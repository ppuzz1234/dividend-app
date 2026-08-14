/**
 * Fact Resolver — 사양 §1.2 의 FACT 2클래스를 실제 응답으로.
 *
 * ## 순서가 곧 설계다
 * ```
 * 1. Registry 에서 조회일 유효 규칙을 찾는다        ← RAG 를 거치지 않는다
 * 2. 있으면  → REGISTRY_RESOLVED_FACT
 * 3. 없으면  → 조문 묶음을 조립해 UNMODELED_OFFICIAL_SOURCE
 * 4. 코퍼스에도 없으면 → 거절
 * ```
 * `resolveFromRegistry` 는 **검색 결과 타입을 인자로 받지 않는다.** RAG 가 rule 선택에
 * 영향을 주는 경로가 타입 레벨로 존재하지 않아야 사양 §1.1("RAG 는 팩트를 결정하지 않는다")이
 * 코드로 보장된다.
 */

import { canonicalHash } from "@cube/numeric";

import { findUnsourcedAmounts } from "./amounts.js";
import type { AmountIssue } from "./amounts.js";
import { findComputedAmounts, findDerivedAmounts } from "./arithmetic.js";
import type { ArithmeticIssue } from "./arithmetic.js";
import type { Bundle, BundleItem } from "./bundle.js";
import { checkCoverage } from "./coverage.js";
import type { CoverageReport } from "./coverage.js";
import { hasForgedCitation, normalizeCitations, verifyCitations } from "./verifyCite.js";
import type { CiteReport } from "./verifyCite.js";

/** 사양 §1.2 표준 문안 — 토씨 하나 바꾸지 않는다. */
export const UNMODELED_NOTICE =
  "관련 공식 조문은 확인됐지만, 해당 사안은 아직 큐브의 검증된 정책 규칙으로 모델링되지 않았습니다. " +
  "원문 근거와 시행일은 아래와 같으며, 개인별 계산에는 적용하지 않습니다.";

export type FactAnswerClass = "REGISTRY_RESOLVED_FACT" | "UNMODELED_OFFICIAL_SOURCE";

/** 사양 §4.4 금지 문구. 렌더러가 LLM 이면 프롬프트만으로는 못 막으므로 출력에서 검사한다. */
const FORBIDDEN_PHRASES = ["평생", "세후", "실수령액", "최소 저축액", "가장 최적의"] as const;

export interface FactAnswer {
  readonly answerClass: FactAnswerClass;
  /** 사용자에게 보여줄 본문 (문장마다 `[n]`) */
  readonly text: string;
  /** §1.2 표준 문안 — UNMODELED 일 때만 */
  readonly notice: string | null;
  /** 근거 조문 — 원문 병기용. **요약하지 않는다.** */
  readonly citations: readonly BundleItem[];
  /** REGISTRY_RESOLVED_FACT 면 필수, UNMODELED 면 빈 배열 (§1.2) */
  readonly resolvedRuleIds: readonly string[];
  /** 개인 상황 적용 가능 여부 — UNMODELED 는 항상 false (§1.2) */
  readonly personalApplicationAllowed: boolean;
  /** PLAN 엔진 입력 가능 여부 — UNMODELED 는 항상 false (§1.2) */
  readonly planEngineInputAllowed: boolean;
  readonly citeReport: CiteReport;
  readonly coverageReport: CoverageReport;
  /** 사양 §4.4 위반 문구 (있으면 내보내면 안 된다) */
  readonly forbiddenPhrases: readonly string[];
  /**
   * 답변에 나왔는데 **인용 조문 원문에는 없는 금액**.
   *
   * 실측으로 잡은 것: 답이 `1,200만원` 을 말했는데 원문에는 `900만원` 까지만 있었다(§86의4).
   * 위조 인용도 아니고 조건 앵커도 통과한 답이었다 — **형식이 아니라 값이 틀린 경우**다.
   * 다만 규칙 10 이 예시용 가정 금액을 허용하므로 **오류 판정이 아니라 경고**다.
   */
  readonly unsourcedAmounts: readonly AmountIssue[];
  /**
   * 답변이 **계산해서 낸 금액** (규칙 10 · 절대 규칙 3 위반).
   *
   * 위조 인용도 미확인 금액도 아니다 — 재료가 전부 근거 있는 값이라 **두 검사를 다 통과한다.**
   * 그런데 결과 숫자는 어느 조문에도 없어서 되짚을 수가 없다. 실측으로 Haiku 가
   * `2,000만원의 10% = 200만원` 을 냈고, 그 답은 위조 0 · 앵커 100% 로 통과했다.
   */
  readonly computedAmounts: readonly ArithmeticIssue[];
  readonly answerPayloadHash: string;
}

