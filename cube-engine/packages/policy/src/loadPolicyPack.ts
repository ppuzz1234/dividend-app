/**
 * 정책 팩 로더 — 사양 §5.1 + CLAUDE.md 규칙 0.
 * 거절 조건은 docs/ORDER2-REJECTION-MATRIX.md A·B 절과 1:1 대응한다.
 *
 * 보정하지 않는다. 첫 위반에서 throw 하고 부분 로딩 결과를 남기지 않는다.
 */

import { assertLocalDate, compareLocalDate } from "./dates.js";
import { reject } from "./errors.js";
import { hashPack } from "./packHash.js";
import { parsePolicyValue } from "./policyValue.js";
import { SCHEMAS, assertSchema } from "./schemaValidate.js";
import type { LoadedPolicyPack, PolicyEffect, PolicyRounding, PolicyRule, PolicySource } from "./types.js";
import { PACK_KINDS, type AuthorityType, type LifecycleStatus, type PackKind } from "./vocabulary.js";

/**
 * 규칙 본문(effect 값 포함)은 공개 객체에 실리지 않는다. 반환된 LoadedPolicyPack 을 키로
 * 여기에만 보관하고, PolicyRegistry 만 꺼낸다 — 값이 스탬프 없이 밖으로 나갈 경로를 없애기 위함이다
 * (매트릭스 R28).
 */
const RULE_STORE = new WeakMap<LoadedPolicyPack, ReadonlyMap<string, PolicyRule>>();

export function internalRulesOf(pack: LoadedPolicyPack): ReadonlyMap<string, PolicyRule> {
  const rules = RULE_STORE.get(pack);
  if (rules === undefined) {
    reject("SCHEMA_VIOLATION", "$", "loadPolicyPack 이 만들지 않은 LoadedPolicyPack 이다");
  }
  return rules;
}

/**
 * 시간 상태를 데이터에 저장하는 것을 금지한다 (사양 P2 · §5.1 · CLAUDE.md 규칙 6).
 * 사양이 명시한 예시는 `CURRENT` 이며, 같은 성격의 상대 시점 토큰을 함께 막는다.
 * 부분 문자열이 아니라 값 전체가 일치할 때만 걸러 `CURRENT_YEAR_LIMIT` 같은 정상 식별자를 살린다.
 */
const TEMPORAL_STATE_TOKENS = new Set(["CURRENT", "TODAY", "NOW"]);

function assertNoTemporalState(node: unknown, path: string): void {
  if (typeof node === "string") {
    if (TEMPORAL_STATE_TOKENS.has(node)) {
      reject(
        "TEMPORAL_STATE_STORED",
        path,
        `시간 상태를 데이터에 저장할 수 없다. 조회 시점에 계산하라: ${node}`,
      );
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertNoTemporalState(item, `${path}[${i}]`));
    return;
  }
  if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      assertNoTemporalState(v, `${path}.${k}`);
    }
  }
}

