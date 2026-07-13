/* ------------------------------------------------------------------ *
 *  ① 투자 성향 서베이 — 문항 정의 (데이터)
 *  양자택일 타일 2문항 + 월 불입 가능 금액(슬라이더).
 *  응답은 riskProfile.js 가 성향 프로파일로 변환한다.
 * ------------------------------------------------------------------ */
export const SURVEY_VERSION = "2026.07.2";

export const SURVEY_QUESTIONS = [
  {
    id: "productStyle",
    q: "선호 상품 스타일",
    opts: [
      { v: "stock", l: "개별 주식", d: "특정 기업 또는 종목에 대한 지식 기반" },
      { v: "etf", l: "ETF", d: "산업 전반과 지수 추종" },
    ],
  },
  {
    id: "horizon",
    q: "투자 기간과 수익",
    opts: [
      { v: "anytime", l: "상시", d: "언제든지 해지 가능. 최대 자유도" },
      { v: "midshort", l: "중단기", d: "중도 인출 가능성 있음, 자산 포트폴리오 자주 개편" },
      { v: "ultralong", l: "초장기", d: "인출 없이 지속적 불입, 55세 이후 꾸준한 월배당 기대" },
    ],
  },
];

/* 3번 문항: 월 불입 가능 금액 (슬라이더) — 화면 표기용 메타 */
export const SURVEY_MONTHLY = {
  id: "monthly",
  q: "월 불입 가능 금액",
  min: 0,
  max: 10_000_000,
  step: 50_000,
  presets: [100_000, 300_000, 500_000, 1_000_000],
};

/** 타일 문항에 모두 답했는지 (월 불입금은 기본값이 있어 항상 유효) */
export function surveyComplete(answers = {}) {
  return SURVEY_QUESTIONS.every((q) => answers[q.id]);
}

/** 투자 기간 응답 → 전략 엔진 목표 매핑 */
export function surveyGoal(answers = {}) {
  return answers.horizon === "ultralong" ? "retirement" : "cashflow";
}
