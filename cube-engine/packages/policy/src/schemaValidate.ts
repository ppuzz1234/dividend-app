/**
 * JSON Schema 구조 검증 (사양 §13 순서 2 산출물).
 *
 * 스키마는 `schema/*.json` 에 언어 중립 JSON 으로 둔다 — TS 상수로 인라인하면 다른 언어 구현과
 * 공유할 수 없고 리뷰 대상 산출물로도 남지 않는다.
 *
 * ajv 오류는 매트릭스의 고유 code 로 매핑한다. 매핑되지 않는 구조 오류는 SCHEMA_VIOLATION 이며,
 * 이는 "보정 없이 거절"이라는 동작에는 영향이 없고 감사 로그의 해상도만 달라진다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 스키마가 draft 2020-12 이므로 ajv 의 2020 빌드를 쓴다. 기본 진입점은 draft-07 전용이라
// $schema 를 해석하지 못한다.
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

import { reject, type PolicyErrorCode } from "./errors.js";

// 컴파일 후 위치는 dist/src/ 이므로 패키지 루트까지 두 단계 올라간다.
const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "schema");

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });

function compile(fileName: string): ValidateFunction {
  return ajv.compile(JSON.parse(readFileSync(join(SCHEMA_DIR, fileName), "utf8")) as object);
}

export const SCHEMAS = {
  policyPack: compile("policy-pack.schema.json"),
  accountSpec: compile("account-spec.schema.json"),
  runManifest: compile("run-manifest.schema.json"),
  factAnswerManifest: compile("fact-answer-manifest.schema.json"),
} as const;

/**
 * 누락 필드 → 고유 code. 여기 없는 필드는 MANIFEST_FIELD_MISSING 또는 SCHEMA_VIOLATION 으로 떨어진다.
 * 매트릭스가 고유 code 를 지정한 항목만 등록한다.
 */
const MISSING_PROPERTY_CODES: Readonly<Record<string, PolicyErrorCode>> = {
  pack_kind: "PACK_KIND_MISSING",
  policy_snapshot: "SNAPSHOT_VERSION_MISSING",
  valid_from: "VALID_FROM_MISSING",
  jurisdiction: "SCOPE_INCOMPLETE",
  tax_years: "SCOPE_INCOMPLETE",
};

/** enum 위반 경로 → 고유 code. instancePath 의 꼬리로 판정한다. */
const ENUM_PATH_CODES: readonly (readonly [RegExp, PolicyErrorCode])[] = [
  [/\/pack_kind$/, "PACK_KIND_INVALID"],
  [/\/lifecycle\/status$/, "LIFECYCLE_STATUS_INVALID"],
  [/\/authority\/type$/, "AUTHORITY_TYPE_INVALID"],
  [/\/rounding\/(stage|mode)$/, "ROUNDING_ENUM_INVALID"],
];

function mapError(err: ErrorObject): PolicyErrorCode {
  if (err.keyword === "additionalProperties") return "UNKNOWN_FIELD";

  if (err.keyword === "required") {
    const missing = (err.params as { missingProperty?: string }).missingProperty ?? "";
    const mapped = MISSING_PROPERTY_CODES[missing];
    if (mapped !== undefined) return mapped;
    // 매니페스트 스키마의 누락은 전부 재현성 필드 누락으로 취급한다 (R51).
    if (err.schemaPath.startsWith("#/required") && /Manifest/.test(String(err.parentSchema ?? ""))) {
      return "MANIFEST_FIELD_MISSING";
    }
    return "SCHEMA_VIOLATION";
  }

  if (err.keyword === "enum") {
    // pack_kind 는 최상위라 instancePath 가 "/pack_kind" 다. 앞에 "/" 를 붙여 꼬리 매칭을 통일한다.
    const path = err.instancePath.startsWith("/") ? err.instancePath : `/${err.instancePath}`;
    for (const [re, code] of ENUM_PATH_CODES) {
      if (re.test(path)) return code;
    }
  }

  return "SCHEMA_VIOLATION";
}

/**
 * 스키마 검증. 위반 시 첫 오류로 즉시 throw 한다 — 부분 로딩을 만들지 않기 위해 누적하지 않는다.
 * `requiredCodeOverride` 는 매니페스트처럼 누락 필드 전부가 같은 code 인 경우에 쓴다.
 */
export function assertSchema(
  validate: ValidateFunction,
  data: unknown,
  rootPath: string,
  requiredCodeOverride?: PolicyErrorCode,
): void {
  if (validate(data)) return;

  const errors = validate.errors ?? [];
  const first = errors[0];
  if (first === undefined) {
    reject("SCHEMA_VIOLATION", rootPath, "스키마 검증 실패 (상세 없음)");
  }

  let code = mapError(first);
  if (requiredCodeOverride !== undefined && first.keyword === "required" && code === "SCHEMA_VIOLATION") {
    code = requiredCodeOverride;
  }

  const at = first.instancePath === "" ? rootPath : `${rootPath}${first.instancePath}`;
  const missing = (first.params as { missingProperty?: string }).missingProperty;
  const detail = missing !== undefined ? `필수 필드 누락: ${missing}` : `${first.keyword}: ${first.message ?? ""}`;
  reject(code, at, detail);
}
