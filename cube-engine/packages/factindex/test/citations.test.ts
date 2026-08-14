/**
 * 인용 그래프 + 색인 버전. 네트워크 없이 실코퍼스로만 돈다.
 *
 * 핵심 주장: **명시 인용만 쓰면 거의 전부 해소되고, 추정하면 6건 중 1건이 틀린다.**
 * 그래서 bare `제N조` 확장을 기각했다 (`@cube/corpus` 가 목 소속 추론을 80.3% 라고 기각한 것과 같은 논리).
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildCitationGraph, outgoing } from "../src/citations.js";
import { DEFAULT_MAX_CHARS } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import type { LoadedArticle } from "../src/corpusLoad.js";
import { computeRagIndexVersion } from "../src/indexVersion.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

function art(over: Partial<LoadedArticle> & { sourceId: string; text: string }): LoadedArticle {
  return {
    articleNo: "1",
    articleSubNo: null,
    title: "t",
    validFrom: "2026-01-01",
    textHash: "0".repeat(64),
    lawName: "테스트법",
    authorityType: "STATUTE",
    ...over,
  };
}

test("명시 인용은 거의 전부 해소된다 (해소율 ≥ 99%)", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const g = buildCitationGraph(c.articles);
  const inCorpus = g.edges.length + g.dangling.length;
  const rate = (g.edges.length / inCorpus) * 100;
  console.log(
    `  [cite] 해소 ${g.edges.length} / dangling ${g.dangling.length} (${rate.toFixed(1)}%) · 코퍼스 밖 인용 ${g.outOfCorpusCount}`,
  );
  if (g.dangling.length > 0) {
    console.log(`  [cite] dangling: ${g.dangling.map((d) => `${d.from}→${d.to}`).join(", ")}`);
  }
  assert.ok(rate >= 99, `해소율 ${rate.toFixed(1)}% — 명시 인용 파싱이 깨졌다`);
  // 실측 고정 — dangling 이 늘면 코퍼스가 변했거나 조문이 누락된 신호다.
  assert.equal(g.edges.length, 579, "엣지 수가 변했다");
  assert.deepEqual(
    g.dangling.map((d) => d.to).sort(),
    ["TAXEX_91_28", "TAXEX_91_9", "TAXEX_D_80"],
    "dangling 대상이 변했다 — 인용된 조문이 코퍼스에서 사라졌는지 확인하라",
  );
});

test("법↔시행령 위임 관계가 실제로 잡힌다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const g = buildCitationGraph(c.articles);
  // 이 관계가 사양 §5.1 의 role: PRIMARY / IMPLEMENTING_DETAIL 구분에 직결된다.
  const crossLaw = g.edges.filter((e) => e.from.split("_")[0] !== e.to.split("_")[0]);
  console.log(`  [cite] 법령 간 엣지 ${crossLaw.length} / 전체 ${g.edges.length}`);
  assert.ok(crossLaw.length > 0, "법령 간 인용이 하나도 없다");
});

test("긴 이름을 먼저 매칭한다 — 시행령이 본법으로 오인되면 안 된다", () => {
  const g = buildCitationGraph([
    art({ sourceId: "X_1", text: "「소득세법 시행령」 제40조의2에 따른다" }),
    art({ sourceId: "INCTAX_D_40_2", text: "본문" }),
    art({ sourceId: "INCTAX_40_2", text: "본문" }),
  ]);
  assert.deepEqual(outgoing(g, "X_1"), ["INCTAX_D_40_2"]);
});

test("코퍼스 밖 법령 인용은 엣지로 만들지 않는다", () => {
  const g = buildCitationGraph([art({ sourceId: "X_1", text: "「법인세법」 제1조에 따른다" })]);
  assert.equal(g.edges.length, 0);
  assert.equal(g.dangling.length, 0);
  assert.equal(g.outOfCorpusCount, 1);
});

test("존재하지 않는 조문을 가리키면 dangling 으로 분리한다 (조용히 버리지 않는다)", () => {
  const g = buildCitationGraph([art({ sourceId: "X_1", text: "「소득세법」 제9999조" })]);
  assert.equal(g.edges.length, 0);
  assert.equal(g.dangling.length, 1);
  assert.equal(g.dangling[0]?.to, "INCTAX_9999");
});

test("자기 참조·중복 인용은 엣지를 늘리지 않는다", () => {
  const g = buildCitationGraph([
    art({ sourceId: "INCTAX_1", text: "「소득세법」 제1조 그리고 「소득세법」 제2조, 또 「소득세법」 제2조" }),
    art({ sourceId: "INCTAX_2", text: "본문" }),
  ]);
  assert.deepEqual(outgoing(g, "INCTAX_1"), ["INCTAX_2"]);
});

test("빈 입력·인용 없는 원문에서도 터지지 않는다", () => {
  assert.deepEqual(buildCitationGraph([]).edges, []);
  const g = buildCitationGraph([art({ sourceId: "X_1", text: "인용이 전혀 없는 조문" })]);
  assert.equal(g.edges.length, 0);
  assert.equal(g.outOfCorpusCount, 0);
});

test("malformed — 닫히지 않은 「 나 과도하게 긴 이름은 매칭하지 않는다", () => {
  const g = buildCitationGraph([
    art({ sourceId: "X_1", text: `「${"가".repeat(60)}」 제1조` }),
    art({ sourceId: "X_2", text: "「소득세법 제1조" }),
  ]);
  assert.equal(g.edges.length, 0);
  assert.equal(g.dangling.length, 0);
  assert.equal(g.outOfCorpusCount, 0);
});

// ─────────────────────────── ragIndexVersion ───────────────────────────

const VALID = {
  embedModel: "gemini-embedding-001",
  embedDim: 3072,
  maxChars: DEFAULT_MAX_CHARS,
  corpusHash: "a".repeat(64),
} as const;

test("ragIndexVersion 은 결정론적이고 hex64 다", () => {
  const v = computeRagIndexVersion(VALID);
  assert.match(v, /^[0-9a-f]{64}$/);
  assert.equal(v, computeRagIndexVersion(VALID));
});

test("답을 바꿀 수 있는 입력이 하나라도 달라지면 버전이 달라진다", () => {
  const base = computeRagIndexVersion(VALID);
  const variants = [
    { ...VALID, embedModel: "other-model" },
    { ...VALID, embedDim: 768 },
    { ...VALID, maxChars: 2000 },
    { ...VALID, corpusHash: "b".repeat(64) },
  ];
  for (const v of variants) {
    assert.notEqual(computeRagIndexVersion(v), base, `${JSON.stringify(v)} 가 같은 버전을 냈다`);
  }
});

test("malformed 입력은 거절한다", () => {
  assert.throws(() => computeRagIndexVersion({ ...VALID, embedModel: "  " }), /embedModel/);
  assert.throws(() => computeRagIndexVersion({ ...VALID, embedDim: 0 }), /embedDim/);
  assert.throws(() => computeRagIndexVersion({ ...VALID, embedDim: 1.5 }), /embedDim/);
  assert.throws(() => computeRagIndexVersion({ ...VALID, maxChars: -1 }), /maxChars/);
  assert.throws(() => computeRagIndexVersion({ ...VALID, corpusHash: "ABC" }), /corpusHash/);
  // 대문자 hex 는 거절 — FactAnswerManifest 가 소문자만 받으므로 여기서 미리 맞춘다.
  assert.throws(() => computeRagIndexVersion({ ...VALID, corpusHash: "A".repeat(64) }), /corpusHash/);
});
