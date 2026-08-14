/**
 * 4모드 × 경계 테이블은 vectors/rounding.spec-derived.json 으로 옮겼고
 * vectors.test.ts 가 대조한다 (Python 독립 구현이 같은 파일을 읽어야 하므로).
 * 여기에는 JSON 벡터로 표현되지 않는 계약만 남긴다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NumericContractError,
  decimalRate,
  fromKRW,
  multiply,
  round,
  roundingSpec,
  type RoundingMode,
} from "../src/index.js";

const MODES: readonly RoundingMode[] = ["FLOOR", "CEIL", "TRUNCATE", "HALF_UP"];

test("stage 는 결과에 영향을 주지 않는다 (numeric 은 해석하지 않는다)", () => {
  const a = multiply(fromKRW(25n), decimalRate(1n, 2n));
  const stages = ["PER_TRANSACTION", "PER_YEAR", "PER_ACCOUNT", "FINAL_RESULT"] as const;
  const values = stages.map(
    (stage) => round(a, roundingSpec({ stage, mode: "HALF_UP", unitKrw: 1n })).value,
  );
  assert.deepEqual(values, [13n, 13n, 13n, 13n]);
});

test("stage 는 RoundingRecord 에 태그로 그대로 실린다", () => {
  const a = fromKRW(100n);
  const record = round(a, roundingSpec({ stage: "PER_ACCOUNT", mode: "FLOOR", unitKrw: 1n })).record;
  assert.equal(record.roundingStage, "PER_ACCOUNT");
  assert.equal(record.roundingMode, "FLOOR");
});

test("unitKrw <= 0 거부", () => {
  for (const unitKrw of [0n, -1n, -10n]) {
    assert.throws(
      () => roundingSpec({ stage: "FINAL_RESULT", mode: "FLOOR", unitKrw }),
      (e: unknown) => e instanceof NumericContractError && e.code === "UNIT_NOT_POSITIVE",
    );
  }
});

test("unitKrw = 1n 은 무반올림 경로 대용으로 통과한다", () => {
  const a = fromKRW(123_456n);
  for (const mode of MODES) {
    assert.equal(round(a, roundingSpec({ stage: "FINAL_RESULT", mode, unitKrw: 1n })).value, 123_456n);
  }
});
