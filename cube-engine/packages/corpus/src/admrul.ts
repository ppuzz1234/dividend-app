/**
 * 행정규칙(고시·훈령·예규) 수집 — `target=admrul`.
 *
 * ## 왜 법령 파서를 재사용하지 못하나 (실측)
 * 법령(`target=law`)은 `조문단위` 객체 배열로 항·호·목이 구조화돼 오지만,
 * 행정규칙은 `조문내용`이 **평문 문자열 배열**이다. 퇴직연금감독규정 기준 39줄이고
 * 그중 34줄이 조문, 5줄이 편·장 표제다. 항·호는 한 줄 안에 이어져 있다.
 *
 * 그래서 조문 경계를 **텍스트에서 직접** 파싱한다. 구조가 없으므로 `[각 목]` 문제도 없다 —
 * 원문이 통째로 한 덩어리라 소속을 잃을 것이 애초에 없다.
 *
 * ## 왜 필요한가
 * 사양 §12 "IRP 편입 제한(개별주 불가·위험자산 비중 등)"의 **유일한 근거**가 여기 있다.
 * 법령·시행령에는 그 한도가 없다. 과장님 요구의 "정부에서 제공하는 official 정보" 절반이 이 층이다.
 */

import { sha256Hex } from "@cube/numeric";

import { asArray, asRecord, str } from "./json.js";
import type { ArticleSnapshot, AuthorityType, LifecycleStatus, SourceSnapshot } from "./types.js";

const BASE = "https://www.law.go.kr/DRF";

/** 줄 맨 앞의 `제N조` / `제N조의M`. 제목 괄호는 붙어 있을 수도, 공백이 낄 수도 있다. */
const ARTICLE_HEAD_RE = /^\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:\(([^)]*)\))?/;

export interface AdmRulIndexEntry {
  readonly name: string;
  /** 본문 조회의 `ID` 파라미터 (법령의 MST 에 해당) */
  readonly id: string;
  /** 행정규칙종류 — 고시 / 훈령 / 예규 / 세칙 등 */
  readonly kind: string;
  /** 현행연혁구분 */
  readonly historyCode: string;
  readonly ministry: string;
  /** YYYYMMDD */
  readonly proclaimedAt: string;
  /** YYYYMMDD */
  readonly enforcedAt: string;
}

