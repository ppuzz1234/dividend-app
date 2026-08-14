/**
 * 사양 §5.2 / §5.2.1 — 타입, 오류 계약, 경계 문자열 정본 코덱.
 *
 * 이 파일은 "타입과 그 불변식 검사"만 담는다. 유리수 연산은 exact.ts,
 * 반올림은 rounding.ts, 직렬화는 canonical.ts.
 */

// ─────────────────────────────────────────────────────────────────────────────
// brand (사양 §5.2 — phantom unique symbol 로 nominal 화)
//
// 런타임 필드를 만들지 않는다. symbol key 는 Object.keys / JSON.stringify 에
// 열거되지 않으므로 canonical JSON·해시에 영향이 없다.
// ─────────────────────────────────────────────────────────────────────────────

declare const INTEGER_STRING_BRAND: unique symbol;
declare const KRW_STRING_BRAND: unique symbol;
declare const RATIONAL_BRAND: unique symbol;
declare const ROUNDING_SPEC_BRAND: unique symbol;

// ─────────────────────────────────────────────────────────────────────────────
// 스칼라
// ─────────────────────────────────────────────────────────────────────────────

/** 정본 10진 정수 문자열 (분모·단위 등 금액이 아닌 정수도 포함). */
export type IntegerString = string & { readonly [INTEGER_STRING_BRAND]: void };

/**
 * 경계에서의 금액 표현. KRWString 은 IntegerString 의 부분집합이다 —
 * 금액은 정수 자리에 넣을 수 있지만 그 반대는 안 된다.
 */
export type KRWString = IntegerString & { readonly [KRW_STRING_BRAND]: void };

/** 도메인 내부 금액: 정수 원. 부동소수점 금지(사양 §5.2). */
export type KRW = bigint;

// ─────────────────────────────────────────────────────────────────────────────
// 유리수 3종 — 구조는 같고 의미가 다르므로 brand 로 분리한다.
// ─────────────────────────────────────────────────────────────────────────────

interface Rational {
  readonly numerator: bigint;
  /** 불변식: denominator > 0, gcd(|numerator|, denominator) === 1 */
  readonly denominator: bigint;
}

/** 세율·비율. */
export type DecimalRate = Rational & { readonly [RATIONAL_BRAND]: "DecimalRate" };

/** 미반올림 정확 금액. KRW 로 나가는 유일한 출구는 round() 다(사양 §5.2.1). */
export type ExactKRW = Rational & { readonly [RATIONAL_BRAND]: "ExactKRW" };

/** 좌수 — 금액도 비율도 아니다(사양 §5.5 TaxableLot.quantity). */
export type ExactQuantity = Rational & { readonly [RATIONAL_BRAND]: "ExactQuantity" };

// ─────────────────────────────────────────────────────────────────────────────
// 반올림
// ─────────────────────────────────────────────────────────────────────────────

export type RoundingStage = "PER_TRANSACTION" | "PER_YEAR" | "PER_ACCOUNT" | "FINAL_RESULT";
export type RoundingMode = "FLOOR" | "CEIL" | "HALF_UP" | "TRUNCATE";

interface RoundingSpecShape {
  /** numeric 은 해석하지 않는다 — RoundingRecord 에 태그로만 실어보낸다. */
  readonly stage: RoundingStage;
  readonly mode: RoundingMode;
  /** 불변식: unitKrw > 0. 정책 팩 YAML 에서는 unit_krw. */
  readonly unitKrw: bigint;
}

export type RoundingSpec = RoundingSpecShape & { readonly [ROUNDING_SPEC_BRAND]: void };

/**
 * §6.2 differential 의 중간값 비교 단위.
 *
 * 실제로 "금액"인 것은 roundedKrw 하나뿐이다 — rawNumerator 는 분모로 나누기 전의
 * 스케일된 정수이고, rawDenominator·unitKrw 는 애초에 금액이 아니다.
 */
export interface RoundingRecord {
  readonly rawNumerator: IntegerString;
  readonly rawDenominator: IntegerString;
  readonly roundingStage: RoundingStage;
  readonly roundingMode: RoundingMode;
  readonly unitKrw: IntegerString;
  readonly roundedKrw: KRWString;
}

// ─────────────────────────────────────────────────────────────────────────────
// 오류 계약 (사양 §5.2.1)
// ─────────────────────────────────────────────────────────────────────────────

export type NumericErrorCode =
  | "KRWSTRING_FORMAT"
  | "DENOMINATOR_NOT_POSITIVE"
  | "UNIT_NOT_POSITIVE"
  | "DIVIDE_BY_ZERO"
  | "NON_ASCII_KEY"
  | "NON_INTEGER_NUMBER"
  | "UNSUPPORTED_VALUE_TYPE"
  | "UNDEFINED_IN_ARRAY";

export class NumericContractError extends Error {
  readonly code: NumericErrorCode;

  constructor(code: NumericErrorCode, detail: string) {
    super(`[${code}] ${detail}`);
    this.name = "NumericContractError";
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 경계 문자열 정본 코덱
//
// 허용: "0" 또는 -?[1-9][0-9]*  →  표현이 유일해야 해시가 안정된다.
// "-0" 은 -? 뒤에 [1-9] 를 요구하므로 자동으로 걸러진다.
// ─────────────────────────────────────────────────────────────────────────────

const INTEGER_STRING_RE = /^(?:0|-?[1-9][0-9]*)$/;

export function toIntegerString(v: bigint): IntegerString {
  // bigint#toString 은 이미 정본이다: 선행 0 없음, -0 없음, 지수 표기 없음.
  return v.toString() as IntegerString;
}

export function parseIntegerString(s: string): bigint {
  if (typeof s !== "string" || !INTEGER_STRING_RE.test(s)) {
    // 진단 문자열 자체가 던지면 안 된다. JSON.stringify 는 bigint 에서, String() 은
    // prototype 없는 객체에서 TypeError 를 낸다 — 비문자열은 타입만 보고한다.
    const shown = typeof s === "string" ? JSON.stringify(s) : `<${typeof s}>`;
    throw new NumericContractError("KRWSTRING_FORMAT", `정본 10진 정수 문자열이 아니다: ${shown}`);
  }
  return BigInt(s);
}

export function toKRWString(v: KRW): KRWString {
  return v.toString() as KRWString;
}

/** 금액 문자열 파서. 정본 검사 로직은 parseIntegerString 과 공유한다. */
export function parseKRWString(s: string): KRW {
  return parseIntegerString(s);
}
