/**
 * 순서 2 타입 — 사양 §5.1 · §5.3 · §5.6.
 *
 * 사양에 정의된 인터페이스 이름·필드명을 그대로 쓴다 (CLAUDE.md 언어·컨벤션).
 * 정책 팩 계층은 snake_case, TS 계층은 camelCase — 레이어별 표기법 고정 (사양 §5.2.1).
 */

import type { IntegerString } from "@cube/numeric";
import type {
  AuthorityType,
  EvaluationPhase,
  LifecycleStatus,
  MechanismType,
  PackKind,
  PlanEventType,
  StateField,
} from "./vocabulary.js";

// ─────────────────────────────────────────────────────────────────────────────
// 정책 팩 (snake_case — 사람이 쓰고 법령과 대조하는 계층)
// ─────────────────────────────────────────────────────────────────────────────

export interface PolicySource {
  readonly source_id: string;
  readonly role: "PRIMARY" | "IMPLEMENTING_DETAIL" | "ADMIN_INTERPRETATION";
}

/**
 * 세율·비율은 유리수, 금액·개수는 IntegerString. JSON number 는 거절된다 (OPEN-Q6).
 *
 * PLACEHOLDER 는 `<원문 대조 후 기재>` 가 남아 있는 상태다. VERIFIED_LAW 팩에서는 로딩 거절이고
 * (R20), 그 외 등급에서는 로딩은 되지만 인출 시 UnverifiedPolicyError 다 (사양 §0 문서 규칙).
 */
export type PolicyValue =
  | { readonly kind: "RATE"; readonly numerator: bigint; readonly denominator: bigint }
  | { readonly kind: "INTEGER"; readonly value: bigint }
  | { readonly kind: "PLACEHOLDER"; readonly raw: string };

export interface PolicyRounding {
  readonly stage: "PER_TRANSACTION" | "PER_YEAR" | "PER_ACCOUNT" | "FINAL_RESULT";
  readonly mode: "FLOOR" | "CEIL" | "HALF_UP" | "TRUNCATE";
  readonly unitKrw: bigint;
}

export interface PolicyEffect {
  readonly value: PolicyValue;
  /**
   * 값의 단위. **MONTHS 는 나중에 추가됐다** — 조문에 `6개월 이내` 처럼 달 단위 기한이
   * 흔한데 표현할 방법이 없어서, 초안 생성기가 그런 값을 `KRW` 로 떨어뜨렸다(실측:
   * 나이 60 이 `60 KRW` 로 승인 팩에 들어갔다). **표현할 수 없는 단위는 결국 거짓말이 된다.**
   */
  readonly unit: "RATE" | "KRW" | "COUNT" | "YEARS" | "MONTHS";
  readonly rounding?: PolicyRounding;
}

export interface PolicyRule {
  readonly id: string;
  readonly status: LifecycleStatus;
  readonly authorityType: AuthorityType;
  readonly appliesTo: string;
  readonly conflictGroup: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly jurisdiction: string;
  readonly taxYears: readonly number[];
  readonly sources: readonly PolicySource[];
  readonly reviewApproved: boolean;
  readonly effect?: PolicyEffect;
}

/**
 * 로딩을 통과한 정책 팩.
 *
 * `rules` 는 노출하지 않는다 — effect 값이 스탬프 없이 밖으로 나가는 경로를 만들지 않기 위함이다
 * (CLAUDE.md 규칙 0 · 매트릭스 R28). 값 인출은 PolicyRegistry.resolveEffect 하나뿐이다.
 */
export interface LoadedPolicyPack {
  readonly packKind: PackKind;
  readonly policySnapshot: string;
  readonly packHash: string;
  readonly ruleIds: readonly string[];
}

