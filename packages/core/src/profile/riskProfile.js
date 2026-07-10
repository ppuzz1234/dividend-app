import { ACCOUNT_PROFILES } from "../knowledge/accountProfiles.js";

/* ------------------------------------------------------------------ *
 *  ① 성향 프로파일 — 서베이 응답 → RiskProfile
 *  accountProfiles 의 fitFor 태그와 응답을 대조해 계좌별 적합도를 매긴다.
 *  결과는 ③ 절세 분석·⑤ 배분 제안의 입력이 된다.
 * ------------------------------------------------------------------ */

const TYPE_LABELS = {
  "retirement.aggressive": "장기 절세 성장형",
  "retirement.neutral": "장기 절세 균형형",
  "retirement.conservative": "장기 절세 안정형",
  "cashflow.aggressive": "현금흐름 적극형",
  "cashflow.neutral": "현금흐름 균형형",
  "cashflow.conservative": "현금흐름 안정형",
};

/* fitFor 태그 대조 점수 (계좌 적합도) */
function fitScore(fit, answers) {
  let score = 0;
  const reasons = [];

  // 투자 기간: 계좌의 기대 horizon과 응답 일치도
  const H = { short: 0, mid: 1, long: 2, any: -1 };
  if (fit.horizon === "any" || fit.horizon === answers.horizon) {
    score += 2;
  } else if (Math.abs(H[fit.horizon] - H[answers.horizon]) === 1) {
    score += 1;
  } else if (fit.horizon === "long" && answers.horizon === "short") {
    score -= 2;
    reasons.push("3년 내 쓸 돈은 55세까지 묶이는 계좌와 맞지 않아요");
  }

  // 유동성 니즈: 계좌가 감당 가능한 인출 수준 vs 응답
  const L = { low: 0, mid: 1, high: 2 };
  if (L[fit.liquidityNeed] >= L[answers.liquidity]) {
    score += 2;
  } else {
    score -= L[answers.liquidity] - L[fit.liquidityNeed];
    if (answers.liquidity === "high") reasons.push("중도 인출이 잦으면 페널티·제약이 커요");
  }

  // 목표 일치
  if (fit.goals.includes(answers.goal)) score += 2;

  // 절세 효과: 오래 굴릴수록 절세계좌의 복리 이점이 커짐
  if (fit.taxSensitivity === "high") score += answers.horizon === "long" ? 2 : 1;

  return { score, reasons };
}

/**
 * 서베이 응답 → 성향 프로파일.
 * @returns {{ goal, horizon, liquidity, riskTolerance, typeLabel,
 *             accountFit: Array<{id, name, score, reasons}> , cautions: string[] }}
 */
export function buildRiskProfile(answers) {
  const { goal, horizon, liquidity, risk } = answers;

  const accountFit = Object.values(ACCOUNT_PROFILES)
    .map((p) => {
      const { score, reasons } = fitScore(p.fitFor, answers);
      return { id: p.id, name: p.name, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const cautions = [];
  if (horizon === "short" || liquidity === "high")
    cautions.push("단기·고유동성 자금은 연금계좌(55세 잠김) 비중을 낮추는 게 안전해요.");
  if (risk === "conservative")
    cautions.push("변동성이 부담이면 IRP 안전자산 30%(예금·채권형)를 적극 활용해요.");

  return {
    goal,
    horizon,
    liquidity,
    riskTolerance: risk,
    typeLabel: TYPE_LABELS[`${goal}.${risk}`] || "균형형",
    accountFit,
    cautions,
  };
}
