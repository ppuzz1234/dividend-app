/* 화면 단계 정의 및 진행 스텝퍼 매핑 */
export const STEPS = [
  "splash",
  "signup",
  "mydata",
  "recommend",
  "picker",
  "seed",
  "period",
  "account",
  "simulate",
  "result",
  "done",
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  signup: 0,
  mydata: 0,
  recommend: 1,
  picker: 1,
  seed: 2,
  period: 2,
  account: 3,
  simulate: 4,
  result: 4,
  done: 4,
};

export const STAGE_LABELS = ["가입", "종목", "금액", "계좌", "결과"];

/* 헤더(스텝퍼)를 숨기는 단계 */
export const NO_HEADER = ["splash", "simulate", "done"];