async function callApi(path: string, params: Readonly<Record<string, string>>): Promise<{ json: unknown; url: string }> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status} — ${url.toString()}`);
  const body = await res.text();
  try {
    return { json: JSON.parse(body), url: url.toString() };
  } catch {
    throw new Error(
      `${path} 응답이 JSON 이 아니다 — OC 인증값과 신청한 target(admrul) 을 확인하라.\n` +
        `  url: ${url.toString()}\n  body(앞 200자): ${body.slice(0, 200)}`,
    );
  }
}

export async function searchAdmRul(oc: string, name: string): Promise<AdmRulIndexEntry[]> {
  const { json } = await callApi("lawSearch.do", {
    OC: oc,
    target: "admrul",
    type: "JSON",
    query: name,
    display: "100",
  });
  const root = asRecord(asRecord(json, "응답 최상위")["AdmRulSearch"], "AdmRulSearch");
  return asArray(root["admrul"]).map((hit) => {
    const r = asRecord(hit, "admrul 항목");
    return {
      name: str(r, "행정규칙명"),
      id: str(r, "행정규칙ID_본문") || str(r, "행정규칙일련번호") || extractIdFromLink(str(r, "행정규칙상세링크")),
      kind: str(r, "행정규칙종류"),
      historyCode: str(r, "현행연혁구분"),
      ministry: str(r, "소관부처명"),
      proclaimedAt: str(r, "발령일자"),
      enforcedAt: str(r, "시행일자") || str(r, "발령일자"),
    };
  });
}

/** 상세링크의 `ID=` 파라미터. 검색 응답의 `행정규칙ID` 는 본문 조회 ID 와 다른 값이라 링크에서 뽑는다. */
function extractIdFromLink(link: string): string {
  const m = /[?&]ID=(\d+)/.exec(link);
  return m?.[1] ?? "";
}

export async function fetchAdmRulBody(oc: string, id: string): Promise<{ json: unknown; url: string }> {
  return callApi("lawService.do", { OC: oc, target: "admrul", type: "JSON", ID: id });
}

/**
 * 행정규칙종류 → 사양 §5.1 `authority.type`.
 *
 * 고시·훈령·예규·세칙은 전부 법률·시행령보다 **아래 서열**이다(사양 §5.1: 법률 → 시행령 →
 * 시행규칙 → 공식 해석·행정안내 → 금융회사 정책). 여기서 등급을 잘못 매기면 상위법이
 * 하위 고시에 밀리므로 모르는 종류는 거절한다.
 */
/** 알려진 행정규칙 종류. 여기 없는 종류는 서열을 모르므로 거절한다. */
const KNOWN_KINDS = new Set(["고시", "훈령", "예규", "세칙", "지침"]);

export function mapAdmRulAuthority(kind: string): AuthorityType {
  if (!KNOWN_KINDS.has(kind)) {
    throw new Error(`알 수 없는 행정규칙종류다: ${JSON.stringify(kind)} — 서열을 임의로 정하지 않는다`);
  }
  // ⚠️ 종류만으로는 서열이 안 갈린다. 사양 §5.1 서열은
  //   법률 → 시행령 → 시행규칙 → 공식 해석·행정안내 → 금융회사 정책
  // 인데, 같은 "고시"라도 **법령의 위임을 받은 법규명령성 고시**(금융위 퇴직연금감독규정)와
  // **내부 사무처리 훈령**(국세청 소득세사무처리규정)은 등급이 다르다.
  // 전자는 RULE, 후자는 ADMIN_GUIDANCE 다. 이 판단은 발령 근거를 읽어야 하므로
  // **추측하지 않고 수집 타깃에 사람이 명시**한다 (`collect-admrul.ts` 의 `authorityType`).
  throw new Error(
    `${kind}: 종류만으로 authority 서열을 정할 수 없다 — 수집 타깃에 authorityType 을 명시하라`,
  );
}

/** 종류가 알려진 것인지만 확인한다. 서열은 호출자가 명시한다. */
export function assertKnownAdmRulKind(kind: string): void {
  if (!KNOWN_KINDS.has(kind)) {
    throw new Error(`알 수 없는 행정규칙종류다: ${JSON.stringify(kind)}`);
  }
}

export function mapAdmRulLifecycle(historyCode: string): LifecycleStatus {
  if (historyCode === "현행" || historyCode === "시행예정") return "ENACTED";
  if (historyCode === "연혁") return "REPEALED";
  throw new Error(`알 수 없는 현행연혁구분이다: ${JSON.stringify(historyCode)}`);
}

function toLocalDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    throw new Error(`날짜 형식이 YYYYMMDD 가 아니다: ${JSON.stringify(yyyymmdd)}`);
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * `조문내용` 문자열 배열 → ArticleSnapshot[].
 *
 * 편·장 표제(`제1장 총칙`)는 조문번호가 없어 자연히 걸러진다 — 법령 파서에서 겪은
 * "표제가 뒤 조문 번호를 달고 온다" 문제가 여기선 없다. 구조가 아니라 텍스트라서다.
 */
export function parseAdmRulArticles(
  body: unknown,
  abbrev: string,
  validFrom: string,
): ArticleSnapshot[] {
  const root = asRecord(asRecord(body, "본문 응답")["AdmRulService"], "AdmRulService");
  const lines = asArray(root["조문내용"]).map((l) => (typeof l === "string" ? l : String(l)));
  if (lines.length === 0) throw new Error("조문내용이 비었다");

  const articles: ArticleSnapshot[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    const text = raw.trim();
    if (text === "") continue;
    const m = ARTICLE_HEAD_RE.exec(text);
    if (m === null) continue; // 편·장 표제 등 — 인용 단위가 아니다

    const [, no, sub, title] = m;
    if (no === undefined) continue;
    const sourceId = sub === undefined ? `${abbrev}_${no}` : `${abbrev}_${no}_${sub}`;
    if (seen.has(sourceId)) {
      throw new Error(`source_id 충돌: ${sourceId} — 조용히 덮지 않는다`);
    }
    seen.add(sourceId);

    articles.push({
      sourceId,
      articleNo: no,
      articleSubNo: sub ?? null,
      title: title === undefined || title.trim() === "" ? null : title.trim(),
      text,
      validFrom,
      textHash: sha256Hex(text),
    });
  }

  if (articles.length === 0) throw new Error("조문이 하나도 파싱되지 않았다");
  return articles;
}

export function buildAdmRulSnapshot(args: {
  readonly entry: AdmRulIndexEntry;
  readonly body: unknown;
  readonly abbrev: string;
  readonly sourceUrl: string;
  readonly collectedAt: string;
  /** 사양 §5.1 서열. 발령 근거를 읽고 사람이 정한다 — 종류만으로는 안 갈린다. */
  readonly authorityType: AuthorityType;
}): SourceSnapshot {
  const { entry, body, abbrev, sourceUrl, collectedAt, authorityType } = args;
  assertKnownAdmRulKind(entry.kind);
  const enforcedAt = toLocalDate(entry.enforcedAt);
  return {
    lawName: entry.name,
    lawId: entry.id,
    mst: entry.id, // 행정규칙은 MST 대신 ID 로 재조회한다
    authorityType,
    lifecycleStatus: mapAdmRulLifecycle(entry.historyCode),
    promulgatedAt: toLocalDate(entry.proclaimedAt),
    enforcedAt,
    collectedAt,
    sourceUrl,
    // 행정규칙은 조문별 시행일을 주지 않는다 — 규칙 단위 시행일을 조문에 그대로 쓴다.
    articles: parseAdmRulArticles(body, abbrev, enforcedAt),
  };
}
