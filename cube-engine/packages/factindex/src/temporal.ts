/**
 * 시점 필터 — 조회일 기준 유효한 조문만 후보에 넣는다.
 *
 * 사양 §5.1: "시간 상태는 저장하지 않고 조회 시점에 계산한다."
 * 조문마다 `validFrom`(조문 단위 시행일)이 있으므로, 조회일보다 늦게 시행되는 조문은
 * 그 시점에 존재하지 않는 법이다.
 *
 * ## ⚠️ 현재 코퍼스에서 이 필터는 아무것도 거르지 않는다
 * 실측: `validFrom` 의 서로 다른 값이 **3개뿐**이고(2026-01-01 / 2026-03-24 / 2026-07-01),
 * **미래 시행 조문은 0건**이다. 즉 실데이터로 이 필터를 테스트하면
 * **항상 통과하는 공허한(vacuous) 테스트**가 된다.
 *
 * 그래서 검증은 **미래 `validFrom` 을 가진 합성 fixture 로만** 한다.
 * 이건 A1 의 실패 구조와 같은 함정이다 — 평가셋이 조사 없는 이름이라 토크나이저 버그를
 * 가렸던 것처럼, 데이터에 그 케이스가 없으면 테스트가 버그를 가린다.
 */

/** `YYYY-MM-DD` 두 개를 문자열 비교. ISO 형식이라 사전순 = 시간순이다(UTC 변환 없음). */
function isNotAfter(a: string, b: string): boolean {
  return a <= b;
}

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertLocalDate(value: string, label: string): string {
  if (!LOCAL_DATE_RE.test(value)) {
    throw new Error(`${label} 이 KST LocalDate(YYYY-MM-DD) 가 아니다: ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * 조회일에 유효한 항목만 남긴다.
 *
 * @param items `validFrom` 을 가진 것들 (Chunk 또는 조문)
 * @param queryAsOf 조회일 `YYYY-MM-DD` (KST)
 */
export function filterEffective<T extends { readonly validFrom: string }>(
  items: readonly T[],
  queryAsOf: string,
): T[] {
  assertLocalDate(queryAsOf, "queryAsOf");
  return items.filter((it) => {
    assertLocalDate(it.validFrom, "validFrom");
    return isNotAfter(it.validFrom, queryAsOf);
  });
}

/** 필터가 실제로 무엇을 걸렀는지 — vacuity 를 눈에 보이게 남긴다. */
export function effectiveStats<T extends { readonly validFrom: string }>(
  items: readonly T[],
  queryAsOf: string,
): { kept: number; filtered: number; distinctValidFrom: number } {
  const kept = filterEffective(items, queryAsOf).length;
  return {
    kept,
    filtered: items.length - kept,
    distinctValidFrom: new Set(items.map((i) => i.validFrom)).size,
  };
}
