/**
 * 법제처 응답 → SourceSnapshot 변환. **순수 함수** (네트워크 없음) 이므로 fixture 로 테스트한다.
 *
 * 설계 메모: 법령 메타데이터(법령명·공포일·시행일·구분)는 **본문 응답의 `기본정보` 가 아니라
 * 검색 응답(LawIndexEntry)에서 가져온다.** 검색 응답 key 는 실제 호출로 검증했지만
 * `기본정보` 하위 key 는 검증하지 않았기 때문이다 — 추측한 key 로 읽으면 값이 조용히 빈 문자열이 된다.
 */

import { sha256Hex } from "@cube/numeric";

import { asArray, asRecord, str } from "./json.js";
import type { ArticleSnapshot, AuthorityType, LifecycleStatus, SourceSnapshot } from "./types.js";
import type { LawIndexEntry } from "./lawApi.js";

/** "20260101" → "2026-01-01". 사양 §5.1 은 날짜를 KST LocalDate 로 못박았다 (UTC 변환 금지). */
export function toLocalDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    throw new Error(`날짜 형식이 YYYYMMDD 가 아니다: ${JSON.stringify(yyyymmdd)}`);
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * 법령구분명 → 사양 §5.1 `authority.type`.
 * 충돌 해소 서열(법률 → 시행령 → 시행규칙 → …)의 근거값이라 모르는 구분명은 거절한다 —
 * 서열이 틀리면 상위법이 하위법에 밀린다.
 */
export function mapAuthorityType(lawKind: string): AuthorityType {
  if (lawKind === "법률") return "STATUTE";
  if (lawKind === "대통령령") return "DECREE";
  if (lawKind.endsWith("령")) return "RULE"; // 총리령·부령·각 부처령
  throw new Error(`알 수 없는 법령구분명이다: ${JSON.stringify(lawKind)} — 서열을 임의로 정하지 않는다`);
}

/**
 * 현행연혁코드 → 사양 §5.1 `lifecycle.status`.
 *
 * "시행예정"을 PROPOSED 로 놓지 않는 것이 중요하다. 시행예정은 **이미 공포된 법**이고
 * 시행일만 미래일 뿐이라 status 는 ENACTED 다. 조회일 기준 유효성 판정
 * (`valid_from <= query_date`, 사양 §5.1)이 알아서 걸러준다.
 * 사양의 PROPOSED 는 국회 통과 전 개정안을 뜻하는데, 법제처 API 는 공포된 것만 주므로
 * 이 경로에서는 PROPOSED 가 나올 수 없다.
 */
export function mapLifecycle(historyCode: string): LifecycleStatus {
  if (historyCode === "현행" || historyCode === "시행예정") return "ENACTED";
  if (historyCode === "연혁") return "REPEALED";
  throw new Error(`알 수 없는 현행연혁코드다: ${JSON.stringify(historyCode)}`);
}

/**
 * 소속 호를 알 수 없는 목에 붙이는 표식.
 *
 * KNOWN-LIMITATION(코퍼스/조문구조): 법제처 `lawService.do` 는 목을 **호의 자식이 아니라
 * 항의 형제**로 내려준다. 한 항 안의 여러 호에 걸린 목이 하나의 평평한 배열로 합쳐지고
 * 부모 호 참조가 없다 (예: 조특법 §91의18 ③ = 호 5개에 목 9개).
 *
 * 그냥 이어붙이면 목이 **마지막 호에 속한 것처럼 읽힌다.** 실제 사고 사례:
 *   1. 다음 각 목의 …: 400만원   ← 가·나·다는 여기 소속
 *   2. 제1호에 해당하지 아니하는 …: 200만원
 *   가. 총급여액 5천만원 이하 …   ← 2번 뒤에 붙어 "5천만원 이하 → 200만원" 으로 뒤집혀 읽힘
 * ISA 서민형 판정(§12 1순위 파라미터)이 통째로 반대가 된다.
 *
 * "다음 각 목" 이라 말하는 호에 순서대로 매칭하는 heuristic 을 4개 법령 238개 항에 대고
 * 측정해봤으나 **80.3% 만 일치**했다. 5건 중 1건을 조용히 틀리게 붙이는 셈이라 채택하지 않았다.
 * 그래서 붙이지 않고 "소속 미상"을 텍스트에 드러낸다 — 틀린 구조를 주장하느니 모른다고 하는 편이 낫다.
 *
 * 업그레이드 경로: 조항호목 단위 API(`lsNwJoListGuide` 계열)가 부모 참조를 주는지 확인해
 * 준다면 그쪽으로 교체하고 이 표식을 제거한다.
 */
