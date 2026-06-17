import express from "express";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 백오피스 API (스텁)
 *  · 향후 종목/계좌 마스터, 회원, 시뮬레이션 저장 등의 로직이 들어갈 자리
 *  · 지금은 헬스체크와 예시 라우트만 제공
 * ------------------------------------------------------------------ */

const app = express();
const PORT = process.env.PORT ?? 4000;

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "devidend-api", ts: Date.now() });
});

// TODO: 프런트의 src/data 를 단일 출처로 옮겨와 여기서 제공할 수 있음
app.get("/api/stocks", (req, res) => {
  res.json({ items: [], note: "stub — connect data source here" });
});

app.listen(PORT, () => {
  console.log(`[devidend-api] listening on http://localhost:${PORT}`);
});
