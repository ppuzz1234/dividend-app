import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NumericContractError,
  parseIntegerString,
  parseKRWString,
  toIntegerString,
  toKRWString,
} from "../src/index.js";

test("직렬화 왕복: KRW → KRWString → KRW", () => {
  const cases: bigint[] = [
    0n,
    1n,
    -1n,
    1000n,
    -1000n,
    9_007_199_254_740_993n, // 2^53 + 1 — number 였다면 깨지는 지점
    1_234_567_890_123_456_789n, // 조 단위 이상
    -1_234_567_890_123_456_789n,
  ];
  for (const v of cases) {
    assert.equal(parseKRWString(toKRWString(v)), v, `왕복 실패: ${v}`);
  }
});

test("0 은 항상 \"0\" 이고 -0n 은 존재하지 않는다", () => {
  assert.equal(toKRWString(0n), "0");
  assert.equal(toKRWString(-0n), "0"); // bigint 에 -0 은 없다
  assert.equal(parseKRWString("0"), 0n);
});

test("금지 표현 거부", () => {
  const rejected = [
    "007", // 선행 0
    "-0", // -0
    "+1000", // + 부호
    "1.0", // 소수점
    "1e3", // 지수 표기
    " 100", // 앞 공백
    "100 ", // 뒤 공백
    "1,000", // 천단위 구분자
    "", // 빈 문자열
    "-", // 부호만
    "0x10",
    "abc",
    "０", // 전각 숫자
  ];
  for (const s of rejected) {
    assert.throws(
      () => parseKRWString(s),
      (e: unknown) =>
        e instanceof NumericContractError && e.code === "KRWSTRING_FORMAT",
      `거부됐어야 한다: ${JSON.stringify(s)}`,
    );
  }
});

test("문자열이 아닌 입력도 거부한다 (JS 호출자 방어)", () => {
  // bigint 와 prototype 없는 객체는 진단 문자열을 만드는 과정 자체가 던질 수 있는 입력이다.
  for (const bad of [null, undefined, 100, 100n, {}, [], Object.create(null), Symbol("x")]) {
    assert.throws(
      () => parseKRWString(bad as unknown as string),
      (e: unknown) => e instanceof NumericContractError && e.code === "KRWSTRING_FORMAT",
    );
  }
});

test("IntegerString 과 KRWString 은 같은 정본 검사를 공유한다", () => {
  assert.equal(toIntegerString(-42n), "-42");
  assert.equal(parseIntegerString("-42"), -42n);
  assert.throws(
    () => parseIntegerString("-0"),
    (e: unknown) => e instanceof NumericContractError && e.code === "KRWSTRING_FORMAT",
  );
});
