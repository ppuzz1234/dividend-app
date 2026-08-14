/**
 * 테스트 공용 — fixture 로딩과 거절 단언.
 *
 * 거절 테스트는 "정상 fixture 를 하나만 망가뜨린다" 패턴을 쓴다. 매 케이스마다 별도 파일을 두면
 * 어디가 다른지 눈으로 찾아야 하고, 정상 fixture 가 바뀔 때 전부 손봐야 한다.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import {
  PolicyContractError,
  type EngineCapabilities,
  type PolicyErrorCode,
} from "../src/index.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "test", "fixtures");

export function readPackYaml(): Record<string, any> {
  return YAML.parse(readFileSync(join(FIXTURE_DIR, "synthetic-demo.pack.yaml"), "utf8")) as Record<
    string,
    any
  >;
}

export function readAccountSpecsJson(): { accountSpecVersion: string; specs: Record<string, any>[] } {
  const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, "account-specs.json"), "utf8")) as {
    accountSpecVersion: string;
    specs: Record<string, any>[];
  };
  return doc;
}

/** 정상 팩의 독립 사본. 호출자가 마음껏 망가뜨려도 다른 테스트에 영향이 없다. */
export function pack(): Record<string, any> {
  return structuredClone(readPackYaml());
}

export function specs(): Record<string, any>[] {
  return structuredClone(readAccountSpecsJson().specs);
}

export function spec(index = 0): Record<string, any> {
  return specs()[index] as Record<string, any>;
}

/** 팩 안에서 id 로 규칙을 찾는다. 인덱스를 하드코딩하면 fixture 를 못 늘린다. */
export function ruleOf(p: Record<string, any>, id: string): Record<string, any> {
  const found = (p["rules"] as Record<string, any>[]).find((r) => r["id"] === id);
  assert.ok(found !== undefined, `fixture 에 ${id} 규칙이 없다`);
  return found;
}

/** 값이 있는 대표 규칙. 값 관련 거절 테스트는 전부 이걸 망가뜨린다. */
export const VALUED_RULE_ID = "DEMO.LIMIT.ANNUAL";

/** fixture 전반에 박아둔 합성 값 표식. 스탬프 없는 유출 탐지에 쓴다. */
export const SYNTHETIC_SENTINEL = "424242";

export function expectReject(fn: () => unknown, code: PolicyErrorCode, label: string): PolicyContractError {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  assert.ok(caught !== undefined, `${label}: 거절돼야 하는데 통과했다`);
  assert.ok(
    caught instanceof PolicyContractError,
    `${label}: PolicyContractError 여야 한다. 실제: ${String(caught)}`,
  );
  assert.equal(caught.code, code, `${label}: code 불일치 — ${caught.message}`);
  return caught;
}

// ─────────────────────────────────────────────────────────────────────────────
// 엔진 능력 선언 (OPEN-Q4) — 로딩 검사용 정적 메타데이터이며 apply() 로직이 아니다.
// ─────────────────────────────────────────────────────────────────────────────

const SAFE_PROPS = {
  piecewiseLinear: true,
  piecewiseMonotone: true,
  finiteBreakpoints: true,
  crossAccountInteraction: false,
  pathDependent: false,
  nonConvex: false,
} as const;

