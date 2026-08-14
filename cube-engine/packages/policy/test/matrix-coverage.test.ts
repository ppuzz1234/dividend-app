/**
 * 거절 매트릭스 ↔ 테스트의 1:1 대응을 **기계적으로** 검증한다.
 *
 * 완료 기준은 "매트릭스의 모든 행에 대응 테스트가 존재하고 통과한다"인데, 그 대조를 사람 눈에
 * 맡기면 행을 추가하고 테스트를 잊어도 초록색이 된다. 이 테스트가 그 구멍을 막는다.
 *
 * 검사 내용
 *   1. 매트릭스의 모든 R/P 행이 참조하는 테스트 파일이 실재한다
 *   2. 그 파일에 정확히 그 이름의 test(...) 가 있다
 *   3. 매트릭스가 쓰는 모든 error code 가 PolicyErrorCode 에 선언돼 있다
 *   4. 반대로, 구현이 실제로 던지는 code 중 매트릭스에 없는 것이 없다
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // dist/test
const PKG_ROOT = join(HERE, "..", "..");
const REPO_ROOT = join(PKG_ROOT, "..", "..");
const MATRIX_PATH = join(REPO_ROOT, "docs", "ORDER2-REJECTION-MATRIX.md");
const TEST_SRC_DIR = join(PKG_ROOT, "test");
const SRC_DIR = join(PKG_ROOT, "src");

interface Row {
  readonly id: string;
  readonly code: string | null;
  readonly file: string;
  readonly testName: string;
}

function parseMatrix(): Row[] {
  const md = readFileSync(MATRIX_PATH, "utf8");
  const rows: Row[] = [];

  for (const line of md.split(/\r?\n/)) {
    if (!/^\|\s*(R\d+b?|P\d+)\s*\|/.test(line)) continue;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const id = cells[0] as string;
    const last = cells[cells.length - 1] as string;

    // `파일명` › 테스트 이름
    const m = /^`([^`]+)`\s*›\s*(.+)$/.exec(last);
    assert.ok(m !== null, `${id}: 테스트 참조 형식이 아니다 → ${last}`);

    const codeCell = cells.length >= 6 ? (cells[4] as string) : "";
    const codeMatch = /^`([A-Za-z_]+)`$/.exec(codeCell);

    rows.push({
      id,
      code: codeMatch === null ? null : (codeMatch[1] as string),
      file: m[1] as string,
      testName: (m[2] as string).trim(),
    });
  }
  return rows;
}

const ROWS = parseMatrix();

test("매트릭스가 비어 있지 않고 R·P 행을 모두 담고 있다", () => {
  const rIds = ROWS.filter((r) => r.id.startsWith("R")).map((r) => r.id);
  const pIds = ROWS.filter((r) => r.id.startsWith("P")).map((r) => r.id);

  assert.ok(rIds.length >= 60, `거절 행이 너무 적다: ${rIds.length}`);
  assert.ok(pIds.length >= 1, "정상 로딩 행이 최소 1건 있어야 한다");

  // id 중복 금지 — 같은 번호 두 행이면 하나가 검증 없이 지나간다.
  assert.equal(new Set(rIds).size, rIds.length, "중복된 R 번호가 있다");
  assert.equal(new Set(pIds).size, pIds.length, "중복된 P 번호가 있다");
});

test("매트릭스의 모든 행에 실재하는 테스트가 매핑돼 있다", () => {
  const cache = new Map<string, string>();
  const missing: string[] = [];

  for (const row of ROWS) {
    const path = join(TEST_SRC_DIR, row.file);
    if (!existsSync(path)) {
      missing.push(`${row.id}: 파일 없음 ${row.file}`);
      continue;
    }
    let src = cache.get(path);
    if (src === undefined) {
      src = readFileSync(path, "utf8");
      cache.set(path, src);
    }
    // test("<이름>", ...) 를 정확히 찾는다.
    if (!src.includes(`test("${row.testName}"`)) {
      missing.push(`${row.id}: ${row.file} 에 test("${row.testName}") 가 없다`);
    }
  }

  assert.deepEqual(missing, [], `매트릭스 행에 대응 테스트가 없다:\n${missing.join("\n")}`);
});

test("매트릭스가 쓰는 error code 는 전부 PolicyErrorCode 에 선언돼 있다", () => {
  const errorsSrc = readFileSync(join(SRC_DIR, "errors.ts"), "utf8");
  const undeclared = ROWS.filter((r) => r.code !== null && !errorsSrc.includes(`"${r.code}"`)).map(
    (r) => `${r.id}: ${r.code}`,
  );
  assert.deepEqual(undeclared, [], `PolicyErrorCode 에 없는 code:\n${undeclared.join("\n")}`);
});

test("구현이 던지는 code 는 전부 매트릭스에 행이 있다", () => {
  // 반대 방향 검사. 코드만 늘고 문서가 안 따라오는 것을 막는다.
  const matrixCodes = new Set(ROWS.map((r) => r.code).filter((c): c is string => c !== null));

  const thrown = new Set<string>();
  for (const file of [
    "loadPolicyPack.ts",
    "loadAccountSpecs.ts",
    "mechanismGraph.ts",
    "optimizationCompatibility.ts",
    "registry.ts",
    "manifest.ts",
    "policyValue.ts",
    "packHash.ts",
    "dates.ts",
  ]) {
    const src = readFileSync(join(SRC_DIR, file), "utf8");
    for (const m of src.matchAll(/reject\(\s*"([A-Z_]+)"/g)) {
      thrown.add(m[1] as string);
    }
  }

  // SCHEMA_VIOLATION 은 매트릭스가 명시한 backstop 이라 고유 행이 없다.
  thrown.delete("SCHEMA_VIOLATION");

  const undocumented = [...thrown].filter((c) => !matrixCodes.has(c)).sort();
  assert.deepEqual(
    undocumented,
    [],
    `구현은 던지는데 매트릭스에 행이 없는 code:\n${undocumented.join("\n")}`,
  );
});

test("매트릭스가 참조하는 테스트 파일이 모두 실재한다", () => {
  const files = [...new Set(ROWS.map((r) => r.file))];
  for (const f of files) {
    assert.ok(existsSync(join(TEST_SRC_DIR, f)), `참조된 테스트 파일 없음: ${f}`);
  }
  assert.ok(files.length >= 7, `테스트 파일이 너무 적게 참조된다: ${files.length}`);
});
