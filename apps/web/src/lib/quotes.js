/* ------------------------------------------------------------------ *
 *  시세 클라이언트 — 백엔드(apps/api) KIS 프록시만 호출 (KIS 직접 호출 X)
 *  · 개발 시 Vite 프록시(/api → :4000)를 통해 동일 출처로 요청
 *  · VITE_API_BASE 로 백엔드 주소 오버라이드 가능
 * ------------------------------------------------------------------ */
const BASE = import.meta.env.VITE_API_BASE || "";

/** 종목 → KIS 조회 참조 (market/symbol/exchange) */
export function quoteRef(stock) {
  return stock.region === "US"
    ? { market: "U", symbol: stock.symbol || stock.name, exchange: stock.exchange || "NAS" }
    : { market: "K", symbol: stock.symbol || stock.ticker };
}

export async function fetchQuote({ market, symbol, exchange }) {
  const qs = exchange ? `?exchange=${encodeURIComponent(exchange)}` : "";
  const r = await fetch(`${BASE}/api/quote/${market}/${encodeURIComponent(symbol)}${qs}`);
  if (!r.ok) throw new Error(`quote ${r.status}`);
  return r.json();
}

/** 현재가 표시 포맷 (₩ / $) */
export function fmtPrice(q) {
  if (!q) return "—";
  return q.currency === "USD"
    ? `$${q.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `₩${Math.round(q.price).toLocaleString()}`;
}

/** 등락률 포맷 (+1.23% / -0.45%) */
export function fmtChange(q) {
  if (!q) return "";
  const s = q.changePct > 0 ? "+" : "";
  return `${s}${q.changePct.toFixed(2)}%`;
}
