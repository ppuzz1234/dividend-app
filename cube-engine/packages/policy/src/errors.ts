/**
 * 순서 2 오류 계약 — docs/ORDER2-REJECTION-MATRIX.md 참조.
 *
 * 로딩 시점 불변식 위반은 전부 PolicyContractError 다. 부분 로딩은 없다 — 첫 위반에서 throw 한다.
 * 미검증 값을 계산 경로로 인출하려는 시도만 UnverifiedPolicyError 로 구분한다(사양 §0 · §5.2.1).
 */

/** 매트릭스의 code 열과 1:1 대응한다. 새 code 를 추가하면 매트릭스에도 행을 추가해야 한다. */
export type PolicyErrorCode =
  // A. 정책 팩 / 규칙 (§5.1)
  | "PACK_KIND_MISSING"
  | "PACK_KIND_INVALID"
  | "SNAPSHOT_VERSION_MISSING"
  | "DUPLICATE_RULE_ID"
  | "EFFECT_WITHOUT_PRIMARY_SOURCE"
  | "EMPTY_SOURCES"
  /**
   * 규칙이 인용한 `source_id` 가 코퍼스에 없다 (R33).
   * 로더는 지금까지 **팩 내부 참조**만 봤다 — `sources` 에 선언된 id 를 `field_bindings` 가
   * 쓰는지. 그 id 가 **실제 조문을 가리키는지**는 아무도 검사하지 않아, 존재하지 않는 조문을
   * 근거로 든 규칙이 통과했다. 이 검사는 두 미션을 잇는 이음매(정책 팩 source_id == 코퍼스
   * ArticleSnapshot.sourceId)를 기계적으로 지킨다.
   */
  | "SOURCE_SNAPSHOT_NOT_FOUND"
  | "DANGLING_FIELD_BINDING"
  | "LIFECYCLE_STATUS_INVALID"
  | "TEMPORAL_STATE_STORED"
  | "AUTHORITY_TYPE_INVALID"
  | "VALID_FROM_MISSING"
  | "DATE_FORMAT_INVALID"
  | "DATE_NOT_A_CALENDAR_DATE"
  | "EMPTY_VALIDITY_INTERVAL"
  | "ROUNDING_SPEC_INCOMPLETE"
  | "ROUNDING_UNIT_NOT_POSITIVE"
  | "ROUNDING_ENUM_INVALID"
  | "FLOAT_IN_POLICY_VALUE"
  | "RATE_DENOMINATOR_NOT_POSITIVE"
  | "PLACEHOLDER_IN_VERIFIED_PACK"
  | "SCOPE_INCOMPLETE"
  | "UNSAFE_INTEGER"
  | "UNKNOWN_FIELD"
  | "UNRESOLVABLE_CONFLICT"
  // B. pack_kind
  | "VERIFIED_PACK_HAS_UNAPPROVED_RULE"
  | "VERIFIED_PACK_MISSING_REVIEW_SIGNATURE"
  | "SYNTHETIC_PACK_CLAIMS_APPROVAL"
  // C. AccountSpec (§5.3.1~5.3.2)
  | "IDENTIFIER_NOT_ASCII"
  | "NON_ASCII_KEY_IN_PACK"
  | "DUPLICATE_ACCOUNT_ID"
  | "CAPABILITY_NOT_SUPPORTED"
  | "UNDECLARED_MECHANISM_TYPE"
  | "MECHANISM_TYPE_UNKNOWN"
  | "DUPLICATE_MECHANISM_INSTANCE_ID"
  | "DANGLING_RULE_REFERENCE"
  | "PLAN_EVENT_TYPE_UNKNOWN"
  // D. 최적화 성질 호환성 (§5.3.1 v1.4)
  | "OPTIMIZATION_PROPERTIES_MISSING"
  | "UNSUPPORTED_OPTIMIZATION_PROPERTIES"
  // E. 메커니즘 그래프 (§5.3.3~5.3.4)
  | "DEPENDENCY_CYCLE"
  | "MISSING_PREREQUISITE_INSTANCE"
  | "CONCURRENT_WRITE_SAME_PHASE"
  | "ORDER_UNDETERMINED"
  // F/G. 매니페스트 (§5.6)
  | "MANIFEST_FIELD_MISSING"
  | "ASSUMPTION_SET_REQUIRED_FOR_PROJECTION"
  | "HASH_FORMAT_INVALID"
  | "SYNTHETIC_STAMP_REQUIRED"
  | "RESOLVED_RULE_IDS_REQUIRED"
  | "RESOLVED_RULE_IDS_MUST_BE_EMPTY"
  | "SOURCE_HASH_PAIRING_MISMATCH"
  // H. Registry 조회 (§5.1)
  | "RULE_NOT_ENACTED"
  | "RULE_NOT_EFFECTIVE_AT_DATE"
  | "RULE_NOT_FOUND"
  // 구조 검증 backstop
  | "SCHEMA_VIOLATION";

export class PolicyContractError extends Error {
  readonly code: PolicyErrorCode;
  /** 위반 지점의 경로 (`$.rules[2].effect.rounding.unit_krw` 형태). 감사 로그에 그대로 남는다. */
  readonly path: string;

  constructor(code: PolicyErrorCode, path: string, detail: string) {
    super(`[${code}] ${path}: ${detail}`);
    this.name = "PolicyContractError";
    this.code = code;
    this.path = path;
  }
}

/**
 * 미검증 정책 값을 계산 경로로 인출하려는 시도.
 *
 * 로딩 실패와 구분하는 이유: UNVERIFIED_DRAFT 팩은 **로딩 자체는 정당하다**(초안 검토·스키마 확인 용도).
 * 막아야 하는 것은 그 값이 계산에 들어가 결과가 사실을 참칭하는 순간이다.
 */
export class UnverifiedPolicyError extends Error {
  readonly packKind: string;
  readonly ruleId: string;

  constructor(packKind: string, ruleId: string, detail: string) {
    super(`[UnverifiedPolicyError] pack_kind=${packKind} rule=${ruleId}: ${detail}`);
    this.name = "UnverifiedPolicyError";
    this.packKind = packKind;
    this.ruleId = ruleId;
  }
}

export function reject(code: PolicyErrorCode, path: string, detail: string): never {
  throw new PolicyContractError(code, path, detail);
}
