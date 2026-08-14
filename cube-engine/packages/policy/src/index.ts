/**
 * @cube/policy — 사양 §13 구현 순서 2: Policy / AccountSpec / RunManifest 스키마 + 로더.
 *
 * 이 패키지에 세법 값은 없다. 값은 정책 팩에서만 오고, 로더는 불량 팩을 **보정하지 않고 거절**한다.
 * 거절 조건 전체는 docs/ORDER2-REJECTION-MATRIX.md 에 있다.
 *
 * 정책 값이 계산 경로로 나가는 유일한 통로는 PolicyRegistry.resolveEffect 계열이며,
 * 반환 타입 StampedResult<T> 의 스탬프는 brand 되어 외부에서 만들 수 없다.
 */

export { PolicyContractError, UnverifiedPolicyError, type PolicyErrorCode } from "./errors.js";

export {
  ASCII_IDENTIFIER_RE,
  AUTHORITY_TYPES,
  LIFECYCLE_STATUSES,
  MECHANISM_TYPES,
  PACK_KINDS,
  PHASE_ORDER,
  PLAN_EVENT_TYPES,
  ROUNDING_MODES,
  ROUNDING_STAGES,
  STATE_FIELDS,
  SYNTHETIC_STAMP_TEXT,
  authorityRank,
  phaseRank,
  type AuthorityType,
  type EvaluationPhase,
  type LifecycleStatus,
  type MechanismType,
  type PackKind,
  type PlanEventType,
  type StateField,
} from "./vocabulary.js";

export { assertLocalDate, compareLocalDate } from "./dates.js";

export { loadPolicyPack } from "./loadPolicyPack.js";
export { loadAccountSpecs } from "./loadAccountSpecs.js";
export { assertDeterministicOrder } from "./mechanismGraph.js";
export { REJECTION_RULES, assertOptimizationCompatible } from "./optimizationCompatibility.js";
export { createRegistry, type PolicyRegistry, type ResultStamp, type StampedResult } from "./registry.js";
export { validateFactAnswerManifest, validateRunManifest } from "./manifest.js";
export { SCHEMAS } from "./schemaValidate.js";

export type {
  AccountSpec,
  EngineCapabilities,
  FactAnswerClass,
  FactAnswerManifest,
  LoadedAccountSpecs,
  LoadedPolicyPack,
  ManifestContext,
  MechanismCapability,
  MechanismInstance,
  MechanismOptimizationProperties,
  PolicyEffect,
  PolicyRounding,
  PolicySource,
  PolicyValue,
  RunManifest,
  RuleMetadata,
} from "./types.js";