function parseRounding(raw: unknown, path: string): PolicyRounding | undefined {
  if (raw === undefined || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;

  const present = (["stage", "mode", "unit_krw"] as const).filter((k) => obj[k] !== undefined);
  if (present.length === 0) return undefined;
  if (present.length !== 3) {
    reject(
      "ROUNDING_SPEC_INCOMPLETE",
      path,
      `stage·mode·unit_krw 는 함께 있거나 함께 없어야 한다. 있는 것: ${present.join(", ")}`,
    );
  }

  // unit_krw 는 IntegerString. parsePolicyValue 와 같은 정본 규칙을 쓴다.
  const parsed = parsePolicyValue(obj["unit_krw"], "COUNT", "SYNTHETIC_DEMO", `${path}.unit_krw`);
  if (parsed.kind !== "INTEGER") {
    reject("ROUNDING_SPEC_INCOMPLETE", `${path}.unit_krw`, "unit_krw 는 정수 문자열이어야 한다");
  }
  if (parsed.value <= 0n) {
    reject(
      "ROUNDING_UNIT_NOT_POSITIVE",
      `${path}.unit_krw`,
      `RoundingSpec 불변식 위반 (unitKrw > 0): ${parsed.value}`,
    );
  }

  return {
    stage: obj["stage"] as PolicyRounding["stage"],
    mode: obj["mode"] as PolicyRounding["mode"],
    unitKrw: parsed.value,
  };
}

function parseRule(raw: Record<string, unknown>, packKind: PackKind, path: string): PolicyRule {
  const id = raw["id"] as string;

  const authority = raw["authority"] as Record<string, unknown>;
  const temporal = raw["temporal"] as Record<string, unknown>;
  const scope = raw["scope"] as Record<string, unknown>;
  const review = raw["review"] as Record<string, unknown>;
  const sources = raw["sources"] as PolicySource[];

  // ── 날짜 (R12·R13) ─────────────────────────────────────────────────────────
  const validFrom = assertLocalDate(temporal["valid_from"], `${path}.temporal.valid_from`);
  const validToRaw = temporal["valid_to"];
  const validTo =
    validToRaw === undefined || validToRaw === null
      ? null
      : assertLocalDate(validToRaw, `${path}.temporal.valid_to`);
  for (const k of ["promulgated_at", "recorded_at"] as const) {
    const v = temporal[k];
    if (v !== undefined && v !== null) assertLocalDate(v, `${path}.temporal.${k}`);
  }

  // ── 유효 구간 (R14) ────────────────────────────────────────────────────────
  if (validTo !== null && compareLocalDate(validTo, validFrom) <= 0) {
    reject(
      "EMPTY_VALIDITY_INTERVAL",
      `${path}.temporal`,
      `valid_to 는 valid_from 보다 커야 한다 (유효성식은 query_date < valid_to): ${validFrom} → ${validTo}`,
    );
  }

  // ── 출처 (R05·R06) ─────────────────────────────────────────────────────────
  if (sources.length === 0) {
    reject("EMPTY_SOURCES", `${path}.sources`, "출처 0건이면 원문 대조가 성립하지 않는다");
  }

  const effectRaw = raw["effect"] as Record<string, unknown> | undefined;
  if (effectRaw !== undefined) {
    const hasPrimary = sources.some((s) => s.role === "PRIMARY");
    if (!hasPrimary) {
      reject(
        "EFFECT_WITHOUT_PRIMARY_SOURCE",
        `${path}.sources`,
        "PRIMARY source 없이 effect 를 기재할 수 없다 (사양 §5.1 불변식)",
      );
    }
  }

  // ── field_bindings dangling (R07) ──────────────────────────────────────────
  const bindings = raw["field_bindings"] as Record<string, string[]> | undefined;
  if (bindings !== undefined) {
    const known = new Set(sources.map((s) => s.source_id));
    for (const [field, ids] of Object.entries(bindings)) {
      for (const sid of ids) {
        if (!known.has(sid)) {
          reject(
            "DANGLING_FIELD_BINDING",
            `${path}.field_bindings.${field}`,
            `sources 에 없는 source_id 를 참조한다: ${sid}`,
          );
        }
      }
    }
  }

  // ── scope 안전 정수 (R22) ──────────────────────────────────────────────────
  const taxYears = scope["tax_years"] as number[];
  taxYears.forEach((y, i) => {
    if (!Number.isSafeInteger(y)) {
      reject("UNSAFE_INTEGER", `${path}.scope.tax_years[${i}]`, `안전 정수여야 한다: ${y}`);
    }
  });

  // ── effect (R15~R20) ───────────────────────────────────────────────────────
  let effect: PolicyEffect | undefined;
  if (effectRaw !== undefined) {
    const unit = effectRaw["unit"] as PolicyEffect["unit"];
    const value = parsePolicyValue(effectRaw["value"], unit, packKind, `${path}.effect.value`);
    const rounding = parseRounding(effectRaw["rounding"], `${path}.effect.rounding`);
    effect = rounding === undefined ? { value, unit } : { value, unit, rounding };
  }

  return {
    id,
    status: (raw["lifecycle"] as Record<string, unknown>)["status"] as LifecycleStatus,
    authorityType: authority["type"] as AuthorityType,
    appliesTo: authority["applies_to"] as string,
    conflictGroup: authority["conflict_group"] as string,
    validFrom,
    validTo,
    jurisdiction: scope["jurisdiction"] as string,
    taxYears,
    sources,
    reviewApproved: review["approved"] as boolean,
    ...(effect === undefined ? {} : { effect }),
  };
}

/** pack_kind 별 승인 규칙 (매트릭스 R25·R26·R29, OPEN-Q2). */
function assertPackKindInvariants(
  packKind: PackKind,
  rawRules: readonly Record<string, unknown>[],
): void {
  rawRules.forEach((raw, i) => {
    const review = raw["review"] as Record<string, unknown>;
    const approved = review["approved"] as boolean;
    const path = `$.rules[${i}].review`;

    if (packKind === "VERIFIED_LAW") {
      if (approved !== true) {
        reject(
          "VERIFIED_PACK_HAS_UNAPPROVED_RULE",
          path,
          `VERIFIED_LAW 팩은 전 규칙이 승인돼야 한다 (rule=${String(raw["id"])})`,
        );
      }
      const reviewer = review["reviewer_id"];
      const reviewedAt = review["reviewed_at"];
      if (typeof reviewer !== "string" || reviewer.length === 0) {
        reject(
          "VERIFIED_PACK_MISSING_REVIEW_SIGNATURE",
          `${path}.reviewer_id`,
          "approved: true 만 있고 승인 주체가 없으면 Maker–Checker 를 추적할 수 없다",
        );
      }
      if (typeof reviewedAt !== "string") {
        reject(
          "VERIFIED_PACK_MISSING_REVIEW_SIGNATURE",
          `${path}.reviewed_at`,
          "승인 일자가 없다",
        );
      }
      assertLocalDate(reviewedAt, `${path}.reviewed_at`);
    }

    if (packKind === "SYNTHETIC_DEMO" && approved === true) {
      reject(
        "SYNTHETIC_PACK_CLAIMS_APPROVAL",
        path,
        `합성 값에 세무 검토 승인 도장을 찍을 수 없다 (rule=${String(raw["id"])})`,
      );
    }
  });
}

/**
 * canonical JSON key 규칙 (§5.2.1): `[A-Za-z0-9_]` 만 허용.
 *
 * 스키마의 additionalProperties 보다 **먼저** 검사한다. 비ASCII·점 포함 key 의 본질은
 * "미지 필드"가 아니라 "해싱 불가"이고, 해싱할 수 없는 팩은 RunManifest 재현성 단위가 될 수 없다.
 *
 * 사양 §5.1 의 `field_bindings: { "effect.value": [...] }` 예시는 이 규칙을 위반한다 — 사양 내부
 * 모순이며 docs/ORDER2-OPEN-QUESTIONS.md Q11 에 기록했다. 보수적으로 거절한다 (R31·R31b).
 */
function assertAsciiKeys(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertAsciiKeys(item, `${path}[${i}]`));
    return;
  }
  if (node === null || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) {
      reject(
        "NON_ASCII_KEY_IN_PACK",
        `${path}.${key}`,
        `canonical JSON key 는 [A-Za-z0-9_] 만 허용된다 — 이 팩은 정본 해시를 계산할 수 없다`,
      );
    }
    assertAsciiKeys(value, `${path}.${key}`);
  }
}