const UNATTACHED_MOK = "[각 목] ";

/**
 * 조문단위 → 원문 텍스트. 응답의 key 순서에 기대지 않고 **명시적으로** 조립한다.
 *
 * key 순서에 기대면 안 되는 이유: 실제 응답의 최상위 key 순서가 `… | 항 | 조문내용 | …` 이라
 * 순서대로 훑으면 **조문 첫 문장이 맨 끝으로 밀린다.**
 */
/**
 * "…내용" 값 하나를 문자열 조각들로 편다.
 *
 * 법제처는 이 값을 문자열로 줄 때도 있고 **중첩 배열**로 줄 때도 있다 — 목 아래 (1)(2)(3)
 * 세목이 배열의 배열로 온다 (실례: 소득세법 시행령 §20 ① 나목의 일용근로자 제외 업무).
 * 문자열만 읽으면 그 세목이 통째로 사라진 채 "원문"으로 저장된다.
 */
function textsOf(value: unknown): string[] {
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? [] : [t];
  }
  if (typeof value === "number") return [String(value)];
  if (Array.isArray(value)) return value.flatMap(textsOf);
  return [];
}

function articleChunks(rec: Record<string, unknown>): string[] {
  const lines: string[] = [];

  lines.push(...textsOf(rec["조문내용"]));

  for (const hang of asArray(rec["항"])) {
    const h = asRecord(hang, "항");
    lines.push(...textsOf(h["항내용"]));

    for (const ho of asArray(h["호"])) {
      const hoRec = asRecord(ho, "호");
      lines.push(...textsOf(hoRec["호내용"]));
      // 호가 목을 직접 갖는 경우는 소속이 확정이므로 표식 없이 그대로 붙인다.
      for (const mok of asArray(hoRec["목"])) lines.push(...textsOf(asRecord(mok, "목")["목내용"]));
    }

    // 항에 형제로 매달린 목 — 소속 호 미상이므로 첫 줄에 표식을 단다.
    // 뒤따르는 세목((1)(2)…)은 그 목의 하위라 소속이 명확하니 표식을 반복하지 않는다.
    for (const mok of asArray(h["목"])) {
      const parts = textsOf(asRecord(mok, "목")["목내용"]);
      parts.forEach((p, i) => lines.push(i === 0 ? UNATTACHED_MOK + p : p));
    }
  }

  return lines;
}

/**
 * 검산용. "…내용" 으로 끝나는 key 를 전부 세어 articleText 가 빠뜨린 게 없는지 확인한다.
 *
 * articleText 는 아는 구조(조문내용/항/호/목)만 명시적으로 읽으므로, 법제처가 새 계층을
 * 추가하면 **조용히 짧아진다** — 그건 요약된 원문과 구분이 안 돼 grounding 이 무너진다.
 * 개수가 어긋나면 parseArticles 가 터진다.
 */
function countTextNodes(node: unknown): number {
  if (Array.isArray(node)) return node.reduce<number>((n, c) => n + countTextNodes(c), 0);
  if (typeof node !== "object" || node === null) return 0;

  let n = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key.endsWith("내용")) n += textsOf(value).length;
    else n += countTextNodes(value);
  }
  return n;
}

