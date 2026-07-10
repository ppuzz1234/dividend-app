/* 상품 유형(영역) — 계좌별 추천·필터에 사용. 상세 로직은 추후 고도화 */
export const CATEGORIES = [
  { id: "high", label: "고배당주", desc: "배당수익률이 높은 종목" },
  { id: "growth", label: "배당성장주", desc: "배당을 꾸준히 늘리는 종목" },
  { id: "etf", label: "ETF", desc: "지수·바스켓 분산 상품" },
  { id: "coveredcall", label: "커버드콜", desc: "옵션 매도로 고분배" },
];

/* 종목 데이터 (예시 가정치) — 실제 수익률이 아님
 * KIS 시세 조회용: 국내는 symbol=종목코드, 해외는 symbol+exchange(NAS/NYS/AMS).
 * (해외 거래소코드는 추정값 — 실연동 전 검증 필요) */
export const STOCKS = [
  { id: "schd", name: "SCHD", ticker: "美 배당성장 ETF", symbol: "SCHD", exchange: "AMS", region: "US", type: "growth", category: "etf", sector: "ETF", yield: 0.035, divG: 0.11, priceG: 0.085, elite: true },
  { id: "kb", name: "KB금융", ticker: "105560", symbol: "105560", region: "KR", type: "high", category: "high", sector: "금융", yield: 0.052, divG: 0.07, priceG: 0.06, elite: true },
  { id: "ko", name: "코카콜라", ticker: "KO", symbol: "KO", exchange: "NYS", region: "US", type: "growth", category: "growth", sector: "필수소비재", yield: 0.030, divG: 0.05, priceG: 0.06, elite: true },
  { id: "ss", name: "삼성전자", ticker: "005930", symbol: "005930", region: "KR", type: "growth", category: "growth", sector: "반도체", yield: 0.026, divG: 0.05, priceG: 0.07 },
  { id: "shin", name: "신한지주", ticker: "055550", symbol: "055550", region: "KR", type: "high", category: "high", sector: "금융", yield: 0.050, divG: 0.06, priceG: 0.05 },
  { id: "skt", name: "SK텔레콤", ticker: "017670", symbol: "017670", region: "KR", type: "high", category: "high", sector: "통신", yield: 0.064, divG: 0.02, priceG: 0.02 },
  { id: "ktg", name: "KT&G", ticker: "033780", symbol: "033780", region: "KR", type: "high", category: "high", sector: "필수소비재", yield: 0.058, divG: 0.03, priceG: 0.03 },
  { id: "mki", name: "맥쿼리인프라", ticker: "088980", symbol: "088980", region: "KR", type: "high", category: "high", sector: "인프라", yield: 0.065, divG: 0.03, priceG: 0.02 },
  { id: "sf", name: "삼성화재", ticker: "000810", symbol: "000810", region: "KR", type: "growth", category: "growth", sector: "보험", yield: 0.042, divG: 0.08, priceG: 0.07 },
  { id: "jepi", name: "JEPI", ticker: "美 커버드콜 ETF", symbol: "JEPI", exchange: "AMS", region: "US", type: "high", category: "coveredcall", sector: "ETF", yield: 0.080, divG: 0.005, priceG: 0.03 },
  { id: "o", name: "리얼티인컴", ticker: "O · 美리츠", symbol: "O", exchange: "NYS", region: "US", type: "high", category: "high", sector: "리츠", yield: 0.055, divG: 0.03, priceG: 0.035 },
  { id: "jnj", name: "존슨앤드존슨", ticker: "JNJ", symbol: "JNJ", exchange: "NYS", region: "US", type: "growth", category: "growth", sector: "헬스케어", yield: 0.031, divG: 0.06, priceG: 0.055 },
  { id: "qyld", name: "QYLD", ticker: "美 나스닥 커버드콜", symbol: "QYLD", exchange: "NAS", region: "US", type: "high", category: "coveredcall", sector: "ETF", yield: 0.115, divG: 0.0, priceG: 0.01 },
  { id: "tigerschd", name: "TIGER 미국배당다우존스", ticker: "458730", symbol: "458730", region: "KR", type: "growth", category: "etf", sector: "ETF", yield: 0.035, divG: 0.10, priceG: 0.07 },
];
