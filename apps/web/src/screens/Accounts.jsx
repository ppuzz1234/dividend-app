import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles, MoveRight, Server, ServerOff, RefreshCw, BadgeCheck } from "lucide-react";
import { buildStrategyComparison, MYDATA_ACCOUNTS } from "@devidend/core";
import { fetchStrategy } from "../lib/strategyApi.js";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { GeniusLoader } from "../components/ui/GeniusLoader.jsx";
import { AccountRooms } from "../components/AccountRooms.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Accounts.module.css";

const VIEWS = [
  { v: "current", l: "현재 상황" },
  { v: "proposed", l: "전략 적용" },
];

/* ③ 계좌 전략 — 마이데이터 취합("현재") vs 앱 제안 리밸런싱("제안") 비교표
 * 사용자 변수(성향·월 불입·나이·전년도 금융/총소득)를 백엔드 전략 엔진
 * (POST /api/strategy, 파일 DB 기반 HPR)에 태워 결과를 렌더링한다.
 * 엔진 미기동 시에는 로컬(@devidend/core) 추정으로 폴백. */
export function Accounts({ mydata, answers, monthly, finIncome, income, age, autoLoad = false, onLinked, onNext }) {
  const [view, setView] = useState("current");
  const [remote, setRemote] = useState(null);
  // 마이데이터 연동 플로우 — idle(미연동) → loading(GENIUS) → done(연동 계좌내역)
  // · autoLoad(온보딩 시트 진입): 곧바로 GENIUS 로딩부터 시작
  // · 이미 연동됨(뒤로가기 재진입): 계좌 샘플(done)을 바로 표시
  // · 전략 비교표(table)는 현재 플로우에서 사용하지 않음(현재/전략적용 화면 비활성)
  const [phase, setPhase] = useState(mydata ? "done" : autoLoad ? "loading" : "idle");

  // GENIUS 로딩 후 연동 완료 처리 (앱 상태에도 반영)
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => {
      setPhase("done");
      onLinked?.();
    }, 2600);
    return () => clearTimeout(t);
  }, [phase, onLinked]);

  const mydataTotal = useMemo(
    () => Object.values(MYDATA_ACCOUNTS).reduce((s, a) => s + (a.balance || 0), 0),
    []
  );

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

  /* 미연동 → 연동 플로우: 버튼 클릭 → GENIUS 로딩 → 하단에 연동 계좌내역 */
  if (phase !== "table") {
    return (
      <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 전략으로 시뮬레이션</Button>}>
        <Heading
          sub={
            phase === "done"
              ? "연동이 완료됐어요. 불러온 계좌 현황을 확인해 보세요."
              : "마이데이터를 연동하면 흩어진 계좌와 소득정보를 한 번에 불러와요."
          }
        >
          내 계좌 전략
        </Heading>

        {/* 마이데이터 연동하기 — 완료 후엔 상태 배지로 전환 */}
        {phase === "done" ? (
          <div className={styles.linkedBadge}>
            <BadgeCheck size={16} />
            마이데이터 연동 완료 · 총 평가 {fmtKRW(mydataTotal)}
          </div>
        ) : (
          <button
            type="button"
            className={styles.linkBtn}
            disabled={phase === "loading"}
            onClick={() => setPhase("loading")}
          >
            <RefreshCw size={17} className={phase === "loading" ? styles.spin : undefined} />
            {phase === "loading" ? "연동 중..." : "마이데이터 연동하기"}
          </button>
        )}

        {/* 하단 영역 — 여력 안내 → GENIUS 로딩 → 연동완료 계좌내역 */}
        {phase === "idle" && <AccountRooms mydata={false} income={income} />}
        {phase === "loading" && (
          <GeniusLoader msgs={["금융사 계좌 조회 중", "잔고·거래내역 취합 중", "전년도 소득정보 확인 중"]} />
        )}
        {phase === "done" && <AccountRooms mydata income={income} />}
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
