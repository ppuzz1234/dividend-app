/* 화면 단계 정의 및 진행 스텝퍼 매핑 */
export const STEPS = [
  "splash",
  "signup",
  "mydata",
  "accounts", // 계좌 현황(여력) + 목표 + 운용 전략
  "picker",
  "seed",
  "period",
  "simulate",
  "result",
  "done",
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  signup: 0,
  mydata: 0,
  accounts: 1,
  picker: 2,
  seed: 3,
  period: 3,
  simulate: 4,
  result: 4,
  done: 4,
};

export const STAGE_LABELS = ["가입", "계좌·전략", "종목", "금액", "결과"];

/* 헤더(스텝퍼)를 숨기는 단계 */
export const NO_HEADER = ["splash", "simulate", "done"];
