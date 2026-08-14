/**
 * 임베딩 유틸 + 색인 산출물 무결성. **네트워크를 타지 않는다** — 이미 만들어진 파일만 읽는다.
 *
 * 여기서 잡으려는 실패는 "조용히 틀리는" 것들이다:
 *  - L2 정규화 누락 → 코사인 순위가 미묘하게 망가진다(에러 없음)
 *  - 청크와 벡터의 짝 어긋남 → i 번째 벡터가 다른 조문을 가리킨다(에러 없음)
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { chunkAll } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import { BATCH_SIZE, l2Normalize } from "../src/embed.js";
import { assertIndexMatchesChunks, loadIndex } from "../src/indexStore.js";
import type { IndexManifest } from "../src/types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const MANIFEST = join(PKG_ROOT, "index", "manifest.json");
const VECTORS = join(PKG_ROOT, "index", "vectors.bin");

const hasIndex = existsSync(MANIFEST) && existsSync(VECTORS);

// ─────────────────────────── L2 정규화 ───────────────────────────

test("l2Normalize — 단위벡터를 만든다", () => {
  const v = l2Normalize([3, 4]);
  assert.equal(Math.hypot(...v), 1);
  assert.deepEqual(v, [0.6, 0.8]);
});

test("l2Normalize — zero vector 에서 NaN 이 나오지 않는다", () => {
  // `|| 1` 방어가 없으면 0/0 = NaN 이 되고, 그 벡터는 모든 유사도를 NaN 으로 만든다.
  const v = l2Normalize([0, 0, 0]);
  assert.deepEqual(v, [0, 0, 0]);
  assert.ok(v.every((x) => Number.isFinite(x)));
});

test("l2Normalize — 이미 단위벡터면 사실상 그대로 (멱등, 부동소수점 오차 내)", () => {
  // 비트 단위 동일을 요구하면 안 된다 — 정규화된 벡터의 노름도 float 에서는 정확히 1.0 이 아니다.
  const once = l2Normalize([1, 2, 3, 4]);
  const twice = l2Normalize(once);
  for (const [i, x] of once.entries()) assert.ok(Math.abs(twice[i]! - x) < 1e-12);
});

test("l2Normalize — 빈 배열·음수 성분", () => {
  assert.deepEqual(l2Normalize([]), []);
  const v = l2Normalize([-3, 4]);
  assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-12);
});

test("배치 크기는 A1-v2 실전값 32 를 유지한다", () => {
  assert.equal(BATCH_SIZE, 32);
});

// ─────────────────────────── 짝 검사 ───────────────────────────

function fakeManifest(chunkIds: string[]): IndexManifest {
  return {
    ragIndexVersion: "0".repeat(64),
    embedModel: "m",
    embedDim: 4,
    chunkRule: { maxChars: 1500, algorithm: "hang>ho>char/v1" },
    corpusHash: "0".repeat(64),
    chunkIds,
    builtAt: "2026-07-31T00:00:00.000Z",
  };
}

test("짝 검사 — 청크 수가 다르면 거절", () => {
  assert.throws(
    () => assertIndexMatchesChunks(fakeManifest(["a", "b"]), ["a"]),
    /청크 수.*다르다/,
  );
});

test("짝 검사 — 순서가 어긋나면 거절 (수가 같아도)", () => {
  // 이게 제일 위험하다: 수가 같으면 크기 검증을 통과하고, 검색은 조용히 엉뚱한 조문을 낸다.
  assert.throws(
    () => assertIndexMatchesChunks(fakeManifest(["a", "b"]), ["b", "a"]),
    /순서가 어긋난다/,
  );
});

test("짝 검사 — 일치하면 통과", () => {
  assert.doesNotThrow(() => assertIndexMatchesChunks(fakeManifest(["a", "b"]), ["a", "b"]));
});

test("짝 검사 — 빈 색인끼리는 통과", () => {
  assert.doesNotThrow(() => assertIndexMatchesChunks(fakeManifest([]), []));
});

// ─────────────────────────── 실제 산출물 ───────────────────────────

test("색인 산출물 — 청크와 벡터의 짝이 맞는다", { skip: !hasIndex && "색인 미생성" }, () => {
  const { manifest } = loadIndex(MANIFEST, VECTORS);
  const chunks = chunkAll(loadCorpus(SNAPSHOT_DIR).articles);
  assertIndexMatchesChunks(manifest, chunks.map((c) => c.chunkId));
  assert.equal(manifest.chunkIds.length, chunks.length);
});

test("색인 산출물 — 전 벡터가 단위벡터다", { skip: !hasIndex && "색인 미생성" }, () => {
  const { manifest, vectors } = loadIndex(MANIFEST, VECTORS);
  const dim = manifest.embedDim;
  let worst = 0;
  for (let i = 0; i < manifest.chunkIds.length; i++) {
    let sum = 0;
    for (let d = 0; d < dim; d++) {
      const x = vectors[i * dim + d]!;
      assert.ok(Number.isFinite(x), `청크 ${i} 차원 ${d} 가 유한수가 아니다`);
      sum += x * x;
    }
    worst = Math.max(worst, Math.abs(1 - Math.sqrt(sum)));
  }
  console.log(`  [index] ${manifest.chunkIds.length}벡터 · L2 오차 최대 ${worst.toExponential(1)}`);
  assert.ok(worst < 1e-4, `L2 노름이 1 에서 ${worst} 벗어났다 — 정규화 누락`);
});

test("색인 산출물 — ragIndexVersion 이 현재 코퍼스와 일치한다", { skip: !hasIndex && "색인 미생성" }, () => {
  const { manifest } = loadIndex(MANIFEST, VECTORS);
  const corpus = loadCorpus(SNAPSHOT_DIR);
  // 코퍼스가 바뀌었는데 색인이 그대로면 근거가 조용히 어긋난다.
  assert.equal(manifest.corpusHash, corpus.corpusHash, "코퍼스가 변했다 — 재색인 필요");
  assert.match(manifest.ragIndexVersion, /^[0-9a-f]{64}$/);
});

test("색인 로딩 — 파일이 없으면 조치 가능한 메시지", () => {
  assert.throws(() => loadIndex(join(PKG_ROOT, "없음.json"), VECTORS), /build:index/);
});
