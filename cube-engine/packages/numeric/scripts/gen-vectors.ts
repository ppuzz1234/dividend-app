/**
 * divergence 벡터 생성기 (`npm run gen:vectors -w @cube/numeric`).
 *
 * 여기서 만드는 두 파일은 정답지가 아니다. 이 구현의 출력을 그대로 기록한 것이므로
 * 정답의 근거가 될 수 없다 — 용도는 두 가지뿐이다.
 *   1. TypeScript 구현의 회귀 감지 (커밋된 파일과 현재 출력이 달라지면 무언가 바뀐 것)
 *   2. 순서 5 Python 독립 구현과의 불일치 탐지
 * 불일치가 나면 이 파일이 아니라 spec-derived 벡터와 사양 원문이 어느 쪽이 틀렸는지 판정한다.
 *
 * spec-derived 벡터는 손으로 쓴 것이며 이 스크립트가 건드리지 않는다.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  canonicalJson,
  decimalRate,
  fromKRW,
  multiply,
  round,
  roundingSpec,
  sha256Hex,
  toIntegerString,
  type ExactKRW,
  type RoundingMode,
} from "../src/index.js";

// 컴파일 후 위치는 dist/scripts/ 이므로 패키지 루트까지 두 단계 올라간다.
const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "vectors");

const LCG = { multiplier: 1664525, increment: 1013904223, modulus: 4294967296 } as const;

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, LCG.multiplier) + LCG.increment) >>> 0;
    return s;
  };
}

const NOT_AN_ORACLE = [
  "이 파일은 정답지가 아니다 (authority: NOT_AN_ORACLE).",
  "TypeScript 구현의 출력을 기록한 것이므로 정답의 근거가 될 수 없다.",
  "용도: (1) TS 구현 회귀 감지 (2) 순서 5 Python 독립 구현과의 불일치 탐지.",
  "불일치 시 판정은 *.spec-derived.json 과 사양 원문이 한다. 이 파일을 근거로 사양을 바꾸지 마라.",
  "재생성: npm run gen:vectors -w @cube/numeric",
];

// ─────────────────────────────────────────────────────────────────────────────
// rounding.divergence.json
// ─────────────────────────────────────────────────────────────────────────────

const MODES: readonly RoundingMode[] = ["FLOOR", "CEIL", "TRUNCATE", "HALF_UP"];
const UNITS = [1n, 5n, 10n, 100n, 1000n, 10_000n] as const;
const ROUNDING_SEED = 20260730;
const ROUNDING_CASES = 1000;

function randomKRW(rng: () => number): bigint {
  const digits = (rng() % 15) + 1;
  let v = 0n;
  for (let i = 0; i < digits; i++) v = v * 10n + BigInt(rng() % 10);
  return rng() % 2 === 0 ? v : -v;
}

function randomExact(rng: () => number): ExactKRW {
  const amount = fromKRW(randomKRW(rng));
  const denominator = BigInt((rng() % 12) + 1);
  return denominator === 1n ? amount : multiply(amount, decimalRate(1n, denominator));
}

function buildRoundingVectors() {
  const rng = makeRng(ROUNDING_SEED);
  const cases = [];
  for (let i = 0; i < ROUNDING_CASES; i++) {
    const a = randomExact(rng);
    const unitKrw = UNITS[rng() % UNITS.length] as bigint;
    const expected: Record<string, string> = {};
    for (const mode of MODES) {
      const spec = roundingSpec({ stage: "FINAL_RESULT", mode, unitKrw });
      expected[mode] = toIntegerString(round(a, spec).value);
    }
    cases.push({
      numerator: toIntegerString(a.numerator),
      denominator: toIntegerString(a.denominator),
      unitKrw: toIntegerString(unitKrw),
      expected,
    });
  }
  return {
    kind: "divergence-probe",
    authority: "NOT_AN_ORACLE",
    $authority_note: NOT_AN_ORACLE,
    specVersion: "v1.4",
    specSection: "§5.2 / §5.2.1",
    generator: { algorithm: "LCG (Numerical Recipes)", ...LCG, seed: ROUNDING_SEED },
    caseCount: cases.length,
    cases,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// canonical.divergence.json
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_SEED = 31415926;
const CANONICAL_CASES = 500;
const KEY_POOL = [
  "a", "b", "z", "amount", "taxYear", "valid_from", "unitKrw", "priority",
  "accountId", "note", "x1", "_leading", "PENSION_SAVINGS", "n",
] as const;
const STRING_POOL = ["", "s", "2026-07-30", "연금저축", 'q"uote', "back\\slash", "tab\there"] as const;

/** JSON 으로 직접 표현할 수 없는 값을 태그 객체로 바꾼다 (canonical.spec-derived.json 과 같은 규약). */
function toTagged(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value === undefined) return { $undefined: true };
  if (Array.isArray(value)) return value.map(toTagged);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toTagged(v);
    return out;
  }
  return value;
}

function randomValue(rng: () => number, depth: number): unknown {
  // depth 가 남지 않으면 스칼라만 낸다 — 무한 재귀 방지.
  const pick = rng() % (depth > 0 ? 8 : 6);
  switch (pick) {
    case 0:
      return (rng() % 2001) - 1000; // 정수 number
    case 1:
      return randomKRW(rng); // bigint
    case 2:
      return STRING_POOL[rng() % STRING_POOL.length] as string;
    case 3:
      return rng() % 2 === 0;
    case 4:
      return null;
    case 5:
      // 객체 값 자리에서만 의미가 있다. 배열 원소로 새면 throw 대상이므로 여기서는 내지 않는다.
      return rng() % 3 === 0 ? undefined : (rng() % 101) - 50;
    case 6: {
      const n = rng() % 4;
      const arr: unknown[] = [];
      for (let i = 0; i < n; i++) {
        // 배열 원소에 undefined 가 들어가면 규약상 throw 이므로 정상 케이스에서는 배제한다.
        let v = randomValue(rng, depth - 1);
        if (v === undefined) v = 0;
        arr.push(v);
      }
      return arr;
    }
    default:
      return randomObject(rng, depth - 1);
  }
}

function randomObject(rng: () => number, depth: number): Record<string, unknown> {
  const count = rng() % 5;
  const out: Record<string, unknown> = {};
  for (let i = 0; i < count; i++) {
    const key = KEY_POOL[rng() % KEY_POOL.length] as string;
    out[key] = randomValue(rng, depth);
  }
  return out;
}

function buildCanonicalVectors() {
  const rng = makeRng(CANONICAL_SEED);
  const cases = [];
  for (let i = 0; i < CANONICAL_CASES; i++) {
    const value = randomObject(rng, 3);
    const canonical = canonicalJson(value);
    cases.push({ input: toTagged(value), canonical, sha256: sha256Hex(canonical) });
  }
  return {
    kind: "divergence-probe",
    authority: "NOT_AN_ORACLE",
    $authority_note: NOT_AN_ORACLE,
    specVersion: "v1.4",
    specSection: "§5.2 / §5.2.1",
    inputEncoding: { $bigint: "임의 정밀도 정수", $undefined: "JS undefined" },
    generator: { algorithm: "LCG (Numerical Recipes)", ...LCG, seed: CANONICAL_SEED },
    caseCount: cases.length,
    cases,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function write(name: string, payload: unknown): void {
  const path = join(VECTORS_DIR, name);
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${name}`);
}

write("rounding.divergence.json", buildRoundingVectors());
write("canonical.divergence.json", buildCanonicalVectors());
