import { useCallback, useEffect, useState } from "react";
import { hasSupabase } from "./supabase.js";
import {
  getCurrentPlan,
  listAccounts,
  listPlanRevisions,
  restoreRevision,
  savePlanRevision,
  syncMydataAccounts,
  syncManualAccounts,
  updateProfile,
} from "./planRepo.js";

/* ------------------------------------------------------------------ *
 *  플랜 저장소 훅 — 화면과 Supabase 사이의 얇은 어댑터.
 *
 *  · Supabase 미설정이면 모든 동작이 조용히 no-op (enabled=false) —
 *    기존 목업 흐름이 그대로 동작하고, 화면은 분기 없이 같은 코드를 쓴다.
 *  · 저장은 append-only 리비전 — save() 를 부를 때마다 새 리비전이 쌓이고,
 *    과거 내역은 사라지지 않는다(restore 로 언제든 되돌릴 수 있다).
 * ------------------------------------------------------------------ */
export function usePlanStore({ enabled: signedIn = false } = {}) {
  const enabled = hasSupabase && signedIn; // 환경변수 + 로그인 세션이 모두 있어야 동작
  const [accounts, setAccounts] = useState([]); // 계좌 원장 (id 는 플랜 저장에 필요)
  const [plan, setPlan] = useState(null); // 최신 리비전 (헤더 + 배분 + 매수규칙)
  const [revisions, setRevisions] = useState([]); // 변경 이력
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(
    async (fn) => {
      if (!enabled) return null;
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch (e) {
        setError(e.message);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [enabled]
  );

  // 최초 진입 — 저장된 계좌·플랜·이력 로드
  const refresh = useCallback(
    () =>
      run(async () => {
        const [a, p, r] = await Promise.all([listAccounts(), getCurrentPlan(), listPlanRevisions()]);
        setAccounts(a ?? []);
        setPlan(p);
        setRevisions(r ?? []);
        return p;
      }),
    [run]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* 마이데이터 연동 완료 → 스냅샷 기록 + 계좌 원장 동기화 */
  const syncMydata = useCallback(
    (mydataAccounts) =>
      run(async () => {
        const next = await syncMydataAccounts(mydataAccounts);
        setAccounts(next ?? []);
        return next;
      }),
    [run]
  );

  /* 수기 입력 나이·연소득 → profiles(age·total_income·fin_income) 반영.
   * 다른 기기에서 서버 플랜으로 복원할 때 계좌 최적화 분기(세액공제율·투자기간)를
   * 그대로 재현하기 위해 저장한다. */
  const saveProfile = useCallback((p) => run(() => updateProfile(p)), [run]);

  /* 수기 입력 계좌 → 원장 동기화 (source='manual') */
  const syncManual = useCallback(
    (list) =>
      run(async () => {
        const next = await syncManualAccounts(list);
        setAccounts(next ?? []);
        return next;
      }),
    [run]
  );

  /**
   * 새 리비전 저장 — 계좌별 월 납입액과 매수 규칙(상품·주기·회당 금액)을 함께 봉인.
   * 화면은 계좌를 kind('isa'|'pensionSavings'|'irp'|'general')로 다루므로,
   * 여기서 원장 id 로 치환한다(원장에 없는 kind 는 건너뛴다).
   *
   * @param {object} p
   * @param {number} p.goalManwon 목표 생활비(만원)
   * @param {number} p.monthlyContribution 총 월 투자금(원)
   * @param {Array} p.byKind [{ kind, monthlyAmount, orders?: [{ productCode, productName, cycle, amountPerOrder }] }]
   */
  const save = useCallback(
    ({ goalManwon, years = 20, monthlyContribution, byKind = [], note }) =>
      run(async () => {
        /* 원장이 아직 로드되지 않았으면(연동 직후 등) 최신 상태를 다시 읽는다 —
         * 계좌 id 를 못 찾으면 배분·매수 규칙이 통째로 누락된 채 저장되기 때문 */
        const ledger = accounts.length ? accounts : (await listAccounts()) ?? [];
        const idOf = new Map(ledger.map((a) => [a.kind, a.id]));
        const planAccounts = [];
        const planOrders = [];

        for (const row of byKind) {
          const accountId = idOf.get(row.kind);
          if (!accountId) continue; // 아직 개설/연동되지 않은 계좌
          planAccounts.push({ accountId, monthlyAmount: Math.round(row.monthlyAmount || 0) });
          for (const o of row.orders ?? []) {
            planOrders.push({
              accountId,
              productCode: o.productCode,
              productName: o.productName,
              cycle: o.cycle ?? "monthly",
              amountPerOrder: Math.round(o.amountPerOrder),
            });
          }
        }

        await savePlanRevision({
          goalManwon,
          years,
          monthlyContribution: Math.round(monthlyContribution || 0),
          accounts: planAccounts,
          orders: planOrders,
          note,
        });
        return refresh();
      }),
    [run, accounts, refresh]
  );

  /* 원상복구 — 과거 리비전을 새 리비전으로 복제 (이력은 그대로 남는다) */
  const restore = useCallback(
    (revisionId) =>
      run(async () => {
        await restoreRevision(revisionId);
        return refresh();
      }),
    [run, refresh]
  );

  return { enabled, accounts, plan, revisions, busy, error, save, restore, syncMydata, syncManual, saveProfile, refresh };
}
