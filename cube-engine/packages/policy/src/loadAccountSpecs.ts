/**
 * AccountSpec 로더 — 사양 §5.3.1 (커버리지·최적화 성질 검사) · §5.3.2 · §5.3.3.
 * 거절 조건은 docs/ORDER2-REJECTION-MATRIX.md C·D·E 절과 1:1 대응한다.
 */

import { assertLocalDate, compareLocalDate } from "./dates.js";
import { reject } from "./errors.js";
import { internalRulesOf } from "./loadPolicyPack.js";
import { assertMechanismGraph } from "./mechanismGraph.js";
import { assertOptimizationCompatible } from "./optimizationCompatibility.js";
import { SCHEMAS, assertSchema } from "./schemaValidate.js";
import type {
  AccountSpec,
  EngineCapabilities,
  LoadedAccountSpecs,
  LoadedPolicyPack,
  MechanismCapability,
  MechanismInstance,
} from "./types.js";
import {
  ASCII_IDENTIFIER_RE,
  isMechanismType,
  isPlanEventType,
  type MechanismType,
  type PlanEventType,
} from "./vocabulary.js";

function indexCapabilities(engine: EngineCapabilities): ReadonlyMap<MechanismType, MechanismCapability> {
  const map = new Map<MechanismType, MechanismCapability>();
  engine.mechanisms.forEach((cap, i) => {
    assertOptimizationCompatible(cap, `$.engine.mechanisms[${i}]`);
    map.set(cap.mechanismType, cap);
  });
  return map;
}

