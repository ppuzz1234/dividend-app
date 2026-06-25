import express from "express";
import { KIS } from "./kis/config.js";
import { getQuote } from "./kis/quote.js";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 백오피스 API
 *  · 한국투자증권(KIS) 시세 프록시 — 프론트는 이 서버만 호출
 *  · APP KEY/SECRET 미설정 시 stub(가상) 시세로 응답 (키 없이 개발 가능)
 * ------------------------------------------------------------------ */
const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(express.json());
// 개발 편의용 CORS (프론트가 직접 호출할 때). Vite 프록시 사용 시엔 불필요.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "devidend-api", ts: Date.now() });
});

// KIS 연동 상태
app.get("/api/kis/status", (req, res) => {
  res.json({ env: KIS.env, hasKeys: KIS.hasKeys, source: KIS.hasKeys ? "kis" : "stub" });
});

// 현재가 조회: /api/quote/K/005930  ·  /api/quote/U/SCHD?exchange=AMS
app.get("/api/quote/:market/:symbol", async (req, res) => {
  try {
    const market = req.params.market.toUpperCase() === "U" ? "U" : "K";
    const q = await getQuote(market, req.params.symbol, req.query.exchange);
    res.json(q);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`[devidend-api] listening on http://localhost:${PORT} (KIS ${KIS.env}, ${KIS.hasKeys ? "live" : "stub"})`);
});
