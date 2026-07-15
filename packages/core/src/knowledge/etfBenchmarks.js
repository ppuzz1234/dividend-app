/* 온보딩 시나리오용 ETF 벤치마크 — 한국(PLUS200)·미국(TOPT) 각 1종.
 * yield/divG/priceG 는 simulate.js 의 blend 입력과 동일한 형태의 "참고 가정치"이며,
 * 펀드 팩트시트에 표기된 설정후 연환산(또는 누적)수익률을 근거로 역산한 예시값이다.
 * 실제 미래 수익률을 보장하지 않음. */
export const ETF_BENCHMARKS = [
  {
    id: "plus200",
    region: "KR",
    name: "PLUS 200",
    ticker: "152100",
    manager: "한화자산운용",
    desc: "코스피200 지수를 그대로 담는 국내 대표 인덱스 ETF",
    inceptionDate: "2012-01-09",
    asOf: "2026-06-30",
    expenseRatio: 0.00017,
    yield: 0.015,
    divG: 0.03,
    priceG: 0.135,
    cagrRef: 0.15,
    sourceNote: "설정후(2012.01~2026.06) 누적 654.75% → 연환산 약 15% (PLUS ETF 팩트시트 기준)",
  },
  {
    id: "topt",
    region: "US",
    name: "TOPT",
    ticker: "iShares Top 20 U.S. Stocks ETF",
    manager: "BlackRock",
    desc: "미국 시가총액 상위 20개 기업에 집중 투자하는 ETF",
    inceptionDate: "2024-10-23",
    asOf: "2026-03-31",
    expenseRatio: 0.0020,
    yield: 0.0042,
    divG: 0.05,
    priceG: 0.1107,
    cagrRef: 0.1149,
    sourceNote: "설정후 연환산 수익률(NAV) 11.49% (iShares 팩트시트 2026.03 기준)",
  },
];
