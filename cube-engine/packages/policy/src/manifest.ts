/**
 * RunManifest / FactAnswerManifest 검증 — 사양 §5.6 · §1.2 · §1.3 재현성 정의.
 * 거절 조건은 docs/ORDER2-REJECTION-MATRIX.md F·G 절과 1:1 대응한다.
 */

import { assertLocalDate } from "./dates.js";
import { reject } from "./errors.js";
import { SCHEMAS, assertSchema } from "./schemaValidate.js";
import type { FactAnswerManifest, ManifestContext, RunManifest } from "./types.js";
import { SYNTHETIC_STAMP_TEXT } from "./vocabulary.js";

/** SHA-256 소문자 hex (사양 §5.2). */
const HASH_RE = /^[0-9a-f]{64}$/;

function assertHash(value: unknown, path: string): void {
  if (typeof value !== "string" || !HASH_RE.test(value)) {
    reject(
      "HASH_FORMAT_INVALID",
      path,
      `SHA-256 소문자 hex 64자여야 한다: ${JSON.stringify(value)}`,
    );
  }
}

export function validateRunManifest(raw: unknown, ctx: ManifestContext): RunManifest {
  assertSchema(SCHEMAS.runManifest, raw, "$.runManifest", "MANIFEST_FIELD_MISSING");
  const m = raw as RunManifest;

  assertLocalDate(m.queryAsOf, "$.runManifest.queryAsOf");
  assertLocalDate(m.createdAt, "$.runManifest.createdAt");
  assertHash(m.confirmedInputHash, "$.runManifest.confirmedInputHash");

  if (!Number.isSafeInteger(m.taxYear)) {
    reject("UNSAFE_INTEGER", "$.runManifest.taxYear", `안전 정수여야 한다: ${m.taxYear}`);
  }

  // ③ 전망 산출 시 가정 세트 필수 (§5.6). 매니페스트 자신은 자기가 전망인지 모르므로 컨텍스트로 받는다.
  if (ctx.producesProjection) {
    const v = m.assumptionSetVersion;
    if (typeof v !== "string" || v.length === 0) {
      reject(
        "ASSUMPTION_SET_REQUIRED_FOR_PROJECTION",
        "$.runManifest.assumptionSetVersion",
        "③ 전망은 가정 세트 버전 없이 재현할 수 없다",
      );
    }
  }

  // 합성 팩 결과는 매니페스트에도 스탬프가 남아야 한다 (CLAUDE.md 규칙 0, R56).
  if (m.packKind === "SYNTHETIC_DEMO") {
    if (m.syntheticStamp !== SYNTHETIC_STAMP_TEXT) {
      reject(
        "SYNTHETIC_STAMP_REQUIRED",
        "$.runManifest.syntheticStamp",
        `SYNTHETIC_DEMO 결과의 매니페스트에는 합성 스탬프가 있어야 한다: ${JSON.stringify(SYNTHETIC_STAMP_TEXT)}`,
      );
    }
  }

  return m;
}

export function validateFactAnswerManifest(raw: unknown): FactAnswerManifest {
  assertSchema(SCHEMAS.factAnswerManifest, raw, "$.factAnswerManifest", "MANIFEST_FIELD_MISSING");
  const m = raw as FactAnswerManifest;

  assertLocalDate(m.queryAsOf, "$.factAnswerManifest.queryAsOf");
  assertHash(m.answerPayloadHash, "$.factAnswerManifest.answerPayloadHash");
  m.sourceHashes.forEach((h, i) => assertHash(h, `$.factAnswerManifest.sourceHashes[${i}]`));

  if (m.answerClass === "REGISTRY_RESOLVED_FACT" && m.resolvedRuleIds.length === 0) {
    reject(
      "RESOLVED_RULE_IDS_REQUIRED",
      "$.factAnswerManifest.resolvedRuleIds",
      "규칙 ID 없는 '공식 팩트'는 근거 없는 단정이다",
    );
  }
  if (m.answerClass === "UNMODELED_OFFICIAL_SOURCE" && m.resolvedRuleIds.length > 0) {
    reject(
      "RESOLVED_RULE_IDS_MUST_BE_EMPTY",
      "$.factAnswerManifest.resolvedRuleIds",
      "미모델링 답변이 규칙 ID 를 달면 팩트 결론으로 오인된다 (사양 §1.2)",
    );
  }

  if (m.sourceSnapshotIds.length !== m.sourceHashes.length) {
    reject(
      "SOURCE_HASH_PAIRING_MISMATCH",
      "$.factAnswerManifest.sourceHashes",
      `스냅샷 ${m.sourceSnapshotIds.length}건과 해시 ${m.sourceHashes.length}건이 짝을 이루지 않는다`,
    );
  }

  // 합성 팩 결과는 FACT 매니페스트에도 스탬프가 남아야 한다 (CLAUDE.md 규칙 0 · R56 의 FACT 판).
  // RunManifest 와 같은 분기를 그대로 복제했다 — 기존 code 라 union 추가가 필요 없다.
  if (m.packKind === "SYNTHETIC_DEMO" && m.syntheticStamp !== SYNTHETIC_STAMP_TEXT) {
    reject(
      "SYNTHETIC_STAMP_REQUIRED",
      "$.factAnswerManifest.syntheticStamp",
      `SYNTHETIC_DEMO 결과의 FACT 매니페스트에는 합성 스탬프가 있어야 한다: ${JSON.stringify(SYNTHETIC_STAMP_TEXT)}`,
    );
  }

  return m;
}
