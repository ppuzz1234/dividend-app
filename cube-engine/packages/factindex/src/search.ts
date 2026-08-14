/**
 * 검색 파이프라인 조립 — 색인 로딩 → 별칭 확장 → 시점 필터 → BM25 + 벡터 → 융합 → 조문 단위.
 *
 * ## 벡터 검색이 메모리 brute-force 인 이유 (결정 D2)
 * 청크 2,357 × 3072차원 = 720만 곱셈. 수 ms 다. ANN 인덱스는 이 규모에서 순수 오버헤드이고,
 * TS 에서 sqlite-vec 같은 native 의존성을 들이지 않아도 된다.
 *
 * ponytail(factindex/검색): 코퍼스가 수만 청크로 커지면 brute-force 가 수십~수백 ms 로 올라간다.
 * 그때 ANN(HNSW 등)으로 교체한다. 교체 지점은 `searchVectors` 하나다.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_CHARS, chunkAll } from "./chunk.js";
import { loadCorpus } from "./corpusLoad.js";
import { buildBm25, scoreBm25 } from "./bm25.js";
import type { Bm25Index } from "./bm25.js";
import { embedTexts, resolveEmbedConfig } from "./embed.js";
import type { EmbedConfig } from "./embed.js";
import { parseExactRef } from "./exactRef.js";
import type { ExactRef } from "./exactRef.js";
import { expandQuery, loadAliases } from "./expandQuery.js";
import type { AliasTable } from "./expandQuery.js";
import { assertIndexMatchesChunks, loadIndex } from "./indexStore.js";
import { foldToArticles, fuse } from "./hybrid.js";
import type { ScoredArticle } from "./hybrid.js";
import { assertLocalDate } from "./temporal.js";
import type { Chunk, IndexManifest } from "./types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const DEFAULT_INDEX_DIR = join(PKG_ROOT, "index");
const DEFAULT_ALIASES = join(PKG_ROOT, "vocab", "aliases.json");

export interface SearchEngine {
  readonly chunks: readonly Chunk[];
  readonly manifest: IndexManifest;
  readonly vectors: Float32Array;
  readonly bm25: Bm25Index;
  readonly aliases: AliasTable;
  readonly config: EmbedConfig;
  /** 질의에서 조문 직접 지정을 파싱한다 (코퍼스에 실재하는 것만). */
  readonly exactRefIndex: (query: string) => ExactRef | null;
}

/** 색인·코퍼스·사전을 한 번에 올린다. 청크는 저장하지 않고 재생성한다(결정론적). */
export function loadEngine(opts: {
  snapshotDir?: string;
  indexDir?: string;
  aliasesPath?: string;
} = {}): SearchEngine {
  const snapshotDir = opts.snapshotDir ?? DEFAULT_SNAPSHOT_DIR;
  const indexDir = opts.indexDir ?? DEFAULT_INDEX_DIR;

  const corpus = loadCorpus(snapshotDir);
  const chunks = chunkAll(corpus.articles, DEFAULT_MAX_CHARS);
  const { manifest, vectors } = loadIndex(
    join(indexDir, "manifest.json"),
    join(indexDir, "vectors.bin"),
  );
  // 짝이 어긋난 채 검색하면 i 번째 벡터가 다른 조문을 가리킨다 — 조용히 틀리는 최악의 실패.
  assertIndexMatchesChunks(manifest, chunks.map((c) => c.chunkId));
  if (manifest.corpusHash !== corpus.corpusHash) {
    throw new Error("코퍼스가 색인 이후 변했다 — `npm run build:index -w @cube/factindex` 재실행 필요");
  }

  return {
    chunks,
    manifest,
    vectors,
    bm25: buildBm25(chunks.map((c) => `${c.contextHeader}\n${c.text}`)),
    aliases: loadAliases(opts.aliasesPath ?? DEFAULT_ALIASES),
    config: resolveEmbedConfig(),
    exactRefIndex: (query) => parseExactRef(query, corpus.articles),
  };
}

