import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Sparkles, MoveRight, Server, ServerOff, RefreshCw, History } from "lucide-react";
import { buildStrategyComparison, projectRetirementScenario, buildAccountRooms, MYDATA_ACCOUNTS } from "@devidend/core";
import { fetchStrategy } from "../lib/strategyApi.js";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { BrandLoader } from "../components/ui/BrandLoader.jsx";
import { AccountRooms } from "../components/AccountRooms.jsx";
import { EtfInfoButton } from "../components/EtfProductCard.jsx";
import { GoalTiles } from "../components/GoalTiles.jsx";
import { PlanHistory } from "../components/PlanHistory.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Accounts.module.css";

const VIEWS = [
  { v: "current", l: "현재 상황" },
  { v: "proposed", l: "전략 적용" },
];

/* 마이데이터 목데이터 → 계좌 원장 저장 형태 (engine id 'pension' → 'pensionSavings') */
const MYDATA_LIST = Object.entries(MYDATA_ACCOUNTS).map(([engineId, a]) => ({
  kind: engineId === "pension" ? "pensionSavings" : engineId,
  institution: a.institution,
  balance: a.balance,
  contributedThisYear: a.contributedThisYear,
  holdings: a.holdings,
}));

/* ③ 계좌 전략 — 마이데이터 취합("현재") vs 앱 제안 리밸런싱("제안") 비교표
 * 사용자 변수(성향·월 불입·나이·전년도 금융/총소득)를 백엔드 전략 엔진
 * (POST /api/strategy, 파일 DB 기반 HPR)에 태워 결과를 렌더링한다.
 * 엔진 미기동 시에는 로컬(@devidend/core) 추정으로 폴백. */
