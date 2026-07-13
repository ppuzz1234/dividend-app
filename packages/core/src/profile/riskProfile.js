import { ACCOUNT_PROFILES } from "../knowledge/accountProfiles.js";
import { surveyGoal } from "./survey.js";

/* ------------------------------------------------------------------ *
 *  ① 성향 프로파일 — 서베이 응답(양자택일 타일) → RiskProfile
 *  응답을 내부 태그(goal·horizon·liquidity)로 변환한 뒤
 *  accountProfiles 의 fitFor 태그와 대조해 계좌별 적합도를 매긴다.
 * ------------------------------------------------------------------ */

const TYPE_LABELS = {
  "retirement.stock": "장기 절세 · 종목 선별형",
  "retirement.etf": "장기 절세 · 지수 적립형",
  "cashflow.stock": "현금흐름 · 종목 선별형",
  "cashflow.etf": "현금흐름 · 지수 적립형",
};

/* 서베이 응답 → 내부 성향 태그 */
function toTags(answers) {
  const H = {
    anytime: { horizon: "short", liquidity: "high" }, // 언제든 해지 — 최대 자유도
    midshort: { horizon: "mid", liquidity: "mid" }, // 중도 인출 가능성 있음
    ultralong: { horizon: "long", liquidity: "low" },
  };
  const t = H[answers.horizon] || H.midshort;
  return { goal: surveyGoal(answers), ...t }; // ultralong→retirement, 그 외→cashflow
}

/* fitFor 태그 대조 점수 (계좌 적합도) */
function fitScore(fit, tags) {
  let score = 0;
  const reasons = [];

  // 투자 기간: 계좌의 기대 horizon과 응답 일치도
  const H = { short: 0, mid: 1, long: 2, any: -1 };
  if (fit.horizon === "any" || fit.horizon === tags.horizon) {
    score += 2;
  } else if (Math.abs(H[fit.horizon] - H[tags.horizon]) === 1) {
    score += 1;
  } else if (fit.horizon === "long" && tags.horizon === "short") {
    score -= 2;
    reasons.push("단기 자금은 55세까지 묶이는 계좌와 맞지 않아요");
  }

  // 유동성 니즈: 계좌가 감당 가능한 인출 수준 vs 응답
  const L = { low: 0, mid: 1, high: 2 };
  if (L[fit.liquidityNeed] >= L[tags.liquidity]) {
    score += 2;
  } else {
    score -= L[tags.liquidity] - L[fit.liquidityNeed];
    if (tags.liquidity === "high") reasons.push("중도 인출이 잦으면 페널티·제약이 커요");
  }

  // 목표 일치
  if (fit.goals.includes(tags.goal)) score += 2;

  // 절세 효과: 오래 굴릴수록 절세계좌의 복리 이점이 커짐
  if (fit.taxSensitivity === "high") score += tags.horizon === "long" ? 2 : 1;

  return { score, reasons };
}

/**
 * 서베이 응답 → 성향 프로파일.
 * @param {object} answers  { productStyle: 'stock'|'etf', horizon: 'midshort'|'ultralong' }
 * @returns {{ goal, horizon, liquidity, productStyle, typeLabel,
 *             accountFit: Array<{id, name, score, reasons}>, cautions: string[] }}
 */
export function buildRiskProfile(answers) {
  const tags = toTags(answers);

  const accountFit = Object.values(ACCOUNT_PROFILES)
    .map((p) => {
      const { score, reasons } = fitScore(p.fitFor, tags);
      return { id: p.id, name: p.name, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const cautions = [];
  if (answers.horizon === "anytime")
    cautions.push("언제든 해지하려면 일반계좌·ISA(원금 내 인출) 중심이 좋아요 — 연금계좌는 55세까지 묶여요.");
  if (answers.horizon === "midshort")
    cautions.push("중도 인출 가능성이 있으면 연금계좌(55세 잠김) 비중을 낮추는 게 안전해요.");
  if (answers.productStyle === "stock")
    cautions.push("개별 주식은 연금저축·IRP에 담을 수 없어요 — 절세계좌 몫은 ETF로 채워요.");

  return {
    ...tags,
    productStyle: answers.productStyle,
    typeLabel: TYPE_LABELS[`${tags.goal}.${answers.productStyle}`] || "균형형",
    accountFit,
    cautions,
  };
}
