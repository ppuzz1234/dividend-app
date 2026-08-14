/**
 * 조문 묶음 조립 — **"숫자가 나왔다고 멈추지 않는다".**
 *
 * ## 왜 검색 결과만으로는 부족한가
 * 파라미터는 숫자 하나가 아니라 **조건이 붙은 값**이다. ISA 한도를 예로 들면:
 * ```
 *   400만원  IF (총급여 5천만원 이하) OR (종합소득 3천8백만원 이하) OR (대통령령 농어민)
 *   200만원  ELSE
 * ```
 * 조건이 다른 조문(시행령·고시)에 있으면 검색 top-N 만으로는 답이 반쪽이 된다.
 * "대통령령으로 정하는 농어민"이 누구인지는 **시행령을 읽어야** 알 수 있다.
 *
 * ## 무엇을 모으나
 * 1. **씨앗** — 검색 상위 조문
 * 2. **나가는 인용** — 씨앗이 「법령명」제N조 로 명시 인용한 조문
 *    → "이 조문이 참조하는 것". `제129조에도 불구하고` 같은 예외 규정을 잡는다.
 * 3. **들어오는 인용** — 씨앗을 인용하는 조문
 *    → **위임 사슬의 아래쪽.** 법률 조문을 찾았으면 그것을 인용하는 시행령이 세부를 정한다.
 *
 * 인용 그래프의 엣지 579개 중 **544개가 법령 간**이므로, 인용 폐포가 곧 위임 사슬 역할을 한다.
 * 별도 메커니즘이 필요 없었다.
 *
 * ## 왜 1홉만
 * 2홉을 열면 소득세법 전체가 딸려온다(조문당 평균 명시 인용 1.94개). 프롬프트가 터지고
 * 무관한 조문이 답을 흐린다. 1홉이 "조건을 읽는 데 필요한 최소"이고, 부족하면 사용자가
 * 후속 질문을 하면 된다. **ponytail(fact/묶음): 2홉이 필요한 질의가 관찰되면 그때 선택적으로 연다.**
 */

import { buildCitationGraph, loadCorpus } from "@cube/factindex";
import type { CitationGraph, LoadedArticle, ScoredArticle } from "@cube/factindex";

/** 묶음에 들어간 조문 하나. 인용 번호 `[n]` 이 이것을 가리킨다. */
export interface BundleItem {
  /** 답변에서 쓰는 인용 번호 (1-base) */
  readonly ref: number;
  readonly sourceId: string;
  readonly lawName: string;
  readonly authorityType: LoadedArticle["authorityType"];
  readonly articleLabel: string;
  readonly title: string | null;
  /** 조문 **전문**. 요약하지 않는다 — 조건을 잃으면 답이 틀린다. */
  readonly text: string;
  readonly validFrom: string;
  readonly textHash: string;
  /**
   * 왜 묶음에 들어왔는가 — 감사·디버깅용.
   * `CARRIED` = 이 대화의 앞 턴에서 인용됐던 조문. 후속 질문이 앞 답을 가리킬 때
   * 그 근거가 사라지면 대화가 끊기므로 이어서 싣는다 (묶음 조립이 아니라 대화 계층에서 붙인다).
   */
  readonly reason: "SEARCH" | "CITES" | "CITED_BY" | "BARE_REF" | "CARRIED";
  /** 검색 씨앗이면 그 순위(1-base), 아니면 null */
  readonly searchRank: number | null;
  /** 소속 호 미상인 목이 들어 있는가 → 답변에 caveat 필요 */
  readonly hasUnattachedMok: boolean;
  /**
   * 조문 **본문에 적힌 적용기한**들 (LocalDate, 오름차순).
   *
   * ★ `validFrom`/`validTo` 로는 못 잡는 것이다. 그 둘은 **조문의 생사**를 말할 뿐이고,
   * 조문이 살아 있어도 그 안의 규정이 `"2022년 12월 31일까지"` 로 이미 끝났을 수 있다.
   * 실측: `TAXEX_86_4`(연금계좌세액공제 등)는 `시행 2026-01-01` 로 표시되지만 내용은
   * 2022년까지의 한시 규정이었고, 그 결과 답변이 **끝난 규정을 현행처럼** 설명했다.
   * 게다가 같은 한도를 정하는 `INCTAX_59_3` 과 값이 달라 **어느 쪽이 지금 맞는지 알 수 없는 답**이 됐다.
   *
   * 여기서는 **추출만** 한다 — 지났는지 여부는 조회일이 있어야 알 수 있으므로 `expiredDeadlines` 가 판단하고,
   * "그러니 적용되지 않는다"는 **법적 결론은 내리지 않는다**(§1.1). 사람에게 드러낼 뿐이다.
   */
  readonly applicationDeadlines: readonly string[];
}

export interface Bundle {
  readonly items: readonly BundleItem[];
  /** 씨앗 조문 수 (검색에서 온 것) */
  readonly seedCount: number;
  /** 인용으로 딸려온 조문 수 */
  readonly expandedCount: number;
}