export function Accounts({ mydata, manualAccounts, answers, monthly, monthlyGoal, finIncome, income, age, store, onLinked, onNext }) {
  const [view, setView] = useState("current");
  const [remote, setRemote] = useState(null);
  // 마이데이터 연동 플로우 — idle(미연동) → loading(브랜드 로더) → done(연동 계좌내역)
  // · 온보딩에서 로딩·확인까지 마치고 진입(mydata=true): 곧바로 done 으로 시작
  // · 전략 비교표(table)는 현재 플로우에서 사용하지 않음(현재/전략적용 화면 비활성)
  // 수기 입력으로 진입한 경우도 연동 완료(done)와 동일하게 취급한다
  const [phase, setPhase] = useState(mydata || manualAccounts ? "done" : "idle");
  // 연동 완료 후 단계 공개 — 1단계(계산+멘트+▼) → ▼ 클릭 → 2단계(투자금 타일+계좌 배분)
  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState(false); // 멘트·▼ 가 위로 사라지는 전환 중
  // 계좌별 매수 주기 (weekly|monthly|yearly) — 저장 시 plan_orders.cycle 로 봉인
  const [cycles, setCycles] = useState({});
  const [histOpen, setHistOpen] = useState(false);
  const setCycle = (kind, cycle) => setCycles((c) => ({ ...c, [kind]: cycle }));
  const toDetail = () => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      setExpanded(true);
    }, 320);
  };

  // 로딩 후 연동 완료 처리 (앱 상태 반영)
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => {
      setPhase("done");
      onLinked?.();
    }, 2600);
    return () => clearTimeout(t);
  }, [phase, onLinked]);

  /* 마이데이터 결과 → 스냅샷(불변 이력) + 계좌 원장 동기화.
   * 이 화면에서 연동한 경우(loading→done)와 온보딩에서 연동을 마치고
   * 곧바로 done 으로 진입한 경우를 모두 처리한다. 원장 id 가 있어야
   * 플랜 저장 시 계좌별 배분을 기록할 수 있으므로 누락되면 안 된다. */
  const syncedRef = useRef(false);
  useEffect(() => {
    if (phase !== "done" || !store?.enabled || syncedRef.current) return;
    if (manualAccounts) return; // 수기 입력은 입력 화면에서 이미 원장에 반영됨
    syncedRef.current = true;
    if (store.accounts?.length) return; // 이미 동기화된 세션
    store.syncMydata(MYDATA_LIST);
  }, [phase, store, manualAccounts]);

  /* 보유 총자산 — 수기 입력이 있으면 그 합계, 없으면 마이데이터 목데이터 합계 */
  const mydataTotal = useMemo(
    () =>
      manualAccounts
        ? Object.values(manualAccounts).reduce((s, v) => s + (v || 0), 0)
        : Object.values(MYDATA_ACCOUNTS).reduce((s, a) => s + (a.balance || 0), 0),
    [manualAccounts]
  );

  /* 온보딩에서 정한 목표 생활비 기준 은퇴 필요 자산에서 연동된 총 금융자산을 뺀
   * 차액(gap)을 20년간 만들기 위한 월 투자금 역산 — 연동 완료 후 상단에 표시 */
  const scenario = useMemo(
    () => projectRetirementScenario({ monthlyLivingCost: monthlyGoal * 10_000, currentAssets: mydataTotal }),
    [monthlyGoal, mydataTotal]
  );
  const [{ etf, requiredMonthly }] = scenario.perEtf; // 단일 상품(PLUS 미국S&P500)

  // 사용자 입력이 바뀌면 백엔드 로직 재실행
  useEffect(() => {
    let alive = true;
    fetchStrategy({ answers, monthly, finIncome, totalIncome: income, age }).then((r) => {
      if (alive) setRemote(r);
    });
    return () => { alive = false; };
  }, [answers, monthly, finIncome, income, age]);

  const localCmp = useMemo(() => buildStrategyComparison(), []);
  const cmp = remote?.comparison ?? localCmp;
  const notes = remote?.notes ?? [];
  const applied = view === "proposed";
  const t = applied ? cmp.proposed : cmp.current;

  /* 계획 저장 — 계좌별 월 납입액과 매수 규칙(상품·주기·회당 금액)을 새 리비전으로 봉인.
   * 화면의 배분 결과와 같은 입력으로 계산해 저장값이 화면과 어긋나지 않게 한다.
   * Supabase 미설정이면 store.save 가 no-op 이라 기존 흐름 그대로 다음 단계로 넘어간다. */
  const saveAndNext = async () => {
    const contribution = scenario.gap > 0 ? requiredMonthly : 0;
    if (store?.enabled && contribution > 0) {
      const { rooms } = buildAccountRooms({ mydata: true, manual: manualAccounts, income, monthlyContribution: contribution });
      const byKind = rooms
        .filter((r) => (r.planMonthly || 0) > 0)
        .map((r) => {
          const cycle = cycles[r.id] ?? "monthly";
          const perOrder =
            cycle === "weekly" ? (r.planMonthly * 12) / 52 : cycle === "yearly" ? r.planMonthly * 12 : r.planMonthly;
          return {
            kind: r.id,
            monthlyAmount: r.planMonthly,
            orders: [
              { productCode: etf.ticker, productName: etf.name, cycle, amountPerOrder: perOrder },
            ],
          };
        });
      await store.save({
        goalManwon: monthlyGoal,
        monthlyContribution: contribution,
        byKind,
        note: "계좌 전략 화면에서 저장",
      });
    }
    onNext?.();
  };

  /* 미연동 → 연동 플로우: (온보딩 자동 진입 시) 브랜드 로딩 → 하단에 연동 계좌내역 */
  if (phase !== "table") {
    return (
      <Pad
        footer={
          /* 1단계(멘트+▼)에서는 하단 버튼도 숨긴다 — ▼로 상세를 연 뒤에만 노출 */
          phase === "done" && !expanded ? null : (
            <Button onClick={saveAndNext} icon={ArrowRight} disabled={store?.busy}>
              {store?.busy ? "저장 중…" : "계좌 별 투자 상품 설정"}
            </Button>
          )
        }
      >
        {/* 목표 요약 타일 — 온보딩 마지막 화면과 동일한 최상단 위치로, 전환 시 그대로 이어짐.
         * 연동 완료 시 두 타일이 좌측으로 줄며 우측에 "내 자산"(연동 총 평가액) 타일이 열린다 */}
        <GoalTiles
          monthlyGoal={monthlyGoal}
          requiredNestEgg={scenario.requiredNestEgg}
          myAsset={phase === "done" ? mydataTotal : undefined}
          pulse={phase === "done"}
        />

        {/* 직접 진입(idle)에서만 연동 버튼 노출 — 로딩 중에는 아래 브랜드 로더가 상태를 대신한다 */}
        {phase === "idle" && (
          <button type="button" className={styles.linkBtn} onClick={() => setPhase("loading")}>
            <RefreshCw size={17} />
            마이데이터 연동하기
          </button>
        )}

        {/* 연동 완료 — 필요 자산 − 연동 자산 = 남은 금액 순차 등장(계산 과정이 읽히도록)
         * 이어서 월 투자 멘트까지만 보여주고 ▼ 로 다음 단계 진행:
         * ▼ 클릭 시 계산 카드가 절반으로 줄며 멘트가 우측 "매달 투자금" 타일로 떠오르고,
         * 그 아래 숨겨뒀던 계좌 배분 콘텐츠가 비로소 열린다 */}
        {phase === "done" && (
          <div className={styles.scenarioWrap}>
            <div className={styles.gapSplit}>
              <div className={cx(styles.gapCard, expanded && styles.gapCardHalf)}>
                {expanded ? (
                  /* 2단계 — 계산 과정은 접고 다른 타일처럼 제목 + 금액만 */
                  <>
                    <span className={styles.monthlyK}>더 모아야 할 금액</span>
                    <b className={styles.monthlyV}>{fmtKRW(scenario.gap)}</b>
                  </>
                ) : (
                  <>
                    <div className={cx(styles.gapRow, styles.seq1)}>
                      <span>필요 자산</span>
                      <b className={styles.flashNeed}>{fmtKRW(scenario.requiredNestEgg)}</b>
                    </div>
                    <div className={cx(styles.gapRow, styles.seq2)}>
                      <span>내 총 자산 (마이데이터)</span>
                      <b className={cx(styles.gapMinus, styles.flashMine)}>− {fmtKRW(mydataTotal)}</b>
                    </div>
                    <div className={cx(styles.gapRow, styles.gapTotal, styles.seq3)}>
                      <span>더 모아야 할 금액</span>
                      <b className={styles.gapPop}>{fmtKRW(scenario.gap)}</b>
                    </div>
                  </>
                )}
              </div>

              {/* 멘트가 변신한 매달 투자금 타일 — 우측 상단 빈 공간으로 떠오른다 */}
              {expanded && (
                <div className={styles.monthlyTile}>
                  <span className={styles.monthlyK}>매달 투자금</span>
                  <b className={styles.monthlyV}>{fmtKRW(requiredMonthly)}</b>
                  <span className={styles.monthlyEtf}>
                    {etf.name}
                    <EtfInfoButton etf={etf} />
                  </span>
                </div>
              )}
            </div>

            {/* 1단계 — 월 투자 시나리오 멘트, ETF명 옆 (i) 클릭 시 상세 모달 */}
            {!expanded && scenario.gap > 0 && (
              <div className={cx(styles.scenarioHead, styles.seq4, leaving && styles.leave)}>
                <span>
                  남은 금액은 매달 <b className={styles.scenarioAmount}>{fmtKRW(requiredMonthly)}</b>을
                  <br />
                  <b className={styles.scenarioAmount}>{etf.name}</b>
                  <EtfInfoButton etf={etf} />
                  <br />에 투자하면 20년 안에 모을 수 있어요.
                </span>
              </div>
            )}
          </div>
        )}

        {/* 1단계 진행 ▼ — 멘트를 읽고 나면 계좌 배분 단계로 */}
        {phase === "done" && !expanded && (
          <button
            type="button"
            className={cx(styles.stepNext, leaving && styles.leave)}
            aria-label="다음 단계"
            onClick={toDetail}
          >
            <ChevronDown size={26} strokeWidth={2.6} />
          </button>
        )}

        {/* 하단 영역 — 여력 안내 → 브랜드 로딩 → (▼ 이후) 연동완료 계좌 배분 */}
        {phase === "idle" && <AccountRooms mydata={false} income={income} />}
        {phase === "loading" && (
          <BrandLoader msgs={["금융사 계좌 조회 중", "잔고·거래내역 취합 중", "전년도 소득정보 확인 중"]} />
        )}
        {phase === "done" && expanded && (
          <div className={styles.revealBlock}>
            {/* 월 투자금(requiredMonthly)을 절세 한도 waterfall 로 계좌별 배분해 표시.
             * 계좌별 매수 주기(주/월/연)는 여기서 조정해 저장 시 함께 봉인된다 */}
            <AccountRooms
              mydata
              manual={manualAccounts}
              income={income}
              monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
              etf={etf}
              cycles={cycles}
              onCycleChange={setCycle}
            />

            {/* 변경 이력 — 저장된 리비전이 있을 때만(=Supabase 연동 시) 노출 */}
            {store?.enabled && store.revisions?.length > 0 && (
              <button type="button" className={styles.histBtn} onClick={() => setHistOpen(true)}>
                <History size={14} />
                변경 이력 {store.revisions.length}건 · 지난 계획으로 되돌리기
              </button>
            )}
            {store?.error && <p className={styles.saveErr}>저장에 실패했어요 — {store.error}</p>}
          </div>
        )}

        {histOpen && (
          <PlanHistory
            revisions={store.revisions}
            busy={store.busy}
            onRestore={async (id) => {
              await store.restore(id);
              setHistOpen(false);
            }}
            onClose={() => setHistOpen(false)}
          />
        )}
      </Pad>
    );
  }

  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>{applied ? "제안 전략으로 시뮬레이션" : "이 전략으로 시뮬레이션"}</Button>}>
      <Heading sub="지금 보유 상황과, 앱이 제안하는 계좌 재배치를 적용했을 때의 세금 차이예요.">
        내 계좌 전략
      </Heading>

      {/* 엔진 연결 상태 — 어떤 로직이 계산했는지 표기 */}
      <div className={cx(styles.engine, remote && styles.engineOn)}>
        {remote ? <Server size={12} /> : <ServerOff size={12} />}
        {remote
          ? `전략 엔진 반영됨 — ${remote.profile.horizonLabel} 성향 · 월 ${fmtKRW(remote.profile.inputs.monthly)} · 금융소득 ${fmtKRW(remote.profile.inputs.finIncome)} · 총소득 ${fmtKRW(remote.profile.inputs.totalIncome)}`
          : "전략 엔진 미연결 — 로컬 기본 추정으로 표시 중 (npm run dev:api)"}
      </div>

      {/* 현재 ↔ 전략 적용 전환 */}
      <Segmented value={view} onChange={setView} opts={VIEWS} />

      {/* 엔진이 산출한 개인화 안내 (ISA 가입 제한 등) */}
      {notes.map((n, i) => (
        <div key={i} className={styles.note}>{n}</div>
      ))}

      {/* 비교표 — 계좌 열 × 상품/세금/건보료/총액/장단점/활용 행 */}
      <div className={styles.tblWrap}>
        <table className={styles.tbl}>
          <thead>
            <tr>
              <th className={styles.rowLabel}>구분</th>
              {t.columns.map((c) => (
                <th key={c.id} className={styles.colHead}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th className={styles.rowLabel}>투자상품</th>
              {t.columns.map((c) => (
                <td key={c.id}>
                  {c.products.length ? (
                    c.products.map((p) => (
                      <div key={p.label} className={styles.prod}>
                        <span>{p.label}</span>
                        <b>{fmtKRW(p.value)}</b>
                      </div>
                    ))
                  ) : (
                    <span className={styles.none}>—</span>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th className={styles.rowLabel}>세금</th>
              {t.columns.map((c) => (
                <td key={c.id}>
                  <div className={styles.taxNote}>{c.taxNote}</div>
                  {c.taxBreakdown?.length ? (
                    c.taxBreakdown.map((b) => (
                      <div key={b.label} className={styles.taxPart}>
                        <span>{b.label}</span>
                        <b>{fmtKRW(b.amount)}</b>
                      </div>
                    ))
                  ) : (
                    <div className={styles.taxAmt}>{c.totalValue > 0 ? fmtKRW(c.tax) : "—"}</div>
                  )}
                </td>
              ))}
            </tr>
            <tr>
              <th className={styles.rowLabel}>건강보험료 (8.01%)</th>
              {t.columns.map((c) => (
                <td key={c.id}>
                  {c.health > 0 ? (
                    <span className={styles.taxAmt}>{fmtKRW(c.health)}</span>
                  ) : (
                    <span className={styles.none}>해당사항 없음</span>
                  )}
                </td>
              ))}
            </tr>
            <tr className={styles.totalRow}>
              <th className={styles.rowLabel}>세금 총액 (연)</th>
              {t.columns.map((c) => (
                <td key={c.id}>
                  <strong>{c.totalValue > 0 ? fmtKRW(c.totalTax) : "—"}</strong>
                  {c.deferred && c.totalValue > 0 && <span className={styles.deferred}>수령 시 · 과세이연</span>}
                </td>
              ))}
            </tr>
            <tr>
              <th className={styles.rowLabel}>계좌 장점</th>
              {t.columns.map((c) => (
                <td key={c.id} className={styles.trait}>{c.pros}</td>
              ))}
            </tr>
            <tr>
              <th className={styles.rowLabel}>계좌 단점</th>
              {t.columns.map((c) => (
                <td key={c.id} className={styles.trait}>{c.cons}</td>
              ))}
            </tr>
            <tr className={styles.useRow}>
              <th className={styles.rowLabel}>계좌 활용</th>
              {t.columns.map((c) => (
                <td key={c.id} className={styles.trait}>{c.use}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* 전략 적용 시: 절감 요약 + 이동 내역 — 표 아래 고정(토글 시 표 위치 불변) */}
      {applied && (
        <div className={styles.savings}>
          <div className={styles.savingsHead}>
            <Sparkles size={15} strokeWidth={2.6} />
            연간 세금·건보료 약 <strong>{fmtKRW(cmp.savings)}</strong> 절감
          </div>
          {cmp.moves.map((m, i) => (
            <div key={i} className={styles.move}>
              <span className={styles.moveName}>
                {m.name} <em>({m.label} · {fmtKRW(m.value)})</em>
              </span>
              <span className={styles.movePath}>
                {m.from} <MoveRight size={12} strokeWidth={3} /> <b>{m.to}</b>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 시나리오 합계 비교 */}
      <div className={styles.compareBar}>
        <span className={cx(styles.cmpItem, !applied && styles.cmpOn)}>
          현재 연 {fmtKRW(cmp.current.totalTax)}
        </span>
        <MoveRight size={14} />
        <span className={cx(styles.cmpItem, styles.cmpGood, applied && styles.cmpOn)}>
          제안 연 {fmtKRW(cmp.proposed.totalTax)}
        </span>
      </div>

      <p className={styles.disclaimer}>
        연 배당수익률 {Math.round(cmp.assumptions.divYield * 1000) / 10}% 가정의 추정치예요. 해외상장 매매차익
        양도세(22%)는 매도 시점에 별도 발생하며, 실제 과세·건보료 산정과 다를 수 있어요.
      </p>
    </Pad>
  );
}
