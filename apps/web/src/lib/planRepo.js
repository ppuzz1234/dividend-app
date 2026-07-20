import { supabase, hasSupabase } from "./supabase.js";

/* ------------------------------------------------------------------ *
 *  플랜 저장소 — supabase-js(HTTP) + RLS 데이터 접근 계층
 *  스키마: supabase/migrations/0001_init.sql
 *
 *  · 납입 계획은 append-only "리비전" — 수정할 때마다 savePlanRevision 으로
 *    새 리비전을 쌓고, 과거 내역은 그대로 남는다(원상복구 = restoreRevision)
 *  · 모든 호출은 로그인 세션의 JWT 로 나가며, RLS 가 본인 행만 허용한다
 *  · hasSupabase === false(환경변수 미설정)면 호출하지 말 것 — 화면은 목업 폴백
 * ------------------------------------------------------------------ */

const need = () => {
  if (!hasSupabase) throw new Error("Supabase 미설정 — VITE_SUPABASE_URL/ANON_KEY 필요");
  return supabase;
};
const throwIf = (error) => {
  if (error) throw new Error(error.message);
};

/* ── 인증 (SSO) ──────────────────────────────────────────────────── */

// provider: 'google' | 'kakao' | 'azure' 등 — Supabase Auth 대시보드에서 활성화한 것
export async function signInWithSSO(provider) {
  const { data, error } = await need().auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin },
  });
  throwIf(error);
  return data;
}

export async function signOut() {
  const { error } = await need().auth.signOut();
  throwIf(error);
}

export async function getUser() {
  const { data } = await need().auth.getUser();
  return data?.user ?? null;
}

/* ── 프로필 ──────────────────────────────────────────────────────── */

export async function getProfile() {
  const { data, error } = await need().from("profiles").select("*").maybeSingle();
  throwIf(error);
  return data;
}

export async function updateProfile({ age, totalIncome, finIncome, displayName }) {
  const user = await getUser();
  const { data, error } = await need()
    .from("profiles")
    .update({
      ...(age != null && { age }),
      ...(totalIncome != null && { total_income: totalIncome }),
      ...(finIncome != null && { fin_income: finIncome }),
      ...(displayName != null && { display_name: displayName }),
    })
    .eq("id", user.id)
    .select()
    .single();
  throwIf(error);
  return data;
}

/* ── 계좌 원장 (수기/마이데이터) ─────────────────────────────────── */

export async function listAccounts({ includeArchived = false } = {}) {
  let q = need().from("user_accounts").select("*").order("created_at");
  if (!includeArchived) q = q.is("archived_at", null);
  const { data, error } = await q;
  throwIf(error);
  return data;
}

