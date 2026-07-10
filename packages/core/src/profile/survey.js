/* ------------------------------------------------------------------ *
 *  ① 투자 성향 서베이 — 문항 정의 (데이터)
 *  응답은 riskProfile.js 가 성향 프로파일로 변환한다.
 *  각 선택지 v 값은 riskProfile 스코어링·accountProfiles.fitFor 와 맞춘다.
 * ------------------------------------------------------------------ */
export const SURVEY_VERSION = "2026.07";

export const SURVEY_QUESTIONS = [
  {
    id: "goal",
    q: "투자의 최우선 목표는 무엇인가요?",
    opts: [
      { v: "retirement", l: "노후 자산 만들기", d: "55세 이후를 위해 길게 불려요" },
      { v: "cashflow", l: "매월 현금흐름 받기", d: "지금 쓸 수 있는 배당이 우선이에요" },
    ],
  },
  {
    id: "horizon",
    q: "이 돈은 언제쯤 쓸 계획인가요?",
    opts: [
      { v: "short", l: "3년 안에", d: "결혼·이사 등 가까운 목돈" },
      { v: "mid", l: "3~10년", d: "중기 목표 자금" },
      { v: "long", l: "10년 이상", d: "노후까지 안 꺼낼 돈" },
    ],
  },
  {
    id: "liquidity",
    q: "중도에 꺼내 쓸 가능성은 어느 정도인가요?",
    opts: [
      { v: "high", l: "높아요", d: "비상시 바로 인출할 수 있어야 해요" },
      { v: "mid", l: "가끔은요", d: "일부는 묶여도 괜찮아요" },
      { v: "low", l: "거의 없어요", d: "55세까지 묶여도 괜찮아요" },
    ],
  },
  {
    id: "risk",
    q: "투자자산이 한 해 -20% 하락하면 어떻게 하시겠어요?",
    opts: [
      { v: "conservative", l: "일부라도 팔아요", d: "손실이 커지는 게 더 무서워요" },
      { v: "neutral", l: "그대로 둬요", d: "회복을 기다릴 수 있어요" },
      { v: "aggressive", l: "더 사요", d: "쌀 때가 기회라고 생각해요" },
    ],
  },
];

/** 모든 문항에 답했는지 */
export function surveyComplete(answers = {}) {
  return SURVEY_QUESTIONS.every((q) => answers[q.id]);
}
