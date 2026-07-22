/* 화면 단계 정의 및 진행 스텝퍼 매핑
 * 개편된 흐름(로그인 이후):
 *  ② 마이데이터 동의(mydata) — 데모=목업 연동 / 구글=수기입력(+나이·연소득)
 *  ③ 3종계좌 최적화 분석(accountsAnalysis) — 나이 기반 계좌 역할·세제 최적화 '가설'(금액 없음)
 *  ⑤ 목표 Passive Income(passiveGoal) — 은퇴 60세 고정, 투자기간=max(5,60−나이)
 *  ⑥ 최적 솔루션 도출(strategy) — 목표 반영 계좌별 월 투자금 배분
 *  ⑦ 배분 방식 결정(allocate) — 추천 상품 자동배정 + 매수 주기(일/주/월) 게이미피케이션
 *  ⑧ 최종 점검·실행(result) → 로딩(simulate) → 메인 앱(portfolio)
 * · 전환 메시지(④)는 passiveGoal 화면의 첫 히어로로 흡수. */
export const STEPS = [
  "splash",
  "intro", // 서비스 콘셉트 3장 안내
  "login",
  "mydata", // ② 마이데이터 동의 (데모 목업 연동 / 구글 수기입력)
  "accountsAnalysis", // ③ 3종계좌 최적화 분석 (나이 기반 가설 · 금액 없음)
  "passiveGoal", // ⑤ 목표 Passive Income (기간=60−나이)
  "strategy", // ⑥ 최적 솔루션 — 목표 반영 계좌별 배분
  "allocate", // ⑦ 배분 방식(일/주/월) 결정 — 게이미피케이션
  "result", // ⑧ 최종 점검 — 하단 "배분·투자하기" → 확인 시트 → "최종 진행하기"
  "simulate", // 로딩 — "최종 진행하기" 직후 대기 화면(앱 로고) → 메인 앱으로 자동 진행
  "portfolio", // 최종 진행 이후 메인 앱 (뉴스·분석·자산 3탭) — 스텝퍼 밖 목적지
];

/* 각 단계가 스텝퍼의 몇 번째 스테이지에 속하는지 */
export const STAGE = {
  mydata: 0,
  accountsAnalysis: 1,
  passiveGoal: 2,
  strategy: 3,
  allocate: 4,
  result: 5,
  // simulate(로딩)·portfolio 는 스텝퍼 없는 화면(NO_HEADER)
};

export const STAGE_LABELS = ["연동", "계좌분석", "목표", "솔루션", "배분", "실행"];

/* 헤더(스텝퍼)를 숨기는 단계
 * authWait: 구글 인증 복귀 직후 세션을 기다리는 짧은 대기 화면(STEPS 밖의 임시 상태) */
export const NO_HEADER = ["splash", "login", "intro", "simulate", "portfolio", "authWait"];
