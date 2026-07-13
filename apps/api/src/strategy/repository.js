import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* ------------------------------------------------------------------ *
 *  R — Repository: 전략 데이터 접근 계층
 *  지금은 src/db/*.json 파일을 읽는다. 실제 DB 이관 시 이 파일의
 *  함수 구현만 교체하면 Provider(비즈니스 로직)는 손대지 않는다.
 *  · 모든 함수가 async — DB 전환을 전제로 한 인터페이스
 *  · 프로세스 캐시(파일은 불변) — DB 전환 시 캐시 정책만 조정
 * ------------------------------------------------------------------ */

const DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db");
const cache = new Map();

async function loadTable(file) {
  if (cache.has(file)) return cache.get(file);
  const raw = JSON.parse(await readFile(path.join(DB_DIR, file), "utf8"));
  cache.set(file, raw);
  return raw;
}

/* ── 계좌 특성 ── */
export async function findAccounts() {
  return (await loadTable("accounts.json")).rows;
}
export async function findAccountById(id) {
  return (await findAccounts()).find((a) => a.id === id) ?? null;
}

/* ── 운용 상품 ── */
export async function findProducts() {
  return (await loadTable("products.json")).rows;
}
export async function findProductById(id) {
  return (await findProducts()).find((p) => p.id === id) ?? null;
}

/* ── ISA 롤오버 규칙 ── */
export async function findIsaRollover() {
  return (await loadTable("isa-rollover.json")).rows[0];
}

/* ── 운용기간 룰 ── */
export async function findHorizons() {
  return (await loadTable("horizons.json")).rows;
}
export async function findHorizonById(id) {
  const rows = await findHorizons();
  return rows.find((h) => h.id === id) ?? rows.find((h) => h.id === "midshort");
}

/* ── 개발용 표본 스냅샷 (요청에 snapshot 없을 때) ── */
export async function findSampleSnapshot() {
  return (await loadTable("sample-snapshot.json")).accounts;
}

/* ── 테이블 메타 (버전 확인용) ── */
export async function tableVersions() {
  const files = ["accounts.json", "products.json", "isa-rollover.json", "horizons.json"];
  const out = {};
  for (const f of files) {
    const t = await loadTable(f);
    out[t.table] = t.version;
  }
  return out;
}
