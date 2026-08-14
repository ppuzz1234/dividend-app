import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalHash,
  decimalRate,
  fromKRW,
  multiply,
  parseKRWString,
  round,
  roundingSpec,
  sub,
  toKRWString,
  type ExactKRW,
  type RoundingMode,
  type RoundingSpec,
} from "../src/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// seeded 생성기 — Math.random() 을 쓰지 않는다.
// 재현성이 이 프로젝트의 존재 이유인데 테스트가 그걸 어기면 실패를 재현할 수 없다.
// ─────────────────────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

/** 1원 ~ 조 단위까지 자릿수를 흩뿌린 부호 있는 bigint. */
function randomKRW(rng: () => number): bigint {
  const digits = (rng() % 15) + 1;
  let v = 0n;
  for (let i = 0; i < digits; i++) {
    v = v * 10n + BigInt(rng() % 10);
  }
  return rng() % 2 === 0 ? v : -v;
}

/** 분모가 1이 아닐 수도 있는 정확 금액. 공개 API 로만 만든다. */
function randomExact(rng: () => number): ExactKRW {
  const amount = fromKRW(randomKRW(rng));
  const denominator = BigInt((rng() % 12) + 1);
  return denominator === 1n ? amount : multiply(amount, decimalRate(1n, denominator));
}

function randomSpec(rng: () => number, mode: RoundingMode): RoundingSpec {
  const units = [1n, 5n, 10n, 100n, 1000n, 10_000n];
  const unitKrw = units[rng() % units.length] as bigint;
  return roundingSpec({ stage: "FINAL_RESULT", mode, unitKrw });
}

function negate(a: ExactKRW): ExactKRW {
  return sub(fromKRW(0n), a);
}

const MODES: readonly RoundingMode[] = ["FLOOR", "CEIL", "TRUNCATE", "HALF_UP"];
const ITERATIONS = 2000;

// ─────────────────────────────────────────────────────────────────────────────

test("(a) 반올림 결과는 항상 unitKrw 의 배수다", () => {
  const rng = makeRng(20260730);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    for (const mode of MODES) {
      const spec = randomSpec(rng, mode);
      const { value } = round(a, spec);
      assert.equal(value % spec.unitKrw, 0n, `seed step ${i} / ${mode} / value=${value}`);
    }
  }
});

test("(b) TRUNCATE 결과의 절대값은 원값의 절대값을 넘지 않는다", () => {
  const rng = makeRng(11235813);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    const spec = randomSpec(rng, "TRUNCATE");
    const { value } = round(a, spec);
    // |value| <= |a| 를 분수 없이 비교: |value| * denominator <= |numerator|
    const lhs = (value < 0n ? -value : value) * a.denominator;
    const rhs = a.numerator < 0n ? -a.numerator : a.numerator;
    assert.ok(lhs <= rhs, `step ${i}: |${value}| * ${a.denominator} > |${a.numerator}|`);
  }
});

test("(c) 직렬화는 단사다 — 다른 금액은 다른 문자열, 왕복은 항등", () => {
  const rng = makeRng(31415926);
  const seen = new Map<string, bigint>();
  for (let i = 0; i < ITERATIONS; i++) {
    const v = randomKRW(rng);
    const s = toKRWString(v);
    assert.equal(parseKRWString(s), v, `왕복 실패: ${v}`);
    const prior = seen.get(s);
    if (prior !== undefined) {
      assert.equal(prior, v, `충돌: ${prior} 와 ${v} 가 모두 "${s}"`);
    } else {
      seen.set(s, v);
    }
  }
});

test("(d) 멱등성: 같은 spec 으로 두 번 반올림해도 결과가 같다", () => {
  const rng = makeRng(27182818);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    for (const mode of MODES) {
      const spec = randomSpec(rng, mode);
      const once = round(a, spec).value;
      const twice = round(fromKRW(once), spec).value;
      assert.equal(twice, once, `step ${i} / ${mode}: ${once} → ${twice}`);
    }
  }
});

test("(e) HALF_UP 대칭성: round(-x) === -round(x)", () => {
  const rng = makeRng(16180339);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    const spec = randomSpec(rng, "HALF_UP");
    const pos = round(a, spec).value;
    const neg = round(negate(a), spec).value;
    assert.equal(neg, -pos, `step ${i}: x=${a.numerator}/${a.denominator}`);
  }
});

