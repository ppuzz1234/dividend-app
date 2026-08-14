/**
 * 승격 검증 — `VERIFIED_LAW` 팩이 실제로 배포 가능한가.
 *
 *   npm run promote -w @cube/packdraft -- packages/policy/packs/kr-tax-2026.pack.yaml
 *
 * ## 검증기를 새로 짜지 않는다
 * `loadPolicyPack` 이 이미 전부 강제한다:
 *   VERIFIED_PACK_HAS_UNAPPROVED_RULE      전 규칙 approved: true 여야 한다
 *   VERIFIED_PACK_MISSING_REVIEW_SIGNATURE reviewer_id·reviewed_at 없으면 거절
 *   PLACEHOLDER_IN_VERIFIED_PACK           <원문 대조 후 기재> 잔존 시 거절
 *   SOURCE_SNAPSHOT_NOT_FOUND              인용한 조문이 코퍼스에 없으면 거절 (Phase 8-3)
 *
 * **돌려서 통과하면 그게 승격 완료다.** 별도 승격 로직을 만들면 검증을 우회하는 경로가 생긴다.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "@cube/factindex";
import { createRegistry, loadPolicyPack } from "@cube/policy";
import { parse } from "yaml";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const REPO_ROOT = join(PKG_ROOT, "..", "..");

/** 워크스페이스에서 실행되므로 상대경로는 **레포 루트** 기준으로도 찾아본다. */
function resolvePath(p: string): string {
  if (existsSync(p)) return p;
  const fromRepo = join(REPO_ROOT, p);
  if (existsSync(fromRepo)) return fromRepo;
  throw new Error(`파일을 찾을 수 없다: ${p}
  (레포 루트 기준으로도 확인함: ${fromRepo})`);
}

function main(): void {
  const rawPath = process.argv[2];
  if (rawPath === undefined) {
    console.error("사용법: npm run promote -w @cube/packdraft -- <팩 YAML 경로>");
    process.exitCode = 1;
    return;
  }

  const path = resolvePath(rawPath);
  // 파일 읽기는 로더 try 밖에 둔다 — 파일 부재를 "로더가 거절했다"로 보고하면 원인 지목이 어긋난다.
  const raw = readFileSync(path, "utf8");

  const { articles } = loadCorpus(SNAPSHOT_DIR);
  const knownSourceIds = new Set(articles.map((a) => a.sourceId));
  console.log(`[승격] ${path}`);
  console.log(`[승격] 코퍼스 조문 ${knownSourceIds.size}개와 대조한다 (이음매 검사)\n`);

  let pack;
  try {
    pack = loadPolicyPack(parse(raw), { knownSourceIds });
  } catch (e) {
    console.error(`✗ 승격 불가\n  ${(e as Error).message}`);
    console.error("\n  이것은 로더가 거절한 것이다. 검증을 우회하지 말고 팩을 고쳐라.");
    process.exitCode = 1;
    return;
  }

  console.log(`✓ 로딩 통과 — pack_kind=${pack.packKind} · 규칙 ${pack.ruleIds.length}개`);
  console.log(`  snapshot ${pack.policySnapshot} · hash ${pack.packHash.slice(0, 16)}…`);

  const registry = createRegistry(pack);
  const stamp = registry.stamp();
  console.log(`  스탬프: synthetic=${stamp.synthetic} notice=${stamp.notice ?? "(없음)"}`);

  const asOf = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const effective = registry.listEffectiveRuleIds(asOf);
  console.log(`\n조회일 ${asOf} 기준 유효 규칙 ${effective.length}개`);
  for (const id of effective) {
    const meta = registry.describeRule(id);
    const primary = meta.sources.filter((s) => s.role === "PRIMARY").map((s) => s.source_id);
    console.log(`  ${id}`);
    console.log(`    ${meta.authorityType} · 시행 ${meta.validFrom} · 승인 ${meta.reviewApproved ? "✓" : "✗"}`);
    console.log(`    PRIMARY 출처 ${primary.join(", ") || "(없음)"}`);
  }

  if (pack.packKind === "VERIFIED_LAW") {
    console.log("\n★ VERIFIED_LAW 승격 완료. 이 팩의 값은 계산에 쓸 수 있다.");
  } else {
    console.log(`\n※ pack_kind=${pack.packKind} — 계산에는 쓸 수 없다.`);
    if (pack.packKind === "UNVERIFIED_DRAFT") {
      console.log("  resolveEffect 를 호출하면 UnverifiedPolicyError 가 난다 (의도된 동작).");
    }
  }
}

main();
