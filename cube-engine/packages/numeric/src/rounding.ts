/**
 * 사양 §5.2 / §5.2.1 — 반올림.
 *
 * round() 는 ExactKRW → KRW 의 유일한 출구다. 반올림이 불필요한 경우에도
 * unitKrw = 1n 스펙으로 통과시킨다.
 *
 * 음수 의미(사양 §5.2 고정):
 *   FLOOR    = 음의 무한대 방향
 *   CEIL     = 양의 무한대 방향
 *   TRUNCATE = 0 방향
 *   HALF_UP  = 정확히 절반이면 절대값이 커지는 방향
 */

import {
  NumericContractError,
  toIntegerString,
  toKRWString,
  type ExactKRW,
  type KRW,
  type RoundingMode,
  type RoundingRecord,
  type RoundingSpec,
  type RoundingStage,
} from "./types.js";

export function roundingSpec(spec: {
  stage: RoundingStage;
  mode: RoundingMode;
  unitKrw: bigint;
}): RoundingSpec {
  if (spec.unitKrw <= 0n) {
    throw new NumericContractError(
      "UNIT_NOT_POSITIVE",
      `RoundingSpec.unitKrw 는 0보다 커야 한다: ${spec.unitKrw}`,
    );
  }
  return { stage: spec.stage, mode: spec.mode, unitKrw: spec.unitKrw } as RoundingSpec;
}

export function round(a: ExactKRW, spec: RoundingSpec): { value: KRW; record: RoundingRecord } {
  const n = a.numerator;
  // divisor = 분모 × 단위. a.denominator > 0, spec.unitKrw > 0 이므로 항상 양수다.
  // 이렇게 두면 "단위 배수 개수 k" 를 한 번의 정수 나눗셈으로 얻는다.
  const divisor = a.denominator * spec.unitKrw;

  // bigint 나눗셈은 0 방향 절사이므로 quotient 는 그 자체로 TRUNCATE 결과다.
  const quotient = n / divisor;
  const remainder = n % divisor; // 부호는 n 을 따르고 |remainder| < divisor

  let k: bigint;
  switch (spec.mode) {
    case "TRUNCATE":
      k = quotient;
      break;
    case "FLOOR":
      k = remainder !== 0n && n < 0n ? quotient - 1n : quotient;
      break;
    case "CEIL":
      k = remainder !== 0n && n > 0n ? quotient + 1n : quotient;
      break;
    case "HALF_UP": {
      const absRemainder = remainder < 0n ? -remainder : remainder;
      // 2|r| >= divisor  ⇔  |소수부| >= 1/2. 등호가 "정확히 절반"이고, 이때 절대값이 커지는
      // 방향(= 0에서 멀어지는 방향)으로 간다. n === 0n 이면 remainder 도 0 이라 분기하지 않는다.
      k = 2n * absRemainder >= divisor ? quotient + (n < 0n ? -1n : 1n) : quotient;
      break;
    }
  }

  const value = k * spec.unitKrw;

  return {
    value,
    record: {
      rawNumerator: toIntegerString(n),
      rawDenominator: toIntegerString(a.denominator),
      roundingStage: spec.stage,
      roundingMode: spec.mode,
      unitKrw: toIntegerString(spec.unitKrw),
      roundedKrw: toKRWString(value),
    },
  };
}
