/* ------------------------------------------------------------------ *
 *  보유 현황 스냅샷 — 파이프라인 ②·③·④의 공통 입력
 *  마이데이터 연동 결과를 {계좌별 잔고·올해 납입액·보유상품}으로 정규화한다.
 *  지금은 예시 목데이터 — 실연동 시 normalizeSnapshot()이 API 응답을 받는다.
 *  · balance: 현재 평가액/예수금
 *  · contributedThisYear: 올해 납입액 (연 한도·세액공제 한도 소진분)
 * ------------------------------------------------------------------ */
export const MYDATA_ACCOUNTS = {
  isa: {
    institution: "한화투자증권",
    balance: 3_000_000,
    contributedThisYear: 3_000_000,
    holdings: [
      { name: "KODEX 배당가치", productType: "krEtf", value: 2_000_000 },
      { name: "TIGER 리츠부동산인프라", productType: "krReit", value: 1_000_000 },
    ],
  },
  pension: {
    institution: "한화자산운용",
    balance: 2_000_000,
    contributedThisYear: 2_000_000,
    holdings: [{ name: "TIGER 미국배당다우존스", productType: "krListedGlobalEtf", value: 2_000_000 }],
  },
  general: {
    institution: "키움증권",
    balance: 15_000_000,
    contributedThisYear: 0,
    holdings: [{ name: "QQQ 나스닥100", productType: "foreignEtf", value: 15_000_000 }],
  },
};

/* 마이데이터(본인확인·소득정보)로 불러오는 개인 프로파일 — 예시 목데이터
 * 금융소득·총소득은 화면에서 사용자가 직접 수정할 수 있는 초기값이다. */
export const MYDATA_PROFILE = {
  name: "고객", // 데모(목업) 사용자 닉네임 — 실 로그인 시 프로필 이름으로 대체됨
  age: 35,
  /* 소득 '종류' 분리 — 계좌 가입자격 판정에 필요:
   * ISA 15~19세는 근로소득만 인정(사업·배당 불인정), IRP는 근로·사업소득 필요 */
  earnedIncomePrevYear: 80_000_000, // 전년도 근로소득
  businessIncomePrevYear: 0, // 전년도 사업소득
  financialIncomePrevYear: 10_000_000, // 전년도 금융소득(이자+배당)
  totalIncomePrevYear: 90_000_000, // 전년도 총소득 (= 근로 + 사업 + 금융)
};

/* (Phase 2) 실 마이데이터 응답 → 스냅샷 정규화 자리
 * 보유상품 목록(holdings: [{productType, ticker, value}])이 추가되면
 * rebalance 단계가 productEligibility 와 대조해 이동 제안을 만든다. */
export function normalizeSnapshot(raw = MYDATA_ACCOUNTS) {
  return raw;
}
