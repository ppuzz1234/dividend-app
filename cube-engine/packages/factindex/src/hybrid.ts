/**
 * 하이브리드 검색 — BM25(어휘) + 벡터(의미) 융합.
 *
 * ## A1-v2 에서 가져온 것
 * `search.py:69-102` 의 **후보 집합 내부 min-max 정규화 후 가중합**.
 *  - `hi === lo` 면 전부 1.0 (후보 1개일 때 division-by-zero 방어)
 *  - 한쪽에만 있는 후보는 다른 쪽 0.0 (RRF 가 아니라 단순 가중합)
 *
 * ## A1 의 부호 반전 함정은 여기 없다
 * A1 은 SQLite `bm25()`(음수일수록 좋음)와 vec0 `distance`(작을수록 좋음)를 뒤집어야 했다.
 * 우리는 두 점수원을 직접 만들어 **둘 다 클수록 좋음**으로 통일했으므로 반전이 없다.
 * 그래도 이 사실을 테스트로 못 박는다 — 나중에 백엔드를 바꾸면 바로 여기서 깨진다.
 *
 * ## ⚠️ 가중치 0.5/0.5 는 튜닝된 값이 아니다
 * A1 의 `hybrid_bm25_weight`/`hybrid_vector_weight` 도 **한 번도 스윕된 적이 없고**,
 * TDD 가 "calibrate 되어야 할 시작값"이라고 명시했다. 평가셋(Phase 6) 없이 튜닝하면
 * 몇 개 질의에 대한 overfit 이다. 여기서는 시작값으로만 쓰고 "검증된 값"이라 부르지 않는다.
 */

import type { Chunk } from "./types.js";

export const DEFAULT_BM25_WEIGHT = 0.5;
export const DEFAULT_VECTOR_WEIGHT = 0.5;

export interface ScoredChunk {
  readonly chunk: Chunk;
  readonly bm25: number;
  readonly vector: number;
  readonly fused: number;
  /**
   * 정규화 **전** 코사인. 0~1 의 절대 척도다.
   *
   * 왜 따로 싣나: `fused` 는 후보 집합 내부 min-max 라 **1위는 항상 1.0 근처**다.
   * 실측상 답이 없는 질의("오늘 서울 날씨")의 1위 `fused` 도 0.89 가 나와 답 있는 질의와
   * 구분되지 않는다 — A1 의 "score gate 가 13건 중 0건 발화 = dead" 와 같은 구조다.
   * 거부 판정에 쓸 신호는 정규화 전 절대값이어야 한다 (Phase 9 가 이 값을 본다).
   */
  readonly rawVector: number;
  /** 질의가 조문을 직접 지정해 고정된 결과인가 (검색 순위가 아니라 파싱 결과) */
  readonly pinned: boolean;
}

/** 조문 단위 결과 — 같은 조문의 여러 청크는 최고점 하나로 대표된다. */
export interface ScoredArticle {
  readonly sourceId: string;
  readonly best: ScoredChunk;
  /** 이 조문에서 매칭된 청크 수 — 넓게 걸렸는지 한 군데만 걸렸는지 보여준다 */
  readonly matchedChunks: number;
}

/** 후보 집합 내부 min-max 정규화. 값이 모두 같으면 전부 1.0. */
function minMax(scores: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  if (scores.size === 0) return out;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of scores.values()) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi === lo) {
    for (const k of scores.keys()) out.set(k, 1);
    return out;
  }
  for (const [k, v] of scores) out.set(k, (v - lo) / (hi - lo));
  return out;
}

export function fuse(
  chunks: readonly Chunk[],
  bm25Scores: ReadonlyMap<number, number>,
  vectorScores: ReadonlyMap<number, number>,
  opts: { bm25Weight?: number; vectorWeight?: number } = {},
): ScoredChunk[] {
  const wB = opts.bm25Weight ?? DEFAULT_BM25_WEIGHT;
  const wV = opts.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
  const nB = minMax(bm25Scores);
  const nV = minMax(vectorScores);

  const out: ScoredChunk[] = [];
  for (const i of new Set([...nB.keys(), ...nV.keys()])) {
    const chunk = chunks[i];
    if (chunk === undefined) continue;
    const bm25 = nB.get(i) ?? 0;
    const vector = nV.get(i) ?? 0;
    out.push({
      chunk,
      bm25,
      vector,
      fused: wB * bm25 + wV * vector,
      rawVector: vectorScores.get(i) ?? 0,
      pinned: false,
    });
  }
  return out.sort((a, b) => b.fused - a.fused);
}

/**
 * 청크 순위 → 조문 순위. 같은 조문의 청크는 **최고점 하나로** 접는다.
 *
 * 왜 접나: 인용 단위가 조문이라 결과도 조문 단위여야 한다. 접지 않으면 긴 조문이
 * 청크 수만큼 상위를 차지해 다른 조문을 밀어낸다 (실제로 top-5 에 같은 조문이 3번 나왔다).
 */
/**
 * 사양 §5.1 권위 서열. 작을수록 상위다.
 * 법률 → 시행령 → 시행규칙·법규명령성 고시 → 공식 해석·행정안내 → 금융회사 정책.
 */
const AUTHORITY_RANK: Readonly<Record<string, number>> = {
  STATUTE: 0,
  DECREE: 1,
  RULE: 2,
  ADMIN_GUIDANCE: 3,
  PROVIDER_POLICY: 4,
};

/**
 * 점수가 이 비율 이내로 근소하면 권위 서열이 순위를 가른다.
 *
 * 왜 필요한가 (실측): 코퍼스에 국세청 훈령(`ADMIN_GUIDANCE`)이 합류하자 `"ISA"` 질의에서
 * `NTSWHT_59`(원천징수사무처리규정 — 내부 사무처리 훈령)가 `TAXEX_91_18`(조세특례제한법 — **법률**)을
 * 밀어냈다. 조문 제목이 질의와 더 겹쳐서 BM25 가 올린 것이고 검색 관점에선 정당하지만,
 * **사양 §5.1 은 근거의 서열을 정해두었다** — 법률이 행정안내에 밀리면 인용의 등급이 뒤집힌다.
 *
 * 계층이 하나(법령)뿐일 때는 드러나지 않던 결함이다. 점수 차이가 크면 여전히 점수가 이긴다 —
 * 서열은 **동점 부근의 tie-break** 이지 점수를 덮는 규칙이 아니다.
 */
const AUTHORITY_TIEBREAK_MARGIN = 0.05;

export function foldToArticles(scored: readonly ScoredChunk[]): ScoredArticle[] {
  const byArticle = new Map<string, { best: ScoredChunk; count: number }>();
  for (const s of scored) {
    const cur = byArticle.get(s.chunk.sourceId);
    if (cur === undefined) byArticle.set(s.chunk.sourceId, { best: s, count: 1 });
    else {
      cur.count += 1;
      if (s.fused > cur.best.fused) cur.best = s;
    }
  }
  return [...byArticle.entries()]
    .map(([sourceId, v]) => ({ sourceId, best: v.best, matchedChunks: v.count }))
    .sort((a, b) => {
      const diff = b.best.fused - a.best.fused;
      if (Math.abs(diff) > AUTHORITY_TIEBREAK_MARGIN) return diff;
      const ra = AUTHORITY_RANK[a.best.chunk.authorityType] ?? 9;
      const rb = AUTHORITY_RANK[b.best.chunk.authorityType] ?? 9;
      // 서열이 같으면 점수로 되돌아간다.
      return ra !== rb ? ra - rb : diff;
    });
}
