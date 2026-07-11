/* 화면 단계 정의 및 진행 스텝퍼 매핑
 * 개편된 흐름:
 *  ①성향(survey) → ②프로필·마이데이터 연동(mydata)
 *  → ③계좌 전략(accounts, 4계좌 여력)
 *  → ④일반 수익률 기준 시뮬레이션/분석(simulate→result)
 *  → ⑤종목 선택(picker)  → ⑥매수(order)
 * · 여력(capacity) 화면은 마이데이터 연동으로 대체되어 제거.
 * · 종목 선택은 시뮬레이션/분석 이후로 이동. */
export const STEPS = [
  "splash",
  "login",
  "survey", // ① 투자 성향 서베이
  "mydata", // ② 보유계좌·개인정보 마이데이터 연동
  "accounts", // ③ 계좌 현황(4계좌 여력) + 목표 + 운용 전략
  "simulate", // ④ 일반 수익률 기준 연산
  "result", // ④ 시뮬레이션/분석 결과 (배당세·건보료 비교 포함)
  "picker", // ⑤ 종목 선택
  "order", // ⑥ 매수 주문 확인·접수
  "done",
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  signup: 0,
  survey: 1,
  mydata: 1,
  accounts: 2,
  simulate: 3,
  result: 3,
  picker: 4,
  order: 5,
  done: 5,
};

export const STAGE_LABELS = ["가입", "프로필", "전략", "분석", "종목", "매수"];

/* 헤더(스텝퍼)를 숨기는 단계 */
export const NO_HEADER = ["splash", "login", "simulate", "done"];
