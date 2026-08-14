/**
 * Policy Registry — 사양 §5.1 (조회 시점 유효 규칙 계산 · 충돌 해소) + CLAUDE.md 규칙 0 (스탬프).
 *
 * 두 가지를 구조로 강제한다.
 *
 * 1. **시간 상태를 저장하지 않는다.** 유효성은 조회일을 받아 매번 계산하며, 팩 객체에
 *    "지금 유효함" 같은 상태를 쓰지 않는다 (사양 P2 · §5.1).
 * 2. **정책 값은 스탬프 봉투로만 나간다.** effect 값을 반환하는 함수는 resolveEffect 계열뿐이고,
 *    그 반환 타입 StampedResult<T> 는 brand 되어 외부에서 만들 수 없다. 나머지 조회 함수는
 *    메타데이터만 돌려준다 — 스탬프 없이 합성 값이 새는 경로 자체를 없애기 위함이다 (매트릭스 R28).
 */

import { assertLocalDate, compareLocalDate } from "./dates.js";
import { UnverifiedPolicyError, reject } from "./errors.js";
import { internalRulesOf } from "./loadPolicyPack.js";
import type { LoadedPolicyPack, PolicyEffect, PolicyRule, RuleMetadata } from "./types.js";
import { SYNTHETIC_STAMP_TEXT, authorityRank, type PackKind } from "./vocabulary.js";

declare const STAMP_BRAND: unique symbol;

/**
 * 결과 출처 스탬프. brand 때문에 이 모듈 밖에서는 만들 수 없다.
 * `notice` 는 SYNTHETIC_DEMO 일 때만 채워지며 문구는 vocabulary.SYNTHETIC_STAMP_TEXT 다.
 */
export interface ResultStamp {
  readonly [STAMP_BRAND]: void;
  readonly packKind: PackKind;
  readonly policySnapshotVersion: string;
  readonly policyPackHash: string;
  readonly synthetic: boolean;
  readonly notice: string | null;
}

/** 정책 값이 계산 경로로 나가는 유일한 형태. */
export interface StampedResult<T> {
  readonly value: T;
  readonly stamp: ResultStamp;
}

export interface PolicyRegistry {
  /** 팩 등급·스냅샷·해시. 값은 담기지 않는다. */
  readonly describePack: () => {
    packKind: PackKind;
    policySnapshot: string;
    packHash: string;
    ruleCount: number;
  };
  /** effect 값을 제외한 규칙 메타데이터 (R65). */
  readonly describeRule: (ruleId: string) => RuleMetadata;
  /** 조회일 기준 유효 규칙 id 목록. 매 호출마다 재계산한다 (P03). */
  readonly listEffectiveRuleIds: (queryDate: string) => readonly string[];
  /** 결과에 붙일 스탬프. 값은 담기지 않는다. */
  readonly stamp: () => ResultStamp;
  /** 정책 값 인출 — 유일한 값 반환 경로. */
  readonly resolveEffect: (ruleId: string, queryDate: string) => StampedResult<PolicyEffect>;
  /** 충돌 그룹 내 서열 해소 후 인출 (§5.1). */
  readonly resolveConflictGroup: (
    appliesTo: string,
    conflictGroup: string,
    queryDate: string,
  ) => StampedResult<PolicyEffect>;
}

function makeStamp(pack: LoadedPolicyPack): ResultStamp {
  const synthetic = pack.packKind === "SYNTHETIC_DEMO";
  return {
    packKind: pack.packKind,
    policySnapshotVersion: pack.policySnapshot,
    policyPackHash: pack.packHash,
    synthetic,
    notice: synthetic ? SYNTHETIC_STAMP_TEXT : null,
  } as ResultStamp;
}

/** 사양 §5.1 유효성식: status == ENACTED AND valid_from <= d AND (valid_to IS NULL OR d < valid_to) */
function isEffectiveAt(rule: PolicyRule, queryDate: string): boolean {
  if (rule.status !== "ENACTED") return false;
  if (compareLocalDate(rule.validFrom, queryDate) > 0) return false;
  if (rule.validTo !== null && compareLocalDate(queryDate, rule.validTo) >= 0) return false;
  return true;
}

function toMetadata(rule: PolicyRule): RuleMetadata {
  return {
    id: rule.id,
    status: rule.status,
    authorityType: rule.authorityType,
    appliesTo: rule.appliesTo,
    conflictGroup: rule.conflictGroup,
    validFrom: rule.validFrom,
    validTo: rule.validTo,
    hasEffect: rule.effect !== undefined,
    sourceIds: rule.sources.map((s) => s.source_id),
    // role 을 버리지 않는다 — PRIMARY 만 인용하려면 여기가 유일한 경로다 (OPEN-Q3').
    sources: rule.sources.map((s) => ({ source_id: s.source_id, role: s.role })),
    reviewApproved: rule.reviewApproved,
  };
}

