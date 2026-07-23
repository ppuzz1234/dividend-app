import { useEffect, useState } from "react";
import { ArrowRight, TrendingUp, Info, X, Landmark, Check, ShieldCheck, Lock, RefreshCw } from "lucide-react";
import { projectRetirementScenario } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Plus200Logo, ToptLogo } from "../components/ui/EtfLogos.jsx";
import { RollingNumber } from "../components/ui/RollingNumber.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Onboarding.module.css";

const YEARS = 20;
const LOGOS = { plus200: Plus200Logo, topt: ToptLogo };
const GOAL_STOPS = [100, 300, 500, 1000, 2000]; // 목표 생활비 슬라이더 구간(만원)

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;
const pct = (r) => `${(r * 100).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}%`;
const dot = (iso) => iso.replace(/-/g, ".");

/* 서베이 진입 전 훅 화면 — "20년 뒤 매달 목표 생활비를 받으려면?"
 * 목표 생활비(연 4% 인출 가정)로 필요한 은퇴 시드를 역산하고, 한국(PLUS200)·
 * 미국(TOPT) ETF 각각의 연환산 수익률 기준으로 그 시드를 20년간 만들기 위한
 * 필요 월 불입금을 배당 재투자 가정으로 역산해 보여준다. */
export function Onboarding({ monthlyGoal, setMonthlyGoal, onNext }) {
  const { requiredNestEgg, perEtf } = projectRetirementScenario({
    monthlyLivingCost: monthlyGoal * 10_000,
    years: YEARS,
  });
  // ETF 상세 레이어팝업 (null 이면 닫힘)
  const [infoEtf, setInfoEtf] = useState(null);
  // 국내·해외 중 선택한 ETF (id). 선택해야 하단 버튼 활성화
  const [selectedId, setSelectedId] = useState(null);
  // 마이데이터 연동 바텀시트 열림 여부
  const [sheetOpen, setSheetOpen] = useState(false);
  const selectedEtf = perEtf.find((p) => p.etf.id === selectedId)?.etf || null;

  useEffect(() => {
    if (!infoEtf && !sheetOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setInfoEtf(null);
      setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [infoEtf, sheetOpen]);

  return (
    <Pad
      footer={
        <Button
          onClick={selectedId ? () => setSheetOpen(true) : undefined}
          disabled={!selectedId}
          icon={ArrowRight}
        >
          {selectedId ? "목표를 확인했어요" : "국내·해외 ETF 중 하나를 선택하세요"}
        </Button>
      }
    >
      <Heading sub="목표 생활비를 정하면, 필요한 자산과 매월 불입금을 미리 확인해드려요.">
        ETF투자를 통해,
        <br />
        은퇴 후 생활자금을 준비하세요.
      </Heading>

      <div className={styles.goalCard}>
        <div className={styles.goalRow}>
          <span className={styles.goalText}>"저는 20년 뒤, 월</span>
          <label className={styles.goalPill}>
            <input
              type="text"
              inputMode="numeric"
              value={monthlyGoal}
              size={Math.max(String(monthlyGoal).length, 1)}
              onChange={(e) => setMonthlyGoal(digits(e.target.value))}
              className={styles.goalInput}
            />
            <span className={styles.goalUnit}>만원</span>
          </label>
          <span className={styles.goalText}>생활비가 필요해요"</span>
        </div>
        {/* 금액 선택 슬라이더 — 구간 라벨(100~2,000)은 균등 배치, 구간 사이는 50만원 단위로
         * 이동 가능하도록 인덱스 공간 ↔ 금액을 구간별 선형 매핑한다. */}
        {(() => {
          const N = GOAL_STOPS.length - 1;
          const clamped = Math.min(GOAL_STOPS[N], Math.max(GOAL_STOPS[0], monthlyGoal));
          let seg = GOAL_STOPS.findIndex((s, i) => i < N && clamped <= GOAL_STOPS[i + 1]);
          if (seg < 0) seg = N - 1;
          const pos = seg + (clamped - GOAL_STOPS[seg]) / (GOAL_STOPS[seg + 1] - GOAL_STOPS[seg]);
          const toVal = (p) => {
            const i = Math.min(N - 1, Math.max(0, Math.floor(p)));
            const raw = GOAL_STOPS[i] + (GOAL_STOPS[i + 1] - GOAL_STOPS[i]) * (p - i);
            return Math.round(raw / 50) * 50; // 50만원 단위 스냅
          };
          return (
            <div className={styles.goalSlider}>
              <input
                type="range"
                className="rng"
                min={0}
                max={N}
                step="any"
                value={pos}
                aria-label="목표 생활비 선택"
                onChange={(e) => setMonthlyGoal(toVal(Number(e.target.value)))}
                style={{ width: "100%" }}
              />
              <div className={styles.stopLabels}>
                {GOAL_STOPS.map((v, i) => (
                  <span
                    key={v}
                    className={cx(styles.stopLabel, v === clamped && styles.stopOn)}
                    style={{ left: `calc(13px + ${i / N} * (100% - 26px))` }}
                  >
                    {v.toLocaleString()}만원
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <div className={styles.scenarioHead}>
        <TrendingUp size={15} />
        <span>
          은퇴 시점에는 최소{" "}
          <RollingNumber className={styles.scenarioAmount} value={fmtKRW(requiredNestEgg)} />의
          <br />기초 자산이 필요해요.
        </span>
      </div>

      <div className={styles.grid}>
        {perEtf.map(({ etf, requiredMonthly }) => {
          const Logo = LOGOS[etf.id];
          const kr = etf.region === "KR";
          const on = selectedId === etf.id;
          return (
            <div
              key={etf.id}
              className={cx(styles.card, on && styles.cardOn)}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              onClick={() => setSelectedId(etf.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelectedId(etf.id))}
            >
              <span className={cx(styles.radio, on && styles.radioOn)} aria-hidden="true">
                {on && <Check size={14} strokeWidth={3.5} />}
              </span>

              <div className={styles.cardCaption}>{kr ? "국내" : "해외"} ETF로 모은다면,</div>

              <div className={styles.metric}>
                <div className={styles.metricLabel}>매월</div>
                <div className={styles.metricValue}>
                  <RollingNumber value={fmtKRW(requiredMonthly)} />
                </div>
                <div className={styles.metricSuffix}>납입 필요</div>
              </div>

              <div className={styles.brandArea}>
                <Logo size={52} />
                <div className={styles.nameRow}>
                  <span className={styles.cardRegion}>{kr ? "한국" : "미국"}</span>
                  <span className={styles.cardTitle}>{etf.name}</span>
                  <button
                    type="button"
                    className={styles.infoBtn}
                    aria-label={`${etf.name} 상세 설명`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setInfoEtf(etf);
                    }}
                  >
                    <Info size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ETF 상세 레이어팝업 — 우상단 X 또는 빈영역(백드롭) 클릭으로 닫기 */}
      {infoEtf && (() => {
        const Logo = LOGOS[infoEtf.id];
        return (
          <div className={styles.overlay} onClick={() => setInfoEtf(null)}>
            <div
              className={styles.popup}
              role="dialog"
              aria-modal="true"
              aria-label={`${infoEtf.name} 상세 설명`}
              onClick={(e) => e.stopPropagation()}
            >
              <button type="button" className={styles.popupClose} aria-label="닫기" onClick={() => setInfoEtf(null)}>
                <X size={16} />
              </button>

              <div className={styles.popupHead}>
                <Logo size={34} />
                <div>
                  <div className={styles.popupTitle}>
                    {infoEtf.region === "KR" ? "한국" : "미국"} {infoEtf.name}
                  </div>
                  <div className={styles.popupSub}>{infoEtf.manager}</div>
                </div>
              </div>

              <div className={styles.popupSection}>
                <div className={styles.popupSectionTitle}>개요</div>
                <p className={styles.popupDesc}>{infoEtf.desc}</p>
                <dl className={styles.specList}>
                  <div className={styles.specRow}>
                    <dt>운용사</dt>
                    <dd>{infoEtf.manager}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt>{infoEtf.region === "KR" ? "종목코드" : "상품명"}</dt>
                    <dd>{infoEtf.ticker}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt>설정일</dt>
                    <dd>{dot(infoEtf.inceptionDate)}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt>총보수</dt>
                    <dd>연 {pct(infoEtf.expenseRatio)}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt>참고 연환산 수익률</dt>
                    <dd>연 {pct(infoEtf.cagrRef)}</dd>
                  </div>
                </dl>
              </div>

              <div className={styles.popupSection}>
                <div className={styles.popupSectionTitle}>
                  <Landmark size={12} /> 배당 재투자 가정
                </div>
                <p className={styles.popupDesc}>
                  월 불입금은 배당금을 전액 재투자한다는 가정으로 역산한 값이에요. 과거 수익률 기준의 예시로,
                  향후 동일한 수익을 보장하지 않아요.
                </p>
                <p className={styles.popupNote}>{infoEtf.sourceNote}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 마이데이터 연동 바텀시트 — 하단 목표확인 버튼 → 슬라이드업. 백드롭/닫기로 해제 */}
      {sheetOpen && selectedEtf && (() => {
        const Logo = LOGOS[selectedEtf.id];
        return (
          <div className={styles.sheetBackdrop} onClick={() => setSheetOpen(false)}>
            <div
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-label="마이데이터 연동 안내"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.sheetHandle} aria-hidden="true" />
              <button type="button" className={styles.popupClose} aria-label="닫기" onClick={() => setSheetOpen(false)}>
                <X size={16} />
              </button>

              <div className={styles.sheetLogo}>
                <Logo size={48} />
              </div>

              <p className={styles.sheetMsg}>
                선택하신 <b className={styles.sheetFund}>{selectedEtf.name}</b> ETF를 활용한 계좌 배분 전략을
                파악하기 위해 마이데이터로 정보를 연동할게요.
              </p>

              <div className={styles.sheetNotice}>
                <div className={styles.sheetNoticeRow}>
                  <ShieldCheck size={15} />
                  <span>금융보안원 인증을 거친 안전한 마이데이터 표준 API로 연동돼요.</span>
                </div>
                <div className={styles.sheetNoticeRow}>
                  <Lock size={15} />
                  <span>여러 금융사에 흩어진 계좌·잔고·소득 정보를 조회 목적으로만 불러오며, 이체·출금 권한은 없어요.</span>
                </div>
                <div className={styles.sheetNoticeRow}>
                  <Landmark size={15} />
                  <span>연동 정보는 암호화되어 전송되고, 동의를 철회하면 즉시 파기돼요.</span>
                </div>
              </div>

              <div className={styles.sheetFooter}>
                <Button onClick={onNext} icon={RefreshCw}>
                  마이데이터 연동하기
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      <p className={styles.disclaimer}>
        * 필요 자산은 은퇴 후 연 4% 인출(4% 룰)을 가정해 역산한 값이며, 월 불입금은 각 ETF의 설정후(과거) 수익률을 참고한
        예시로 향후 동일한 수익을 보장하지 않습니다. 실제 배분·세제는 다음 단계(성향 분석)에서 계좌별로 정교하게 설계돼요.
      </p>
    </Pad>
  );
}