export function engine(): EngineCapabilities {
  return {
    engineBuildVersion: "DEMO-ENGINE-0001",
    mechanisms: [
      {
        mechanismType: "CONTRIBUTION_LIMIT",
        phase: "CONTRIBUTION",
        reads: ["ytdContribution"],
        writes: ["contributionRoom"],
        dependsOnTypes: [],
        optimizationProperties: { ...SAFE_PROPS },
      },
      {
        mechanismType: "TAX_CREDIT",
        phase: "TAX_BENEFIT",
        reads: ["contributionRoom"],
        writes: ["taxCreditApplied"],
        dependsOnTypes: ["CONTRIBUTION_LIMIT"],
        optimizationProperties: { ...SAFE_PROPS },
      },
      {
        mechanismType: "TAX_DEFERRAL",
        phase: "GROWTH",
        reads: ["accountBalance"],
        writes: ["accountBalance"],
        dependsOnTypes: [],
        optimizationProperties: { ...SAFE_PROPS },
      },
      {
        mechanismType: "DIVIDEND_DISTRIBUTION_TAX",
        phase: "WITHDRAWAL_TAX",
        reads: ["accountBalance"],
        writes: ["withheldTax"],
        dependsOnTypes: [],
        optimizationProperties: { ...SAFE_PROPS },
      },
      {
        mechanismType: "TAXABLE_SALE_TAX",
        phase: "WITHDRAWAL_TAX",
        reads: ["accountBalance"],
        writes: ["realizedGain"],
        dependsOnTypes: [],
        optimizationProperties: { ...SAFE_PROPS },
      },
      {
        mechanismType: "FINANCIAL_INCOME_AGGREGATION",
        phase: "SETTLEMENT",
        reads: ["withheldTax", "realizedGain"],
        writes: ["cashflow"],
        dependsOnTypes: ["DIVIDEND_DISTRIBUTION_TAX", "TAXABLE_SALE_TAX"],
        optimizationProperties: { ...SAFE_PROPS },
      },
    ],
  };
}

/** 능력 표의 한 항목만 바꾼 사본. */
export function engineWith(
  mechanismType: string,
  patch: Record<string, unknown>,
): EngineCapabilities {
  const base = engine();
  return {
    engineBuildVersion: base.engineBuildVersion,
    mechanisms: base.mechanisms.map((m) =>
      m.mechanismType === mechanismType ? ({ ...m, ...patch } as (typeof base.mechanisms)[number]) : m,
    ),
  };
}

/** 값 어딘가에 needle 문자열이 있는지 재귀 탐색. 스탬프 없는 유출 탐지용. */
export function deepContains(node: unknown, needle: string): boolean {
  if (typeof node === "string") return node.includes(needle);
  if (typeof node === "bigint" || typeof node === "number") return String(node).includes(needle);
  if (Array.isArray(node)) return node.some((v) => deepContains(v, needle));
  if (node !== null && typeof node === "object") {
    return Object.values(node as Record<string, unknown>).some((v) => deepContains(v, needle));
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 매니페스트 fixture
// ─────────────────────────────────────────────────────────────────────────────

const ZERO_HASH = "0".repeat(64);

export function runManifest(): Record<string, any> {
  return {
    runId: "DEMO_RUN_0001",
    queryAsOf: "2026-07-30",
    taxYear: 2026,
    confirmedInputHash: ZERO_HASH,
    packKind: "SYNTHETIC_DEMO",
    syntheticStamp: "합성 세법 값 · 실제 세법이 아님",
    policySnapshotVersion: "DEMO-SYNTHETIC-0001",
    accountSpecVersion: "DEMO-SPECS-0001",
    mechanismSchemaVersion: "DEMO-MECH-0001",
    instrumentDataVersion: "DEMO-INSTR-0001",
    strategyCoverageVersion: "DEMO-COV-0001",
    strategyTemplateVersion: "DEMO-TPL-0001",
    optimizerVersion: "DEMO-OPT-0001",
    engineBuildVersion: "DEMO-ENGINE-0001",
    createdAt: "2026-07-30",
  };
}

export function factManifest(): Record<string, any> {
  return {
    queryAsOf: "2026-07-30",
    policySnapshotVersion: "DEMO-SYNTHETIC-0001",
    factResolverVersion: "DEMO-FACT-0001",
    answerClass: "REGISTRY_RESOLVED_FACT",
    resolvedRuleIds: ["DEMO.LIMIT.ANNUAL"],
    sourceSnapshotIds: ["DEMO_SRC_PRIMARY"],
    sourceHashes: [ZERO_HASH],
    rendererTemplateVersion: "DEMO-RENDER-0001",
    answerPayloadHash: ZERO_HASH,
  };
}
