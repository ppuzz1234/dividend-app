/**
 * 메커니즘 그래프 로더 불변식 — 사양 §5.3.3 · §5.3.4.
 *
 * "위반 시 부분 실행 없이 로딩 거절: 의존성 순환 / 동일 phase 동일 필드 동시 쓰기 /
 *  선행 인스턴스 누락 / 실행 순서 미결정(위상정렬 불가)"
 *
 * 의존·읽기/쓰기·phase 선언의 소재를 사양이 정하지 않아 EngineCapabilities 를 로더 입력으로 받는다
 * (OPEN-Q4). 이는 엔진의 정적 선언표이며 핸들러 apply() 로직과 무관하다.
 */

import { reject } from "./errors.js";
import type { AccountSpec, MechanismCapability, MechanismInstance } from "./types.js";
import { phaseRank, type MechanismType } from "./vocabulary.js";

type CapabilityIndex = ReadonlyMap<MechanismType, MechanismCapability>;

/**
 * 정렬 키의 정적 꼬리 3단계가 전순서를 이루는지 검사한다 (§5.3.4, R50).
 * 앞의 두 키(event.occurredAt·event.sequence)는 이벤트에서 오므로 로딩 시점에 검사할 수 없다 —
 * TODO(순서3) 에서 이벤트 축을 포함한 전체 정렬 결정론으로 확장한다.
 *
 * 테스트가 직접 호출할 수 있도록 export 한다. 중복 mechanismInstanceId 를 R36 이 먼저 잡으므로
 * 통합 경로에서는 도달하지 않지만, 사양이 별도 조항으로 규정한 검사라 별도로 존재해야 한다.
 */
export function assertDeterministicOrder(
  instances: readonly MechanismInstance[],
  caps: CapabilityIndex,
  path: string,
): void {
  const keyed = instances.map((inst) => {
    const cap = caps.get(inst.mechanismType);
    const rank = cap === undefined ? -1 : phaseRank(cap.phase);
    return { inst, key: `${String(rank).padStart(3, "0")}|${inst.priority}|${inst.mechanismInstanceId}` };
  });

  const seen = new Map<string, string>();
  for (const { inst, key } of keyed) {
    const prior = seen.get(key);
    if (prior !== undefined) {
      reject(
        "ORDER_UNDETERMINED",
        path,
        `정렬 키(phase → priority → mechanismInstanceId)로 순서가 결정되지 않는다: ${prior} 와 ${inst.mechanismInstanceId}`,
      );
    }
    seen.set(key, inst.mechanismInstanceId);
  }
}

/** 동일 phase 에서 같은 StateField 를 두 인스턴스가 쓰면 마지막 쓰기가 비결정적이다 (R49). */
function assertNoConcurrentWrites(
  instances: readonly MechanismInstance[],
  caps: CapabilityIndex,
  path: string,
): void {
  const writers = new Map<string, string>(); // `${phase}::${field}` → instanceId
  for (const inst of instances) {
    const cap = caps.get(inst.mechanismType);
    if (cap === undefined) continue; // 커버리지 검사에서 이미 걸렀다
    for (const field of cap.writes) {
      const key = `${cap.phase}::${field}`;
      const prior = writers.get(key);
      if (prior !== undefined) {
        reject(
          "CONCURRENT_WRITE_SAME_PHASE",
          path,
          `phase ${cap.phase} 에서 ${prior} 와 ${inst.mechanismInstanceId} 가 같은 필드(${field})에 쓴다`,
        );
      }
      writers.set(key, inst.mechanismInstanceId);
    }
  }
}

/** 의존 대상 타입의 인스턴스가 같은 계좌에 없으면 선행 계산이 실행되지 않는다 (R48). */
function assertPrerequisites(
  instances: readonly MechanismInstance[],
  caps: CapabilityIndex,
  path: string,
): void {
  const presentTypes = new Set(instances.map((i) => i.mechanismType));
  for (const inst of instances) {
    const cap = caps.get(inst.mechanismType);
    if (cap === undefined) continue;
    for (const needed of cap.dependsOnTypes) {
      if (!presentTypes.has(needed)) {
        reject(
          "MISSING_PREREQUISITE_INSTANCE",
          path,
          `${inst.mechanismInstanceId}(${inst.mechanismType}) 가 ${needed} 에 의존하는데 이 계좌에 인스턴스가 없다`,
        );
      }
    }
  }
}

/** 위상정렬 불가 = 실행 순서 미결정 (R47). 계좌 안에 실재하는 타입만 대상으로 한다. */
function assertNoDependencyCycle(
  instances: readonly MechanismInstance[],
  caps: CapabilityIndex,
  path: string,
): void {
  const presentTypes = new Set(instances.map((i) => i.mechanismType));

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<MechanismType, number>();
  const stack: MechanismType[] = [];

  const visit = (type: MechanismType): void => {
    color.set(type, GRAY);
    stack.push(type);
    const cap = caps.get(type);
    for (const next of cap?.dependsOnTypes ?? []) {
      if (!presentTypes.has(next)) continue; // 선행 누락은 R48 소관
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const cycleStart = stack.indexOf(next);
        const cycle = [...stack.slice(cycleStart), next].join(" → ");
        reject("DEPENDENCY_CYCLE", path, `의존성 순환: ${cycle}`);
      }
      if (c === WHITE) visit(next);
    }
    stack.pop();
    color.set(type, BLACK);
  };

  for (const type of presentTypes) {
    if ((color.get(type) ?? WHITE) === WHITE) visit(type);
  }
}

export function assertMechanismGraph(
  spec: AccountSpec,
  caps: CapabilityIndex,
  path: string,
): void {
  assertPrerequisites(spec.mechanismInstances, caps, path);
  assertNoDependencyCycle(spec.mechanismInstances, caps, path);
  assertNoConcurrentWrites(spec.mechanismInstances, caps, path);
  assertDeterministicOrder(spec.mechanismInstances, caps, path);
}
