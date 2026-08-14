/**
 * 사양 §5.2.1 — 정확한 유리수 연산.
 *
 * 유리수 기계는 이 파일 안에서 private 다. ExactKRW / ExactQuantity / DecimalRate 가
 * 기계를 공유하되, 외부에는 타입이 분리된 연산만 노출된다 — 기계를 별도 모듈로 빼면
 * 그 타입 분리를 우회하는 경로가 생긴다.
 *
 * 연산 중간에 암묵적 반올림은 일어나지 않는다. 반올림은 rounding.round() 뿐이다.
 */

import {
  NumericContractError,
  type DecimalRate,
  type ExactKRW,
  type ExactQuantity,
  type KRW,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// private 유리수 기계
// ─────────────────────────────────────────────────────────────────────────────

interface RawRational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * 부호를 분자로 몰고 기약분수로 만든다. 호출자가 d !== 0n 을 보장한다.
 *
 * 0 의 처리: gcd(0, d) === d 이므로 0/d 는 자동으로 0/1 이 된다.
 * 즉 "denominator > 0 && gcd(|n|, d) === 1" 불변식이 0 의 표현을 0/1 로 유일하게 결정한다.
 */
function normalize(n: bigint, d: bigint): RawRational {
  let num = n;
  let den = d;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { numerator: num / g, denominator: den / g };
}

function mul(a: RawRational, b: RawRational): RawRational {
  return normalize(a.numerator * b.numerator, a.denominator * b.denominator);
}

function addRaw(a: RawRational, b: RawRational): RawRational {
  return normalize(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

function subRaw(a: RawRational, b: RawRational): RawRational {
  return normalize(
    a.numerator * b.denominator - b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
}

/** 두 분모 모두 양수이므로 교차곱의 부호가 그대로 비교 결과다. */
function cmpRaw(a: RawRational, b: RawRational): -1 | 0 | 1 {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requirePositiveDenominator(d: bigint, what: string): void {
  if (d <= 0n) {
    throw new NumericContractError(
      "DENOMINATOR_NOT_POSITIVE",
      `${what} 의 분모는 0보다 커야 한다: ${d}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 불변식 생성자 — 각 타입을 만드는 유일한 경로
// ─────────────────────────────────────────────────────────────────────────────

export function decimalRate(numerator: bigint, denominator: bigint): DecimalRate {
  requirePositiveDenominator(denominator, "DecimalRate");
  return normalize(numerator, denominator) as DecimalRate;
}

export function exactQuantity(numerator: bigint, denominator: bigint): ExactQuantity {
  requirePositiveDenominator(denominator, "ExactQuantity");
  return normalize(numerator, denominator) as ExactQuantity;
}

// ─────────────────────────────────────────────────────────────────────────────
// 금액 연산
// ─────────────────────────────────────────────────────────────────────────────

export function fromKRW(v: KRW): ExactKRW {
  return { numerator: v, denominator: 1n } as ExactKRW;
}

export function multiply(a: ExactKRW, r: DecimalRate): ExactKRW {
  return mul(a, r) as ExactKRW;
}

export function add(a: ExactKRW, b: ExactKRW): ExactKRW {
  return addRaw(a, b) as ExactKRW;
}

export function sub(a: ExactKRW, b: ExactKRW): ExactKRW {
  return subRaw(a, b) as ExactKRW;
}

export function compare(a: ExactKRW, b: ExactKRW): -1 | 0 | 1 {
  return cmpRaw(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// 나눗셈: 금액 ÷ 금액 = 비율
// ─────────────────────────────────────────────────────────────────────────────

export function ratio(a: KRW, b: KRW): DecimalRate {
  if (b === 0n) {
    throw new NumericContractError("DIVIDE_BY_ZERO", "ratio(a, 0n)");
  }
  return normalize(a, b) as DecimalRate;
}

export function divideExact(a: ExactKRW, b: ExactKRW): DecimalRate {
  if (b.numerator === 0n) {
    throw new NumericContractError("DIVIDE_BY_ZERO", "divideExact(a, 0)");
  }
  return normalize(a.numerator * b.denominator, a.denominator * b.numerator) as DecimalRate;
}

// ─────────────────────────────────────────────────────────────────────────────
// 수량 연산 (사양 §5.5 TaxableLot)
// ─────────────────────────────────────────────────────────────────────────────

export function multiplyQuantity(q: ExactQuantity, r: DecimalRate): ExactQuantity {
  return mul(q, r) as ExactQuantity;
}

export function quantityTimesPrice(q: ExactQuantity, unitPrice: ExactKRW): ExactKRW {
  return mul(q, unitPrice) as ExactKRW;
}

export function compareQuantity(a: ExactQuantity, b: ExactQuantity): -1 | 0 | 1 {
  return cmpRaw(a, b);
}
