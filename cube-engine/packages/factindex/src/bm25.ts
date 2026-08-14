/**
 * BM25 역색인 — 외부 의존성 0.
 *
 * SQLite FTS5 를 쓰지 않는 이유가 두 가지다:
 *  1. **토크나이저 통제.** FTS5 기본 토크나이저는 한국어 조사를 모른다 — A1 이 그것 때문에
 *     BM25 절반을 조용히 잃었다(`tokenize.ts` 헤더 참조).
 *  2. **의존성 0 유지.** 청크 2,357개 규모에서 역색인은 메모리에 다 올라간다(수 MB).
 *
 * 파라미터는 표준값 k1=1.2, b=0.75 를 쓴다. **튜닝한 값이 아니다** —
 * 평가셋(Phase 6)이 생기기 전의 튜닝은 몇 개 질의에 대한 overfit 이다.
 */

import { tokenize } from "./tokenize.js";

const K1 = 1.2;
const B = 0.75;

export interface Bm25Index {
  /** term → (docIndex → term frequency) */
  readonly postings: ReadonlyMap<string, ReadonlyMap<number, number>>;
  readonly docLengths: readonly number[];
  readonly avgDocLength: number;
  readonly docCount: number;
}

export function buildBm25(documents: readonly string[]): Bm25Index {
  const postings = new Map<string, Map<number, number>>();
  const docLengths: number[] = [];

  for (const [docIndex, doc] of documents.entries()) {
    const tokens = tokenize(doc);
    docLengths.push(tokens.length);
    for (const t of tokens) {
      let byDoc = postings.get(t);
      if (byDoc === undefined) {
        byDoc = new Map();
        postings.set(t, byDoc);
      }
      byDoc.set(docIndex, (byDoc.get(docIndex) ?? 0) + 1);
    }
  }

  const total = docLengths.reduce((a, b) => a + b, 0);
  return {
    postings,
    docLengths,
    avgDocLength: docLengths.length === 0 ? 0 : total / docLengths.length,
    docCount: docLengths.length,
  };
}

/**
 * 질의 → { docIndex → 점수 }. 점수는 **정규화 전 raw BM25** 다.
 * 하이브리드 융합(Phase 5)이 후보 집합 내부에서 min-max 정규화한다.
 *
 * @param candidates 주어지면 이 문서들만 채점한다 (시점 필터 적용 후 등).
 */
export function scoreBm25(
  index: Bm25Index,
  query: string,
  candidates?: ReadonlySet<number>,
): Map<number, number> {
  const scores = new Map<number, number>();
  if (index.docCount === 0) return scores;

  // 질의 토큰의 중복은 무시한다 — 같은 bigram 이 두 번 나온다고 두 배로 세면
  // 긴 질의가 짧은 질의보다 무조건 높은 점수를 받는다.
  for (const term of new Set(tokenize(query))) {
    const byDoc = index.postings.get(term);
    if (byDoc === undefined) continue;

    // IDF (BM25 표준형). 흔한 term 은 0 에 가까워지고, 절반 이상 문서에 나오면 음수가 될 수 있어
    // 0 으로 바닥을 깐다 — 음수 IDF 는 "이 단어가 있으면 감점"이라는 뜻이라 검색 의도와 어긋난다.
    const df = byDoc.size;
    const idf = Math.max(0, Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5)));
    if (idf === 0) continue;

    for (const [docIndex, tf] of byDoc) {
      if (candidates !== undefined && !candidates.has(docIndex)) continue;
      const dl = index.docLengths[docIndex] ?? 0;
      const norm = tf + K1 * (1 - B + (B * dl) / (index.avgDocLength || 1));
      scores.set(docIndex, (scores.get(docIndex) ?? 0) + (idf * (tf * (K1 + 1))) / norm);
    }
  }
  return scores;
}
