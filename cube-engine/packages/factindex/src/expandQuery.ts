/**
 * 질의 확장 — **결정론적 사전 조회.** LLM 을 부르지 않는다.
 *
 * 같은 질의가 매번 다른 후보를 부르면 `FactAnswerManifest.answerPayloadHash` 재현성
 * (사양 §1.3 "동일 입력·동일 스냅샷에서 동일 결과")이 깨진다. 확장은 승인된 사전에서만 온다.
 *
 * `approved: false` 인 별칭은 **쓰지 않는다** — 정책 팩의 `review.approved` 와 같은 규율이다.
 * 사전이 미승인이면 확장이 하나도 안 일어나고, 그건 "ISA 를 못 찾는다"로 드러난다.
 * 조용히 쓰는 것보다 낫다.
 */

import { readFileSync } from "node:fs";

export interface AliasEntry {
  readonly term: string;
  readonly expandsTo: readonly string[];
  readonly corpusHits: number;
  readonly approved: boolean;
  readonly reviewer: string | null;
  readonly reviewedAt: string | null;
  readonly note?: string;
}

export interface AliasTable {
  readonly version: string;
  readonly aliases: readonly AliasEntry[];
}

export function loadAliases(path: string): AliasTable {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`별칭 사전을 읽을 수 없다 (${(e as Error).message}): ${path}`);
  }
  const obj = raw as Partial<AliasTable>;
  if (typeof obj.version !== "string" || !Array.isArray(obj.aliases)) {
    throw new Error("별칭 사전 형식이 잘못됐다 — version(string)·aliases(array) 필요");
  }
  for (const a of obj.aliases) {
    if (typeof a.term !== "string" || a.term.trim() === "") throw new Error("별칭에 term 이 없다");
    if (!Array.isArray(a.expandsTo)) throw new Error(`${a.term}: expandsTo 가 배열이 아니다`);
    if (typeof a.approved !== "boolean") throw new Error(`${a.term}: approved 가 boolean 이 아니다`);
  }
  return obj as AliasTable;
}

export interface ExpandResult {
  /** 확장된 질의 — 원 질의 + 승인된 별칭의 법령 용어 */
  readonly expanded: string;
  /** 실제로 적용된 별칭 (감사·디버깅용) */
  readonly applied: readonly { term: string; expandsTo: readonly string[] }[];
  /** 사전에 있으나 미승인이라 건너뛴 별칭 — 조용히 넘어가지 않는다 */
  readonly skippedUnapproved: readonly string[];
}

/**
 * 질의에 별칭을 적용한다. 원 질의를 **지우지 않고 덧붙인다** —
 * 사용자가 쓴 말도 매칭 신호이고, 지우면 사전이 틀렸을 때 복구가 안 된다.
 */
export function expandQuery(query: string, table: AliasTable): ExpandResult {
  const applied: { term: string; expandsTo: readonly string[] }[] = [];
  const skippedUnapproved: string[] = [];
  const additions: string[] = [];
  const lower = query.toLowerCase();

  for (const a of table.aliases) {
    if (!lower.includes(a.term.toLowerCase())) continue;
    if (!a.approved) {
      skippedUnapproved.push(a.term);
      continue;
    }
    const news = a.expandsTo.filter((t) => !query.includes(t));
    if (news.length === 0) continue;
    additions.push(...news);
    applied.push({ term: a.term, expandsTo: news });
  }

  return {
    expanded: additions.length === 0 ? query : `${query} ${additions.join(" ")}`,
    applied,
    skippedUnapproved,
  };
}
