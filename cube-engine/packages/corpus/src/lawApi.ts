/**
 * 국가법령정보 공동활용 OPEN API 클라이언트 (https://open.law.go.kr).
 *
 * `type=JSON` 을 쓴다 — XML 파서 의존성을 추가하지 않기 위해서다.
 * 응답 key 가 한글이라 @cube/numeric 의 canonicalHash(ASCII key 강제)로는 통째로 못 해싱한다.
 * 그래서 해시는 조문 **원문 텍스트**에 건다 (parse.ts) — 원문 대조의 대상도 어차피 텍스트다.
 */

import { asArray, asRecord, str } from "./json.js";

const BASE = "https://www.law.go.kr/DRF";

/** 검색 결과 1건. 여기 key 들은 실제 응답으로 검증된 것만 쓴다. */
export interface LawIndexEntry {
  readonly lawName: string;
  readonly lawId: string;
  /** 법령일련번호 — 본문 조회(lawService.do)의 MST 파라미터 */
  readonly mst: string;
  /** 법령구분명. "법률" / "대통령령" / "…령" */
  readonly lawKind: string;
  /** 현행연혁코드. "현행" / "시행예정" / "연혁" */
  readonly historyCode: string;
  /** YYYYMMDD */
  readonly promulgatedAt: string;
  /** YYYYMMDD */
  readonly enforcedAt: string;
}

/**
 * OC 인증값. 비밀키가 아니라 신청자 식별자(쿼리스트링 평문)지만,
 * 계정 교체를 코드 수정 없이 하려고 .env 에 둔다.
 */
export function resolveOc(): string {
  const oc = process.env["LAW_OC"];
  if (oc && oc !== "test") return oc;
  // 하드 실패시키지 않는 이유: 샘플 계정으로 개발·검증이 가능해야 OC 발급을 기다리며 막히지 않는다.
  // 대신 조용히 넘어가면 샘플 계정으로 본 수집을 해버리므로 눈에 띄게 경고한다.
  console.warn(
    "[warn] LAW_OC 가 없거나 'test' 다 — 법제처 샘플 계정으로 호출한다.\n" +
      "       개발·검증에는 괜찮지만 본 수집은 https://open.law.go.kr 에서 발급받은 본인 OC 로 하라.",
  );
  return "test";
}

async function callApi(
  path: string,
  params: Readonly<Record<string, string>>,
): Promise<{ json: unknown; url: string }> {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path} HTTP ${res.status} — ${url.toString()}`);

  const body = await res.text();
  try {
    return { json: JSON.parse(body), url: url.toString() };
  } catch {
    // 인증 실패·미신청 target 은 HTTP 200 + 로그인 HTML 로 돌아온다. 여기서만 드러난다.
    throw new Error(
      `${path} 응답이 JSON 이 아니다 — OC 인증값과 신청한 target 을 확인하라.\n` +
        `  url: ${url.toString()}\n  body(앞 200자): ${body.slice(0, 200)}`,
    );
  }
}

/** 법령명으로 검색. 동명이법이 아니라 "소득세법 / 소득세법 시행령 / 시행규칙" 이 함께 잡히므로 호출측이 정확일치로 고른다. */
export async function searchLaw(oc: string, lawName: string): Promise<LawIndexEntry[]> {
  const { json } = await callApi("lawSearch.do", {
    OC: oc,
    target: "law",
    type: "JSON",
    query: lawName,
    display: "100",
  });

  const search = asRecord(asRecord(json, "응답 최상위")["LawSearch"], "LawSearch");
  return asArray(search["law"]).map((hit) => {
    const r = asRecord(hit, "LawSearch.law 항목");
    return {
      lawName: str(r, "법령명한글"),
      lawId: str(r, "법령ID"),
      mst: str(r, "법령일련번호"),
      lawKind: str(r, "법령구분명"),
      historyCode: str(r, "현행연혁코드"),
      promulgatedAt: str(r, "공포일자"),
      enforcedAt: str(r, "시행일자"),
    };
  });
}

/**
 * 본문 전체 조회. JO(조문번호)를 주지 않아 **전 조문**을 한 번에 받는다.
 *
 * 조문별로 나눠 부르지 않는 이유가 두 가지다:
 *  1. 호출 1번으로 그 법 전체가 확보돼, 나중에 §12 밖 조문이 필요해져도 재수집이 없다.
 *  2. 사양 §1.2 의 FACT 2클래스가 여기 그대로 걸린다 — §12 목록 조문은 Registry 룰로 승격해
 *     REGISTRY_RESOLVED_FACT 가 되고, 나머지 조문은 UNMODELED_OFFICIAL_SOURCE 로 원문 인용만 한다.
 *     전 조문을 갖고 있어야 후자를 "모른다" 대신 "원문은 있으나 미모델링"으로 답할 수 있다.
 */
export async function fetchLawBody(oc: string, mst: string): Promise<{ json: unknown; url: string }> {
  return callApi("lawService.do", { OC: oc, target: "law", type: "JSON", MST: mst });
}
