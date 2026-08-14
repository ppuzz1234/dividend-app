/**
 * 정렬·이스케이프·타입 매핑 등 언어 중립 계약은 vectors/canonical.spec-derived.json 으로
 * 옮겼고 vectors.test.ts 가 대조한다. 여기에는 JSON 벡터로 표현할 수 없는 JS 고유 케이스만 남긴다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { NumericContractError, canonicalHash, canonicalJson, toKRWString } from "../src/index.js";

function throwsWith(code: string) {
  return (e: unknown) => e instanceof NumericContractError && e.code === code;
}

test("1원 차이면 다른 해시", () => {
  const base = { amount: toKRWString(1_000_000n), taxYear: 2026 };
  const off = { amount: toKRWString(1_000_001n), taxYear: 2026 };
  assert.notEqual(canonicalHash(base), canonicalHash(off));
});

test("배열 순서가 해시를 바꾼다", () => {
  assert.notEqual(canonicalHash({ xs: [1, 2] }), canonicalHash({ xs: [2, 1] }));
});

test("JSON 으로 표현되지 않는 number 값은 throw", () => {
  // NaN·Infinity·-0 는 JSON 리터럴로 적을 수 없어 벡터 파일에 담기지 않는다.
  for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
    assert.throws(() => canonicalJson({ v }), throwsWith("NON_INTEGER_NUMBER"), String(v));
  }
  // 2^53 초과 정수도 거부 — number 로는 이미 정확하지 않다.
  // Python 독립 구현도 같은 제한을 적용해야 differential 이 규약 차이로 갈리지 않는다.
  assert.throws(() => canonicalJson({ v: 9007199254740993 }), throwsWith("NON_INTEGER_NUMBER"));
  assert.throws(() => canonicalJson({ v: 1e21 }), throwsWith("NON_INTEGER_NUMBER"));
});

test("JS 고유 타입은 throw", () => {
  assert.throws(() => canonicalJson({ at: new Date(0) }), throwsWith("UNSUPPORTED_VALUE_TYPE"));
  assert.throws(() => canonicalJson({ f: () => 1 }), throwsWith("UNSUPPORTED_VALUE_TYPE"));
  assert.throws(() => canonicalJson({ m: new Map() }), throwsWith("UNSUPPORTED_VALUE_TYPE"));
  assert.throws(() => canonicalJson({ s: new Set() }), throwsWith("UNSUPPORTED_VALUE_TYPE"));
  assert.throws(() => canonicalJson({ s: Symbol("x") }), throwsWith("UNSUPPORTED_VALUE_TYPE"));
  // 날짜는 KST YYYY-MM-DD 문자열로 (§5.3.4)
  assert.equal(canonicalJson({ at: "2026-07-30" }), '{"at":"2026-07-30"}');
});

test("brand 는 직렬화에 나타나지 않는다", () => {
  // KRWString 은 brand 된 string 이지만 런타임에는 평범한 문자열이고,
  // 유리수 타입의 brand 는 symbol key 라 Object.keys 에 열거되지 않는다.
  assert.equal(canonicalJson({ amount: toKRWString(1000n) }), '{"amount":"1000"}');
});

test("canonicalHash 는 소문자 hex 64자", () => {
  assert.match(canonicalHash({ a: 1 }), /^[0-9a-f]{64}$/);
});