/** `법령.조문.조문단위` → ArticleSnapshot[]. */
export function parseArticles(body: unknown, abbrev: string): ArticleSnapshot[] {
  const law = asRecord(asRecord(body, "본문 응답 최상위")["법령"], "법령");
  const units = asArray(asRecord(law["조문"], "법령.조문")["조문단위"]);

  const articles: ArticleSnapshot[] = [];
  const seen = new Map<string, number>();

  for (const unit of units) {
    const rec = asRecord(unit, "조문단위 항목");

    // `조문여부` 는 "조문" / "전문" 두 값을 갖는다. "전문"은 "제1장 총칙" 같은 편·장·절 표제인데,
    // **자기 번호가 없어서 뒤따르는 조문의 번호를 그대로 달고 온다** (제1장 총칙이 조문번호 "1").
    // 인용 단위가 아니고, 거르지 않으면 제1조와 source_id 가 충돌한다.
    // 부칙은 `법령.조문` 이 아니라 `법령.부칙` 에 따로 있어 여기 섞이지 않는다.
    if (str(rec, "조문여부") !== "조문") continue;

    const articleNo = str(rec, "조문번호");
    if (articleNo === "") {
      throw new Error("조문여부='조문' 인데 조문번호가 없다 — 응답 구조가 바뀌었을 수 있다");
    }

    const subNo = str(rec, "조문가지번호");
    const sourceId = subNo === "" ? `${abbrev}_${articleNo}` : `${abbrev}_${articleNo}_${subNo}`;

    const chunks = articleChunks(rec);
    const text = chunks.join("\n");
    if (text === "") {
      throw new Error(
        `${sourceId}: 조문 원문이 비었다 — 응답 구조가 바뀌었을 수 있다 (articleChunks 확인)`,
      );
    }

    // 줄 수가 아니라 **조각 수**로 센다 — 원문 문자열 안에 줄바꿈이 들어있는 조문이 실제로 있다.
    const expected = countTextNodes(rec);
    if (chunks.length !== expected) {
      throw new Error(
        `${sourceId}: 원문 조각 ${chunks.length}개를 조립했는데 응답에는 ${expected}개다 — ` +
          `모르는 계층이 생겨 원문이 잘렸을 수 있다. 잘린 원문은 요약본과 구분되지 않으므로 중단한다`,
      );
    }

    const prev = seen.get(sourceId);
    if (prev !== undefined) {
      throw new Error(
        `source_id 충돌: ${sourceId} 가 ${prev}번째와 ${articles.length}번째에 중복된다 — ` +
          `정책 팩이 어느 조문을 인용한 건지 결정 불가해지므로 조용히 덮지 않는다`,
      );
    }
    seen.set(sourceId, articles.length);

    const title = str(rec, "조문제목");
    articles.push({
      sourceId,
      articleNo,
      articleSubNo: subNo === "" ? null : subNo,
      title: title === "" ? null : title,
      text,
      validFrom: toLocalDate(str(rec, "조문시행일자")),
      textHash: sha256Hex(text),
    });
  }

  if (articles.length === 0) throw new Error("조문이 하나도 파싱되지 않았다");
  return articles;
}

export function buildSnapshot(args: {
  readonly entry: LawIndexEntry;
  readonly body: unknown;
  readonly abbrev: string;
  readonly sourceUrl: string;
  readonly collectedAt: string;
}): SourceSnapshot {
  const { entry, body, abbrev, sourceUrl, collectedAt } = args;
  return {
    lawName: entry.lawName,
    lawId: entry.lawId,
    mst: entry.mst,
    authorityType: mapAuthorityType(entry.lawKind),
    lifecycleStatus: mapLifecycle(entry.historyCode),
    promulgatedAt: toLocalDate(entry.promulgatedAt),
    enforcedAt: toLocalDate(entry.enforcedAt),
    collectedAt,
    sourceUrl,
    articles: parseArticles(body, abbrev),
  };
}
