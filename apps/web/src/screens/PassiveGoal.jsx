import { useState } from "react";
import { ArrowRight, ChevronDown, Target, Hourglass, Flag, Wallet } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Button } from "../components/ui/Button.jsx";
import { RollingNumber } from "../components/ui/RollingNumber.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Onboarding.module.css";
import card from "./PassiveGoal.module.css";

const GOAL_STOPS = [100, 300, 500, 1000, 2000]; // 목표 passive income 슬라이더 구간(만원)
const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* ⑤ 목표 Passive Income — 계좌 최적화(③)에서 넘어오는 전환 히어로로 시작해,
 *  은퇴 후 매달 받고 싶은 passive income 을 정하면 필요 자산(4% 룰)과
 *  은퇴(60세)까지 기간(=60−나이) 동안의 월 투자금을 역산해 보여준다.
 *  (기존 온보딩 목표 슬라이더 화면을 착안 — 마이데이터는 이미 앞 단계에서 연동됨) */
export function PassiveGoal({ monthlyGoal, setMonthlyGoal, requiredNestEgg, requiredMonthly, years, gap, onNext }) {
  const [stage, setStage] = useState("hero"); // hero → goal
  const [moved, setMoved] = useState(false);
  const reachFinal = () => setMoved(true);

  return (
    <Pad
      footer={
        stage === "goal" && moved ? (
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
              은퇴 준비를 위한
              <br />
              세금 최적화 계좌를 구성했어요.
            </h1>
            <p className={styles.heroSub}>
              이제 은퇴 후 Passive Income을 만들기 위한
              <br />
              목표 자산 형성 솔루션을 도출해볼까요?
            </p>
          </div>
          <button type="button" className={styles.stepNext} aria-label="다음 단계" onClick={() => setStage("goal")}>
            <ChevronDown size={26} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* 목표 passive income 입력 + 필요 자산·월 투자금 역산 */}
      {stage === "goal" && (
        <div className={styles.goalStage}>
          <div className={cx(styles.goalRow, styles.reveal)}>
            <span className={styles.goalText}>"은퇴 후 매달</span>
            <label className={styles.goalPill}>
              <input
                type="text"
                inputMode="numeric"
                value={monthlyGoal}
                size={Math.max(String(monthlyGoal).length, 1)}
                onChange={(e) => (setMonthlyGoal(digits(e.target.value)), reachFinal())}
                className={styles.goalInput}
              />
              <span className={styles.goalUnit}>만원</span>
            </label>
            <span className={styles.goalText}>받고 싶어"</span>
          </div>

          <div className={cx(styles.goalCard, styles.reveal)}>
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
                    onChange={(e) => (setMonthlyGoal(toVal(Number(e.target.value))), reachFinal())}
                    style={{ width: "100%" }}
                  />
                  <div className={styles.stopLabels}>
                    {GOAL_STOPS.map((v) => (
                      <span key={v} className={cx(styles.stopLabel, v === clamped && styles.stopOn)}>
                        {v.toLocaleString()}만원
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          <div className={styles.scenarioZone}>
            {moved && (
              <div className={card.summary}>
                {/* 필요 자산 */}
                <div className={card.row}>
                  <span className={card.rowIcon}>
                    <Target size={20} strokeWidth={2.2} />
                  </span>
                  <span className={card.rowLabel}>필요 자산</span>
                  <RollingNumber className={card.rowVal} value={fmtKRW(requiredNestEgg)} />
                </div>

                <div className={card.divider} />

                {/* 은퇴까지 / 은퇴 정년 */}
                <div className={card.dual}>
                  <div className={card.dualCell}>
                    <span className={card.rowIcon}>
                      <Hourglass size={18} strokeWidth={2.2} />
                    </span>
                    <div>
                      <span className={card.miniLabel}>은퇴까지</span>
                      <b className={card.miniVal}>{years}년</b>
                    </div>
                  </div>
                  <div className={card.dualCell}>
                    <span className={card.rowIcon}>
                      <Flag size={18} strokeWidth={2.2} />
                    </span>
                    <div>
                      <span className={card.miniLabel}>은퇴 정년</span>
                      <b className={card.miniVal}>60세</b>
                    </div>
                  </div>
                </div>

                <div className={card.divider} />

                {/* 매달 투자금 — 히어로 강조 */}
                <div className={cx(card.row, card.hero)}>
                  <span className={card.rowIcon}>
                    <Wallet size={20} strokeWidth={2.2} />
                  </span>
                  <span className={card.rowLabel}>매달 투자금</span>
                  {gap > 0 ? (
                    <RollingNumber className={card.heroVal} value={fmtKRW(requiredMonthly)} />
                  ) : (
                    <b className={card.heroVal}>0원</b>
                  )}
                </div>

                <p className={card.foot}>
                  {gap > 0
                    ? "이 금액을 은퇴까지 꾸준히 투자하면 목표 자산에 도착해요."
                    : "이미 보유한 자산만으로 목표를 달성할 수 있어요 🎉"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </Pad>
  );
}
