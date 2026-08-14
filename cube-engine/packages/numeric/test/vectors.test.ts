/**
 * 공유 골든 벡터 대조 (사양 §6.2).
 *
 * spec-derived  = 정답지. 사람이 사양을 읽고 적었으므로 구현이 여기에 맞춰야 한다.
 * divergence    = 정답지 아님. 커밋된 기록과 현재 출력이 갈리면 무언가 바뀐 것이다(회귀 감지).
 *                 순서 5 Python 구현이 같은 파일을 읽어 두 구현의 불일치를 탐지한다.
 *
 * TODO(순서5): 네 벡터 파일을 읽는 Python 대조 러너. 현재는 TypeScript 한쪽만 대조하므로
 * spec-derived 를 "사람이 사양에서 도출했다"고는 말할 수 있어도 "독립 검증됐다"고는 말할 수 없다.
 * 진짜 독립성은 다른 사람·다른 언어가 같은 사양에서 같은 값을 얻을 때 성립한다.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  NumericContractError,
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
  type RoundingStage,
} from "../src/index.js";

const VECTORS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "vectors");

function load(name: string): any {
  return JSON.parse(readFileSync(join(VECTORS_DIR, name), "utf8"));
}

/** 벡터의 n/d 를 공개 API 만으로 ExactKRW 로 되돌린다. */
function exactFrom(numerator: string, denominator: string): ExactKRW {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  return d === 1n ? fromKRW(n) : multiply(fromKRW(n), decimalRate(1n, d));
}

/** canonical 벡터의 태그 객체를 네이티브 값으로 되돌린다 (gen-vectors 의 toTagged 역함수). */
function decodeTagged(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeTagged);
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["$bigint"] === "string") return BigInt(obj["$bigint"]);
    if (obj["$undefined"] === true) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeTagged(v);
    return out;
  }
  return value;
}

const MODES: readonly RoundingMode[] = ["FLOOR", "CEIL", "TRUNCATE", "HALF_UP"];

// ─────────────────────────────────────────────────────────────────────────────
// 정답지 대조
// ─────────────────────────────────────────────────────────────────────────────

test("[ORACLE] rounding.spec-derived — 사람이 사양에서 도출한 기대값과 일치", () => {
  const doc = load("rounding.spec-derived.json");
  assert.equal(doc.authority, "ORACLE");
  assert.ok(doc.cases.length > 0);

  for (const c of doc.cases) {
    const a = exactFrom(c.numerator, c.denominator);
    for (const mode of MODES) {
      const spec = roundingSpec({
        stage: "FINAL_RESULT",
        mode,
        unitKrw: BigInt(c.unitKrw),
      });
      assert.equal(
        toIntegerString(round(a, spec).value),
        c.expected[mode],
        `${c.label} / ${mode}`,
      );
    }
  }
});

test("[ORACLE] rounding.spec-derived — RoundingRecord 형태", () => {
  const doc = load("rounding.spec-derived.json");
  for (const shape of doc.recordShape) {
    const a = exactFrom(shape.input.numerator, shape.input.denominator);
    const spec = roundingSpec({
      stage: shape.input.stage as RoundingStage,
      mode: shape.input.mode as RoundingMode,
      unitKrw: BigInt(shape.input.unitKrw),
    });
    assert.deepEqual(round(a, spec).record, shape.record);
  }
});

test("[ORACLE] canonical.spec-derived — canonical 문자열이 일치", () => {
  const doc = load("canonical.spec-derived.json");
  assert.equal(doc.authority, "ORACLE");

  for (const c of doc.cases) {
    assert.equal(canonicalJson(decodeTagged(c.input)), c.canonical, c.label);
  }
});

test("[ORACLE] canonical.spec-derived — 오류 케이스", () => {
  const doc = load("canonical.spec-derived.json");
  for (const c of doc.errorCases) {
    assert.throws(
      () => canonicalJson(decodeTagged(c.input)),
      (e: unknown) => e instanceof NumericContractError && e.code === c.throws,
      c.label,
    );
  }
});

test("[ORACLE] SHA-256 known answers (FIPS 180-4)", () => {
  const doc = load("canonical.spec-derived.json");
  for (const v of doc.sha256KnownAnswers.vectors) {
    assert.equal(sha256Hex(v.input), v.sha256, JSON.stringify(v.input));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 회귀 감지 (정답지 아님)
// ─────────────────────────────────────────────────────────────────────────────

test("[REGRESSION] rounding.divergence — 커밋된 기록과 현재 출력이 같다", () => {
  const doc = load("rounding.divergence.json");
  assert.equal(doc.authority, "NOT_AN_ORACLE");
  assert.equal(doc.cases.length, doc.caseCount);

  for (const [i, c] of doc.cases.entries()) {
    const a = exactFrom(c.numerator, c.denominator);
    for (const mode of MODES) {
      const spec = roundingSpec({ stage: "FINAL_RESULT", mode, unitKrw: BigInt(c.unitKrw) });
      assert.equal(
        toIntegerString(round(a, spec).value),
        c.expected[mode],
        `case ${i} / ${mode} — 출력이 바뀌었다. 의도한 변경이면 gen:vectors 로 재생성하라.`,
      );
    }
  }
});

test("[REGRESSION] canonical.divergence — 커밋된 기록과 현재 출력이 같다", () => {
  const doc = load("canonical.divergence.json");
  assert.equal(doc.authority, "NOT_AN_ORACLE");
  assert.equal(doc.cases.length, doc.caseCount);

  for (const [i, c] of doc.cases.entries()) {
    const canonical = canonicalJson(decodeTagged(c.input));
    assert.equal(canonical, c.canonical, `case ${i} — canonical 이 바뀌었다`);
    assert.equal(sha256Hex(canonical), c.sha256, `case ${i} — 해시가 바뀌었다`);
  }
});

test("divergence 벡터는 자기가 정답지가 아님을 파일에 명시한다", () => {
  for (const name of ["rounding.divergence.json", "canonical.divergence.json"]) {
    const doc = load(name);
    assert.equal(doc.authority, "NOT_AN_ORACLE", name);
    assert.ok(
      doc.$authority_note.join(" ").includes("정답지가 아니다"),
      `${name}: 권위 구분이 헤더에 없다`,
    );
  }
});
