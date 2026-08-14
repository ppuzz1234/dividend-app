/**
 * 사양 §5.2 절차 1~4 / §5.2.1 canonical JSON 규약.
 *
 *   1. bigint → 10진수 문자열
 *   2. 객체 key 를 사전순 정렬
 *   3. UTF-8 canonical JSON 생성
 *   4. SHA-256
 *
 * key 를 ASCII [A-Za-z0-9_] 로 제한하는 이유: UTF-8 바이트 정렬(Python 기본)과
 * UTF-16 코드유닛 정렬(JS 기본)이 갈리는 것을 원천 차단하기 위함이다. ASCII 범위에서는
 * 두 정렬이 동일하므로 언어 간 differential(§6.2)이 성립한다.
 */

import { createHash } from "node:crypto";
import { NumericContractError } from "./types.js";

const ASCII_KEY_RE = /^[A-Za-z0-9_]+$/;

const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '"': '\\"',
  "\\": "\\\\",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
};

// KNOWN-LIMITATION(canonical): 짝 없는 서로게이트(lone surrogate)를 검출하지 않는다.
// UTF-8 인코딩 단계에서 U+FFFD 로 치환되므로 서로 다른 두 입력이 같은 해시를 낼 여지가 있다.
// 실입력은 전부 스키마 검증을 통과한 식별자·날짜·열거값이라 현재는 도달 불가 경로다.
// 업그레이드 경로: escapeString 에 서로게이트 짝 검사를 넣어 UNSUPPORTED_VALUE_TYPE 로 throw.
function escapeString(s: string): string {
  let out = '"';
  for (const ch of s) {
    const short = SHORT_ESCAPES[ch];
    if (short !== undefined) {
      out += short;
      continue;
    }
    const code = ch.codePointAt(0) as number;
    if (code < 0x20) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    // 비ASCII 는 이스케이프하지 않고 UTF-8 그대로 내보낸다.
    out += ch;
  }
  return `${out}"`;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v) as object | null;
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";

    case "bigint":
      // 절차 1. JSON number 가 아니라 문자열이다 — number 로 내보내면 2^53 밖에서 깨진다.
      return `"${value.toString()}"`;

    case "number": {
      if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
        throw new NumericContractError(
          "NON_INTEGER_NUMBER",
          `${path}: 안전한 정수만 허용된다 (NaN·Infinity·소수·-0·2^53 초과 금지): ${String(value)}`,
        );
      }
      return String(value);
    }

    case "string":
      return escapeString(value);

    case "object": {
      if (Array.isArray(value)) {
        const parts = value.map((item, i) => {
          if (item === undefined) {
            throw new NumericContractError(
              "UNDEFINED_IN_ARRAY",
              `${path}[${i}]: 제거하면 인덱스가 밀려 의미가 변한다`,
            );
          }
          return encode(item, `${path}[${i}]`);
        });
        return `[${parts.join(",")}]`;
      }

      if (!isPlainObject(value)) {
        throw new NumericContractError(
          "UNSUPPORTED_VALUE_TYPE",
          `${path}: Date·클래스 인스턴스·Map·Set 은 직렬화하지 않는다 (날짜는 KST YYYY-MM-DD 문자열)`,
        );
      }

      const record = value as Record<string, unknown>;
      // Object.keys 는 symbol key 를 열거하지 않으므로 brand 는 여기 오지 않는다.
      const keys = Object.keys(record).filter((k) => record[k] !== undefined);
      for (const key of keys) {
        if (!ASCII_KEY_RE.test(key)) {
          throw new NumericContractError(
            "NON_ASCII_KEY",
            `${path}.${key}: key 는 [A-Za-z0-9_] 만 허용된다`,
          );
        }
      }
      // ASCII 범위에서는 UTF-16 코드유닛 정렬과 코드포인트 정렬이 동일하다.
      keys.sort();

      const parts = keys.map((k) => `${escapeString(k)}:${encode(record[k], `${path}.${k}`)}`);
      return `{${parts.join(",")}}`;
    }

    default:
      // undefined(최상위·객체값은 호출자가 처리), function, symbol
      throw new NumericContractError(
        "UNSUPPORTED_VALUE_TYPE",
        `${path}: 직렬화할 수 없는 타입 ${typeof value}`,
      );
  }
}

export function canonicalJson(value: unknown): string {
  return encode(value, "$");
}

/** canonical 문자열의 UTF-8 바이트열에 대한 SHA-256, 소문자 hex. */
export function sha256Hex(canonical: string): string {
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** 절차 1~4 의 합성. confirmedInputHash·스냅샷 해시·trace 저장에 공통. */
export function canonicalHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
