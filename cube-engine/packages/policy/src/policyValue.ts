/**
 * 정책 팩 값 파서 — 사양 §5.2 (부동소수점 금지) · OPEN-Q6.
 *
 * 허용 표현은 둘뿐이다.
 *   RATE     → { numerator: "<정수문자열>", denominator: "<양의 정수문자열>" }
 *   그 외    → "<정수문자열>"
 *
 * JSON number 는 정수라도 거절한다. 정수 number 를 열어두면 YAML 파서가 큰 값을 double 로 읽는
 * 경로가 생기고 2^53 경계에서 조용히 깨진다 — 이 시스템이 막으려는 실패가 정확히 그것이다.
 */

import { parseIntegerString } from "@cube/numeric";

import { reject } from "./errors.js";
import type { PolicyValue } from "./types.js";
import type { PackKind } from "./vocabulary.js";

/** 사양 §5.1 의 `<원문 대조 후 기재>` 자리표시자. */
const PLACEHOLDER_RE = /^<.*>$/;

function toBigInt(raw: unknown, path: string): bigint {
  if (typeof raw === "number") {
    reject(
      "FLOAT_IN_POLICY_VALUE",
      path,
      `정책 값에 JSON number 를 쓸 수 없다 (정수라도 금지). 정수 문자열로 적어라: ${raw}`,
    );
  }
  if (typeof raw !== "string") {
    reject("FLOAT_IN_POLICY_VALUE", path, `정수 문자열이어야 한다: ${typeof raw}`);
  }
  // parseIntegerString 은 선행 0·-0·소수점·공백을 전부 거절한다 (순서 1 계약).
  return parseIntegerString(raw);
}

export function parsePolicyValue(
  raw: unknown,
  unit: string,
  packKind: PackKind,
  path: string,
): PolicyValue {
  if (typeof raw === "string" && PLACEHOLDER_RE.test(raw)) {
    if (packKind === "VERIFIED_LAW") {
      reject(
        "PLACEHOLDER_IN_VERIFIED_PACK",
        path,
        `VERIFIED_LAW 를 선언한 팩에 미기재 자리표시자가 남아 있다: ${raw}`,
      );
    }
    return { kind: "PLACEHOLDER", raw };
  }

  if (unit === "RATE") {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      reject(
        "FLOAT_IN_POLICY_VALUE",
        path,
        "unit: RATE 의 값은 { numerator, denominator } 유리수여야 한다",
      );
    }
    const obj = raw as Record<string, unknown>;
    const known = new Set(["numerator", "denominator"]);
    for (const key of Object.keys(obj)) {
      if (!known.has(key)) {
        reject("UNKNOWN_FIELD", `${path}.${key}`, "유리수 값에 허용되지 않는 필드");
      }
    }
    const numerator = toBigInt(obj["numerator"], `${path}.numerator`);
    const denominator = toBigInt(obj["denominator"], `${path}.denominator`);
    if (denominator <= 0n) {
      reject(
        "RATE_DENOMINATOR_NOT_POSITIVE",
        `${path}.denominator`,
        `DecimalRate 불변식 위반 (denominator > 0): ${denominator}`,
      );
    }
    return { kind: "RATE", numerator, denominator };
  }

  return { kind: "INTEGER", value: toBigInt(raw, path) };
}
