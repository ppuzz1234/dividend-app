/**
 * 최적화 성질 호환성 검사 — 사양 §5.3.1 [v1.4 신설].
 *
 * "데이터 필드 호환성만 검사하면, 새 메커니즘이 Optimizer 의 암묵적 가정을 깨뜨리면서도
 * 로딩에 성공한다." 각 메커니즘이 자기 성질을 선언하고, 로더가 Optimizer 지원 집합과 대조한다.
 *
 * 사양은 거절 예시를 **하나만**(nonConvex && !finiteBreakpoints) 주고 지원 조합 전체를
 * 정의하지 않았다 (OPEN-Q3). 따라서 화이트리스트가 아니라 거절 규칙 목록으로 두되,
 * 사양 근거가 있는 규칙과 보수적 확장을 코드에서 구분해 표시한다.
 */

import { reject } from "./errors.js";
import type { MechanismCapability, MechanismOptimizationProperties } from "./types.js";

interface RejectionRule {
  readonly id: string;
  /** SPEC = 사양 명시 / CONSERVATIVE = 사양이 열거하지 않아 보수적으로 막은 조합 (OPEN-Q3) */
  readonly basis: "SPEC" | "CONSERVATIVE";
  readonly reason: string;
  readonly matches: (p: MechanismOptimizationProperties) => boolean;
}

export const REJECTION_RULES: readonly RejectionRule[] = [
  {
    id: "NON_CONVEX_WITHOUT_FINITE_BREAKPOINTS",
    basis: "SPEC",
    reason:
      "유한 경계점 없는 비볼록 문제는 breakpoint 전수 열거로 최적성이 성립하지 않는다 (사양 §5.3.1 명시 예시)",
    matches: (p) => p.nonConvex && !p.finiteBreakpoints,
  },
  {
    id: "PATH_DEPENDENT_WITHOUT_FINITE_BREAKPOINTS",
    basis: "CONSERVATIVE",
    reason:
      "경로 의존인데 경계점이 유한하지 않으면 §6.1.1 의 '유한 후보 전수 열거'가 성립하지 않는다",
    matches: (p) => p.pathDependent && !p.finiteBreakpoints,
  },
  {
    id: "NO_EXPLOITABLE_STRUCTURE",
    basis: "CONSERVATIVE",
    reason:
      "구간 선형·구간 단조·유한 경계점이 모두 없으면 현 Optimizer 가 기댈 구조가 남지 않는다",
    matches: (p) => !p.piecewiseLinear && !p.piecewiseMonotone && !p.finiteBreakpoints,
  },
];

export function assertOptimizationCompatible(cap: MechanismCapability, path: string): void {
  const props = cap.optimizationProperties;

  // 미선언은 거절이다. "안 적었으니 안전"으로 처리하면 이 검사 자체가 무력화된다 (R43).
  if (props === undefined) {
    reject(
      "OPTIMIZATION_PROPERTIES_MISSING",
      `${path}.optimizationProperties`,
      `${cap.mechanismType} 이 최적화 성질을 선언하지 않았다 (사양 §5.3.1 v1.4)`,
    );
  }

  for (const rule of REJECTION_RULES) {
    if (rule.matches(props)) {
      reject(
        "UNSUPPORTED_OPTIMIZATION_PROPERTIES",
        `${path}.optimizationProperties`,
        `${cap.mechanismType}: ${rule.id} (${rule.basis}) — ${rule.reason}`,
      );
    }
  }
}
