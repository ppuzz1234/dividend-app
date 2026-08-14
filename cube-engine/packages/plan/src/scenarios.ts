/**
 * 시나리오 — "이런 상황이면 얼마인가"를 **코드가** 계산한다 (미션 2 최소판).
 *
 * ## 세 가지를 지킨다
 * 1. **값은 승인된 규칙에서만.** `registry.resolveEffect` 로 꺼낸다. 하드코딩 0(절대 규칙 1).
 * 2. **계산은 코드가.** LLM 은 이 경로에 들어오지 않는다(절대 규칙 3).
 *    실측으로 LLM 이 `"600만원 × 15% = 90만원"` 을 직접 계산한 적이 있는데, 그 값은
 *    어느 조문에도 없어서 **되짚을 수가 없었다.** 여기서 나온 값은 규칙 id 로 되짚힌다.
 * 3. **부족하면 무엇이 부족한지 말한다.** 계산을 못 하면 "안 됩니다"가 아니라
 *    *"세액공제율 규칙이 아직 승인되지 않았습니다 — 조문은 소득세법 §59의3"* 라고 말한다.
 *    빠진 것을 이름으로 말해야 사람이 채울 수 있다.
 *
 * ## 왜 시나리오를 손으로 적나
 * 질문에서 계산식을 **추론**하면 그 추론이 검증 밖이 된다. 시나리오는 사람이 읽고 검토할 수 있는
 * 목록이고, 여기 없는 질문은 **못 한다고 말한다.** 목록이 짧은 것이 틀린 답보다 낫다.
 */

import type { PolicyRegistry, PolicyValue } from "@cube/policy";

import type { Situation } from "./situation.js";

/** 계산에 필요한 입력 항목. 없으면 사용자에게 이 이름으로 요청한다. */
export type InputKey = keyof Situation;

export const INPUT_LABEL: Record<InputKey, string> = {
  grossSalary: "총급여액",
  comprehensiveIncome: "종합소득금액",
  contribution: "연금계좌 납입액",
  age: "나이",
};

/**
 * 빠진 입력을 **되묻는** 방법.
 *
 * `options` 는 **승인된 규칙에서 나온 값만** 담는다. 소득 구간(예: 총급여 5,500만원)은
 * 세법 값이라 UI 가 지어내면 절대 규칙 1 위반이다 — 규칙이 없으면 **선택지 없이 직접 입력**받는다.
 * *"선택지를 못 주는 것"도 정보다: 그 기준값이 아직 승인 안 됐다는 뜻이므로.*
 */
export interface AskSpec {
  readonly question: string;
  readonly unit: string;
  /** 승인 규칙에서 유도한 보기. 없으면 빈 배열 — 지어내지 않는다. */
  readonly options: readonly { label: string; phrase: string; fromRule: string }[];
  /**
   * 슬라이더 범위 — **승인된 규칙에서 유도한다.**
   *
   * 최댓값이 곧 세법 값(한도)이므로 UI 가 정하면 절대 규칙 1 위반이다. 규칙이 없으면
   * `undefined` — 슬라이더 없이 직접 입력만 받는다. *범위를 못 그린다는 것도 정보다.*
   *
   * 단위는 **만원**이고 환산(원 → 만원)도 여기서 한다 — UI 는 나눗셈을 하지 않는다(절대 규칙 8).
   */
  readonly range?: { readonly min: string; readonly max: string; readonly step: string; readonly maxLabel: string };
}

export interface Scenario {
  readonly id: string;
  /** 사용자에게 보일 이름 */
  readonly title: string;
  /** 이 시나리오를 부르는 말 (질문에 하나라도 있으면 후보) */
  readonly triggers: readonly string[];
  readonly needsInputs: readonly InputKey[];
  /** 필요한 **승인된 규칙** id */
  readonly needsRules: readonly string[];
  /** 실제 계산. 규칙·입력이 다 갖춰졌을 때만 불린다. */
  readonly compute: (s: Situation, v: ReadonlyMap<string, PolicyValue>) => ComputeResult;
  /** 빠진 입력을 되묻는 문구·보기. 규칙 값이 필요하면 `v` 에서 꺼내 쓴다. */
  readonly ask?: (key: InputKey, v: ReadonlyMap<string, PolicyValue>) => AskSpec | undefined;
}

