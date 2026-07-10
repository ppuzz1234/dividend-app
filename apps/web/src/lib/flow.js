/* 화면 단계 정의 및 진행 스텝퍼 매핑
 * 7단계 비즈니스 파이프라인(docs/ARCHITECTURE.md) 순서를 따른다:
 * ①성향(survey)·정보(mydata) → ②여력(capacity) → ③절세분석(accounts)
 * → ④계좌조정(rebalance) → ⑤배분안(plan) → ⑥종목·갭시뮬(picker~result)
 * → ⑦매수(order) */
export const STEPS = [
  "splash",
  "signup",
  "survey", // ① 투자 성향 서베이
  "mydata", // ① 보유계좌·개인정보 연동
  "capacity", // ② 올해 투자 여력 진단
  "accounts", // ③ 계좌 현황(여력) + 목표 + 운용 전략
  "rebalance", // ④ 보유 상품 운용 계좌 조정
  "plan", // ⑤ 올해 배분안 + 기간·재투자 확정
  "picker", // ⑥ 종목 선택
  "simulate",
  "result", // ⑥ 갭 시뮬레이션 결과
  "order", // ⑦ 매수 주문 확인·접수
  "done",
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  signup: 0,
  survey: 1,
  mydata: 1,
  capacity: 2,
  accounts: 3,
  rebalance: 3,
  plan: 3,
  picker: 4,
  simulate: 5,
  result: 5,
  order: 5,
  done: 5,
};

export const STAGE_LABELS = ["가입", "프로필", "여력", "전략", "종목", "결과"];

/* 헤더(스텝퍼)를 숨기는 단계 */
export const NO_HEADER = ["splash", "simulate", "done"];
