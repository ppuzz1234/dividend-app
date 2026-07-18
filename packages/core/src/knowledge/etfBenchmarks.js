/* 온보딩 시나리오용 ETF 벤치마크 — 미국(PLUS 미국S&P500) 1종.
 * yield/divG/priceG 는 simulate.js 의 blend 입력과 동일한 형태의 "참고 가정치"이며,
 * 펀드 팩트시트에 표기된 설정후 연환산(또는 누적)수익률을 근거로 역산한 예시값이다.
 * 실제 미래 수익률을 보장하지 않음. */
export const ETF_BENCHMARKS = [
  {
    id: "plusSp500",
    region: "US",
    name: "PLUS 미국S&P500",
    ticker: "429760",
    manager: "한화자산운용",
    desc: "미국 대표 500개 기업으로 구성된 S&P500 지수에 투자하는 ETF",
    inceptionDate: "2022-05-27",
    asOf: "2026-06-30",
    expenseRatio: 0.0007,
    yield: 0.0086, // 최근 1년 분배금 182원 / 기준가(NAV) 21,286원
    divG: 0.05,
    priceG: 0.0914, // 연 총수익 10% 가정 − 배당수익률 0.86%
    cagrRef: 0.1, // 장기 계획용 보수적 가정치 (설정후 실적 연환산 21.7%를 하향 조정)
    sourceNote:
      "장기 시나리오는 연 10% 가정으로 계산해요. 참고: 설정후(2022.05~2026.06) 누적 123.04% → 연환산 약 21.7% (PLUS ETF 팩트시트 2026.06 기준)",
  },
];
