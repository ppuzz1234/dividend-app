/**
 * 조문 직접 지정 파싱 — `"소득세법 시행령 제118조의3"` → `INCTAX_D_118_3`.
 *
 * ## 왜 이게 필요한가 (실측)
 * 평가셋 exact 버킷의 hit@1 이 **3/8(38%)** 였다. `"소득세법 시행령 제118조의3"` 에
 * `INCTAX_D_178_4` 가 1위로 나온다 — 조문번호가 2-gram 으로 흩어지면서 숫자가 비슷한
 * 조문들과 섞이기 때문이다.
 *
 * **이건 검색으로 풀 문제가 아니라 파싱으로 풀 문제다.** 사용자가 조문을 특정해 물었으면
 * 그 조문을 주면 된다. 아는 것을 fuzzy 로 다시 찾으면 드리프트만 생긴다
 * (A1 의 "송세진 → 송석우" 사고와 같은 구조 — 정확한 이름을 알면서 유사검색으로 흘렸다).
 *
 * 파싱이 실패하면 그냥 검색으로 넘어간다. **추측해서 고정하지 않는다.**
 */

import type { LoadedArticle } from "./corpusLoad.js";

/** 법령명 → source_id 접두사. `citations.ts` 와 같은 표를 쓴다(긴 이름 우선). */
const LAW_ABBREV: ReadonlyArray<readonly [string, string]> = [
  ["소득세법 시행령", "INCTAX_D"],
  ["소득세법시행령", "INCTAX_D"],
  ["조세특례제한법 시행령", "TAXEX_D"],
  ["조세특례제한법시행령", "TAXEX_D"],
  ["근로자퇴직급여 보장법 시행령", "RETIRE_D"],
  ["근로자퇴직급여보장법 시행령", "RETIRE_D"],
  ["근로자퇴직급여보장법시행령", "RETIRE_D"],
  ["소득세법", "INCTAX"],
  ["조세특례제한법", "TAXEX"],
  ["조특법", "TAXEX"],
  ["근로자퇴직급여 보장법", "RETIRE"],
  ["근로자퇴직급여보장법", "RETIRE"],
  ["퇴직급여법", "RETIRE"],
];

/** `제118조의3` · `제91조의18` · `제61조` */
const ARTICLE_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/;

export interface ExactRef {
  readonly sourceId: string;
  /** 질의에서 매칭된 부분 — 왜 고정했는지 보여준다 */
  readonly matched: string;
}

/**
 * 질의에서 조문 직접 지정을 뽑는다. 법령명이 없거나 그 조문이 코퍼스에 없으면 `null`.
 *
 * 법령명을 요구하는 이유: `"제17조"` 만으로는 6개 법령 중 어느 것인지 알 수 없다.
 * 추측해서 고정하면 6분의 1 확률로 맞는 근거를 제시하게 된다.
 */
export function parseExactRef(
  query: string,
  articles: readonly LoadedArticle[],
): ExactRef | null {
  const m = ARTICLE_RE.exec(query);
  if (m === null) return null;
  const [rawArticle, no, sub] = m;
  if (no === undefined) return null;

  // 법령명은 조문 표기 **앞**에 와야 한다. 뒤에 있으면 다른 법을 인용하는 문장일 수 있다.
  const before = query.slice(0, m.index);
  let abbrev: string | null = null;
  let matchedLaw = "";
  for (const [full, ab] of LAW_ABBREV) {
    if (before.includes(full) && full.length > matchedLaw.length) {
      abbrev = ab;
      matchedLaw = full;
    }
  }
  if (abbrev === null) return null;

  const sourceId = sub === undefined ? `${abbrev}_${no}` : `${abbrev}_${no}_${sub}`;
  if (!articles.some((a) => a.sourceId === sourceId)) return null;

  return { sourceId, matched: `${matchedLaw} ${rawArticle}` };
}
