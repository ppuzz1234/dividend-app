import { KIS, TR } from "./config.js";
import { getAccessToken } from "./token.js";
import { stubQuote } from "./stub.js";

/* ------------------------------------------------------------------ *
 *  현재가 조회 (국내/해외) — 정규화된 단일 형태로 반환
 *  · 키 없으면 stub 시세
 *  · 짧은 TTL 캐시로 KIS 유량(초당 ~20건/모의 ~2건) 보호
 *  market: "K"(국내) | "U"(해외)
 * ------------------------------------------------------------------ */
const CACHE_TTL = 3_000;
const cache = new Map(); // key -> { data, exp }

const num = (v) => (v == null || v === "" ? 0 : Number(v));

export async function getQuote(market, symbol, exchange) {
  const key = `${market}:${symbol}:${exchange || ""}`;
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.data;

  const data = KIS.hasKeys
    ? await fetchFromKis(market, symbol, exchange)
    : stubQuote(market, symbol);

  cache.set(key, { data, exp: Date.now() + CACHE_TTL });
  return data;
}

async function fetchFromKis(market, symbol, exchange) {
  const token = await getAccessToken();
  const baseHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    appkey: KIS.appKey,
    appsecret: KIS.appSecret,
    custtype: "P",
  };

  if (market === "U") {
    // 해외주식 현재가
    const qs = new URLSearchParams({ AUTH: "", EXCD: exchange || "NAS", SYMB: symbol });
    const res = await fetch(`${KIS.base.rest}/uapi/overseas-price/v1/quotations/price?${qs}`, {
      headers: { ...baseHeaders, tr_id: TR.overseasPrice },
    });
    if (!res.ok) throw new Error(`overseas price ${res.status}`);
    const o = (await res.json()).output || {};
    return {
      market,
      symbol,
      price: num(o.last),
      prevClose: num(o.base),
      change: num(o.diff),
      changePct: num(o.rate),
      volume: num(o.tvol),
      currency: o.curr || "USD",
      ts: Date.now(),
      source: "kis",
    };
  }

  // 국내주식 현재가
  const qs = new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: symbol });
  const res = await fetch(`${KIS.base.rest}/uapi/domestic-stock/v1/quotations/inquire-price?${qs}`, {
    headers: { ...baseHeaders, tr_id: TR.domesticPrice },
  });
  if (!res.ok) throw new Error(`domestic price ${res.status}`);
  const o = (await res.json()).output || {};
  const sign = o.prdy_vrss_sign; // 1,2 상승 / 4,5 하락
  const dir = sign === "4" || sign === "5" ? -1 : 1;
  return {
    market,
    symbol,
    price: num(o.stck_prpr),
    prevClose: num(o.stck_prpr) - dir * num(o.prdy_vrss),
    change: dir * num(o.prdy_vrss),
    changePct: dir * num(o.prdy_ctrt),
    volume: num(o.acml_vol),
    currency: "KRW",
    ts: Date.now(),
    source: "kis",
  };
}
