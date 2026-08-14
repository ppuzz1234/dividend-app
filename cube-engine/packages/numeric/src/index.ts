/**
 * @cube/numeric — 사양 §5.2 / §5.2.1 구현 순서 1.
 *
 * 이 패키지에 세법 값은 없다. RoundingSpec 은 정책 팩에서 주입되는 파라미터이며
 * numeric 은 stage 를 해석하지 않는다.
 */

export {
  NumericContractError,
  parseIntegerString,
  parseKRWString,
  toIntegerString,
  toKRWString,
  type DecimalRate,
  type ExactKRW,
  type ExactQuantity,
  type IntegerString,
  type KRW,
  type KRWString,
  type NumericErrorCode,
  type RoundingMode,
  type RoundingRecord,
  type RoundingSpec,
  type RoundingStage,
} from "./types.js";

export {
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
} from "./exact.js";

export { round, roundingSpec } from "./rounding.js";

export { canonicalHash, canonicalJson, sha256Hex } from "./canonical.js";
