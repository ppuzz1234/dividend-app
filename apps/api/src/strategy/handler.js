import { Router } from "express";
import { buildStrategy } from "./provider.js";
import { tableVersions } from "./repository.js";

/* ------------------------------------------------------------------ *
 *  H — Handler: 전략 API 라우트 (입출력·검증만, 로직은 Provider)
 *  POST /api/strategy        사용자 입력 → 전략 산출
 *  GET  /api/strategy/tables 데이터 테이블 버전 확인 (운영 점검용)
 * ------------------------------------------------------------------ */

export const strategyRouter = Router();

const HORIZONS = new Set(["anytime", "midshort", "ultralong"]);
const num = (v, fallback = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fallback);

strategyRouter.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const horizon = HORIZONS.has(b?.answers?.horizon) ? b.answers.horizon : "midshort";
    const result = await buildStrategy({
      answers: { productStyle: b?.answers?.productStyle ?? null, horizon },
      monthly: num(b.monthly),
      finIncome: num(b.finIncome),
      totalIncome: num(b.totalIncome),
      age: num(b.age, 45),
      snapshot: b.snapshot && typeof b.snapshot === "object" ? b.snapshot : undefined,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

strategyRouter.get("/tables", async (req, res) => {
  try {
    res.json({ source: "file-db", tables: await tableVersions() });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