export function createRegistry(pack: LoadedPolicyPack): PolicyRegistry {
  const rules = internalRulesOf(pack);
  const stamp = makeStamp(pack);

  function requireRule(ruleId: string): PolicyRule {
    const rule = rules.get(ruleId);
    if (rule === undefined) {
      reject("RULE_NOT_FOUND", `$.rules[${ruleId}]`, "정책 팩에 없는 규칙을 조회했다");
    }
    return rule;
  }

  /** 값 인출 전 게이트. 여기를 통과하지 못하면 어떤 경로로도 effect 를 못 얻는다. */
  function gate(rule: PolicyRule, queryDate: string): PolicyEffect {
    // UNVERIFIED_DRAFT 는 로딩은 정당하되 계산 진입을 막는다 (R27 · 사양 §0 문서 규칙).
    if (pack.packKind === "UNVERIFIED_DRAFT") {
      throw new UnverifiedPolicyError(
        pack.packKind,
        rule.id,
        "초안 팩의 값은 계산에 사용할 수 없다. 원문 대조·검토 승인 후 재배포하라",
      );
    }

    if (rule.status === "PROPOSED") {
      reject("RULE_NOT_ENACTED", `$.rules[${rule.id}]`, "PROPOSED 규칙은 계산에 쓸 수 없다 (참고 표시만)");
    }
    if (rule.status === "REPEALED") {
      // TODO(순서5): 과거 재현(replay) 경로. 사양 §5.1 은 REPEALED 를 과거 재현 전용으로 허용하지만,
      // 재현 컨텍스트를 구분할 입력이 순서 2 에 없다. 구분 없이 허용하면 폐지 규칙이 현재 계산에 섞인다.
      reject(
        "RULE_NOT_EFFECTIVE_AT_DATE",
        `$.rules[${rule.id}]`,
        "REPEALED 규칙은 과거 재현 전용이며 일반 조회로 인출할 수 없다",
      );
    }

    if (!isEffectiveAt(rule, queryDate)) {
      reject(
        "RULE_NOT_EFFECTIVE_AT_DATE",
        `$.rules[${rule.id}]`,
        `조회일 ${queryDate} 에 유효하지 않다 (valid_from=${rule.validFrom}, valid_to=${rule.validTo ?? "null"})`,
      );
    }

    const effect = rule.effect;
    if (effect === undefined) {
      reject("RULE_NOT_FOUND", `$.rules[${rule.id}].effect`, "effect 가 없는 규칙에서 값을 인출할 수 없다");
    }
    if (effect.value.kind === "PLACEHOLDER") {
      throw new UnverifiedPolicyError(
        pack.packKind,
        rule.id,
        `미기재 자리표시자를 계산에 쓸 수 없다: ${effect.value.raw}`,
      );
    }
    return effect;
  }

  return Object.freeze({
    describePack: () => ({
      packKind: pack.packKind,
      policySnapshot: pack.policySnapshot,
      packHash: pack.packHash,
      ruleCount: rules.size,
    }),

    describeRule: (ruleId: string) => toMetadata(requireRule(ruleId)),

    listEffectiveRuleIds: (queryDate: string) => {
      assertLocalDate(queryDate, "$.queryDate");
      // 매 호출마다 조회일 기준으로 다시 계산한다 — 팩에는 어떤 시간 상태도 쓰지 않는다.
      return [...rules.values()].filter((r) => isEffectiveAt(r, queryDate)).map((r) => r.id);
    },

    stamp: () => stamp,

    resolveEffect: (ruleId: string, queryDate: string) => {
      assertLocalDate(queryDate, "$.queryDate");
      return { value: gate(requireRule(ruleId), queryDate), stamp };
    },

    resolveConflictGroup: (appliesTo: string, conflictGroup: string, queryDate: string) => {
      assertLocalDate(queryDate, "$.queryDate");
      const path = `$.conflictGroup[${appliesTo}/${conflictGroup}]`;

      const candidates = [...rules.values()].filter(
        (r) => r.appliesTo === appliesTo && r.conflictGroup === conflictGroup && isEffectiveAt(r, queryDate),
      );
      if (candidates.length === 0) {
        reject("RULE_NOT_FOUND", path, `조회일 ${queryDate} 에 유효한 규칙이 없다`);
      }

      // 서열: 법률 → 시행령 → 시행규칙 → 공식 해석·행정안내 → 금융회사 정책 (§5.1)
      let best = authorityRank(candidates[0]!.authorityType);
      for (const c of candidates) best = Math.min(best, authorityRank(c.authorityType));
      const top = candidates.filter((c) => authorityRank(c.authorityType) === best);

      if (top.length > 1) {
        // 사양이 2차 tie-break 를 정하지 않았다 (OPEN-Q9). 근거 없는 판정을 자동화하지 않고 거절한다.
        reject(
          "UNRESOLVABLE_CONFLICT",
          path,
          `같은 서열(${top[0]!.authorityType})의 규칙이 동시에 유효하다: ${top.map((r) => r.id).join(", ")}`,
        );
      }

      return { value: gate(top[0]!, queryDate), stamp };
    },
  });
}