export interface BundleSource {
  readonly articles: readonly LoadedArticle[];
  readonly graph: CitationGraph;
}

/** 코퍼스를 한 번만 읽어 재사용한다 (조문 전문 + 인용 그래프). */
export function loadBundleSource(snapshotDir: string): BundleSource {
  const { articles } = loadCorpus(snapshotDir);
  return { articles, graph: buildCitationGraph(articles) };
}

function articleLabel(a: LoadedArticle): string {
  return a.articleSubNo === null ? `제${a.articleNo}조` : `제${a.articleNo}조의${a.articleSubNo}`;
}

/** 명시 인용 구간 — bare 후보에서 뺀다. 이미 인용 그래프가 처리한 것이다. */
const EXPLICIT_RE = /「[^」\n]{1,40}」\s*제\s*\d+\s*조(?:\s*의\s*\d+)?/g;
const BARE_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;

/**
 * 같은 법령 안의 bare 참조(`제2조`) → sourceId.
 *
 * ## 왜 인용 그래프는 이걸 안 하는데 묶음은 하나 — **용도가 다르면 기준도 다르다**
 * Phase 1 이 bare 확장을 **16% 오류**로 기각한 것은 **인용 그래프**에 대해서였다.
 * 그래프는 "이 조문이 저 조문을 인용한다"는 **사실 주장**이라 6건 중 1건이 틀리면 근거가 거짓이 된다.
 *
 * 묶음 확장은 다르다. 조문을 **후보로 넣는 것**이지 답을 결정하지 않는다. 잘못 들어온 조문은
 * 질문과 무관하니 LLM 이 인용하지 않고, `buildUnmodeledAnswer` 가 **인용된 것만** 근거로 싣는다.
 * 즉 틀린 추가의 비용은 **정확도가 아니라 프롬프트 토큰**이다.
 *
 * ## 실측 (`npm run measure:bareref -w @cube/factindex`)
 * bare 참조 5,790 중 자기참조 1,764 제외 → 4,026. 코퍼스 실재 3,238(80.4%),
 * dangling 788(19.6%)은 **실재 필터가 자동으로 거른다.** dangling 다수는 「삭제」 스텁을
 * 가리키는 정당한 참조였다(법을 잘못 붙인 것이 아니라).
 *
 * ponytail(fact/bare): "실재하지만 다른 법을 가리키는" 잔여 위험은 측정으로 구분할 수 없다.
 * 인용 검증이 출력에서 걸러주므로 감수한다. 정식 해결은 조문별 참조 대상을 원문 대조로 확정하는 것.
 */
function bareRefsWithin(article: LoadedArticle): string[] {
  const prefix = /^([A-Z]+(?:_D)?)_/.exec(article.sourceId)?.[1];
  if (prefix === undefined) return [];
  const stripped = article.text.replace(EXPLICIT_RE, " ");
  const out = new Set<string>();
  BARE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = BARE_RE.exec(stripped)) !== null) {
    const [, no, sub] = m;
    if (no === undefined) continue;
    const to = sub === undefined ? `${prefix}_${no}` : `${prefix}_${no}_${sub}`;
    if (to !== article.sourceId) out.add(to);
  }
  return [...out];
}

export interface BundleOptions {
  /** 씨앗으로 쓸 검색 상위 개수 */
  readonly seedTopK?: number;
  /** 인용 확장 후 묶음 전체 상한 — 프롬프트가 터지지 않게 */
  readonly maxItems?: number;
}

/**
 * 검색 결과 → 조문 묶음.
 *
 * 순서가 곧 우선순위다: 씨앗 → 나가는 인용 → 들어오는 인용.
 * 상한에 걸리면 뒤쪽(들어오는 인용)부터 잘린다 — 씨앗은 절대 잘리지 않는다.
 */
