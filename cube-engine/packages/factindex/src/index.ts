export type { Chunk, IndexManifest, SplitLevel } from "./types.js";

export type { LoadedArticle, LoadedCorpus } from "./corpusLoad.js";
export { SNAPSHOT_ABBREVS, loadCorpus } from "./corpusLoad.js";

export { CHUNK_ALGORITHM, DEFAULT_MAX_CHARS, chunkAll, chunkArticle } from "./chunk.js";

export type { CitationEdge, CitationGraph } from "./citations.js";
export { buildCitationGraph, outgoing } from "./citations.js";

export type { IndexVersionInput } from "./indexVersion.js";
export { computeRagIndexVersion } from "./indexVersion.js";

export type { ScoredArticle, ScoredChunk } from "./hybrid.js";
export { DEFAULT_BM25_WEIGHT, DEFAULT_VECTOR_WEIGHT, foldToArticles, fuse } from "./hybrid.js";

export type { SearchEngine, SearchOptions, SearchResult } from "./search.js";
export { loadEngine, search, searchVectors } from "./search.js";

export type { AliasEntry, AliasTable, ExpandResult } from "./expandQuery.js";
export { expandQuery, loadAliases } from "./expandQuery.js";