function parseSpec(
  raw: unknown,
  path: string,
  knownRuleIds: ReadonlySet<string>,
  caps: ReadonlyMap<MechanismType, MechanismCapability>,
): AccountSpec {
  assertSchema(SCHEMAS.accountSpec, raw, path);
  const obj = raw as Record<string, unknown>;

  // ── 식별자 ASCII (R30) ─────────────────────────────────────────────────────
  const accountId = obj["accountId"] as string;
  if (!ASCII_IDENTIFIER_RE.test(accountId)) {
    reject(
      "IDENTIFIER_NOT_ASCII",
      `${path}.accountId`,
      `canonical JSON key 가 되는 식별자는 [A-Za-z0-9_] 만 허용된다. 한글 명칭은 displayName 에 두라: ${accountId}`,
    );
  }

  // ── 유효 구간 (R39) ────────────────────────────────────────────────────────
  const effectiveFrom = assertLocalDate(obj["effectiveFrom"], `${path}.effectiveFrom`);
  const effectiveToRaw = obj["effectiveTo"];
  const effectiveTo =
    effectiveToRaw === undefined || effectiveToRaw === null
      ? undefined
      : assertLocalDate(effectiveToRaw, `${path}.effectiveTo`);
  if (effectiveTo !== undefined && compareLocalDate(effectiveTo, effectiveFrom) <= 0) {
    reject(
      "EMPTY_VALIDITY_INTERVAL",
      `${path}.effectiveTo`,
      `effectiveTo 는 effectiveFrom 보다 커야 한다: ${effectiveFrom} → ${effectiveTo}`,
    );
  }

  // ── 출처 (R42) ─────────────────────────────────────────────────────────────
  const sourceIds = obj["sourceIds"] as string[];
  if (sourceIds.length === 0) {
    reject("EMPTY_SOURCES", `${path}.sourceIds`, "계좌 spec 도 출처 없이는 근거를 제시할 수 없다");
  }

  // ── 커버리지 검사 (R33·R35) ────────────────────────────────────────────────
  const requiredRaw = obj["requiredEngineCapabilities"] as string[];
  const required: MechanismType[] = [];
  requiredRaw.forEach((t, i) => {
    if (!isMechanismType(t)) {
      reject(
        "MECHANISM_TYPE_UNKNOWN",
        `${path}.requiredEngineCapabilities[${i}]`,
        `성질 어휘(사양 §5.3.1)에 없는 MechanismType: ${t}`,
      );
    }
    if (!caps.has(t)) {
      reject(
        "CAPABILITY_NOT_SUPPORTED",
        `${path}.requiredEngineCapabilities[${i}]`,
        `엔진이 지원하지 않는 성질이다. 부분 계산 없이 로딩을 거절한다: ${t}`,
      );
    }
    required.push(t);
  });
  const declared = new Set(required);

  // ── 이벤트 어휘 (R40) ──────────────────────────────────────────────────────
  const supportedEventsRaw = obj["supportedEvents"] as string[];
  const supportedEvents: PlanEventType[] = [];
  supportedEventsRaw.forEach((e, i) => {
    if (!isPlanEventType(e)) {
      reject("PLAN_EVENT_TYPE_UNKNOWN", `${path}.supportedEvents[${i}]`, `열거 밖 이벤트: ${e}`);
    }
    supportedEvents.push(e);
  });

  // ── 인스턴스 (R34·R35·R36·R41) ─────────────────────────────────────────────
  const instancesRaw = obj["mechanismInstances"] as Record<string, unknown>[];
  const instances: MechanismInstance[] = [];
  const seenInstanceIds = new Set<string>();

  instancesRaw.forEach((instRaw, i) => {
    const ipath = `${path}.mechanismInstances[${i}]`;
    const instanceId = instRaw["mechanismInstanceId"] as string;
    const type = instRaw["mechanismType"] as string;
    const priority = instRaw["priority"] as number;

    if (!isMechanismType(type)) {
      reject("MECHANISM_TYPE_UNKNOWN", `${ipath}.mechanismType`, `성질 어휘에 없다: ${type}`);
    }
    if (!declared.has(type)) {
      reject(
        "UNDECLARED_MECHANISM_TYPE",
        `${ipath}.mechanismType`,
        `requiredEngineCapabilities 에 선언되지 않은 성질을 인스턴스로 갖고 있다 — 커버리지 검사를 우회한다: ${type}`,
      );
    }
    if (seenInstanceIds.has(instanceId)) {
      reject(
        "DUPLICATE_MECHANISM_INSTANCE_ID",
        `${ipath}.mechanismInstanceId`,
        `정렬 키의 최종 tie-breaker 가 유일하지 않다: ${instanceId}`,
      );
    }
    seenInstanceIds.add(instanceId);

    if (!Number.isSafeInteger(priority)) {
      reject("UNSAFE_INTEGER", `${ipath}.priority`, `안전 정수여야 한다: ${priority}`);
    }

    const parameterRuleIds = instRaw["parameterRuleIds"] as string[];
    parameterRuleIds.forEach((rid, j) => {
      if (!knownRuleIds.has(rid)) {
        reject(
          "DANGLING_RULE_REFERENCE",
          `${ipath}.parameterRuleIds[${j}]`,
          `정책 팩에 없는 규칙을 참조한다: ${rid}`,
        );
      }
    });

    instances.push({ mechanismInstanceId: instanceId, mechanismType: type, parameterRuleIds, priority });
  });

  // ── 자격·편입 규칙 참조 (R38) ──────────────────────────────────────────────
  for (const field of ["eligibilityRuleIds", "instrumentEligibilityRuleIds"] as const) {
    const ids = obj[field] as string[];
    ids.forEach((rid, j) => {
      if (!knownRuleIds.has(rid)) {
        reject("DANGLING_RULE_REFERENCE", `${path}.${field}[${j}]`, `정책 팩에 없는 규칙: ${rid}`);
      }
    });
  }

  const spec: AccountSpec = {
    accountId,
    displayName: obj["displayName"] as string,
    schemaVersion: obj["schemaVersion"] as string,
    effectiveFrom,
    ...(effectiveTo === undefined ? {} : { effectiveTo }),
    eligibilityRuleIds: obj["eligibilityRuleIds"] as string[],
    mechanismInstances: instances,
    instrumentEligibilityRuleIds: obj["instrumentEligibilityRuleIds"] as string[],
    supportedEvents,
    requiredEngineCapabilities: required,
    sourceIds,
  };

  // ── 그래프 불변식 (R47·R48·R49·R50) ────────────────────────────────────────
  assertMechanismGraph(spec, caps, path);

  return spec;
}

export function loadAccountSpecs(
  raws: readonly unknown[],
  pack: LoadedPolicyPack,
  engine: EngineCapabilities,
  accountSpecVersion: string,
): LoadedAccountSpecs {
  const caps = indexCapabilities(engine);
  const knownRuleIds = new Set(internalRulesOf(pack).keys());

  const specs: AccountSpec[] = [];
  const seenAccountIds = new Set<string>();

  raws.forEach((raw, i) => {
    const path = `$.accountSpecs[${i}]`;
    const spec = parseSpec(raw, path, knownRuleIds, caps);
    if (seenAccountIds.has(spec.accountId)) {
      reject("DUPLICATE_ACCOUNT_ID", `${path}.accountId`, `계좌 조회가 비결정적이 된다: ${spec.accountId}`);
    }
    seenAccountIds.add(spec.accountId);
    specs.push(spec);
  });

  return { specs, accountSpecVersion };
}
