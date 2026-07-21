import { useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { projectRetirementScenario } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Button } from "../components/ui/Button.jsx";
import { GoalTiles } from "../components/GoalTiles.jsx";
import { RollingNumber } from "../components/ui/RollingNumber.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Onboarding.module.css";

const YEARS = 20;
const GOAL_STOPS = [100, 300, 500, 1000, 2000]; // 목표 생활비 슬라이더 구간(만원)

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;


/* 서베이 진입 전 훅 화면 — "20년 뒤 매달 목표 생활비를 받으려면?"
 * 목표 생활비(연 4% 인출 가정)로 필요한 은퇴 시드를 역산해 보여주고,
 * 마이데이터 연동으로 이어준다. (월 투자금 산정은 연동 후 계좌 화면에서)
 *
 * 스토리텔링 순차 노출 — 정보 부담을 줄이기 위해 동화책 넘기듯 단계별 공개.
 * 각 단락 끝의 깜빡이는 ▼ 버튼을 눌러 다음 단계로 진행한다:
 *   stage 0  히어로 문구 페이드인(제목 → 부제 순)
 *   stage 2  (▼ 클릭) 히어로가 사라지고 목표 문장·슬라이더 노출 →
 *            슬라이더를 조작하면(moved) 하단 "필요 자산" 문구와 ▼ 가 이어서 등장
 *   stage 3  (▼ 클릭) 위 내용이 위로 페이드아웃 → 선택 요약 타일 2개 +
 *            계좌 현황 입력 안내로 전환 */
export function Onboarding({ userName, monthlyGoal, setMonthlyGoal, onNext }) {
  const { requiredNestEgg } = projectRetirementScenario({
    monthlyLivingCost: monthlyGoal * 10_000,
    years: YEARS,
  });
  const [stage, setStage] = useState(0);
  // 마지막 전환 — 목표·시나리오 단락이 위로 떠오르며 사라지는 동안 true
  const [leaving, setLeaving] = useState(false);
  // 슬라이더(또는 금액)를 처음 조작했는지 — 조작 전에는 하단 시나리오 문구·▼를 숨긴다
  const [moved, setMoved] = useState(false);

  // 히어로 ▼ 클릭 → 목표 문장·슬라이더까지만 노출 (하단 시나리오는 슬라이더 조작 시)
  const next = () => setStage(2);
  // 금액을 조정하면 시나리오 단락이 열리도록
  const reachFinal = () => {
    setStage((s) => Math.max(s, 2));
    setMoved(true);
  };
  // stage 2 → 3: 페이드아웃 애니메이션이 끝난 뒤 요약 화면으로 교체
  const toSummary = () => {
    setLeaving(true);
    setTimeout(() => {
      setLeaving(false);
      setStage(3);
    }, 380);
  };

  return (
    <Pad>
      {/* 히어로 — 첫 단락에서만 노출, ▼ 클릭 시 다음 단락으로 교체. 문구+▼를 본문 세로 중앙에 배치 */}
      {stage === 0 && (
        <div className={styles.heroStage}>
          <div className={styles.hero}>
            {userName && <p className={styles.heroGreeting}>{userName}님.</p>}
            <h1 className={styles.heroTitle}>
              ETF투자를 통해,
              <br />
              은퇴 후 생활자금을 준비하세요.
            </h1>
            <p className={styles.heroSub}>
              목표 생활비를 정하면, 필요한 자산과
              <br />
              매월 불입금을 미리 확인해드려요.
            </p>
          </div>

          {/* 단락 진행 ▼ — 히어로를 읽고 누르면 목표 문장 단계로 */}
          <button type="button" className={styles.stepNext} aria-label="다음 단계" onClick={next}>
            <ChevronDown size={26} strokeWidth={2.6} />
          </button>
        </div>
      )}

      {/* 목표·시나리오 단락 — 마지막 전환(leaving) 시 통째로 위로 페이드아웃 */}
      {stage === 2 && (
      <div className={cx(styles.goalStage, leaving && styles.leave)}>
      {/* 목표 문장 — 타일 밖에서 화면의 주인공으로 크게 노출 */}
      <div className={cx(styles.goalRow, styles.reveal)}>
        <span className={styles.goalText}>"나는 20년 뒤, 월</span>
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
        <span className={styles.goalText}>생활비가 필요해"</span>
      </div>

      {/* 슬라이더만 담는 둥근 타일 */}
      <div className={cx(styles.goalCard, styles.reveal)}>
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

      {/* 슬라이더 아래 고정 높이 존 — stage 2에서 은퇴 시점 멘트가 나타나도
       * 전체 높이가 변하지 않아 위쪽(목표 문장·슬라이더)이 밀려 올라가지 않는다. */}
      {/* 필요 자산 문구 + 요약 화면으로 넘어가는 ▼ */}
      {/* 슬라이더 조작 전에는 숨김 — 고정 높이 존은 유지해 위쪽 레이아웃이 밀리지 않는다 */}
      <div className={styles.scenarioZone}>
        {moved && (
          <>
            <div className={cx(styles.scenarioHead, styles.revealSoft)}>
              <span>
                은퇴 시점에는 최소
                <br />
                {/* 계산 금액은 항상 단독 행 — 값이 바뀌어도 중간 개행되지 않도록 고정 */}
                <span className={styles.scenarioNumLine}>
                  <RollingNumber className={styles.scenarioAmount} value={fmtKRW(requiredNestEgg)} />의
                </span>
                <br />금융 자산이 필요해요.
              </span>
            </div>

            <button type="button" className={styles.stepNext} aria-label="다음 단계" onClick={toSummary}>
              <ChevronDown size={26} strokeWidth={2.6} />
            </button>
          </>
        )}
      </div>
      </div>
      )}

      {/* 최종 단락 — 상단 요약 타일 + 화면 중앙의 마이데이터 안내·연동 버튼.
       * 버튼 클릭 시 곧바로 다음 프로세스(계좌 현황 입력)로 진행 —
       * 다음 화면도 같은 요약 타일을 상단에 유지해 자연스럽게 이어진다. */}
      {stage === 3 && (
        <div className={styles.finalWrap}>
          <div className={styles.reveal}>
            <GoalTiles monthlyGoal={monthlyGoal} requiredNestEgg={requiredNestEgg} />
          </div>

          <div className={styles.mydataCenter}>
            <div className={cx(styles.mydataMsg, styles.revealMid)}>
              지금 가지고 있는 계좌를 알려주시면,
              <br />맞춤형 투자 전략을 추천해드릴게요.
            </div>
            <div className={styles.revealLate}>
              <Button onClick={onNext} icon={ArrowRight}>
                내 계좌 입력하기
              </Button>
            </div>
          </div>

          <p className={cx(styles.disclaimer, styles.revealLate)}>
            * 필요 자산은 은퇴 후 연 4% 인출(4% 룰)을 가정해 역산한 예시 값으로, 향후 동일한 수익을 보장하지 않습니다.
            실제 배분·세제는 다음 단계(성향 분석)에서 계좌별로 정교하게 설계돼요.
          </p>
        </div>
      )}
    </Pad>
  );
}