export function assembleBundle(
  source: BundleSource,
  ranked: readonly ScoredArticle[],
  opts: BundleOptions = {},
): Bundle {
  const seedTopK = opts.seedTopK ?? 5;
  const maxItems = opts.maxItems ?? 12;
  if (seedTopK <= 0 || maxItems <= 0) throw new Error("seedTopK·maxItems 는 양수여야 한다");

  const byId = new Map(source.articles.map((a) => [a.sourceId, a]));
  const picked = new Map<string, { article: LoadedArticle; reason: BundleItem["reason"]; rank: number | null }>();

  // 1) 씨앗
  const seeds = ranked.slice(0, seedTopK);
  for (const [i, s] of seeds.entries()) {
    const a = byId.get(s.sourceId);
    if (a !== undefined) picked.set(s.sourceId, { article: a, reason: "SEARCH", rank: i + 1 });
  }
  const seedCount = picked.size;

  const add = (sourceId: string, reason: BundleItem["reason"]): void => {
    if (picked.size >= maxItems || picked.has(sourceId)) return;
    const a = byId.get(sourceId);
    if (a !== undefined) picked.set(sourceId, { article: a, reason, rank: null });
  };

  // 2) 나가는 인용 — 이 조문이 참조하는 것 (예외·정의 규정)
  for (const seed of seeds) {
    for (const e of source.graph.edges) {
      if (e.from === seed.sourceId) add(e.to, "CITES");
    }
  }
  // 3) 들어오는 인용 — 이 조문을 참조하는 것 (위임 사슬 아래쪽: 법률 → 그 시행령)
  for (const seed of seeds) {
    for (const e of source.graph.edges) {
      if (e.to === seed.sourceId) add(e.from, "CITED_BY");
    }
  }
  // 4) 같은 법령 안의 bare 참조 — 명시 인용을 **다 넣은 뒤** 남는 자리에만 넣는다.
  //
  //    ★ 이 순서를 두 번 바꿔 보고 되돌렸다 (2026-08-03 측정).
  //      ① BARE_REF 를 CITED_BY 앞으로 → 묶음 적중 25/26 **변화 없음**
  //      ② 씨앗들이 예산을 나눠 갖는 라운드로빈 → 역시 **25/26, 변화 없음**
  //      둘 다 논리는 그럴듯했지만 **측정이 개선을 보여주지 못했다.** 그래서 원래대로 뒀다.
  //      나아짐을 보이지 못한 변경은 위험만 남긴다 — 특히 평가 문항 **한 건**을 겨냥한 변경은.
  //
  //    남은 구멍(`INCTAX_D_118_3`)의 진짜 원인은 순서가 아니라 **예산**이다:
  //    `maxItems` 를 20 으로 올려야 들어온다. 토큰 비용이 실제로 들고 1/26 이라 올리지 않았다.
  //    ponytail(fact/묶음예산): 상한 10 은 프롬프트 크기와의 타협이다. 유형별 평가셋이
  //    생겨 이런 사례가 여러 건 확인되면 그때 근거를 갖고 올린다.
  for (const seed of seeds) {
    const a = byId.get(seed.sourceId);
    if (a === undefined) continue;
    for (const to of bareRefsWithin(a)) add(to, "BARE_REF");
  }
  const items: BundleItem[] = [...picked.values()].map((p, i) => ({
    ref: i + 1,
    sourceId: p.article.sourceId,
    lawName: p.article.lawName,
    authorityType: p.article.authorityType,
    articleLabel: articleLabel(p.article),
    title: p.article.title,
    text: p.article.text,
    validFrom: p.article.validFrom,
    textHash: p.article.textHash,
    reason: p.reason,
    searchRank: p.rank,
    hasUnattachedMok: p.article.text.includes("[각 목]"),
    applicationDeadlines: extractDeadlines(p.article.text),
  }));

  return { items, seedCount, expandedCount: items.length - seedCount };
}

/**
 * 조문 본문에서 **적용기한 표현**을 뽑는다. `2022년 12월 31일까지` · `2022.12.31.까지` 형태.
 *
 * ## 왜 판단하지 않고 추출만 하나
 * "기한이 지났으니 이 규정은 적용되지 않는다"는 **법적 결론**이다. 그건 승인된 정책 규칙의
 * `temporal.valid_to` 가 할 일이지 RAG 가 할 일이 아니다(§1.1). 여기서는 "이 조문에 이런
 * 날짜가 적혀 있다"는 **사실**만 꺼내고, 조회일과의 비교는 `expiredDeadlines` 에서 한다.
 *
 * ponytail: 문자열 규칙이라 `해당 과세기간 종료일까지` 처럼 날짜가 아닌 기한 표현은 못 잡는다.
 * 상한은 "연·월·일이 명시된 것만". 업그레이드 경로는 표현 목록을 늘리는 것이고,
 * **놓쳐도 기존 동작대로**(경고 없음)라 새 위험을 만들지는 않는다.
 */
export function extractDeadlines(text: string): string[] {
  const out = new Set<string>();
  const pad = (s: string): string => (s.length === 1 ? `0${s}` : s);

  for (const m of text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*까지/g)) {
    out.add(`${m[1] ?? ""}-${pad(m[2] ?? "")}-${pad(m[3] ?? "")}`);
  }
  for (const m of text.matchAll(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*까지/g)) {
    out.add(`${m[1] ?? ""}-${pad(m[2] ?? "")}-${pad(m[3] ?? "")}`);
  }
  return [...out].sort();
}

/** 조회일 기준으로 **이미 지난** 적용기한들. 날짜 비교일 뿐 법적 판단이 아니다. */
export function expiredDeadlines(item: BundleItem, queryAsOf: string): string[] {
  return item.applicationDeadlines.filter((d) => d < queryAsOf);
}

/** 조문 하나가 "지난 기한을 담고 있는가" — 프롬프트·화면에서 경고를 띄울 조건. */
export function hasExpiredDeadline(item: BundleItem, queryAsOf: string): boolean {
  return expiredDeadlines(item, queryAsOf).length > 0;
}
