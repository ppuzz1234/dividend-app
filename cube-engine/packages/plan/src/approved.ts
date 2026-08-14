/**
 * 조문 → **그 조문에 걸린 승인 규칙**을 인출한다 (사양 §1.2 의 ① REGISTRY_RESOLVED_FACT 재료).
 *
 * ## 왜 이게 §1.1 을 어기지 않나
 * 사양 §1.1 은 "RAG 는 팩트를 결정하지 않는다"이지, "RAG 결과를 쳐다보지도 마라"가 아니다.
 * 여기서 갈리는 두 역할을 분명히 해 둔다:
 *
 * ```
 * RAG        →  어느 조문을 볼 것인가            (라우팅)
 * Registry   →  그 조문의 값이 무엇인가          (판정)
 * ```
 *
 * 값은 `resolveEffect` 하나로만 나온다 — 검색 점수도, LLM 문장도 값에 손대지 못한다.
 * 그래서 RAG 가 **틀리면** 나오는 실패는 "엉뚱한 조문의 정확한 값"이지 **지어낸 값이 아니다.**
 * 그 둘의 차이가 이 시스템의 전부다. (`resolve.ts` 의 `resolveFromRegistry` 가 검색 결과
 * **타입**을 못 받게 막아 둔 것은 그대로다 — 여기는 조문 id 문자열만 받는다.)
 *
 * ## 왜 인용된 조문이 아니라 묶음 전체를 보나
 * 인용은 **LLM 이 고른 것**이다. 거기에 맞춰 ① 을 고르면 LLM 이 ① 을 결정하게 된다.
 * ① 은 LLM 과 독립이어야 하므로 **검색이 가져온 조문 전부**를 본다.
 *
 * ## 단위를 해석하지 않는다
 * 값은 팩이 적은 그대로 보여준다(자릿수 구분만). `18000000` 을 `1,800만원` 으로 바꾸려면
 * "이건 원 단위다"를 내가 판단해야 하는데, 그 판단의 근거는 팩의 `unit` 뿐이고
 * **팩이 틀렸을 때 내가 틀린 것을 예쁘게 확정해 버린다.** 단위는 코드 그대로 옆에 붙인다.
 */

import type { PolicyRegistry } from "@cube/policy";

/** 조회 대상 조문 — id 와 **사람이 읽을 이름**. */
export interface SourceRef {
  readonly sourceId: string;
  /** `소득세법 시행령 제40조의2 (연금계좌 등)` 같은 표시용 이름. */
  readonly label: string;
}

/** 조문 하나에 걸린 승인 규칙 하나. */
export interface ApprovedFact {
  readonly ruleId: string;
  /** 이 값을 떠받치는 조문 id — 화면의 근거 카드와 이어진다. */
  readonly sourceIds: readonly string[];
  /**
   * 근거 조문의 읽을 수 있는 이름.
   *
   * ★ id 만 보이면 **엉뚱한 주제로 읽힌다.** 실측: ISA 질문의 묶음에도 `INCTAX_D_40_2`
   * (연금계좌 등)가 들어가는데, 거기 걸린 `60 YEARS`(주택양도 나이)가 id 만 달고 뜨니
   * ISA 요건처럼 보였다. 이름이 붙으면 "아, 연금계좌 조문 값이구나"가 바로 읽힌다.
   */
  readonly sourceLabels: readonly string[];
  /** 팩에 적힌 값 그대로 (자릿수 구분만). */
  readonly display: string;
  /** `KRW` · `RATE` · `COUNT` · `YEARS` — 팩이 적은 단위 코드. */
  readonly unit: string;
  readonly validFrom: string;
  readonly authorityType: string;
}

export interface ApprovedFacts {
  readonly packKind: string;
  readonly policySnapshot: string;
  readonly packHash: string;
  readonly facts: readonly ApprovedFact[];
}

/** 값 표시. **해석하지 않는다** — 자릿수 구분과 분수 표기가 전부다. */
function display(v: { kind: string; value?: bigint; numerator?: bigint; denominator?: bigint; raw?: string }): string | null {
  if (v.kind === "INTEGER" && v.value !== undefined) return v.value.toLocaleString("ko-KR");
  if (v.kind === "RATE" && v.numerator !== undefined && v.denominator !== undefined) {
    return `${v.numerator.toLocaleString("ko-KR")}/${v.denominator.toLocaleString("ko-KR")}`;
  }
  // PLACEHOLDER 는 gate 가 이미 막지만, 여기까지 오면 **보여주지 않는다.** 미확정 값은 값이 아니다.
  return null;
}

/**
 * 주어진 조문 id 들에 걸린 **승인·유효** 규칙을 모은다.
 *
 * 하나도 없으면 `facts: []` 로 돌려준다 — `null` 이 아니다. *"이 조문엔 승인 규칙이 0개"*
 * 라는 사실 자체가 사람이 채워야 할 빈칸을 가리키므로 화면에서 말해야 한다.
 */
export function approvedFactsFor(
  registry: PolicyRegistry | null,
  sources: readonly SourceRef[],
  queryAsOf: string,
): ApprovedFacts | null {
  if (registry === null) return null;
  const wanted = new Map(sources.map((s) => [s.sourceId, s.label]));
  const pack = registry.describePack();
  const facts: ApprovedFact[] = [];

  for (const ruleId of registry.listEffectiveRuleIds(queryAsOf)) {
    const meta = registry.describeRule(ruleId);
    // ★ 승인 안 된 규칙은 값이 있어도 쓰지 않는다. `gate` 는 status·시행일만 보므로
    //   승인 여부는 여기서 직접 확인한다 — 검사는 겹쳐도 손해가 없다.
    if (!meta.reviewApproved) continue;
    const hit = meta.sourceIds.filter((s) => wanted.has(s));
    if (hit.length === 0) continue;

    let effect;
    try {
      effect = registry.resolveEffect(ruleId, queryAsOf).value;
    } catch {
      // 인출이 거절된 규칙(미확정·기간 밖)은 **없는 것으로 둔다.** 추측해서 채우지 않는다.
      continue;
    }
    const shown = display(effect.value as never);
    if (shown === null) continue;
    facts.push({
      ruleId,
      sourceIds: hit,
      sourceLabels: hit.map((s) => wanted.get(s) ?? s),
      display: shown,
      unit: effect.unit,
      validFrom: meta.validFrom,
      authorityType: meta.authorityType,
    });
  }

  // 규칙 id 순 — 화면 순서가 매번 같아야 두 답을 눈으로 비교할 수 있다.
  facts.sort((a, b) => (a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0));
  return { packKind: pack.packKind, policySnapshot: pack.policySnapshot, packHash: pack.packHash, facts };
}
