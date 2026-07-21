/* 화면 단계 정의 및 진행 스텝퍼 매핑
 * 개편된 흐름:
 *  ①목표(onboarding, 목표 생활비 × 20년 ETF 시나리오)
 *  → ②계좌 전략(accounts, 4계좌 여력)
 *  → ③종목(productSetup, 계좌별 추천 상품 선택 + 금액 배분)
 *  → ④분석(simulate→result, 일반 수익률 기준 시뮬레이션)  → ⑤매수(order)
 * · 프로필 단계(성향 서베이·마이데이터)는 제거 — 목표에서 곧바로 전략으로.
 * · 종목 선택은 ProductSetup 이 담당(구 Picker 화면은 제거). */
export const STEPS = [
  "splash",
  "intro", // 서비스 콘셉트 3장 안내(진짜 온보딩)
  "login",
  "onboarding", // ① 목표 — 목표 생활비 × 20년 ETF 시나리오
  // 계좌 현황 입력은 라우팅 화면이 아니라 온보딩 위로 뜨는 바텀시트(App 의 manualOpen)로 처리
  "accounts", // ② 계좌 현황(4계좌 여력) + 목표 + 운용 전략
  "productSetup", // ③ 종목 — 계좌 별 투자 상품 설정 (추천 상품 선택 + 계좌 총액 내 금액 배분)
  "result", // ④ 분석 결과 — 하단 "배분·투자하기" → 확인 시트 → "최종 진행하기"
  "simulate", // 로딩 — "최종 진행하기" 직후 대기 화면(앱 로고) → 자산 탭으로 자동 진행
  "portfolio", // ⑤ 최종 진행 이후 메인 앱 (뉴스·분석·자산 3탭) — 스텝퍼 밖 목적지
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  onboarding: 0,
  accounts: 1,
  productSetup: 2, // 종목 — 계좌별 상품·금액 설정
  result: 3, // 분석
  // simulate(로딩)·portfolio 는 스텝퍼 없는 화면(NO_HEADER)
};

export const STAGE_LABELS = ["목표", "전략", "종목", "분석", "매수"];

/* 헤더(스텝퍼)를 숨기는 단계
 * authWait: 구글 인증 복귀 직후 세션을 기다리는 짧은 대기 화면(STEPS 밖의 임시 상태) */
export const NO_HEADER = ["splash", "login", "intro", "simulate", "portfolio", "authWait"];
