/* ------------------------------------------------------------------ *
 *  보유 현황 스냅샷 — 파이프라인 ②·③·④의 공통 입력
 *  마이데이터 연동 결과를 {계좌별 잔고·올해 납입액·보유상품}으로 정규화한다.
 *  지금은 예시 목데이터 — 실연동 시 normalizeSnapshot()이 API 응답을 받는다.
 *  · balance: 현재 평가액/예수금
 *  · contributedThisYear: 올해 납입액 (연 한도·세액공제 한도 소진분)
 * ------------------------------------------------------------------ */
export const MYDATA_ACCOUNTS = {
  general: {
    institution: "한화투자증권",
    // 해외ETF에서 연 배당 3,000만 발생 가정 → 평가액 = 3,000만 ÷ 3.5%(배당수익률 가정) 역산
    balance: 857_142_857,
    contributedThisYear: 0,
    holdings: [{ name: "QQQ 나스닥100", productType: "foreignEtf", value: 857_142_857 }],
  },
  isa: {
    institution: "미래에셋증권",
    balance: 12_000_000,
    contributedThisYear: 7_000_000,
    holdings: [
      { name: "KODEX 배당가치", productType: "krEtf", value: 7_000_000 },
      { name: "TIGER 리츠부동산인프라", productType: "krReit", value: 5_000_000 },
    ],
  },
  pension: {
    institution: "한화투자증권",
    balance: 5_000_000,
    contributedThisYear: 3_000_000,
    holdings: [{ name: "TIGER 미국배당다우존스", productType: "krListedGlobalEtf", value: 5_000_000 }],
  },
};

/* 마이데이터(본인확인·소득정보)로 불러오는 개인 프로파일 — 예시 목데이터
 * 금융소득·총소득은 화면에서 사용자가 직접 수정할 수 있는 초기값이다. */
export const MYDATA_PROFILE = {
  age: 45,
  financialIncomePrevYear: 30_000_000, // 전년도 금융소득 — 일반계좌 해외ETF 배당 3,000만과 일관
  totalIncomePrevYear: 90_000_000, // 전년도 총소득
};

/* (Phase 2) 실 마이데이터 응답 → 스냅샷 정규화 자리
 * 보유상품 목록(holdings: [{productType, ticker, value}])이 추가되면
 * rebalance 단계가 productEligibility 와 대조해 이동 제안을 만든다. */
export function normalizeSnapshot(raw = MYDATA_ACCOUNTS) {
  return raw;
}
