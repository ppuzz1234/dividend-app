/**
 * 닫힌 어휘 — 사양 §5.1 · §5.3.1 · §5.3.3.
 *
 * 전부 닫힌 집합으로 둔다. 열린 문자열로 두면 오타난 값이 검사를 조용히 통과한다
 * (예: 오타난 StateField 는 동시 쓰기 충돌 검사 R49 를 무력화한다).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 정책 팩 등급 (CLAUDE.md 절대 규칙 0)
// 사양 v1.4 본문에는 없다 — docs/ORDER2-OPEN-QUESTIONS.md Q1 참조.
// ─────────────────────────────────────────────────────────────────────────────

export const PACK_KINDS = ["VERIFIED_LAW", "SYNTHETIC_DEMO", "UNVERIFIED_DRAFT"] as const;
export type PackKind = (typeof PACK_KINDS)[number];

/** CLAUDE.md 규칙 0 의 문구. 테스트는 이 상수를 참조한다 (OPEN-Q10). */
export const SYNTHETIC_STAMP_TEXT = "합성 세법 값 · 실제 세법이 아님";

// ─────────────────────────────────────────────────────────────────────────────
// 규칙 생애주기·권위 (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

export const LIFECYCLE_STATUSES = ["PROPOSED", "ENACTED", "REPEALED"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

/**
 * 서열: 법률 → 시행령 → 시행규칙 → 공식 해석·행정안내 → 금융회사 정책 (§5.1).
 * 배열 순서가 곧 우선순위이며, 인덱스가 작을수록 상위다.
 */
export const AUTHORITY_TYPES = [
  "STATUTE",
  "DECREE",
  "RULE",
  "ADMIN_GUIDANCE",
  "PROVIDER_POLICY",
] as const;
export type AuthorityType = (typeof AUTHORITY_TYPES)[number];

export function authorityRank(type: AuthorityType): number {
  return AUTHORITY_TYPES.indexOf(type);
}

// ─────────────────────────────────────────────────────────────────────────────
// 반올림 (§5.2) — 값이 아니라 어휘만. 값은 정책 팩에서 온다.
// ─────────────────────────────────────────────────────────────────────────────

export const ROUNDING_STAGES = ["PER_TRANSACTION", "PER_YEAR", "PER_ACCOUNT", "FINAL_RESULT"] as const;
export const ROUNDING_MODES = ["FLOOR", "CEIL", "HALF_UP", "TRUNCATE"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 성질 어휘 (§5.3.1 표) — 18종
// ─────────────────────────────────────────────────────────────────────────────

export const MECHANISM_TYPES = [
  "CONTRIBUTION_LIMIT",
  "CARRYOVER",
  "TAX_CREDIT",
  "TAX_EXEMPTION",
  "EXCESS_SEPARATE_TAX",
  "TAX_DEFERRAL",
  "WITHDRAWAL_LOCK",
  "WITHDRAWAL_ORDER",
  "PENSION_WITHDRAWAL_TAX",
  "MATURITY",
  "ACCOUNT_CONVERSION",
  "INSTRUMENT_GATE",
  "DIVIDEND_DISTRIBUTION_TAX",
  "TAXABLE_SALE_TAX",
  "FINANCIAL_INCOME_AGGREGATION",
  "WITHDRAWAL_PLAN",
  "INVESTMENT_FEE",
  "TRANSACTION_COST",
] as const;
export type MechanismType = (typeof MECHANISM_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// 실행 단계 (§5.3.3) — union 선언 순서가 실행 순서를 보장하지 않으므로 상수로 고정
// ─────────────────────────────────────────────────────────────────────────────

export const PHASE_ORDER = [
  "ELIGIBILITY",
  "CONTRIBUTION",
  "TAX_BENEFIT",
  "GROWTH",
  "TRANSFER",
  "WITHDRAWAL_ORDER",
  "WITHDRAWAL_TAX",
  "SETTLEMENT",
] as const;
export type EvaluationPhase = (typeof PHASE_ORDER)[number];

export function phaseRank(phase: EvaluationPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO(순서3): StateField 와 PlanEventType 은 사양 v1.4 에 정의가 없다 (OPEN-Q5).
// 아래는 순서 2 로더 검사(동시 쓰기·supportedEvents 열거)에 필요한 최소 잠정 집합이며,
// 순서 3 에서 상태 모델·정렬 키를 구현할 때 확정된다. 열린 문자열로 두지 않은 이유는
// 오타난 필드명이 동시 쓰기 충돌 검사(R49)를 조용히 통과하는 것을 막기 위함이다.
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_FIELDS = [
  "accountBalance",
  "contributionRoom",
  "ytdContribution",
  "taxCreditApplied",
  "moneyBuckets",
  "lockedRatio",
  "realizedGain",
  "withheldTax",
  "cashflow",
  "feeAccrued",
] as const;
export type StateField = (typeof STATE_FIELDS)[number];

export const PLAN_EVENT_TYPES = [
  "CONTRIBUTION",
  "WITHDRAWAL",
  "MATURITY",
  "TRANSFER",
  "DISTRIBUTION",
  "SALE",
  "YEAR_END",
] as const;
export type PlanEventType = (typeof PLAN_EVENT_TYPES)[number];

// ─────────────────────────────────────────────────────────────────────────────

/** canonical JSON key 가 되는 식별자 규칙 (§5.3.2 · §5.2.1). */
export const ASCII_IDENTIFIER_RE = /^[A-Za-z0-9_]+$/;

/**
 * rule id 는 `PENSION.TAX_CREDIT.RATE.LOW_INCOME` 처럼 점 구분 계층을 쓴다(§5.1 예시).
 * key 로 쓰이지 않으므로 점을 허용하되, 그 외 비ASCII 는 막는다.
 */
export const RULE_ID_RE = /^[A-Za-z0-9_.]+$/;

export function isMechanismType(v: unknown): v is MechanismType {
  return typeof v === "string" && (MECHANISM_TYPES as readonly string[]).includes(v);
}

export function isPlanEventType(v: unknown): v is PlanEventType {
  return typeof v === "string" && (PLAN_EVENT_TYPES as readonly string[]).includes(v);
}

export function isStateField(v: unknown): v is StateField {
  return typeof v === "string" && (STATE_FIELDS as readonly string[]).includes(v);
}