export interface LoadPolicyPackOptions {
  /**
   * 코퍼스에 실재하는 `source_id` 집합. 주면 규칙의 출처가 실제 조문을 가리키는지 검사한다.
   * 안 주면 검사하지 않는다 — 코퍼스 없이 팩 형식만 검증하는 기존 용법을 유지하기 위함이다.
   */
  readonly knownSourceIds?: ReadonlySet<string>;
}

export function loadPolicyPack(raw: unknown, opts?: LoadPolicyPackOptions): LoadedPolicyPack {
  // 1. key 규칙 — 스키마보다 먼저다 (R31). 해싱 불가가 미지 필드보다 본질적인 결함이다.
  assertAsciiKeys(raw, "$");

  // 2. 시간 상태 저장 금지 (R09) — enum 검사보다 먼저 걸러야 고유 code 가 나온다.
  assertNoTemporalState(raw, "$");

  // 3. 구조 (R01·R02·R03·R08·R10·R11·R17·R21·R23)
  assertSchema(SCHEMAS.policyPack, raw, "$");

  const pack = raw as { pack_kind: PackKind; policy_snapshot: string; rules: Record<string, unknown>[] };
  const packKind = pack.pack_kind;
  if (!(PACK_KINDS as readonly string[]).includes(packKind)) {
    reject("PACK_KIND_INVALID", "$.pack_kind", `열거 밖: ${String(packKind)}`);
  }

  // 4. pack_kind 별 승인 불변식 (R25·R26·R29)
  assertPackKindInvariants(packKind, pack.rules);

  // 5. 규칙별 의미 검사 + 중복 id (R04)
  const rules = new Map<string, PolicyRule>();
  pack.rules.forEach((rawRule, i) => {
    const path = `$.rules[${i}]`;
    const parsed = parseRule(rawRule, packKind, path);
    if (rules.has(parsed.id)) {
      reject("DUPLICATE_RULE_ID", `${path}.id`, `같은 id 의 규칙이 이미 있다: ${parsed.id}`);
    }
    rules.set(parsed.id, parsed);
  });

  // 5-b. 이음매 검사 (R33) — 규칙이 인용한 source_id 가 **실제 조문**을 가리키는가.
  //   `@cube/policy` 가 `@cube/corpus` 를 의존하면 계층이 역전되므로(policy=검증, corpus=획득)
  //   호출자가 알려진 id 집합을 **주입**한다. 미지정이면 현행 동작 그대로 — 기존 호출을 깨지 않는다.
  //   SYNTHETIC_DEMO 는 면제한다: 합성 팩이 합성 출처를 갖는 것은 정상이고, 여기에 이 검사를
  //   걸면 알고리즘 검증용 fixture 를 못 쓰게 된다.
  if (opts?.knownSourceIds !== undefined && packKind !== "SYNTHETIC_DEMO") {
    const known = opts.knownSourceIds;
    for (const [ruleId, rule] of rules) {
      for (const [i, s] of rule.sources.entries()) {
        if (!known.has(s.source_id)) {
          reject(
            "SOURCE_SNAPSHOT_NOT_FOUND",
            `$.rules[${ruleId}].sources[${i}].source_id`,
            `인용한 조문이 코퍼스에 없다: ${s.source_id} — 근거 없는 규칙은 배포할 수 없다`,
          );
        }
      }
    }
  }

  // 6. 정본 해시 — 의미 검사를 전부 통과한 뒤에 계산한다. 앞에서 하면 부동소수점 값이
  //    FLOAT_IN_POLICY_VALUE 대신 해시 계층 오류로 보고돼 감사 로그의 원인 지목이 어긋난다.
  const packHash = hashPack(raw, "$");

  const loaded: LoadedPolicyPack = {
    packKind,
    policySnapshot: pack.policy_snapshot,
    packHash,
    ruleIds: [...rules.keys()],
  };
  RULE_STORE.set(loaded, rules);
  return loaded;
}
