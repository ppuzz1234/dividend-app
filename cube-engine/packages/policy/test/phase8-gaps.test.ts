/**
 * Phase 8 — `@cube/policy` 의 세 구멍을 메운 것에 대한 검증.
 *
 * 세 구멍 전부 **에러를 내지 않는** 종류였다:
 *  8-1 role 소실   → 행정해석을 PRIMARY 인 것처럼 인용해도 아무도 못 잡는다
 *  8-2 스탬프 부재 → 합성 세법 값 결과가 스탬프 없이 매니페스트에 보관된다 (규칙 0 위반)
 *  8-3 이음매 부재 → 존재하지 않는 조문을 근거로 든 규칙이 통과한다
 *
 * fixture(`synthetic-demo.pack.yaml`)는 `pack_kind: SYNTHETIC_DEMO` 다. 8-3 은 합성 팩을
 * 면제하므로, 그 검사를 실제로 돌리려면 `UNVERIFIED_DRAFT` 로 바꿔서 쓴다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SYNTHETIC_STAMP_TEXT,
  createRegistry,
  loadPolicyPack,
  validateFactAnswerManifest,
} from "../src/index.js";
import { VALUED_RULE_ID, expectReject, pack, ruleOf } from "./helpers.js";

/** fixture 를 비합성 등급으로 바꾼다 — 8-3 검사가 면제되지 않게. */
function draftPack(): Record<string, any> {
  const p = pack();
  p["pack_kind"] = "UNVERIFIED_DRAFT";
  return p;
}

// ─────────────────────────── 8-1. role 노출 ───────────────────────────

test("8-1 describeRule 이 출처를 role 과 함께 준다 (PRIMARY 만 인용 가능)", () => {
  const p = pack();
  const rule = ruleOf(p, VALUED_RULE_ID);
  rule["sources"] = [
    { source_id: "LAW_X", role: "PRIMARY" },
    { source_id: "DECREE_X", role: "IMPLEMENTING_DETAIL" },
    { source_id: "GUIDE_X", role: "ADMIN_INTERPRETATION" },
  ];
  rule["field_bindings"] = { effect_value: ["LAW_X"] };

  const meta = createRegistry(loadPolicyPack(p)).describeRule(VALUED_RULE_ID);

  // 기존 필드는 호환을 위해 남아 있어야 한다.
  assert.deepEqual([...meta.sourceIds], ["LAW_X", "DECREE_X", "GUIDE_X"]);

  // PRIMARY 만 걸러내는 것이 가능해야 한다 — 사양 §5.1 "PRIMARY source 없이 effect 기재 불가".
  assert.deepEqual(
    meta.sources.filter((s) => s.role === "PRIMARY").map((s) => s.source_id),
    ["LAW_X"],
  );

  // 행정해석이 PRIMARY 로 둔갑하지 않는다 — 근거 등급이 조용히 올라가는 것을 막는다.
  assert.equal(meta.sources.find((s) => s.source_id === "GUIDE_X")?.role, "ADMIN_INTERPRETATION");
});

test("8-1 role 을 노출해도 effect 값은 새지 않는다 (RuleMetadata 설계 의도 유지)", () => {
  const meta = createRegistry(loadPolicyPack(pack())).describeRule(VALUED_RULE_ID);
  assert.ok(!("effect" in meta), "메타데이터에 effect 가 실렸다 — 스탬프 없이 값이 나간다");
  assert.equal(typeof meta.hasEffect, "boolean");
  // sources 는 id+role 뿐이어야 한다. 값이 딸려오면 스탬프 없는 유출 경로가 생긴다.
  for (const s of meta.sources) {
    assert.deepEqual(Object.keys(s).sort(), ["role", "source_id"]);
  }
});

// ─────────────────────────── 8-2. FACT 매니페스트 스탬프 ───────────────────────────

function factManifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    queryAsOf: "2026-07-31",
    policySnapshotVersion: "KR-TAX-2026-07-31.1",
    factResolverVersion: "0.1.0",
    answerClass: "UNMODELED_OFFICIAL_SOURCE",
    resolvedRuleIds: [],
    sourceSnapshotIds: ["TAXEX_91_18"],
    sourceHashes: ["a".repeat(64)],
    rendererTemplateVersion: "t1",
    answerPayloadHash: "b".repeat(64),
    ...over,
  };
}

test("8-2 SYNTHETIC_DEMO FACT 매니페스트에 스탬프가 없으면 거절 (규칙 0)", () => {
  expectReject(
    () => validateFactAnswerManifest(factManifest({ packKind: "SYNTHETIC_DEMO" })),
    "SYNTHETIC_STAMP_REQUIRED",
    "8-2 합성 팩 FACT 매니페스트 스탬프 부재",
  );
});

