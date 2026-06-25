/* ------------------------------------------------------------------ *
 *  Stub(가상) 시세 — 키 없이도 프론트가 동작하도록 합성 시세를 생성
 *  · 심볼별 기준가(base)는 결정적으로 고정, 가격은 호출마다 랜덤워크
 *  · base 를 전일종가로 삼아 등락률을 계산 → "인베스팅 느낌"의 변동 표시
 *  · source: "stub" 로 표시되어 실연동과 구분됨
 * ------------------------------------------------------------------ */
const state = new Map();

function hash(s) {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export function stubQuote(market, symbol) {
  const usd = market === "U";
  let st = state.get(symbol);
  if (!st) {
    const base = usd ? 20 + (hash(symbol) % 280) : 10000 + (hash(symbol) % 190000);
    st = { base, price: base };
    state.set(symbol, st);
  }
  // 랜덤워크 (기준가의 ±0.4%)
  st.price = Math.max(0.01, st.price + (Math.random() - 0.5) * st.base * 0.008);
  const change = st.price - st.base;
  const dp = usd ? 2 : 0;
  return {
    market,
    symbol,
    price: round(st.price, dp),
    prevClose: round(st.base, dp),
    change: round(change, dp),
    changePct: round((change / st.base) * 100, 2),
    volume: 100_000 + (hash(symbol) % 900_000) + Math.floor(Math.random() * 50_000),
    currency: usd ? "USD" : "KRW",
    ts: Date.now(),
    source: "stub",
  };
}
