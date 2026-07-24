import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Button } from "../components/ui/Button.jsx";
import { InfoTip } from "../components/ui/InfoTip.jsx";
import { RollingNumber } from "../components/ui/RollingNumber.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Onboarding.module.css";
import card from "./PassiveGoal.module.css";

const GOAL_STOPS = [100, 300, 500, 1000, 2000]; // 목표 passive income 슬라이더 구간(만원)

/* ⑤ 목표 Passive Income — 계좌 최적화(③)에서 넘어오는 전환 히어로로 시작해,
 *  은퇴 후 매달 받고 싶은 passive income 을 정하면 필요 자산(4% 룰)과
 *  은퇴(60세)까지 기간(=60−나이) 동안의 월 투자금을 역산해 보여준다.
 *  (기존 온보딩 목표 슬라이더 화면을 착안 — 마이데이터는 이미 앞 단계에서 연동됨) */
export function PassiveGoal({ monthlyGoal, setMonthlyGoal, requiredNestEgg, requiredMonthly, years, gap, onNext }) {
  const [stage, setStage] = useState("hero"); // hero → goal

  return (
    <Pad
      footer={
        stage === "goal" ? (
          <Button onClick={onNext} icon={ArrowRight}>
            이 목표로 솔루션 도출하기
          </Button>
        ) : null
      }
    >
      {/* 전환 히어로 — 세금 최적화 계좌 구성 완료 → passive income 목표 제안 */}
      {stage === "hero" && (
        <div className={styles.heroStage}>
          <div className={styles.hero}>
            <h1 className={styles.heroTitle}>
              금융 빌딩을 만들어 갈,
              <br />
              절세 계좌 최적화 설계가 완료되었어요.
            </h1>
            <p className={styles.heroSub}>
              이제 금융 빌딩 만들기 위한
              <br />
              목표 자산  형성 솔루션을 도출해볼까요?
            </p>
          </div>
          <button type="button" className={styles.stepNext} aria-label="다음 단계" onClick={() => setStage("goal")}>
            <ChevronDown size={26} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* 목표 passive income 선택 + 필요 자산·월 투자금 역산 */}
      {stage === "goal" && (
        <div className={styles.goalStage}>
          <p className={cx(styles.goalGuide, styles.reveal)}>
            은퇴 후 목표 Passive Income을 정하면,
            <br />
            필요한 자산과 매월 필요한 투자금을 알려드려요
          </p>

          <div className={cx(styles.goalCard, styles.reveal)}>
            {/* 선택한 목표 금액 — 슬라이더로 고른 값을 크게 표시 */}
            <div className={styles.goalPick}>
              <span className={styles.goalPickText}>매달</span>
              <b className={styles.goalPickVal}>{monthlyGoal.toLocaleString()}</b>
              <span className={styles.goalPickUnit}>만원</span>
            </div>
            {(() => {
              const N = GOAL_STOPS.length - 1;
              const clamped = Math.min(GOAL_STOPS[N], Math.max(GOAL_STOPS[0], monthlyGoal));
              let seg = GOAL_STOPS.findIndex((s, i) => i < N && clamped <= GOAL_STOPS[i + 1]);
              if (seg < 0) seg = N - 1;
              const pos = seg + (clamped - GOAL_STOPS[seg]) / (GOAL_STOPS[seg + 1] - GOAL_STOPS[seg]);
              const toVal = (p) => {
                const i = Math.min(N - 1, Math.max(0, Math.floor(p)));
                const raw = GOAL_STOPS[i] + (GOAL_STOPS[i + 1] - GOAL_STOPS[i]) * (p - i);
                return Math.round(raw / 50) * 50;
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
                    aria-label="목표 passive income 선택"
                    onChange={(e) => setMonthlyGoal(toVal(Number(e.target.value)))}
                    style={{ width: "100%" }}
                  />
                  {/* 라벨 중심을 각 구간의 슬라이더 썸(지름 26px) 중심에 정확히 정렬 */}
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

          <div className={styles.scenarioZone}>
            <div className={card.summary}>
                {/* 필요 자산 — 4% 룰 역산 근거를 (i) 더보기로 설명 */}
                <div className={card.row}>
                  <img className={card.rowIcon} src="/brand/pg-nestegg.svg" alt="" />
                  <span className={card.rowLabel}>
                    필요 자산
                    <InfoTip title="필요 자산은 이렇게 계산했어요">
                      <p>
                        은퇴 후 매달 <b>{monthlyGoal.toLocaleString()}만원</b>을 4% 룰로 평생 인출하려면, 필요한 은퇴
                        자산은 총 <b>{fmtKRW(requiredNestEgg)}</b>이에요. (연 생활비 ÷ 4%)
                      </p>
                      {gap > 0 && gap < requiredNestEgg && (
                        <p>
                          이미 보유한 금융자산을 빼면 앞으로 <b>{fmtKRW(gap)}</b>만 더 모으면 되고, 아래 매달 투자금은 이
                          금액을 은퇴까지 {years}년 동안 만들기 위해 역산한 값이에요.
                        </p>
                      )}
                    </InfoTip>
                  </span>
                  <RollingNumber className={card.rowVal} value={fmtKRW(requiredNestEgg)} />
                </div>

                <div className={card.divider} />

                {/* 은퇴 정년 / 은퇴까지 — 라벨 좌측, 값 우측 (상단 행과 동일 리듬) */}
                <div className={card.dual}>
                  <div className={card.dualCell}>
                    <img className={card.rowIcon} src="/brand/pg-age.svg" alt="" />
                    <span className={card.miniLabel}>은퇴 정년</span>
                    <b className={card.miniVal}>60세</b>
                  </div>
                  <div className={card.dualCell}>
                    <img className={card.rowIcon} src="/brand/pg-until.svg" alt="" />
                    <span className={card.miniLabel}>은퇴까지</span>
                    <b className={card.miniVal}>{years}년</b>
                  </div>
                </div>

                <div className={card.divider} />

                {/* 매달 투자금 — 히어로 강조 */}
                <div className={cx(card.row, card.hero)}>
                  <img className={card.rowIcon} src="/brand/pg-monthly.svg" alt="" />
                  <span className={card.rowLabel}>매달 투자금</span>
                  {gap > 0 ? (
                    <RollingNumber className={card.heroVal} value={fmtKRW(requiredMonthly)} />
                  ) : (
                    <b className={card.heroVal}>0원</b>
                  )}
                </div>

                <p className={card.assumeNote}>PLUS 미국S&P500 ETF 상품 활용 예시예요.</p>

                <p className={card.foot}>
                  {gap > 0
                    ? "이 금액을 은퇴까지 꾸준히 투자하면 목표 자산에 도착해요."
                    : "이미 보유한 자산만으로 목표를 달성할 수 있어요 🎉"}
                </p>
              </div>
          </div>
        </div>
      )}
    </Pad>
  );
}
