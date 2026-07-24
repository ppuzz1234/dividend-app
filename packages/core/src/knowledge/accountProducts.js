/* ------------------------------------------------------------------ *
 *  계좌별 추천 상품 리스트 — "계좌 별 투자 상품 설정" 화면(ProductSetup)에서
 *  각 계좌 탭에 기본으로 노출할 추천 상품 목록.
 *
 *  · 지금은 파일 기준(아래 ACCOUNT_PRODUCTS). 향후 별도 DB로 이관 예정 —
 *    이관 시 recommendedProducts()/accountStrategy() 만 DB 조회로 바꾸면 화면은 그대로.
 *  · 계좌 id 는 원장/엔진과 동일: 'isa' | 'pensionSavings' | 'irp' | 'general'.
 *  · 각 상품은 self-contained(외부 STOCKS 의존 없음) — 새 상품을 자유롭게 붙일 수 있다.
 *
 *  계좌 shape:  { headline, note?, products: Product[] }
 *  Product shape:
 *    { code, name, desc, yield? }
 *      code  : 종목/상품 코드 (예: '458730', '0137V0') — 주문·시세 매칭 키
 *      name  : 표시 이름       (예: 'TIGER 미국배당다우존스')
 *      desc  : 한줄 차별성/추천 사유
 *      yield : (선택) 연 배당수익률(0~1). 성장형 ETF 등 배당이 핵심이 아니면 생략.
 * ------------------------------------------------------------------ */
export const ACCOUNT_PRODUCTS = {
  // ISA — 국내상장 해외/배당 ETF 15.4% → 9.9% 절감, 만기 시 연금이전 추가 세액공제
  isa: {
    headline: "국내 성장주 + 국내상장 해외 성장 ETF",
    note: "ISA는 국내상장 해외/배당 ETF의 15.4% 과세를 9.9%로 낮추고, 만기 시 연금계좌로 이전하면 추가 세액공제(이전액 10%, 최대 300만원)도 받아요.",
    products: [
      { code: "0137V0", name: "KIWOOM 미국S&P500모멘텀", desc: "한국판 SPMO — S&P500 중 상승 모멘텀 상위 종목만 선별해 지수 대비 성장 탄력 강화 (신생 ETF, 규모·트랙레코드는 짧음)" },
      { code: "497570", name: "TIGER 미국필라델피아AI반도체나스닥", desc: "AI 반도체 테마 강화판, 성장 위성자산" },
      { code: "396500", name: "TIGER 반도체TOP10", desc: "삼성전자·SK하이닉스 등 국내 반도체 대장주 집중 (Fn반도체TOP10)" },
      { code: "305720", name: "KODEX 2차전지산업", desc: "국내 2차전지 밸류체인(LG엔솔·에코프로 등) 성장 베팅" },
      { code: "458730", name: "TIGER 미국배당다우존스", yield: 0.035, desc: "SCHD 추종, ISA에서 배당세 15.4%→9.9% 절감 효과 큼" },
    ],
  },
  // 연금저축(펀드) — 과세이연이라 100% 성장 지수형 공격 배치
  pensionSavings: {
    headline: "100% 성장 지수형 (공격적 배치)",
    products: [
      { code: "133690", name: "TIGER 미국나스닥100", desc: "국내 나스닥100 대표 ETF, 유동성 최상위" },
      { code: "379810", name: "KODEX 미국나스닥100(TR)", desc: "분배금 재투자형, 연금 과세이연과 궁합" },
      { code: "360200", name: "ACE 미국S&P500", desc: "저보수 S&P500, 코어 지수 장기적립에 적합" },
      { code: "381180", name: "TIGER 미국필라델피아반도체나스닥", desc: "엔비디아·브로드컴·TSMC 등 반도체 순수 노출" },
      { code: "381170", name: "TIGER 미국테크TOP10 INDXX", desc: "빅테크 초집중, 변동성 크나 성장 탄력 극대" },
    ],
  },
  // IRP — 코어 성장 70% + 안전자산 30%
  irp: {
    headline: "코어 성장 70% + 안전자산 30%",
    products: [
      { code: "433870", name: "PLUS TDF2050액티브", desc: "TDF — 2050 은퇴시점에 맞춰 위험·안전자산 비중(약 2.5:7.5)을 자동 조정, 퇴직연금 100% 투자 가능한 원스톱 자산배분 (보수 연 0.18%)" },
      { code: "379810", name: "KODEX 미국나스닥100(TR)", desc: "나스닥100 성장주 집중 + TR형, 연금 장기복리에 최적" },
      { code: "381170", name: "TIGER 미국테크TOP10 INDXX", desc: "애플·MS·엔비디아 등 빅테크 10종 집중, 순도 높은 성장 베팅" },
      { code: "458730", name: "TIGER 미국배당다우존스", yield: 0.035, desc: "SCHD 추종, 배당+완만한 성장. 안전자산 대체 겸 현금흐름" },
    ],
  },
  // 일반 위탁계좌 — 한도·상품 제약이 없으므로 위 계좌들의 추천 상품을 전체 나열(아래에서 채움)
  general: {
    headline: "제약 없는 기본 계좌 — 전체 상품에서 선택",
    products: [],
  },
};

/* 일반계좌 = ISA·연금저축·IRP 추천 상품 전체(코드 기준 중복 제거)로 자동 구성 —
 * 위 목록이 바뀌면 함께 갱신된다. */
ACCOUNT_PRODUCTS.general.products = (() => {
  const all = [
    ...ACCOUNT_PRODUCTS.isa.products,
    ...ACCOUNT_PRODUCTS.pensionSavings.products,
    ...ACCOUNT_PRODUCTS.irp.products,
  ];
  const seen = new Set();
  return all.filter((p) => (seen.has(p.code) ? false : seen.add(p.code)));
})();

/** 계좌 id 의 추천 상품 목록 (없으면 빈 배열) — 향후 DB 조회로 교체 지점 */
export function recommendedProducts(accountId) {
  return ACCOUNT_PRODUCTS[accountId]?.products || [];
}

/** 상품 코드로 상품 정보 찾기 (전 계좌 통합 조회) */
export function findProduct(code) {
  for (const key of Object.keys(ACCOUNT_PRODUCTS)) {
    const p = ACCOUNT_PRODUCTS[key].products.find((x) => x.code === code);
    if (p) return p;
  }
  return null;
}

/** 계좌 id 의 전략 헤드라인/주석 */
export function accountStrategy(accountId) {
  const a = ACCOUNT_PRODUCTS[accountId];
  return a ? { headline: a.headline, note: a.note ?? null } : null;
}

export const ACCOUNT_PRODUCTS_VERSION = "2026-07-21";
