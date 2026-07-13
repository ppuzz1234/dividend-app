/* ------------------------------------------------------------------ *
 *  전략 엔진 클라이언트 — 백엔드(apps/api) POST /api/strategy 호출
 *  나이·전년도 금융소득/총소득·월 불입·성향(horizon)을 보내면
 *  백엔드 비즈니스 로직(HPR, 파일 DB 기반)이 반영된 전략을 받는다.
 *  · 개발 시 Vite 프록시(/api → :4000) — quotes.js 와 동일 패턴
 *  · 백엔드 미기동/미배포 시 null 반환 → 화면은 로컬 추정으로 폴백
 * ------------------------------------------------------------------ */
const BASE = import.meta.env.VITE_API_BASE || "";

export async function fetchStrategy({ answers, monthly, finIncome, totalIncome, age, snapshot } = {}) {
  try {
    const r = await fetch(`${BASE}/api/strategy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, monthly, finIncome, totalIncome, age, snapshot }),
    });
    if (!r.ok) throw new Error(`strategy ${r.status}`);
    return await r.json();
  } catch {
    return null; // 엔진 미연결 — 호출부가 로컬 추정으로 폴백
  }
}
