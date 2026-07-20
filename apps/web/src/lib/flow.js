/* 화면 단계 정의 및 진행 스텝퍼 매핑
 * 개편된 흐름:
 *  ①목표(onboarding, 목표 생활비 × 20년 ETF 시나리오)
 *  → ②계좌 전략(accounts, 4계좌 여력)
 *  → ③일반 수익률 기준 시뮬레이션/분석(simulate→result)
 *  → ④종목 선택(picker)  → ⑤매수(order)
 * · 프로필 단계(성향 서베이·마이데이터)는 제거 — 목표에서 곧바로 전략으로. */
export const STEPS = [
  "splash",
  "intro", // 서비스 콘셉트 3장 안내(진짜 온보딩)
  "login",
  "onboarding", // ① 목표 — 목표 생활비 × 20년 ETF 시나리오
  "manual", // ①-b 계좌 현황 직접 입력 (마이데이터 대신 슬라이더로 입력)
  "accounts", // ② 계좌 현황(4계좌 여력) + 목표 + 운용 전략
  "simulate", // ③ 일반 수익률 기준 연산
  "result", // ③ 시뮬레이션/분석 결과 (배당세·건보료 비교 포함)
  "picker", // ④ 종목 선택
  "order", // ⑤ 매수 주문 확인·접수
  "done",
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  onboarding: 0,
  manual: 0, // 목표 단계의 연장 — 계좌 현황 입력
  accounts: 1,
  simulate: 2,
  result: 2,
  picker: 3,
  order: 4,
  done: 4,
};

export const STAGE_LABELS = ["목표", "전략", "분석", "종목", "매수"];

/* 헤더(스텝퍼)를 숨기는 단계
 * authWait: 구글 인증 복귀 직후 세션을 기다리는 짧은 대기 화면(STEPS 밖의 임시 상태) */
export const NO_HEADER = ["splash", "login", "intro", "simulate", "done", "authWait"];