export interface RejectResult {
  readonly rejected: true;
  readonly reason: string;
  readonly message: string;
}

export type ResolveResult = FactAnswer | RejectResult;

export function isRejected(r: ResolveResult): r is RejectResult {
  return "rejected" in r;
}

/**
 * 조문 묶음 + 생성된 답변 → 검증된 FactAnswer.
 *
 * 검증을 여기서 하는 이유: LLM 호출부(`answer.ts`)와 분리해야 스텁으로 테스트할 수 있고,
 * "생성"과 "검증"이 한 함수에 있으면 검증을 건너뛰는 경로가 생긴다.
 */
export function buildUnmodeledAnswer(query: string, bundle: Bundle, raw: string): FactAnswer {
  // ★ 표기 변형을 먼저 표준형으로 되돌린다 — 항·호를 덧붙인 인용은 우리 정규식이 못 읽어
  //   **인용이 통째로 사라진다**(실측: Haiku 한 답에서 10건). 조문 번호는 그대로 두므로
  //   잃는 정보가 없고, 지어내는 것도 없다 (verifyCite.normalizeCitations).
  const generated = normalizeCitations(raw);
  // ★ 상한이 아니라 **실제 ref 목록**을 넘긴다. 대화 안에서 번호를 고정하면
  //   묶음의 ref 가 1..N 연속이 아니게 되기 때문이다 (conversation.ts 참조).
  const citeReport = verifyCitations(generated, bundle.items.map((i) => i.ref));
  const coverageReport = checkCoverage(generated, bundle.items, citeReport.usedRefs);
  const forbidden = FORBIDDEN_PHRASES.filter((p) => generated.includes(p));

  // 인용된 조문만 근거로 싣는다 — 안 쓴 조문을 출처로 달면 근거를 부풀리는 것이다.
  // (A1 의 `_name_in_text` 와 같은 규율: 답에 등장한 것만 출처로.)
  const cited = bundle.items.filter((i) => citeReport.usedRefs.includes(i.ref));

  const payload = {
    query,
    answerClass: "UNMODELED_OFFICIAL_SOURCE",
    text: generated,
    sourceIds: cited.map((c) => c.sourceId),
    sourceHashes: cited.map((c) => c.textHash),
  };

  return {
    answerClass: "UNMODELED_OFFICIAL_SOURCE",
    text: generated,
    notice: UNMODELED_NOTICE,
    citations: cited,
    resolvedRuleIds: [], // §1.2 — UNMODELED 는 반드시 빈 배열
    personalApplicationAllowed: false,
    planEngineInputAllowed: false,
    citeReport,
    coverageReport,
    forbiddenPhrases: forbidden,
    // 인용한 조문만 대조한다 — 묶음 전체를 넣으면 "있으니 근거가 있다"가 되어 검사가 헐거워진다.
    unsourcedAmounts: findUnsourcedAmounts(generated, cited.map((c) => c.text)),
    computedAmounts: [
      ...findComputedAmounts(generated),
      // 등호를 안 쓰고 결과만 낸 경우 — 형태가 아니라 **값**으로 잡는다.
      ...findDerivedAmounts(generated, findUnsourcedAmounts(generated, cited.map((c) => c.text)).map((u) => u.asWritten)),
    ],
    answerPayloadHash: canonicalHash(payload),
  };
}

/** 내보내도 되는 답변인가 — 위조 인용·금지 문구가 있으면 안 된다. */
export function isPublishable(a: FactAnswer): boolean {
  // ★ 계산한 금액이 있으면 못 내보낸다. 사양 §1.1 이 계산을 승인된 규칙 위로 못박은 이상,
  //   LLM 이 낸 계산 결과는 **근거를 댈 수 없는 숫자**다 — 위조 인용과 같은 급이다.
  return (
    !hasForgedCitation(a.citeReport) && a.forbiddenPhrases.length === 0 && a.computedAmounts.length === 0
  );
}

/** 코퍼스에서도 근거를 못 찾았을 때 (사양 §4.2). */
export function reject(reason: string): RejectResult {
  return {
    rejected: true,
    reason,
    message:
      "제공 가능한 공식 조문에서 해당 내용을 확인하지 못했습니다. " +
      "큐브는 수집·검증된 법령 범위 안에서만 답변하며, 범위 밖은 답하지 않습니다.",
  };
}
