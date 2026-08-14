/**
 * 거절 매트릭스 F·G 절 — RunManifest / FactAnswerManifest (사양 §5.6 · §1.2 · §1.3).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SYNTHETIC_STAMP_TEXT, validateFactAnswerManifest, validateRunManifest } from "../src/index.js";
import { expectReject, factManifest, runManifest } from "./helpers.js";

const NO_PROJECTION = { producesProjection: false };
const WITH_PROJECTION = { producesProjection: true };

const VERSION_FIELDS = [
  "policySnapshotVersion",
  "accountSpecVersion",
  "mechanismSchemaVersion",
  "instrumentDataVersion",
  "strategyCoverageVersion",
  "strategyTemplateVersion",
  "optimizerVersion",
  "engineBuildVersion",
] as const;

test("R51 버전 필드 누락", () => {
  for (const field of VERSION_FIELDS) {
    const m = runManifest();
    delete m[field];
    expectReject(() => validateRunManifest(m, NO_PROJECTION), "MANIFEST_FIELD_MISSING", `R51 (${field})`);
  }
  // 재현성 축의 나머지 필수 필드도 같이 막혀야 한다.
  for (const field of ["runId", "taxYear", "confirmedInputHash", "createdAt", "packKind"]) {
    const m = runManifest();
    delete m[field];
    expectReject(() => validateRunManifest(m, NO_PROJECTION), "MANIFEST_FIELD_MISSING", `R51 (${field})`);
  }
});

test("R52 전망에 가정 버전 부재", () => {
  const m = runManifest();
  expectReject(
    () => validateRunManifest(m, WITH_PROJECTION),
    "ASSUMPTION_SET_REQUIRED_FOR_PROJECTION",
    "R52",
  );

  // ③ 전망이 아니면 없어도 통과한다.
  validateRunManifest(runManifest(), NO_PROJECTION);

  // 있으면 전망도 통과한다.
  validateRunManifest({ ...runManifest(), assumptionSetVersion: "DEMO-ASSUME-0001" }, WITH_PROJECTION);
});

test("R53 해시 형식 오류", () => {
  for (const bad of ["", "abc", "0".repeat(63), "0".repeat(65), "A".repeat(64), `${"0".repeat(63)}g`]) {
    const m = runManifest();
    m["confirmedInputHash"] = bad;
    expectReject(() => validateRunManifest(m, NO_PROJECTION), "HASH_FORMAT_INVALID", `R53 (${bad})`);
  }
});

test("R54 매니페스트 날짜 오류", () => {
  for (const field of ["queryAsOf", "createdAt"]) {
    const m = runManifest();
    m[field] = "2026-07-30T12:00:00Z";
    expectReject(() => validateRunManifest(m, NO_PROJECTION), "DATE_FORMAT_INVALID", `R54 (${field})`);
  }
  const cal = runManifest();
  cal["queryAsOf"] = "2026-02-30";
  expectReject(() => validateRunManifest(cal, NO_PROJECTION), "DATE_NOT_A_CALENDAR_DATE", "R54 (달력)");
});

test("R55 taxYear 비안전 정수", () => {
  for (const bad of [2026.5, 9007199254740993]) {
    const m = runManifest();
    m["taxYear"] = bad;
    expectReject(() => validateRunManifest(m, NO_PROJECTION), "UNSAFE_INTEGER", `R55 (${bad})`);
  }
});

test("R56 매니페스트 스탬프 부재", () => {
  const missing = runManifest();
  delete missing["syntheticStamp"];
  expectReject(() => validateRunManifest(missing, NO_PROJECTION), "SYNTHETIC_STAMP_REQUIRED", "R56 (누락)");

  const wrong = runManifest();
  wrong["syntheticStamp"] = "합성";
  expectReject(() => validateRunManifest(wrong, NO_PROJECTION), "SYNTHETIC_STAMP_REQUIRED", "R56 (문구 불일치)");

  const nulled = runManifest();
  nulled["syntheticStamp"] = null;
  expectReject(() => validateRunManifest(nulled, NO_PROJECTION), "SYNTHETIC_STAMP_REQUIRED", "R56 (null)");

  // VERIFIED_LAW 는 스탬프가 없어야 정상이다.
  const verified = { ...runManifest(), packKind: "VERIFIED_LAW", syntheticStamp: undefined };
  delete (verified as Record<string, unknown>)["syntheticStamp"];
  validateRunManifest(verified, NO_PROJECTION);

  assert.equal(runManifest()["syntheticStamp"], SYNTHETIC_STAMP_TEXT);
});

test("R57 팩트에 규칙 ID 부재", () => {
  const m = factManifest();
  m["resolvedRuleIds"] = [];
  expectReject(() => validateFactAnswerManifest(m), "RESOLVED_RULE_IDS_REQUIRED", "R57");
});

test("R58 미모델링에 규칙 ID", () => {
  const m = factManifest();
  m["answerClass"] = "UNMODELED_OFFICIAL_SOURCE";
  expectReject(() => validateFactAnswerManifest(m), "RESOLVED_RULE_IDS_MUST_BE_EMPTY", "R58");

  // 빈 배열이면 통과한다.
  validateFactAnswerManifest({ ...factManifest(), answerClass: "UNMODELED_OFFICIAL_SOURCE", resolvedRuleIds: [] });
});

test("R59 출처 해시 짝 불일치", () => {
  const m = factManifest();
  m["sourceSnapshotIds"] = ["A", "B"];
  expectReject(() => validateFactAnswerManifest(m), "SOURCE_HASH_PAIRING_MISMATCH", "R59");
});

test("R60 답변 해시 형식", () => {
  const m = factManifest();
  m["answerPayloadHash"] = "not-a-hash";
  expectReject(() => validateFactAnswerManifest(m), "HASH_FORMAT_INVALID", "R60 (payload)");

  const q = factManifest();
  q["sourceHashes"] = ["not-a-hash"];
  expectReject(() => validateFactAnswerManifest(q), "HASH_FORMAT_INVALID", "R60 (source)");
});

test("정상 매니페스트는 통과한다", () => {
  const run = validateRunManifest(runManifest(), NO_PROJECTION);
  assert.equal(run.packKind, "SYNTHETIC_DEMO");
  const fact = validateFactAnswerManifest(factManifest());
  assert.equal(fact.answerClass, "REGISTRY_RESOLVED_FACT");
});
