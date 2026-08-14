/**
 * 런타임 테스트가 아니라 컴파일 시점 계약이다. (`*.test.js` 글롭에 걸리지 않도록 이름이 다르다.)
 *
 * `@ts-expect-error` 는 "이 줄은 반드시 타입 에러여야 한다"를 뜻한다. brand 가 약해져서
 * 에러가 사라지면 tsc 가 "unused '@ts-expect-error' directive" 로 빌드를 실패시킨다.
 * 즉 사양 §5.2 의 nominal 화가 실제로 작동하는지를 빌드가 매번 검증한다.
 */

import {
  decimalRate,
  exactQuantity,
  fromKRW,
  multiply,
  multiplyQuantity,
  quantityTimesPrice,
  round,
  roundingSpec,
  toIntegerString,
  toKRWString,
  type IntegerString,
  type KRWString,
} from "../src/index.js";

const amount = fromKRW(1000n);
const qty = exactQuantity(3n, 1n);
const rate = decimalRate(1n, 2n);
const spec = roundingSpec({ stage: "PER_YEAR", mode: "FLOOR", unitKrw: 10n });

// ── 유리수 3종은 구조가 같아도 서로 대입되지 않는다 ──────────────────────────

// @ts-expect-error 금액 자리에 수량
multiply(qty, rate);

// @ts-expect-error 수량 자리에 금액
multiplyQuantity(amount, rate);

// @ts-expect-error 비율 자리에 금액
multiply(amount, amount);

// @ts-expect-error 단가 자리에 수량
quantityTimesPrice(qty, qty);

// @ts-expect-error 반올림 대상 자리에 수량
round(qty, spec);

// 올바른 조합은 통과해야 한다
multiply(amount, rate);
multiplyQuantity(qty, rate);
quantityTimesPrice(qty, amount);
round(amount, spec);

// ── 검증을 우회하는 리터럴 생성 차단 ────────────────────────────────────────

// @ts-expect-error RoundingSpec 을 리터럴로 만들면 unitKrw > 0 검사를 건너뛴다
round(amount, { stage: "PER_YEAR", mode: "FLOOR", unitKrw: 0n });

// @ts-expect-error 검증 안 거친 생 문자열은 KRWString 이 아니다
const rawString: KRWString = "1000";

// ── KRWString ⊂ IntegerString (한 방향만) ──────────────────────────────────

// 금액은 정수 자리에 들어간다
const asInteger: IntegerString = toKRWString(1000n);

// @ts-expect-error 정수는 금액 자리에 들어가지 않는다
const asAmount: KRWString = toIntegerString(1000n);

export type _Unused = [typeof rawString, typeof asInteger, typeof asAmount];
