/**
 * 색인 빌드 — 청크 → 임베딩 → `index/vectors.bin` + `index/manifest.json`.
 *
 *   npm run build:index -w @cube/factindex
 *
 * ## 중단 복구 (resume)
 * 74콜을 도는 중 네트워크가 끊기거나 quota 가 소진되면 처음부터 다시 도는 건 낭비다.
 * 배치마다 `index/.partial.bin` 에 append 하고 `index/.progress.json` 에 진행을 기록한다.
 * 재실행 시 **같은 `ragIndexVersion`** 이면 이어서, 다르면 버리고 처음부터.
 * (버전이 다르다 = 코퍼스나 청킹 규칙이 바뀌었다 = 이전 벡터는 다른 청크의 것이다)
 *
 * ⚠️ 이 키는 A1-v2 와 quota 를 공유한다. 색인 도는 중 A1-v2 테스트를 돌리지 마라.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_CHARS, chunkAll } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import { BATCH_SIZE, embedTexts, resolveEmbedConfig } from "../src/embed.js";
import { computeRagIndexVersion } from "../src/indexVersion.js";
import { writeManifest, writeVectors } from "../src/indexStore.js";
import type { IndexManifest } from "../src/types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const INDEX_DIR = join(PKG_ROOT, "index");
const PARTIAL_BIN = join(INDEX_DIR, ".partial.bin");
const PROGRESS = join(INDEX_DIR, ".progress.json");

interface Progress {
  readonly ragIndexVersion: string;
  readonly done: number;
}

function readProgress(version: string): number {
  if (!existsSync(PROGRESS) || !existsSync(PARTIAL_BIN)) return 0;
  try {
    const p = JSON.parse(readFileSync(PROGRESS, "utf8")) as Progress;
    if (p.ragIndexVersion !== version) {
      console.log("[색인] 이전 partial 이 다른 버전이라 버린다 (코퍼스·청킹 규칙 변경)");
      rmSync(PARTIAL_BIN, { force: true });
      rmSync(PROGRESS, { force: true });
      return 0;
    }
    return p.done;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const config = resolveEmbedConfig();
  const corpus = loadCorpus(SNAPSHOT_DIR);
  const chunks = chunkAll(corpus.articles);
  const ragIndexVersion = computeRagIndexVersion({
    embedModel: config.model,
    embedDim: config.dim,
    maxChars: DEFAULT_MAX_CHARS,
    corpusHash: corpus.corpusHash,
  });

  // 임베딩 입력 = contextHeader + 본문. 맥락을 빼면 쪼개진 조각의 의미가 얇아진다.
  const inputs = chunks.map((c) => `${c.contextHeader}\n${c.text.trim()}`);
  const totalCalls = Math.ceil(chunks.length / BATCH_SIZE);

  console.log(`[색인] 조문 ${corpus.articles.length} (삭제 스텁 ${corpus.deletedStubCount} 제외)`);
  console.log(`[색인] 청크 ${chunks.length} · 모델 ${config.model} · 차원 ${config.dim}`);
  console.log(`[색인] ragIndexVersion ${ragIndexVersion.slice(0, 16)}…`);
  console.log(`[색인] 예상 API 콜 ${totalCalls}회  ⚠️ quota 는 A1-v2 와 공유한다\n`);

  mkdirSync(INDEX_DIR, { recursive: true });
  const startAt = readProgress(ragIndexVersion);
  if (startAt > 0) console.log(`[색인] 이어서 시작 — 이미 ${startAt}/${chunks.length} 완료\n`);

  const t0 = Date.now();
  for (let i = startAt; i < inputs.length; i += BATCH_SIZE) {
    const slice = inputs.slice(i, i + BATCH_SIZE);
    const vecs = await embedTexts(slice, { config, task: "RETRIEVAL_DOCUMENT" });

    // 배치 결과를 즉시 append — 중단돼도 여기까지는 남는다.
    const flat = new Float32Array(vecs.length * config.dim);
    vecs.forEach((v, k) => flat.set(v, k * config.dim));
    appendFileSync(PARTIAL_BIN, Buffer.from(flat.buffer, flat.byteOffset, flat.byteLength));

    const done = Math.min(i + BATCH_SIZE, inputs.length);
    writeFileSync(PROGRESS, JSON.stringify({ ragIndexVersion, done } satisfies Progress), "utf8");

    const elapsed = (Date.now() - t0) / 1000;
    const rate = (done - startAt) / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? (inputs.length - done) / rate : 0;
    console.log(
      `[색인] ${String(done).padStart(5)}/${inputs.length}  ` +
        `(${((done / inputs.length) * 100).toFixed(1)}%)  경과 ${elapsed.toFixed(0)}s  남은 ~${eta.toFixed(0)}s`,
    );
  }

  // partial → 최종. 크기 검증을 먼저 한다.
  const buf = readFileSync(PARTIAL_BIN);
  const expected = chunks.length * config.dim * 4;
  if (buf.byteLength !== expected) {
    throw new Error(
      `partial 크기가 맞지 않는다: ${buf.byteLength}B (기대 ${expected}B) — ` +
        `.partial.bin 을 지우고 다시 돌려라`,
    );
  }
  const vectors = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );

  // L2 노름 검증 — 정규화가 빠지면 코사인 검색 순위가 조용히 망가진다.
  let worst = 0;
  for (let i = 0; i < chunks.length; i++) {
    let sum = 0;
    for (let d = 0; d < config.dim; d++) {
      const x = vectors[i * config.dim + d]!;
      sum += x * x;
    }
    worst = Math.max(worst, Math.abs(1 - Math.sqrt(sum)));
  }
  if (worst > 1e-4) throw new Error(`L2 노름이 1 에서 최대 ${worst} 벗어났다 — 정규화 확인`);

  writeVectors(join(INDEX_DIR, "vectors.bin"), vectors);
  writeManifest(join(INDEX_DIR, "manifest.json"), {
    ragIndexVersion,
    embedModel: config.model,
    embedDim: config.dim,
    chunkRule: { maxChars: DEFAULT_MAX_CHARS, algorithm: "hang>ho>char/v1" },
    corpusHash: corpus.corpusHash,
    chunkIds: chunks.map((c) => c.chunkId),
    builtAt: new Date().toISOString(),
  } satisfies IndexManifest);

  rmSync(PARTIAL_BIN, { force: true });
  rmSync(PROGRESS, { force: true });

  console.log(
    `\n[색인] 완료 — 청크 ${chunks.length} · ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB · ` +
      `L2 오차 최대 ${worst.toExponential(1)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
}

await main();
