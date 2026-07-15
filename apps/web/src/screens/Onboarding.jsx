import { ArrowRight, TrendingUp, Landmark } from "lucide-react";
import { projectRetirementScenario } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Plus200Logo, ToptLogo } from "../components/ui/EtfLogos.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Onboarding.module.css";

const YEARS = 20;
const LOGOS = { plus200: Plus200Logo, topt: ToptLogo };
const PRESETS = [100, 300, 500, 1000];

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* 서베이 진입 전 훅 화면 — "20년 뒤 매달 목표 생활비를 받으려면?"
 * 목표 생활비(연 4% 인출 가정)로 필요한 은퇴 시드를 역산하고, 한국(PLUS200)·
 * 미국(TOPT) ETF 각각의 연환산 수익률 기준으로 그 시드를 20년간 만들기 위한
 * 필요 월 불입금을 배당 재투자 가정으로 역산해 보여준다. */
export function Onboarding({ monthlyGoal, setMonthlyGoal, onNext }) {
  const { requiredNestEgg, perEtf } = projectRetirementScenario({
    monthlyLivingCost: monthlyGoal * 10_000,
    years: YEARS,
  });

  return (
    <Pad
      footer={
        <Button onClick={onNext} icon={ArrowRight}>
          목표 확인했어요 · 시작하기
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
          <span className={styles.goalText}>저는 20년 뒤, 매월</span>
          <input
            type="text"
            inputMode="numeric"
            value={monthlyGoal}
            onChange={(e) => setMonthlyGoal(digits(e.target.value))}
            className={styles.goalInput}
          />
          <span className={styles.goalText}>만원의 생활비가 필요해요</span>
        </div>
        <div className={styles.presets}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMonthlyGoal(p)}
              className={cx(styles.preset, monthlyGoal === p && styles.presetOn)}
            >
              {p}만원
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scenarioHead}>
        <TrendingUp size={15} />
        <span>
          {YEARS}년 뒤 매달 {monthlyGoal.toLocaleString()}만원을 받으려면 최소{" "}
          <span className={styles.scenarioAmount}>{fmtKRW(requiredNestEgg)}</span>이 필요합니다
        </span>
      </div>

      <div className={styles.grid}>
        {perEtf.map(({ etf, requiredMonthly }) => {
          const Logo = LOGOS[etf.id];
          return (
            <div key={etf.id} className={styles.card}>
              <div className={styles.cardHead}>
                <Logo size={36} />
                <div className={styles.cardTitle}>{etf.name}</div>
                <span className={styles.cardRegion}>{etf.region === "KR" ? "국내" : "미국"}</span>
                <div className={styles.cardDesc}>{etf.desc}</div>
              </div>

              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <div className={styles.metricLabel}>{YEARS}년 동안 매월 불입금</div>
                  <div className={styles.metricValue}>{fmtKRW(requiredMonthly)}</div>
                </div>
              </div>

              <div className={styles.cardFoot}>
                <Landmark size={11} />
                <span>
                  배당 재투자 가정
                  <br />
                  {etf.sourceNote}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className={styles.disclaimer}>
        * 필요 자산은 은퇴 후 연 4% 인출(4% 룰)을 가정해 역산한 값이며, 월 불입금은 각 ETF의 설정후(과거) 수익률을 참고한
        예시로 향후 동일한 수익을 보장하지 않습니다. 실제 배분·세제는 다음 단계(성향 분석)에서 계좌별로 정교하게 설계돼요.
      </p>
    </Pad>
  );
}
