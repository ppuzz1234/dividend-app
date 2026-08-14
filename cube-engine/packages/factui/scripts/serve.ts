/**
 * 데모 서버 실행.
 *
 *   npm run serve -w @cube/factui          → http://127.0.0.1:8787
 *
 * ⚠️ 질문 1건당 API 콜 2회(임베딩 1 + 답변 1). quota 는 A1-v2 와 공유한다.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createFactServer } from "../src/server.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// 포트는 상수다. env 로 받으면 문자열→수 변환이 필요한데, 그 함수는
// `no-computation.test.ts` 가 UI 층에서 금지한다 (세법 값 파싱 경로와 구별이 안 되므로).
const PORT = 8787;

console.log("[UI] 색인·코퍼스 적재 중… (수십 초 걸릴 수 있다)");
const server = createFactServer({
  publicDir: join(PKG_ROOT, "public"),
  snapshotDir: join(PKG_ROOT, "..", "corpus", "snapshots"),
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`[UI] http://127.0.0.1:${String(PORT)}  (Ctrl+C 로 종료)`);
});