test("(f) FLOOR/CEIL 거울 관계: FLOOR(-x) === -CEIL(x)", () => {
  const rng = makeRng(14142135);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    const units = [1n, 10n, 1000n];
    for (const unitKrw of units) {
      const floorSpec = roundingSpec({ stage: "FINAL_RESULT", mode: "FLOOR", unitKrw });
      const ceilSpec = roundingSpec({ stage: "FINAL_RESULT", mode: "CEIL", unitKrw });
      const floorOfNeg = round(negate(a), floorSpec).value;
      const ceilOfPos = round(a, ceilSpec).value;
      assert.equal(
        floorOfNeg,
        -ceilOfPos,
        `step ${i} / unit ${unitKrw}: x=${a.numerator}/${a.denominator}`,
      );
    }
  }
});

test("(g) TRUNCATE 대칭성 + FLOOR ≤ TRUNCATE ≤ CEIL", () => {
  const rng = makeRng(57721566);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    const unitKrw = 100n;
    const mk = (mode: RoundingMode) =>
      round(a, roundingSpec({ stage: "FINAL_RESULT", mode, unitKrw })).value;
    const floor = mk("FLOOR");
    const trunc = mk("TRUNCATE");
    const ceil = mk("CEIL");
    assert.ok(floor <= trunc && trunc <= ceil, `step ${i}: ${floor} / ${trunc} / ${ceil}`);
    // TRUNCATE 는 0 방향이므로 부호에 대칭이다
    const truncOfNeg = round(
      negate(a),
      roundingSpec({ stage: "FINAL_RESULT", mode: "TRUNCATE", unitKrw }),
    ).value;
    assert.equal(truncOfNeg, -trunc, `step ${i}: TRUNCATE 비대칭`);
  }
});

test("(i) 반올림 오차 상한: 모든 모드에서 |round(a) - a| < unitKrw", () => {
  // (a)~(g) 가 못 잡는 오류를 잡는다. divisor 를 잘못 써도 "단위의 배수"와 "대칭성"은
  // 통과할 수 있지만, 결과가 원값에서 한 단위 이상 떨어지면 여기서 걸린다.
  const rng = makeRng(98765431);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    for (const mode of MODES) {
      const spec = randomSpec(rng, mode);
      const { value } = round(a, spec);
      // |value - n/d| < unit  ⇔  |value*d - n| < unit*d   (d > 0 이라 부등호 방향이 유지된다)
      const diff = value * a.denominator - a.numerator;
      const absDiff = diff < 0n ? -diff : diff;
      assert.ok(
        absDiff < spec.unitKrw * a.denominator,
        `step ${i} / ${mode}: |${value}·${a.denominator} - ${a.numerator}| = ${absDiff} >= ${spec.unitKrw * a.denominator}`,
      );
    }
  }
});

test("(j) HALF_UP 오차 상한은 절반이다: 2|round(a) - a| <= unitKrw", () => {
  // HALF_UP 은 더 강한 경계를 만족해야 한다 — 등호는 "정확히 절반"일 때다.
  const rng = makeRng(12345678);
  for (let i = 0; i < ITERATIONS; i++) {
    const a = randomExact(rng);
    const spec = randomSpec(rng, "HALF_UP");
    const { value } = round(a, spec);
    const diff = value * a.denominator - a.numerator;
    const absDiff = diff < 0n ? -diff : diff;
    assert.ok(
      2n * absDiff <= spec.unitKrw * a.denominator,
      `step ${i}: 2·${absDiff} > ${spec.unitKrw * a.denominator}`,
    );
  }
});

test("(h) canonical 해시는 key 순서에 불변이고 값 변화에 민감하다", () => {
  const rng = makeRng(66260701);
  for (let i = 0; i < 500; i++) {
    const amount = randomKRW(rng);
    const year = 2000 + (rng() % 60);
    const forward = { amount: toKRWString(amount), taxYear: year, note: null };
    const shuffled = { note: null, taxYear: year, amount: toKRWString(amount) };
    assert.equal(canonicalHash(forward), canonicalHash(shuffled));

    const bumped = { ...forward, amount: toKRWString(amount + 1n) };
    assert.notEqual(canonicalHash(forward), canonicalHash(bumped), `step ${i}: 1원 차이 미검출`);
  }
});
