/**
 * Phase 5 — 융합 수학. 네트워크 없음(점수 맵을 직접 주입한다).
 *
 * A1 이 여기서 겪은 함정 3개를 테스트로 못 박는다:
 *  ① 후보 1개일 때 min-max 의 division-by-zero
 *  ② 한쪽에만 있는 후보를 버리는 것(RRF 가 아니라 단순 가중합이므로 0.0 으로 들어가야 한다)
 *  ③ 부호 반전 — 우리는 두 점수원이 모두 "클수록 좋음"이라 반전이 없다. 백엔드를 바꾸면 여기서 깨진다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_BM25_WEIGHT, DEFAULT_VECTOR_WEIGHT, foldToArticles, fuse } from "../src/hybrid.js";
import type { ScoredArticle } from "../src/hybrid.js";
import type { Chunk } from "../src/types.js";

function chunk(id: string, sourceId: string): Chunk {
  return {
    chunkId: id,
    sourceId,
    lawName: "L",
    authorityType: "STATUTE",
    articleNo: "1",
    articleSubNo: null,
    title: null,
    text: "t",
    contextHeader: "h",
    validFrom: "2026-01-01",
    articleTextHash: "0".repeat(64),
    chunkHash: "0".repeat(64),
    splitLevel: "ARTICLE",
    hasUnattachedMok: false,
    charOffset: [0, 1],
  };
}

const CHUNKS = [chunk("a#1", "A"), chunk("a#2", "A"), chunk("b", "B"), chunk("c", "C")];

test("가중치 기본값은 0.5/0.5 — 튜닝된 값이 아니라 시작값이다", () => {
  assert.equal(DEFAULT_BM25_WEIGHT, 0.5);
  assert.equal(DEFAULT_VECTOR_WEIGHT, 0.5);
});

test("① 후보가 1개면 division-by-zero 없이 1.0 이 된다", () => {
  const r = fuse(CHUNKS, new Map([[0, 3.7]]), new Map([[0, 0.9]]));
  assert.equal(r.length, 1);
  assert.equal(r[0]?.bm25, 1);
  assert.equal(r[0]?.vector, 1);
  assert.equal(r[0]?.fused, 1);
});

test("① 값이 전부 같아도 1.0 (hi===lo)", () => {
  const r = fuse(CHUNKS, new Map([[0, 5], [1, 5]]), new Map());
  assert.ok(r.every((x) => x.bm25 === 1));
  assert.ok(r.every((x) => Number.isFinite(x.fused)));
});

test("② 한쪽에만 있는 후보도 살아남고 다른 쪽은 0.0 이다", () => {
  const r = fuse(CHUNKS, new Map([[0, 10]]), new Map([[2, 0.8]]));
  const byId = new Map(r.map((x) => [x.chunk.chunkId, x]));
  assert.equal(byId.size, 2, "합집합이 아니라 교집합을 취했다");
  assert.equal(byId.get("a#1")?.vector, 0);
  assert.equal(byId.get("b")?.bm25, 0);
});

test("③ 두 점수원 모두 클수록 좋다 — 부호 반전이 없다", () => {
  // BM25 raw 가 크고 코사인도 크면 융합 점수가 가장 높아야 한다.
  const r = fuse(CHUNKS, new Map([[0, 100], [1, 1]]), new Map([[0, 0.99], [1, 0.1]]));
  assert.equal(r[0]?.chunk.chunkId, "a#1");
});

test("min-max 는 후보 집합 내부에서만 — 전역 정규화가 아니다", () => {
  const small = fuse(CHUNKS, new Map([[0, 1], [1, 2]]), new Map());
  const large = fuse(CHUNKS, new Map([[0, 1000], [1, 2000]]), new Map());
  // 절대값이 달라도 상대 순위·정규화 결과는 같다.
  assert.deepEqual(small.map((x) => x.bm25), large.map((x) => x.bm25));
});

test("가중치를 바꾸면 순위가 바뀐다", () => {
  const b = new Map([[0, 10], [2, 1]]);
  const v = new Map([[0, 0.1], [2, 0.9]]);
  assert.equal(fuse(CHUNKS, b, v, { bm25Weight: 1, vectorWeight: 0 })[0]?.chunk.chunkId, "a#1");
  assert.equal(fuse(CHUNKS, b, v, { bm25Weight: 0, vectorWeight: 1 })[0]?.chunk.chunkId, "b");
});

test("빈 입력에서 터지지 않는다", () => {
  assert.deepEqual(fuse(CHUNKS, new Map(), new Map()), []);
  assert.deepEqual(fuse([], new Map([[0, 1]]), new Map()), []);
});

test("존재하지 않는 청크 인덱스는 조용히 건너뛴다", () => {
  assert.deepEqual(fuse(CHUNKS, new Map([[999, 1]]), new Map()), []);
});

// ─────────────────────────── 조문 단위 접기 ───────────────────────────

test("같은 조문의 청크는 최고점 하나로 접힌다", () => {
  const scored = fuse(CHUNKS, new Map([[0, 1], [1, 10], [2, 5]]), new Map());
  const arts = foldToArticles(scored);
  assert.deepEqual(arts.map((a) => a.sourceId), ["A", "B"]);
  assert.equal(arts[0]?.matchedChunks, 2, "A 의 청크 2개가 세어지지 않았다");
  assert.equal(arts[0]?.best.chunk.chunkId, "a#2", "최고점 청크가 대표가 아니다");
});

test("접기 — 긴 조문이 상위를 독차지하지 않는다", () => {
  // 접지 않으면 A 가 top-2 를 차지해 B 를 밀어낸다 (실제로 top5 에 같은 조문이 3번 나왔다).
  const scored = fuse(CHUNKS, new Map([[0, 10], [1, 9], [2, 8]]), new Map());
  const arts = foldToArticles(scored);
  assert.deepEqual(arts.map((a) => a.sourceId), ["A", "B"]);
});

test("접기 — 빈 입력", () => {
  assert.deepEqual(foldToArticles([]), []);
});

// ─────────────────────────── 권위 서열 tie-break (사양 §5.1) ───────────────────────────

function withAuthority(sourceId: string, fused: number, authorityType: Chunk["authorityType"]): ScoredArticle {
  const base = chunk(sourceId, sourceId);
  return {
    sourceId,
    best: { chunk: { ...base, authorityType }, bm25: fused, vector: fused, fused, rawVector: fused, pinned: false },
    matchedChunks: 1,
  };
}

test("★ 점수가 근소하면 법률이 행정안내를 앞선다 (사양 §5.1 서열)", () => {
  // 실측 사례: "ISA" 질의에서 국세청 훈령(NTSWHT_59)이 조세특례제한법(TAXEX_91_18)을 밀어냈다.
  const scored = [
    withAuthority("훈령", 0.98, "ADMIN_GUIDANCE").best,
    withAuthority("법률", 0.96, "STATUTE").best,
  ];
  assert.deepEqual(foldToArticles(scored).map((a) => a.sourceId), ["법률", "훈령"]);
});

test("점수 차가 크면 서열이 점수를 덮지 않는다", () => {
  const scored = [
    withAuthority("훈령", 0.9, "ADMIN_GUIDANCE").best,
    withAuthority("법률", 0.3, "STATUTE").best,
  ];
  assert.deepEqual(foldToArticles(scored).map((a) => a.sourceId), ["훈령", "법률"]);
});

test("서열이 같으면 점수 순서를 유지한다", () => {
  const scored = [
    withAuthority("A", 0.90, "STATUTE").best,
    withAuthority("B", 0.93, "STATUTE").best,
  ];
  assert.deepEqual(foldToArticles(scored).map((a) => a.sourceId), ["B", "A"]);
});

test("서열 전체 순서 — 법률 < 시행령 < 고시 < 행정안내", () => {
  const scored = [
    withAuthority("안내", 0.99, "ADMIN_GUIDANCE").best,
    withAuthority("고시", 0.98, "RULE").best,
    withAuthority("시행령", 0.97, "DECREE").best,
    withAuthority("법률", 0.96, "STATUTE").best,
  ];
  assert.deepEqual(foldToArticles(scored).map((a) => a.sourceId), ["법률", "시행령", "고시", "안내"]);
});