// kind: 'general' | 'isa' | 'pensionSavings' | 'irp' / source: 'manual' | 'mydata'
export async function addAccount({ kind, source = "manual", institution, balance = 0, contributedThisYear = 0 }) {
  const user = await getUser();
  const { data, error } = await need()
    .from("user_accounts")
    .insert({
      user_id: user.id,
      kind,
      source,
      institution,
      balance,
      contributed_this_year: contributedThisYear,
    })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function updateAccount(accountId, { balance, contributedThisYear, institution }) {
  const { data, error } = await need()
    .from("user_accounts")
    .update({
      ...(balance != null && { balance }),
      ...(contributedThisYear != null && { contributed_this_year: contributedThisYear }),
      ...(institution != null && { institution }),
    })
    .eq("id", accountId)
    .select()
    .single();
  throwIf(error);
  return data;
}

// 삭제 대신 아카이브 — 과거 플랜 리비전이 이 계좌를 참조하므로 행은 보존한다
export async function archiveAccount(accountId) {
  const { error } = await need()
    .from("user_accounts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", accountId);
  throwIf(error);
}

/* ── 마이데이터 스냅샷 (불변 이력) ───────────────────────────────── */

export async function saveMydataSnapshot({ totalBalance, accounts }) {
  const user = await getUser();
  const { data, error } = await need()
    .from("mydata_snapshots")
    .insert({ user_id: user.id, total_balance: totalBalance, accounts })
    .select()
    .single();
  throwIf(error);
  return data;
}

export async function listMydataSnapshots({ limit = 20 } = {}) {
  const { data, error } = await need()
    .from("mydata_snapshots")
    .select("*")
    .order("taken_at", { ascending: false })
    .limit(limit);
  throwIf(error);
  return data;
}

/**
 * 마이데이터 연동 결과를 한 번에 반영 —
 * ① 조회 결과를 불변 스냅샷으로 기록하고 ② 계좌 원장(user_accounts)을 동기화한다.
 * 같은 kind 의 기존 계좌가 있으면 잔고·당해 기납만 갱신(행을 새로 만들지 않는다 —
 * 과거 플랜 리비전이 그 계좌 id 를 참조하고 있으므로).
 *
 * @param {Array} accounts [{ kind, institution, balance, contributedThisYear, holdings }]
 * @returns {Promise<Array>} 동기화된 계좌 원장
 */
export async function syncMydataAccounts(accounts) {
  const totalBalance = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  await saveMydataSnapshot({ totalBalance, accounts });

  const existing = await listAccounts();
  const byKind = new Map(existing.map((a) => [a.kind, a]));

  for (const a of accounts) {
    const prev = byKind.get(a.kind);
    if (prev) {
      await updateAccount(prev.id, {
        balance: a.balance ?? 0,
        contributedThisYear: a.contributedThisYear ?? 0,
        institution: a.institution,
      });
    } else {
      await addAccount({ ...a, source: "mydata" });
    }
  }
  return listAccounts();
}

/**
 * 수기 입력 계좌를 원장에 반영 — 마이데이터 없이 사용자가 직접 입력한 경우.
 * 같은 kind 가 있으면 갱신하고(과거 플랜이 참조 중이므로 행을 새로 만들지 않는다),
 * 입력에서 빠진 계좌(= 계좌 없음)는 아카이브 처리한다.
 * @param {Array} accounts [{ kind, balance, contributedThisYear }]
 */
export async function syncManualAccounts(accounts) {
  const existing = await listAccounts();
  const byKind = new Map(existing.map((a) => [a.kind, a]));
  const keep = new Set(accounts.map((a) => a.kind));

  for (const a of accounts) {
    const prev = byKind.get(a.kind);
    if (prev) {
      await updateAccount(prev.id, {
        balance: a.balance ?? 0,
        contributedThisYear: a.contributedThisYear ?? 0,
      });
    } else {
      await addAccount({ ...a, source: "manual" });
    }
  }
  // 이번 입력에서 "계좌 없음"으로 바뀐 기존 계좌는 아카이브(삭제하지 않음)
  for (const prev of existing) if (!keep.has(prev.kind)) await archiveAccount(prev.id);

  return listAccounts();
}

/* ── 납입 계획 리비전 (append-only + 원상복구) ───────────────────── */

/**
 * 새 리비전 저장 — 헤더·계좌 배분·매수 규칙을 서버측 한 트랜잭션(RPC)으로 기록.
 * @param {object} p
 * @param {number} p.goalManwon  목표 생활비(만원)
 * @param {number} [p.years=20]
 * @param {number} p.monthlyContribution  총 월 투자금(원)
 * @param {Array}  [p.accounts]  [{ accountId, monthlyAmount }]
 * @param {Array}  [p.orders]    [{ accountId, productCode, productName, cycle: 'weekly'|'monthly'|'yearly', amountPerOrder }]
 * @param {string} [p.note]
 * @returns {Promise<string>} 새 리비전 id
 */
export async function savePlanRevision({ goalManwon, years = 20, monthlyContribution, accounts = [], orders = [], note }) {
  const { data, error } = await need().rpc("save_plan_revision", {
    p_goal_manwon: goalManwon,
    p_years: years,
    p_monthly: monthlyContribution,
    p_note: note ?? null,
    p_accounts: accounts.map((a) => ({ account_id: a.accountId, monthly_amount: a.monthlyAmount })),
    p_orders: orders.map((o) => ({
      account_id: o.accountId,
      product_code: o.productCode,
      product_name: o.productName,
      cycle: o.cycle,
      amount_per_order: o.amountPerOrder,
    })),
  });
  throwIf(error);
  return data;
}

// 현재(최신) 플랜 — 헤더 + 계좌 배분 + 매수 규칙
export async function getCurrentPlan() {
  const sb = need();
  const { data: rev, error } = await sb.from("current_plan_revision").select("*").maybeSingle();
  throwIf(error);
  if (!rev) return null;
  const [{ data: accounts, error: e1 }, { data: orders, error: e2 }] = await Promise.all([
    sb.from("plan_accounts").select("*").eq("revision_id", rev.id),
    sb.from("plan_orders").select("*").eq("revision_id", rev.id),
  ]);
  throwIf(e1);
  throwIf(e2);
  return { ...rev, accounts, orders };
}

// 리비전 히스토리 (최신순) — 원상복구 화면용
export async function listPlanRevisions({ limit = 50 } = {}) {
  const { data, error } = await need()
    .from("plan_revisions")
    .select("*")
    .order("revision_no", { ascending: false })
    .limit(limit);
  throwIf(error);
  return data;
}

// 과거 리비전을 새 리비전으로 복제해 복구 — 이력은 그대로 남는다
export async function restoreRevision(revisionId) {
  const { data, error } = await need().rpc("restore_plan_revision", { p_revision_id: revisionId });
  throwIf(error);
  return data; // 새 리비전 id
}
