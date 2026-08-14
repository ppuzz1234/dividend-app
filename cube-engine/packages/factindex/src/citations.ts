/**
 * 조문 간 인용 그래프 — **명시 인용만.**
 *
 * ## 왜 명시 인용만인가 (실측)
 * - 명시 `「법령명」제N조` : 코퍼스 내 6법령을 가리키는 689건 중 **688건이 실제 조문으로 해소 = 99.9%**
 * - bare `제N조` 를 "같은 법"으로 추정 : 표본 62건 중 **10건(16%)이 존재하지 않는 sourceId**
 *
 * 6건 중 1건을 조용히 틀리게 확장하면 "근거 조문"이 거짓이 된다. 이는 `@cube/corpus` 의
 * `parse.ts` 가 목 소속 추론 heuristic 을 80.3% 라는 이유로 기각한 것과 **같은 논리**다.
 * 커버리지(엣지 보유 조문 16.7%)는 낮지만, 그 안에 **법 ↔ 시행령 위임 관계**가 들어 있어
 * 사양 §5.1 의 `role: PRIMARY / IMPLEMENTING_DETAIL` 구분에 직결된다.
 *
 * 코퍼스 밖 법령(「법인세법」「자본시장과 금융투자업에 관한 법률」 등)은 해소하지 않고 버린다 —
 * 수집 범위 밖이라 가리킬 조문이 없다.
 */

import type { LoadedArticle } from "./corpusLoad.js";

/** 법령명 → source_id 접두사. `@cube/corpus` 의 `targets.json` abbrev 와 같아야 한다. */
const LAW_ABBREV: ReadonlyArray<readonly [string, string]> = [
  // 긴 이름부터 — "소득세법 시행령" 이 "소득세법" 으로 잘못 매칭되면 엉뚱한 법을 가리킨다.
  ["소득세법 시행령", "INCTAX_D"],
  ["조세특례제한법 시행령", "TAXEX_D"],
  ["근로자퇴직급여 보장법 시행령", "RETIRE_D"],
  ["근로자퇴직급여보장법 시행령", "RETIRE_D"],
  ["소득세법", "INCTAX"],
  ["조세특례제한법", "TAXEX"],
  ["근로자퇴직급여 보장법", "RETIRE"],
  ["근로자퇴직급여보장법", "RETIRE"],
];

/** `「소득세법」 제129조` · `「소득세법 시행령」제40조의2` */
const EXPLICIT_RE = /「([^」\n]{1,40})」\s*제(\d+)조(?:의(\d+))?/g;

export interface CitationEdge {
  readonly from: string;
  readonly to: string;
  /** 원문에 나타난 그대로 — 대조·디버깅용 */
  readonly raw: string;
}

export interface CitationGraph {
  readonly edges: readonly CitationEdge[];
  /** 코퍼스 내 법령을 가리켰으나 그 조문이 없는 인용 (원문 오탈자·미수집 조문) */
  readonly dangling: readonly CitationEdge[];
  /** 코퍼스 밖 법령 인용 수 — 커버리지 한계를 수치로 남긴다 */
  readonly outOfCorpusCount: number;
}

function abbrevOf(lawName: string): string | null {
  const name = lawName.trim();
  for (const [full, abbrev] of LAW_ABBREV) if (name === full) return abbrev;
  return null;
}

export function buildCitationGraph(articles: readonly LoadedArticle[]): CitationGraph {
  const known = new Set(articles.map((a) => a.sourceId));
  const edges: CitationEdge[] = [];
  const dangling: CitationEdge[] = [];
  const seen = new Set<string>();
  let outOfCorpusCount = 0;

  for (const article of articles) {
    EXPLICIT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EXPLICIT_RE.exec(article.text)) !== null) {
      const [raw, lawName, articleNo, subNo] = m;
      if (lawName === undefined || articleNo === undefined) continue;

      const abbrev = abbrevOf(lawName);
      if (abbrev === null) {
        outOfCorpusCount += 1;
        continue;
      }
      const to = subNo === undefined ? `${abbrev}_${articleNo}` : `${abbrev}_${articleNo}_${subNo}`;
      if (to === article.sourceId) continue; // 자기 참조는 엣지가 아니다

      const key = `${article.sourceId}->${to}`;
      if (seen.has(key)) continue; // 같은 조문을 여러 번 인용해도 엣지는 하나
      seen.add(key);

      const edge: CitationEdge = { from: article.sourceId, to, raw };
      if (known.has(to)) edges.push(edge);
      else dangling.push(edge);
    }
  }

  return { edges, dangling, outOfCorpusCount };
}

/** 어떤 조문이 인용하는 조문들 (1홉). Phase 9 의 근거 보강에 쓴다. */
export function outgoing(graph: CitationGraph, sourceId: string): string[] {
  return graph.edges.filter((e) => e.from === sourceId).map((e) => e.to);
}