/** 질의 벡터 vs 전 청크. 둘 다 단위벡터라 내적 = 코사인. */
export function searchVectors(
  engine: SearchEngine,
  queryVec: readonly number[],
  candidates?: ReadonlySet<number>,
): Map<number, number> {
  const dim = engine.manifest.embedDim;
  const n = engine.manifest.chunkIds.length;
  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (candidates !== undefined && !candidates.has(i)) continue;
    let dot = 0;
    const base = i * dim;
    for (let d = 0; d < dim; d++) dot += engine.vectors[base + d]! * queryVec[d]!;
    out.set(i, dot);
  }
  return out;
}

export interface SearchOptions {
  /** 조회일 (KST `YYYY-MM-DD`). 이 시점에 유효한 조문만 후보가 된다. */
  readonly queryAsOf: string;
  readonly topK?: number;
  readonly bm25Weight?: number;
  readonly vectorWeight?: number;
}

export interface SearchResult {
  readonly articles: readonly ScoredArticle[];
  /** 실제로 검색에 쓰인 질의 (별칭 확장 후) */
  readonly effectiveQuery: string;
  readonly appliedAliases: readonly { term: string; expandsTo: readonly string[] }[];
  readonly skippedUnapproved: readonly string[];
  /** 시점 필터가 거른 청크 수 — vacuity 를 눈에 보이게 남긴다 */
  readonly filteredByDate: number;
  /** 조문 직접 지정이 파싱됐으면 그 정보 (1위 고정의 근거) */
  readonly exactRef?: ExactRef;
}

export async function search(
  engine: SearchEngine,
  query: string,
  opts: SearchOptions,
): Promise<SearchResult> {
  assertLocalDate(opts.queryAsOf, "queryAsOf");
  const topK = opts.topK ?? 10;

  const exp = expandQuery(query, engine.aliases);

  // 시점 필터를 먼저 걸어 후보를 좁힌다 (사양 §5.1 — 조회 시점에 계산).
  const candidates = new Set<number>();
  for (const [i, c] of engine.chunks.entries()) {
    if (c.validFrom <= opts.queryAsOf) candidates.add(i);
  }
  const filteredByDate = engine.chunks.length - candidates.size;

  const bm25Scores = scoreBm25(engine.bm25, exp.expanded, candidates);
  const [queryVec] = await embedTexts([exp.expanded], {
    config: engine.config,
    task: "RETRIEVAL_QUERY",
  });
  if (queryVec === undefined) throw new Error("질의 임베딩에 실패했다");
  const vectorScores = searchVectors(engine, queryVec, candidates);

  const fused = fuse(engine.chunks, bm25Scores, vectorScores, {
    ...(opts.bm25Weight !== undefined ? { bm25Weight: opts.bm25Weight } : {}),
    ...(opts.vectorWeight !== undefined ? { vectorWeight: opts.vectorWeight } : {}),
  });
  let articles = foldToArticles(fused);

  // 질의가 조문을 직접 지정했으면 그 조문을 1위로 고정한다.
  // 아는 것을 fuzzy 로 다시 찾으면 드리프트만 생긴다 — 실측상 exact 버킷 hit@1 이 38% 였다.
  const exact = engine.exactRefIndex(query);
  if (exact !== null) {
    const hit = articles.find((a) => a.sourceId === exact.sourceId);
    const pinnedBest =
      hit?.best ??
      // 검색에 아예 안 걸린 경우에도 고정한다 — 사용자가 조문을 특정했기 때문이다.
      (() => {
        const idx = engine.chunks.findIndex((c) => c.sourceId === exact.sourceId);
        const chunk = engine.chunks[idx];
        if (chunk === undefined) return null;
        return { chunk, bm25: 0, vector: 0, fused: 1, rawVector: 0, pinned: true };
      })();
    if (pinnedBest !== null) {
      articles = [
        { sourceId: exact.sourceId, best: { ...pinnedBest, pinned: true }, matchedChunks: hit?.matchedChunks ?? 1 },
        ...articles.filter((a) => a.sourceId !== exact.sourceId),
      ];
    }
  }

  return {
    articles: articles.slice(0, topK),
    effectiveQuery: exp.expanded,
    appliedAliases: exp.applied,
    skippedUnapproved: exp.skippedUnapproved,
    filteredByDate,
    ...(exact !== null ? { exactRef: exact } : {}),
  };
}
