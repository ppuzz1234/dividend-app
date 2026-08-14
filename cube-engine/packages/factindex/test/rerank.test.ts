/**
 * Phase 7 — rerank. LLM 을 스텁으로 주입해 **네트워크 없이** 돈다.
 *
 * 여기서 지키려는 것은 정확도가 아니라 **답변 경로가 끊기지 않는 것**이다.
 * A1-v2 의 교훈: LLM 이 뭘 뱉든(빈 응답·펜스·범위 밖 점수·부분 채점) 검색 결과를 잃으면 안 된다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScoredArticle } from "../src/hybrid.js";
import { parseScores, rerank } from "../src/rerank.js";
import type { Chunk } from "../src/types.js";

function article(sourceId: string, fused: number): ScoredArticle {
  const chunk: Chunk = {
    chunkId: sourceId,
    sourceId,
    lawName: "테스트법",
    authorityType: "STATUTE",
    articleNo: "1",
    articleSubNo: null,
    title: sourceId,
    text: `${sourceId} 본문`,
    contextHeader: "h",
    validFrom: "2026-01-01",
    articleTextHash: "0".repeat(64),
    chunkHash: "0".repeat(64),
    splitLevel: "ARTICLE",
    hasUnattachedMok: false,
    charOffset: [0, 1],
  };
  return {
    sourceId,
    best: { chunk, bm25: fused, vector: fused, fused, rawVector: fused, pinned: false },
    matchedChunks: 1,
  };
}

const CANDIDATES = [article("A", 0.9), article("B", 0.6), article("C", 0.3)];
const order = (r: readonly ScoredArticle[]): string[] => r.map((a) => a.sourceId);

// ─────────────────────────── 파싱 ───────────────────────────

test("정상 JSON 을 파싱한다", () => {
  const m = parseScores('{"scores":[{"i":0,"s":0.2},{"i":1,"s":0.9}]}');
  assert.deepEqual([...m], [[0, 0.2], [1, 0.9]]);
});

test("마크다운 펜스로 감싼 응답도 살린다", () => {
  const m = parseScores('```json\n{"scores":[{"i":2,"s":1}]}\n```');
  assert.equal(m.get(2), 1);
});

test("범위 밖 점수는 clamp 한다 — 융합 점수와 같은 0~1 스케일을 유지해야 섞인다", () => {
  const m = parseScores('{"scores":[{"i":0,"s":1.7},{"i":1,"s":-0.2}]}');
  assert.equal(m.get(0), 1);
  assert.equal(m.get(1), 0);
});

test("필드가 빠지거나 타입이 다른 항목은 건너뛴다", () => {
  const m = parseScores('{"scores":[{"i":0},{"s":0.5},{"i":"x","s":0.5},{"i":1,"s":"높음"},{"i":2,"s":0.4}]}');
  assert.deepEqual([...m], [[2, 0.4]]);
});

test("깨진 입력에서 던지지 않고 빈 맵을 준다", () => {
  for (const bad of ["", "JSON 아님", "{", '{"scores":"배열아님"}', "{}", '{"scores":[]}', "null"]) {
    assert.doesNotThrow(() => parseScores(bad));
    assert.equal(parseScores(bad).size, 0, `"${bad}" 에서 뭔가 파싱됐다`);
  }
});

test("NaN·Infinity·음수 인덱스는 무시한다", () => {
  const m = parseScores('{"scores":[{"i":-1,"s":0.5},{"i":1.5,"s":0.5},{"i":0,"s":null}]}');
  assert.equal(m.size, 0);
});

// ─────────────────────────── graceful degrade ───────────────────────────

test("LLM 이 던지면 원래 순서를 그대로 준다 (답변 경로가 끊기지 않는다)", async () => {
  const r = await rerank("q", CANDIDATES, {
    llm: () => Promise.reject(new Error("quota 소진")),
  });
  assert.deepEqual(order(r), ["A", "B", "C"]);
});

test("빈 응답이면 fused 순서 유지", async () => {
  const r = await rerank("q", CANDIDATES, { llm: () => Promise.resolve("") });
  assert.deepEqual(order(r), ["A", "B", "C"]);
});

test("★ 부분 채점도 흡수한다 — 채점 안 된 후보는 fused 로 메운다", async () => {
  // C 만 1.0 으로 올리고 나머지는 채점하지 않는다 → A(0.9)·B(0.6) 은 fused 로 남는다.
  const r = await rerank("q", CANDIDATES, {
    llm: () => Promise.resolve('{"scores":[{"i":2,"s":1.0}]}'),
  });
  assert.deepEqual(order(r), ["C", "A", "B"]);
});

test("전부 채점되면 그 순서를 따른다", async () => {
  const r = await rerank("q", CANDIDATES, {
    llm: () => Promise.resolve('{"scores":[{"i":0,"s":0.1},{"i":1,"s":0.9},{"i":2,"s":0.5}]}'),
  });
  assert.deepEqual(order(r), ["B", "C", "A"]);
});

test("범위 밖 인덱스를 뱉어도 무시하고 나머지는 정상 동작", async () => {
  const r = await rerank("q", CANDIDATES, {
    llm: () => Promise.resolve('{"scores":[{"i":99,"s":1},{"i":2,"s":0.95}]}'),
  });
  assert.deepEqual(order(r), ["C", "A", "B"]);
});

test("topK 로 자른다", async () => {
  const r = await rerank("q", CANDIDATES, { topK: 2, llm: () => Promise.resolve("") });
  assert.equal(r.length, 2);
});

test("빈 후보·topK 0 에서 터지지 않는다", async () => {
  assert.deepEqual(await rerank("q", [], { llm: () => Promise.resolve("") }), []);
  assert.deepEqual(await rerank("q", CANDIDATES, { topK: 0, llm: () => Promise.resolve("") }), []);
});

test("입력 배열을 변형하지 않는다 (호출자의 순위가 안전하다)", async () => {
  const before = order(CANDIDATES);
  await rerank("q", CANDIDATES, {
    llm: () => Promise.resolve('{"scores":[{"i":2,"s":1}]}'),
  });
  assert.deepEqual(order(CANDIDATES), before);
});

test("프롬프트에 후보 인덱스와 조문 제목이 들어간다", async () => {
  let captured = "";
  await rerank("IRP 중도인출", CANDIDATES, {
    llm: (_s, user) => {
      captured = user;
      return Promise.resolve("");
    },
  });
  assert.match(captured, /\[0\]/);
  assert.match(captured, /\[2\]/);
  assert.match(captured, /IRP 중도인출/);
});

test("★ 조문 원문 안의 줄바꿈은 제거된다 — 후보 하나가 한 줄이어야 인덱스 대응이 안 깨진다", async () => {
  // 원문에 항·호 줄바꿈이 그대로 들어가면 모델이 [i] 경계를 오인한다.
  const multiline = article("M", 0.5);
  const withNewlines: ScoredArticle = {
    ...multiline,
    best: {
      ...multiline.best,
      chunk: { ...multiline.best.chunk, text: "제1조(목적)\n① 첫째 항\n1. 첫째 호\n2. 둘째 호" },
    },
  };
  let captured = "";
  await rerank("q", [withNewlines], {
    llm: (_s, user) => {
      captured = user;
      return Promise.resolve("");
    },
  });
  const block = captured.split("후보:\n")[1] ?? "";
  assert.equal(block.split("\n").length, 1, `후보 블록이 여러 줄이다:\n${block}`);
  assert.match(block, /제1조\(목적\) ① 첫째 항 1\. 첫째 호/);
});