export interface ComputeResult {
  /** 사람이 읽을 결론 한 줄 */
  readonly headline: string;
  /** 계산 과정 — 각 줄이 어느 규칙에서 왔는지 */
  readonly steps: readonly { label: string; value: string; fromRule?: string }[];
}

function asInteger(v: PolicyValue | undefined, ruleId: string): bigint {
  if (v === undefined) throw new Error(`${ruleId}: 값이 없다`);
  if (v.kind !== "INTEGER") throw new Error(`${ruleId}: 정수 값이 아니다 (${v.kind})`);
  return v.value;
}

/** 원 단위 정수를 `1,800만원` 처럼 읽기 좋게. 값을 바꾸지 않는다 — 표기만. */
export function won(n: bigint): string {
  // ★ 0 을 먼저 거른다 — `0 % 1억 === 0` 이라 `0억원` 이 나온다(실측).
  if (n === 0n) return "0원";
  if (n % 100000000n === 0n) return `${(n / 100000000n).toLocaleString("ko-KR")}억원`;
  if (n % 10000n === 0n) return `${(n / 10000n).toLocaleString("ko-KR")}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

// 근거는 **소득세법 시행령 §40의2②1호 가목**("연간 1천800만원")이다.
// 근퇴법 시행령 §17의2 는 이 조문을 가리키기만 하는 위임 조문이라 값의 출처가 아니다
// (예전 팩이 그쪽을 PRIMARY 로 달고 있었다 — 2026-08-04 재승인에서 바로잡음).
const IRP_LIMIT = "INCTAX_D_40_2.CONTRIBUTION_LIMIT_COMPONENT.GENERAL";

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "PENSION_CONTRIBUTION_LIMIT",
    title: "연금계좌 연간 납입한도 초과 여부",
    triggers: ["납입한도", "얼마까지 넣", "넣어도 되", "한도 넘", "초과", "납입", "넣으면", "불입"],
    needsInputs: ["contribution"],
    needsRules: [IRP_LIMIT],
    ask: (key, v) => {
      if (key !== "contribution") return undefined;
      const limit = v.get(IRP_LIMIT);
      const known = limit !== undefined && limit.kind === "INTEGER";
      return {
        question: "연금계좌(연금저축·IRP)에 올해 얼마를 납입하셨나요?",
        unit: "만원",
        // ★ 보기·범위 모두 **승인된 한도 값**에서 나온다. 내가 정한 숫자가 아니다.
        options: !known
          ? []
          : [{ label: `한도까지 꽉 채움 (${won(limit.value)})`, phrase: `${won(limit.value)} 납입했어`, fromRule: IRP_LIMIT }],
        // 슬라이더는 0 ~ 한도. **한도를 넘는 값은 슬라이더로 못 만든다** — 그건 직접 입력이다.
        //   범위를 한도 위로 늘리려면 "얼마나 위까지"를 내가 정해야 하는데, 그건 근거 없는 숫자가 된다.
        ...(known
          ? {
              range: {
                min: "0",
                max: (limit.value / 10000n).toString(), // 원 → 만원. UI 가 아니라 여기서 나눈다.
                step: "10",
                maxLabel: won(limit.value),
              },
            }
          : {}),
      };
    },
    compute: (s, v) => {
      const limit = asInteger(v.get(IRP_LIMIT), IRP_LIMIT);
      const paid = s.contribution?.value ?? 0n;
      // bigint 비교는 그 자체로 정확하다 — 부동소수점이 끼어들 자리가 없다.
      // (`@cube/numeric` 의 브랜드 타입은 반올림·환산이 섞이는 계산에서 필요하고, 여기는 순수 비교다.)
      const over = paid > limit ? 1 : paid < limit ? -1 : 0;
      const diff = paid > limit ? paid - limit : limit - paid;
      return {
        headline:
          over > 0
            ? `한도를 ${won(diff)} 초과합니다.`
            : over === 0
              ? "한도와 정확히 같습니다."
              : `한도까지 ${won(diff)} 더 넣을 수 있습니다.`,
        steps: [
          { label: "납입액 (입력)", value: won(paid) },
          { label: "연간 납입한도", value: won(limit), fromRule: IRP_LIMIT },
          { label: over > 0 ? "초과액" : "여유액", value: won(diff) },
        ],
      };
    },
  },
  {
    id: "PENSION_TAX_CREDIT",
    title: "연금계좌 세액공제액",
    triggers: ["세액공제", "공제 얼마", "얼마 받", "얼마 돌려받", "환급", "절세"],
    needsInputs: ["contribution"],
    ask: (key) =>
      key === "contribution"
        ? { question: "연금계좌에 올해 얼마를 납입하셨나요?", unit: "만원", options: [] }
        : undefined,
    // ★ 아직 **승인되지 않은** 규칙들이다. 그래서 이 시나리오는 지금 "부족한 것"을 말한다.
    //    승인이 들어오면 코드를 고치지 않고 그대로 동작한다.
    needsRules: ["INCTAX_59_3.PENSION_CREDIT.RATE", "INCTAX_59_3.PENSION_CREDIT.LIMIT_PENSION_SAVINGS"],
    compute: (s, v) => {
      const rate = v.get("INCTAX_59_3.PENSION_CREDIT.RATE");
      const limit = asInteger(v.get("INCTAX_59_3.PENSION_CREDIT.LIMIT_PENSION_SAVINGS"), "LIMIT");
      const paid = s.contribution?.value ?? 0n;
      const base = paid > limit ? limit : paid;
      if (rate === undefined || rate.kind !== "RATE") throw new Error("공제율이 비율 값이 아니다");
      // ⚠️ **여기 반올림 결정이 숨어 있다.** bigint 나눗셈은 버림(truncate)인데,
      //    버릴지 올릴지는 **조문이 정하는 것**(`effect.rounding.mode`)이지 내가 정할 게 아니다.
      //    지금은 이 시나리오가 미승인이라 도달하지 않는다. 규칙이 승인될 때
      //    `rounding` 을 함께 확인하고 `@cube/numeric` 의 반올림 경로로 바꿔야 한다.
      //    ponytail(plan/반올림): 상한은 "버림 고정". 업그레이드는 rounding 스펙 주입.
      const credit = (base * rate.numerator) / rate.denominator;
      return {
        headline: `세액공제액은 ${won(credit)} 입니다.`,
        steps: [
          { label: "납입액 (입력)", value: won(paid) },
          { label: "공제 대상 한도", value: won(limit), fromRule: "INCTAX_59_3.PENSION_CREDIT.LIMIT_PENSION_SAVINGS" },
          { label: "인정 납입액", value: won(base) },
          {
            label: "공제율",
            value: `${rate.numerator.toString()}/${rate.denominator.toString()}`,
            fromRule: "INCTAX_59_3.PENSION_CREDIT.RATE",
          },
          { label: "세액공제액", value: won(credit) },
        ],
      };
    },
  },
];

/** 질문에 걸리는 시나리오. 여러 개면 트리거가 많이 맞은 것부터. */
export function pickScenarios(query: string): Scenario[] {
  return SCENARIOS.map((s) => ({ s, hits: s.triggers.filter((t) => query.includes(t)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.s);
}

/** 규칙이 승인돼 있고 조회일에 유효한가. 없으면 `undefined` — **추측하지 않는다.** */
export function tryResolve(
  registry: PolicyRegistry | null,
  ruleId: string,
  queryAsOf: string,
): PolicyValue | undefined {
  if (registry === null) return undefined;
  try {
    return registry.resolveEffect(ruleId, queryAsOf).value.value;
  } catch {
    // 미승인·미존재·기간 밖 — 어느 쪽이든 **쓸 수 없다**는 결론은 같다.
    return undefined;
  }
}
