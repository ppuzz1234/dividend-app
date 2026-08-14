/**
 * 외부 JSON 을 읽는 최소 헬퍼.
 *
 * 법제처 응답은 우리 스키마가 아니므로 `unknown` 으로 받아 좁혀 쓴다.
 * 캐스팅(`as`)으로 뭉개면 필드가 사라졌을 때 스냅샷이 조용히 비어버리고,
 * 그 빈 스냅샷이 "원문 대조 완료"로 둔갑한다 — 이 시스템에서 가장 나쁜 실패다.
 */

export function asRecord(value: unknown, ctx: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${ctx}: 객체를 기대했으나 ${value === null ? "null" : typeof value} 이다`);
  }
  return value as Record<string, unknown>;
}

/** 1건일 때 객체, 여러 건일 때 배열로 주는 관행을 흡수한다. */
export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

/** 문자열 필드. 숫자로 와도 문자열로 통일한다 (조문번호가 91 로 올 때가 있다). */
export function str(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  return "";
}