test("8-2 스탬프 문구가 다르면 거절 — 비슷한 문구로 우회할 수 없다", () => {
  expectReject(
    () =>
      validateFactAnswerManifest(
        factManifest({ packKind: "SYNTHETIC_DEMO", syntheticStamp: "합성 값입니다" }),
      ),
    "SYNTHETIC_STAMP_REQUIRED",
    "8-2 스탬프 문구 불일치",
  );
});

test("8-2 스탬프가 정확하면 통과", () => {
  const m = validateFactAnswerManifest(
    factManifest({ packKind: "SYNTHETIC_DEMO", syntheticStamp: SYNTHETIC_STAMP_TEXT }),
  );
  assert.equal(m.syntheticStamp, SYNTHETIC_STAMP_TEXT);
  assert.equal(m.packKind, "SYNTHETIC_DEMO");
});

test("8-2 VERIFIED_LAW 는 스탬프를 요구하지 않는다", () => {
  assert.doesNotThrow(() => validateFactAnswerManifest(factManifest({ packKind: "VERIFIED_LAW" })));
});

test("8-2 packKind 를 안 실어도 기존 매니페스트는 통과한다 (하위 호환)", () => {
  assert.doesNotThrow(() => validateFactAnswerManifest(factManifest()));
});

test("8-2 기존 FACT 불변식은 그대로 살아 있다", () => {
  expectReject(
    () => validateFactAnswerManifest(factManifest({ answerClass: "REGISTRY_RESOLVED_FACT" })),
    "RESOLVED_RULE_IDS_REQUIRED",
    "8-2 회귀: 규칙 ID 필수",
  );
  expectReject(
    () => validateFactAnswerManifest(factManifest({ resolvedRuleIds: ["R1"] })),
    "RESOLVED_RULE_IDS_MUST_BE_EMPTY",
    "8-2 회귀: UNMODELED 는 빈 배열",
  );
  expectReject(
    () => validateFactAnswerManifest(factManifest({ sourceHashes: [] })),
    "SOURCE_HASH_PAIRING_MISMATCH",
    "8-2 회귀: 스냅샷↔해시 짝",
  );
});

// ─────────────────────────── 8-3. 이음매 검사 ───────────────────────────

/** 팩이 인용하는 모든 source_id — "실재한다" 를 흉내내는 집합. */
function allSourceIds(p: Record<string, any>): Set<string> {
  const out = new Set<string>();
  for (const r of p["rules"] as Record<string, any>[]) {
    for (const s of (r["sources"] ?? []) as { source_id: string }[]) out.add(s.source_id);
  }
  return out;
}

test("8-3 코퍼스에 없는 source_id 를 인용하면 거절", () => {
  const p = draftPack();
  expectReject(
    () => loadPolicyPack(p, { knownSourceIds: new Set(["TAXEX_91_18"]) }),
    "SOURCE_SNAPSHOT_NOT_FOUND",
    "8-3 미실재 조문 인용",
  );
});

test("8-3 실재하는 source_id 면 통과", () => {
  const p = draftPack();
  assert.doesNotThrow(() => loadPolicyPack(p, { knownSourceIds: allSourceIds(p) }));
});

test("8-3 knownSourceIds 미지정이면 검사하지 않는다 (기존 호출 무회귀)", () => {
  assert.doesNotThrow(() => loadPolicyPack(draftPack()));
});

test("8-3 빈 집합을 주면 모든 출처가 거절된다 (검사가 실제로 도는지)", () => {
  expectReject(
    () => loadPolicyPack(draftPack(), { knownSourceIds: new Set() }),
    "SOURCE_SNAPSHOT_NOT_FOUND",
    "8-3 빈 집합",
  );
});

test("8-3 SYNTHETIC_DEMO 는 면제된다 — 합성 팩이 합성 출처를 갖는 건 정상", () => {
  // fixture 는 원래 SYNTHETIC_DEMO 다. 빈 집합을 줘도 통과해야 한다.
  assert.doesNotThrow(() => loadPolicyPack(pack(), { knownSourceIds: new Set() }));
});

test("8-3 한 규칙만 어긋나도 잡는다 (부분 통과 없음)", () => {
  const p = draftPack();
  const ids = allSourceIds(p); // 기존 출처는 전부 '실재'한다고 둔다
  // 기존 source_id 를 바꾸면 field_bindings 가 그걸 참조해 DANGLING_FIELD_BINDING 이 먼저 난다.
  // 검사하려는 것은 이음매이므로, 참조되지 않는 출처를 **추가**해 그것만 어긋나게 한다.
  const rule = ruleOf(p, VALUED_RULE_ID);
  (rule["sources"] as { source_id: string; role: string }[]).push({
    source_id: "없는조문_9999",
    role: "ADMIN_INTERPRETATION",
  });
  expectReject(
    () => loadPolicyPack(p, { knownSourceIds: ids }),
    "SOURCE_SNAPSHOT_NOT_FOUND",
    "8-3 일부 규칙만 어긋남",
  );
});
