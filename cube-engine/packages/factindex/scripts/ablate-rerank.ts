/**
 * rerank on/off ablation — **"리랭커 왜 넣었어요?" 에 답할 수치를 만든다.**
 *
 *   npm run ablate:rerank -w @cube/factindex
 *
 * A1/A1-v2 는 rerank on/off 를 **한 번도 재지 않았다.** 있는 수치는 (a) 로컬모델↔API 구현 비교,
 * (b) in/out 점수 분리도, (c) "rerank 점수는 거부 판정엔 무용지물" 이라는 감사 결과뿐이다.
 * 그래서 리랭커의 기여를 주장할 근거가 없었다. 이 스크립트가 그 공백을 메운다.
 *
 * **개선이 없거나 음수로 나오면 rerank 를 넣지 않기로 결정하고 그 사실을 기록한다.**
 * 이것도 유효한 결과다.
 *
 * ## API 콜
 * 질의당 임베딩 1 + rerank 1 = 답 있는 질의 26건 × 2 = **52콜**. ⚠️ quota 는 A1-v2 와 공유.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { rerank, resolveRerankConfig } from "../src/rerank.js";
import { loadEngine, search } from "../src/search.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVAL_PATH = join(PKG_ROOT, "eval", "queries.json");
const AS_OF = "2026-07-31";
/** rerank 에 넘길 후보 수. 너무 크면 프롬프트가 길고, 너무 작으면 고칠 여지가 없다. */
const CANDIDATE_K = 10;

type Bucket = "exact" | "semantic" | "josa" | "out";
interface EvalQuery {
  readonly bucket: Bucket;
  readonly q: string;
  readonly expected: string | readonly string[] | null;
}

const accept = (e: string | readonly string[]): string[] => (typeof e === "string" ? [e] : [...e]);

function rankOf(ranked: readonly string[], expected: string | readonly string[]): number {
  let best = -1;
  for (const e of accept(expected)) {
    const i = ranked.indexOf(e);
    if (i >= 0 && (best === -1 || i < best)) best = i;
  }
  return best;
}

async function main(): Promise<void> {
  const evalSet = JSON.parse(readFileSync(EVAL_PATH, "utf8")) as { queries: EvalQuery[] };
  const answerable = evalSet.queries.filter((q) => q.expected !== null);
  const engine = loadEngine();
  const rerankConfig = resolveRerankConfig();

  console.log(`[ablation] 답 있는 질의 ${answerable.length}건 · 후보 top-${CANDIDATE_K}`);
  console.log(`[ablation] rerank 모델 ${rerankConfig.model} · API 콜 ${answerable.length * 2}회 예정\n`);

  const stats = new Map<Bucket, { n: number; offHit1: number; onHit1: number }>();
  const changed: string[] = [];
  let failures = 0;

  for (const [i, q] of answerable.entries()) {
    const s = stats.get(q.bucket) ?? { n: 0, offHit1: 0, onHit1: 0 };
    stats.set(q.bucket, s);
    s.n += 1;

    const r = await search(engine, q.q, { queryAsOf: AS_OF, topK: CANDIDATE_K });
    const offOrder = r.articles.map((a) => a.sourceId);
    const offRank = rankOf(offOrder, q.expected!);
    if (offRank === 0) s.offHit1 += 1;

    // 조문 직접 지정(pinned)은 파싱 결과라 재정렬 대상이 아니다 — 아는 것을 다시 흔들면 드리프트다.
    const pinned = r.articles[0]?.best.pinned === true;
    const onArticles = pinned ? r.articles : await rerank(q.q, r.articles, { config: rerankConfig });
    const onOrder = onArticles.map((a) => a.sourceId);
    const onRank = rankOf(onOrder, q.expected!);
    if (onRank === 0) s.onHit1 += 1;

    if (offRank !== onRank) {
      const mark = onRank === 0 ? "고침" : offRank === 0 ? "★망침" : "이동";
      if (offRank === 0 && onRank !== 0) failures += 1;
      changed.push(
        `  [${mark}] "${q.q}"\n      기대 ${accept(q.expected!).join("|")} · rank ${offRank + 1} → ${onRank < 0 ? "밖" : onRank + 1}`,
      );
    }
    process.stdout.write(`\r[ablation] ${i + 1}/${answerable.length}   `);
  }
  console.log("\n");

  console.log("=== rerank on/off (hit@1) ===");
  let offAll = 0;
  let onAll = 0;
  let nAll = 0;
  for (const [bucket, s] of stats) {
    offAll += s.offHit1;
    onAll += s.onHit1;
    nAll += s.n;
    const delta = s.onHit1 - s.offHit1;
    console.log(
      `  ${bucket.padEnd(9)} n=${String(s.n).padStart(2)}  off ${s.offHit1}/${s.n} → on ${s.onHit1}/${s.n}  ` +
        `(${delta > 0 ? "+" : ""}${delta})`,
    );
  }
  const delta = onAll - offAll;
  console.log(`  ${"전체".padEnd(9)} n=${nAll}  off ${offAll}/${nAll} → on ${onAll}/${nAll}  (${delta > 0 ? "+" : ""}${delta})`);

  if (changed.length > 0) {
    console.log(`\n순위가 바뀐 ${changed.length}건:`);
    for (const c of changed) console.log(c);
  }

  console.log(
    `\n판정: ${
      delta > 0
        ? `rerank 가 hit@1 을 ${delta}건 개선했다. 채택 근거가 생겼다.`
        : delta === 0
          ? "rerank 가 hit@1 을 바꾸지 못했다 — 비용(질의당 1콜·지연)만큼의 값을 못 한다. **넣지 않는 것도 유효한 결정이다.**"
          : `rerank 가 hit@1 을 ${-delta}건 악화시켰다. **채택하지 마라.**`
    }`,
  );
  if (failures > 0) {
    console.log(`⚠️ 원래 1위였던 것을 ${failures}건 밀어냈다 — 개선 총량이 양수여도 이 손실을 함께 보고할 것.`);
  }
  console.log("※ rerank 점수는 순위에만 쓴다. 거부 판정에 쓰면 A1 의 dead score gate 를 재현한다.");
}

await main();
