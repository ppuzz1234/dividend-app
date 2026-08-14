/**
 * 승인된 정책 팩 **여러 개**를 하나의 레지스트리처럼 조회한다.
 *
 * ## 왜 필요한가 (실측 2026-08-11)
 * `@cube/policy` 의 `createRegistry` 는 **팩 하나**만 받는다. 순서 2 를 짤 때는 팩 하나가
 * 법령 하나였으니 맞는 설계였다. 그런데 승인이 진행되며 팩이 **9개**가 됐고, 서버는
 * `files[0]` 만 읽고 있었다 — 즉 **승인된 100건 중 8건만 화면에 반영되고 나머지는 조용히
 * 버려지고 있었다.** 사람이 원문을 대조해 서명한 값이 쓰이지 않는 것은, 승인 절차가
 * 있으나 마나였다는 뜻이다.
 *
 * ## 왜 YAML 을 이어붙이지 않는가
 * 팩 아홉 개를 한 덩어리로 만들어 `loadPolicyPack` 에 넣으면 코드가 훨씬 짧다. 하지만
 * 그러면 `policy_snapshot` 과 `pack_hash` 가 **어느 법령도 가리키지 않는 새 이름**이 된다.
 * 스탬프가 출처를 잃는다는 뜻이고, 그건 이 프로젝트가 지키려는 것 자체다.
 * → 팩은 각자 두고 **조회만 겹친다.** 값에 붙는 스탬프는 그 값을 실제로 소유한 팩의 것이다.
 *
 * ## 스탬프는 가장 보수적인 것
 * 합성기 전체의 `stamp()` 는 구성원 중 **가장 약한 등급**을 돌려준다. 합성 팩이 하나라도
 * 섞이면 결과 전체가 합성 취급이다 — 절대 규칙 0("합성이면 스탬프 강제 부착")을
 * 부분적으로 빠져나갈 구멍을 만들지 않기 위해서다.
 *
 * ## ⚠️ A4-Logic 에 같은 것이 있다
 * `A4-Logic/packages/taxlens/src/compose.ts` 와 **의미가 같다.** 두 레포를 합칠 때 하나로
 * 수렴시켜야 한다(`docs/MISSION2-SEAM.md`). `@cube/policy` 에 넣지 않은 이유는 그 패키지가
 * 양쪽 공유 사본이라 ❄ 동결돼 있기 때문이다 — 한쪽만 고치면 조용히 갈라진다.
 */

import type { PolicyRegistry, ResultStamp } from "@cube/policy";

/** 등급이 나쁠수록 앞. 합성기의 스탬프는 이 순서에서 가장 앞선 것을 쓴다. */
const KIND_SEVERITY: readonly string[] = ["SYNTHETIC_DEMO", "UNVERIFIED_DRAFT", "VERIFIED_LAW"];

function worstStamp(regs: readonly PolicyRegistry[]): ResultStamp {
  let worst = regs[0]!.stamp();
  for (const r of regs.slice(1)) {
    const s = r.stamp();
    if (KIND_SEVERITY.indexOf(s.packKind) < KIND_SEVERITY.indexOf(worst.packKind)) worst = s;
  }
  return worst;
}

/**
 * 첫 번째로 성공하는 팩의 결과를 돌려준다.
 *
 * **`UnverifiedPolicyError` 는 삼키지 않는다.** 규칙이 없는 것(다음 팩을 봐야 함)과
 * 규칙은 있는데 못 쓰는 것(즉시 멈춰야 함)은 전혀 다른 사건이다. 뒤엣것을 넘겨버리면
 * 미검증 팩의 규칙을 조용히 건너뛰고 다른 팩의 동명 규칙을 쓰게 된다 — 절대 규칙 0 우회다.
 */
function firstHit<T>(regs: readonly PolicyRegistry[], call: (r: PolicyRegistry) => T, what: string): T {
  let lastErr: unknown = null;
  for (const r of regs) {
    try {
      return call(r);
    } catch (e) {
      if ((e as Error).name === "UnverifiedPolicyError") throw e;
      lastErr = e;
    }
  }
  throw lastErr ?? new Error(`${what}: 어느 팩에도 없다`);
}

export function composeRegistries(regs: readonly PolicyRegistry[]): PolicyRegistry {
  if (regs.length === 0) throw new Error("팩이 하나도 없다");
  if (regs.length === 1) return regs[0]!;

  const stamp = worstStamp(regs);

  return {
    describePack: () => {
      const parts = regs.map((r) => r.describePack());
      return {
        packKind: stamp.packKind,
        // 어느 법령들이 합쳐졌는지 이름으로 남긴다 — 새 이름을 지어내지 않는다.
        policySnapshot: parts.map((p) => p.policySnapshot).join("+"),
        packHash: parts.map((p) => p.packHash).join("+"),
        ruleCount: parts.reduce((n, p) => n + p.ruleCount, 0),
      };
    },
    describeRule: (ruleId) => firstHit(regs, (r) => r.describeRule(ruleId), ruleId),
    listEffectiveRuleIds: (queryDate) => {
      const seen = new Set<string>();
      for (const r of regs) for (const id of r.listEffectiveRuleIds(queryDate)) seen.add(id);
      return [...seen].sort();
    },
    stamp: () => stamp,
    resolveEffect: (ruleId, queryDate) => firstHit(regs, (r) => r.resolveEffect(ruleId, queryDate), ruleId),
    resolveConflictGroup: (appliesTo, conflictGroup, queryDate) =>
      firstHit(regs, (r) => r.resolveConflictGroup(appliesTo, conflictGroup, queryDate), `${appliesTo}/${conflictGroup}`),
  };
}
