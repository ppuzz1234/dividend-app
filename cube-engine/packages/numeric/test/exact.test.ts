import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NumericContractError,
  add,
  compare,
  compareQuantity,
  decimalRate,
  divideExact,
  exactQuantity,
  fromKRW,
  multiply,
  multiplyQuantity,
  quantityTimesPrice,
  ratio,
  sub,
} from "../src/index.js";

function throwsWith(code: string) {
  return (e: unknown) => e instanceof NumericContractError && e.code === code;
}

test("DecimalRate: 생성 시 자동 약분", () => {
  assert.deepEqual({ ...decimalRate(2n, 4n) }, { numerator: 1n, denominator: 2n });
  assert.deepEqual({ ...decimalRate(-2n, 4n) }, { numerator: -1n, denominator: 2n });
  assert.deepEqual({ ...decimalRate(100n, 10n) }, { numerator: 10n, denominator: 1n });
  assert.deepEqual({ ...decimalRate(13n, 17n) }, { numerator: 13n, denominator: 17n });
});

test("DecimalRate: 0 의 표현은 0/1 로 유일하다", () => {
  // gcd(0, d) === d 이므로 불변식이 0 의 표현을 하나로 결정한다.
  for (const d of [1n, 2n, 7n, 1_000_000n]) {
    assert.deepEqual({ ...decimalRate(0n, d) }, { numerator: 0n, denominator: 1n });
  }
});

test("DecimalRate: denominator <= 0 거부", () => {
  assert.throws(() => decimalRate(1n, 0n), throwsWith("DENOMINATOR_NOT_POSITIVE"));
  assert.throws(() => decimalRate(1n, -2n), throwsWith("DENOMINATOR_NOT_POSITIVE"));
  assert.throws(() => exactQuantity(1n, 0n), throwsWith("DENOMINATOR_NOT_POSITIVE"));
  assert.throws(() => exactQuantity(1n, -3n), throwsWith("DENOMINATOR_NOT_POSITIVE"));
});

test("fromKRW 는 이미 정규화돼 있다", () => {
  assert.deepEqual({ ...fromKRW(0n) }, { numerator: 0n, denominator: 1n });
  assert.deepEqual({ ...fromKRW(-500n) }, { numerator: -500n, denominator: 1n });
});

test("multiply: 정확한 유리수 곱, 중간 반올림 없음", () => {
  // 1000원 × 1/3 = 1000/3 — 333 으로 잘리지 않는다
  const r = multiply(fromKRW(1000n), decimalRate(1n, 3n));
  assert.deepEqual({ ...r }, { numerator: 1000n, denominator: 3n });

  // 세 번 곱해도 오차가 누적되지 않는다
  const third = decimalRate(1n, 3n);
  const thrice = multiply(multiply(multiply(fromKRW(9n), third), third), third);
  assert.deepEqual({ ...thrice }, { numerator: 1n, denominator: 3n });
});

test("add / sub: 분모가 다른 정확 금액", () => {
  const a = multiply(fromKRW(1n), decimalRate(1n, 3n)); // 1/3
  const b = multiply(fromKRW(1n), decimalRate(1n, 6n)); // 1/6
  assert.deepEqual({ ...add(a, b) }, { numerator: 1n, denominator: 2n });
  assert.deepEqual({ ...sub(a, b) }, { numerator: 1n, denominator: 6n });
  assert.deepEqual({ ...sub(a, a) }, { numerator: 0n, denominator: 1n });
});

test("compare: 분모가 달라도 정확 비교", () => {
  const oneThird = multiply(fromKRW(1n), decimalRate(1n, 3n));
  const oneHalf = multiply(fromKRW(1n), decimalRate(1n, 2n));
  assert.equal(compare(oneThird, oneHalf), -1);
  assert.equal(compare(oneHalf, oneThird), 1);
  assert.equal(compare(oneThird, oneThird), 0);
  assert.equal(compare(fromKRW(-1n), fromKRW(1n)), -1);
});

test("ratio: 금액 ÷ 금액 = 비율, 부호는 분자로", () => {
  assert.deepEqual({ ...ratio(3n, 6n) }, { numerator: 1n, denominator: 2n });
  assert.deepEqual({ ...ratio(1n, -2n) }, { numerator: -1n, denominator: 2n });
  assert.deepEqual({ ...ratio(-1n, -2n) }, { numerator: 1n, denominator: 2n });
  assert.deepEqual({ ...ratio(0n, 5n) }, { numerator: 0n, denominator: 1n });
});

test("나눗셈: 0 으로 나누면 throw", () => {
  assert.throws(() => ratio(1n, 0n), throwsWith("DIVIDE_BY_ZERO"));
  assert.throws(() => divideExact(fromKRW(1n), fromKRW(0n)), throwsWith("DIVIDE_BY_ZERO"));
});

test("divideExact: coverage ratio 형태", () => {
  // 세후 실질소득 250만 ÷ 목표 300만 = 5/6
  const actual = fromKRW(2_500_000n);
  const target = fromKRW(3_000_000n);
  assert.deepEqual({ ...divideExact(actual, target) }, { numerator: 5n, denominator: 6n });
});

test("수량 연산: 좌수는 금액도 비율도 아니다", () => {
  const q = exactQuantity(7n, 2n); // 3.5좌
  assert.deepEqual({ ...multiplyQuantity(q, decimalRate(2n, 1n)) }, {
    numerator: 7n,
    denominator: 1n,
  });

  // 3.5좌 × 10,000원 = 35,000원
  const proceeds = quantityTimesPrice(q, fromKRW(10_000n));
  assert.deepEqual({ ...proceeds }, { numerator: 35_000n, denominator: 1n });

  assert.equal(compareQuantity(exactQuantity(1n, 3n), exactQuantity(1n, 2n)), -1);
  assert.equal(compareQuantity(exactQuantity(2n, 4n), exactQuantity(1n, 2n)), 0);
});