/** effect 값을 제외한 규칙 메타데이터. 스탬프 없이 나가도 안전한 정보만 담는다. */
export interface RuleMetadata {
  readonly id: string;
  readonly status: LifecycleStatus;
  readonly authorityType: AuthorityType;
  readonly appliesTo: string;
  readonly conflictGroup: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly hasEffect: boolean;
  readonly sourceIds: readonly string[];
  /**
   * 출처를 role 과 함께. `sourceIds` 는 호환을 위해 남기지만 **인용에는 이쪽을 써야 한다.**
   *
   * 왜 추가했나: `sourceIds` 는 role 을 버려서 "PRIMARY 출처만 인용" 이 불가능했다.
   * 사양 §5.1 은 "PRIMARY source 없이 effect 기재 불가" 를 불변식으로 두고, §4.2 는
   * 권위 서열로 해소 불가한 충돌을 거절 사유로 둔다 — 둘 다 role 을 알아야 지킬 수 있다.
   * 행정해석(ADMIN_INTERPRETATION)을 PRIMARY 인 것처럼 인용하면 근거의 등급이 조용히 올라간다.
   *
   * role 은 effect 값이 아니므로 스탬프 없이 나가도 안전하다 (이 타입의 설계 의도 유지).
   */
  readonly sources: readonly PolicySource[];
  readonly reviewApproved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// AccountSpec (camelCase — TS 계층)
// ─────────────────────────────────────────────────────────────────────────────

export interface MechanismInstance {
  readonly mechanismInstanceId: string;
  readonly mechanismType: MechanismType;
  readonly parameterRuleIds: readonly string[];
  readonly priority: number;
}

export interface AccountSpec {
  readonly accountId: string;
  readonly displayName: string;
  readonly schemaVersion: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly eligibilityRuleIds: readonly string[];
  readonly mechanismInstances: readonly MechanismInstance[];
  readonly instrumentEligibilityRuleIds: readonly string[];
  readonly supportedEvents: readonly PlanEventType[];
  readonly requiredEngineCapabilities: readonly MechanismType[];
  readonly sourceIds: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 엔진 능력 선언 (사양 §5.3.1 v1.4 + OPEN-Q4)
// ─────────────────────────────────────────────────────────────────────────────

/** 사양 §5.3.1 [v1.4 신설]. 미선언은 거절이다 — "안 적었으니 안전"으로 처리하면 검사가 무력화된다. */
export interface MechanismOptimizationProperties {
  readonly piecewiseLinear: boolean;
  readonly piecewiseMonotone: boolean;
  readonly finiteBreakpoints: boolean;
  readonly crossAccountInteraction: boolean;
  readonly pathDependent: boolean;
  readonly nonConvex: boolean;
}

/**
 * 엔진이 제공하는 정적 선언. 핸들러의 apply() 로직이 아니라 로딩 검사용 메타데이터다.
 * 사양이 이 선언의 소재를 정하지 않아 로더 입력으로 뒀다 — OPEN-Q4.
 */
export interface MechanismCapability {
  readonly mechanismType: MechanismType;
  readonly phase: EvaluationPhase;
  readonly reads: readonly StateField[];
  readonly writes: readonly StateField[];
  readonly dependsOnTypes: readonly MechanismType[];
  readonly optimizationProperties?: MechanismOptimizationProperties;
}

export interface EngineCapabilities {
  readonly engineBuildVersion: string;
  readonly mechanisms: readonly MechanismCapability[];
}

export interface LoadedAccountSpecs {
  readonly specs: readonly AccountSpec[];
  readonly accountSpecVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 매니페스트 (사양 §5.6)
// ─────────────────────────────────────────────────────────────────────────────

export interface RunManifest {
  readonly runId: string;
  readonly queryAsOf: string;
  readonly taxYear: number;
  readonly confirmedInputHash: string;

  /** 확장 — OPEN-Q7 */
  readonly packKind: PackKind;
  /** 확장 — SYNTHETIC_DEMO 일 때 필수 (R56) */
  readonly syntheticStamp?: string;

  readonly policySnapshotVersion: string;
  readonly accountSpecVersion: string;
  readonly mechanismSchemaVersion: string;
  readonly instrumentDataVersion: string;
  readonly providerRuleVersion?: string;

  readonly strategyCoverageVersion: string;
  readonly strategyTemplateVersion: string;
  readonly optimizerVersion: string;
  readonly engineBuildVersion: string;
  readonly assumptionSetVersion?: string;

  readonly parserModelVersion?: string;
  readonly parserPromptVersion?: string;
  readonly rendererTemplateVersion?: string;
  readonly rendererPromptVersion?: string;
  readonly rendererModelVersion?: string;

  readonly mydataSpecVersion?: string;
  readonly mydataRetrievedAt?: string;
  readonly mydataConsentScope?: readonly string[];

  readonly createdAt: string;
}

export type FactAnswerClass = "REGISTRY_RESOLVED_FACT" | "UNMODELED_OFFICIAL_SOURCE";

export interface FactAnswerManifest {
  readonly queryAsOf: string;
  readonly confirmedInputHash?: string;
  readonly policySnapshotVersion: string;
  readonly factResolverVersion: string;
  readonly answerClass: FactAnswerClass;
  readonly resolvedRuleIds: readonly string[];
  readonly sourceSnapshotIds: readonly string[];
  readonly sourceHashes: readonly string[];
  readonly ragIndexVersion?: string;
  readonly rendererTemplateVersion: string;
  readonly rendererModelVersion?: string;
  readonly answerPayloadHash: string;

  /**
   * [확장 — OPEN-Q2'] 사양 §5.6 원문에는 없다. `RunManifest` 와 같은 방식으로 **추가**했다
   * (개명·삭제 없음).
   *
   * 왜 필요한가: CLAUDE.md 규칙 0 은 합성 값 결과의 **모든 출력**에 스탬프를 요구하는데,
   * FACT 경로에는 스탬프가 앉을 자리가 없었다. 응답 봉투에만 실으면 **보관된 매니페스트만
   * 봐서는 그 답이 합성 세법 값에서 나왔는지 알 수 없다** — 사양 §1.3 이 재현성의 단위를
   * 매니페스트로 정의했으므로 매니페스트도 출력이다.
   *
   * ⚠️ `answerPayloadHash` 계산에 이 필드가 **포함돼야** 한다. 밖에 두면 스탬프만
   * 갈아끼운 위조가 해시 검증을 통과한다.
   */
  readonly packKind?: PackKind;
  readonly syntheticStamp?: string;
}

/** 매니페스트 검증 컨텍스트 — ③ 전망 산출 여부는 매니페스트 자신이 알 수 없다 (§5.6). */
export interface ManifestContext {
  readonly producesProjection: boolean;
}

// IntegerString 은 경계 표현에서만 쓴다. 내부는 bigint (사양 §5.2).
export type { IntegerString };
