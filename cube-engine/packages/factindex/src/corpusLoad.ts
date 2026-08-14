/**
 * 스냅샷 로딩 + 색인 대상 선별.
 *
 * 여기서 거르는 것은 **「삭제」 스텁**이다 (`제13조 삭제 <2009.12.31>` 류).
 *
 * 왜 거르나: 검색 노이즈이면서 **BM25 길이 정규화가 오히려 상위로 밀어올린다.**
 * 짧은 문서일수록 같은 매치에 높은 점수를 받기 때문이다. "제13조 삭제"는 어떤 질의에도 답이 아니다.
 *
 * 판별 기준의 이력(중요): 처음엔 `title === null` 과 정규식의 **동치관계**를 이중 술어로 썼다.
 * 법령 6종에서 372/372 로 정확히 일치했기 때문이다. 그런데 행정규칙이 합류하자 깨졌다 —
 * 행정규칙은 삭제해도 제목을 남긴다(`제5조의3(표준투자권유준칙) 삭제`).
 * 즉 그 동치관계는 **법령 특유의 우연**이었고, 삭제의 진짜 신호는 "제목 없음"이 아니라
 * "본문이 삭제 표기뿐"이다. 이중 술어 가드가 그 사실을 실패로 드러냈다.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ArticleSnapshot, SourceSnapshot } from "@cube/corpus";
import { sha256Hex } from "@cube/numeric";

/** `targets.json` 의 abbrev 와 같은 순서. 스냅샷 파일명이기도 하다. */
export const SNAPSHOT_ABBREVS = [
  "INCTAX",
  "INCTAX_D",
  "TAXEX",
  "TAXEX_D",
  "RETIRE",
  "RETIRE_D",
  // 행정규칙 (Phase 3-a·3-b). 사양 §5.1 서열에서 법률·시행령 아래다.
  //   RULE            = 법령 위임을 받은 법규명령성 고시 (금융위·금감원)
  //   ADMIN_GUIDANCE  = 행정청 내부 사무처리 훈령 (국세청)
  "PENSUP",
  "PENSUPD",
  "NTSWHT",
  "NTSINC",
] as const;

/**
 * 삭제 스텁 — 본문이 삭제 표기뿐인 조문. 두 형태를 모두 받는다:
 *   법령     `제13조 삭제 <2009.12.31>`                    (제목 없음)
 *   행정규칙 `제5조의3(표준투자권유준칙) 삭제<2022. 7. 12.>`  (**제목 유지**)
 * 그 밖의 본문이 붙으면 살아 있는 조문이다.
 */
const DELETED_STUB_RE = /^제[^\s(]+\s*(?:\([^)]*\))?\s*삭제\s*<[^>]*>$/;

/**
 * 제목 소실이 삭제의 신호인 계층. **법령에서만 그렇다.**
 *
 * 실측: 법령 6종에서 `title === null` 집합(372)과 위 정규식 집합(372)이 정확히 일치했다.
 * 그런데 행정규칙은 삭제해도 제목을 남긴다(`제5조의3(표준투자권유준칙) 삭제`).
 * 즉 그 동치관계는 **법령 특유의 우연**이었고, 삭제의 진짜 신호는 "제목 없음"이 아니라
 * "본문이 삭제 표기뿐"이다. 그래서 판별은 정규식이 하고, 제목 교차검증은 법령에만 건다.
 * (교차검증을 버리지 않는 이유: 법령에서 그 불일치는 파싱이 깨졌다는 신호이므로 여전히 유효하다.)
 */
const TITLE_SIGNALS_DELETION: ReadonlySet<SourceSnapshot["authorityType"]> = new Set([
  "STATUTE",
  "DECREE",
]);

export interface LoadedArticle extends ArticleSnapshot {
  readonly lawName: string;
  readonly authorityType: SourceSnapshot["authorityType"];
}

export interface LoadedCorpus {
  /** 색인 대상 — 삭제 스텁 제외 */
  readonly articles: readonly LoadedArticle[];
  /** 제외된 삭제 스텁 수 (테스트가 372 로 고정한다) */
  readonly deletedStubCount: number;
  /** 제외 전 전체 조문 수 */
  readonly totalArticleCount: number;
  /** 코퍼스 지문 — 조문 해시를 sourceId 순으로 이어 해싱. 원문이 바뀌면 색인이 무효다. */
  readonly corpusHash: string;
}

function isDeletedStub(a: ArticleSnapshot, authorityType: SourceSnapshot["authorityType"]): boolean {
  const byText = DELETED_STUB_RE.test(a.text.trim());
  if (TITLE_SIGNALS_DELETION.has(authorityType)) {
    const byTitle = a.title === null;
    if (byTitle !== byText) {
      throw new Error(
        `${a.sourceId}: 삭제 스텁 판별이 어긋난다 (title===null:${byTitle} / regex:${byText}) — ` +
          `법령 계층에서는 두 신호가 일치해야 한다. 어긋났다면 파싱이 깨졌거나 코퍼스 형태가 변했다.\n` +
          `  title=${JSON.stringify(a.title)} text=${JSON.stringify(a.text.slice(0, 80))}`,
      );
    }
  }
  return byText;
}

export function loadCorpus(snapshotDir: string): LoadedCorpus {
  const articles: LoadedArticle[] = [];
  let deletedStubCount = 0;
  let totalArticleCount = 0;
  const seen = new Set<string>();

  for (const abbrev of SNAPSHOT_ABBREVS) {
    const path = join(snapshotDir, `${abbrev}.json`);
    let snapshot: SourceSnapshot;
    try {
      snapshot = JSON.parse(readFileSync(path, "utf8")) as SourceSnapshot;
    } catch (e) {
      throw new Error(
        `스냅샷 ${abbrev}.json 을 읽을 수 없다 (${(e as Error).message}) — ` +
          `\`npm run collect -w @cube/corpus\` 로 수집했는지 확인하라`,
      );
    }
    if (!Array.isArray(snapshot.articles)) {
      throw new Error(`${abbrev}.json: articles 가 배열이 아니다`);
    }

    for (const article of snapshot.articles) {
      totalArticleCount += 1;
      if (seen.has(article.sourceId)) {
        // source_id 는 정책 팩이 조문을 지목하는 전역 주소다. 겹치면 인용이 모호해진다.
        throw new Error(`source_id 가 중복이다: ${article.sourceId}`);
      }
      seen.add(article.sourceId);

      if (isDeletedStub(article, snapshot.authorityType)) {
        deletedStubCount += 1;
        continue;
      }
      articles.push({
        ...article,
        lawName: snapshot.lawName,
        authorityType: snapshot.authorityType,
      });
    }
  }

  // sourceId 정렬 후 해싱 — 파일 순서·수집 시각(collectedAt)에 흔들리지 않는 지문.
  // 조문 원문이 한 글자라도 바뀌면 corpusHash 가 바뀌고, 그러면 ragIndexVersion 도 바뀐다.
  const fingerprint = [...articles]
    .sort((a, b) => (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0))
    .map((a) => `${a.sourceId}:${a.textHash}`)
    .join("\n");

  return {
    articles,
    deletedStubCount,
    totalArticleCount,
    corpusHash: sha256Hex(fingerprint),
  };
}
