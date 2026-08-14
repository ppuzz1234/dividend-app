/**
 * 대조표 출력 — 승인 전에 사람이 봐야 할 것.
 *
 *   npm run review -w @cube/packdraft -- packages/policy/packs/drafts/RETIRE_D_17_2.draft.yaml
 *
 * **이 스크립트는 아무것도 승인하지 않는다.** 원문과 초안을 나란히 보여줄 뿐이다.
 * 승인은 YAML 을 손으로 편집하는 것으로만 이뤄진다 (`diffTable.ts` 헤더 참조).
 * API 콜 0회.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "@cube/factindex";
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

interface PackRule {
  id: string;
  effect?: { value?: unknown; unit?: string };
  sources?: { source_id: string; role: string }[];
  review?: { approved?: boolean; reviewer_id?: string | null; reviewed_at?: string | null };
}

function main(): void {
  const rawPath = process.argv[2];
  if (rawPath === undefined) {
    console.error("사용법: npm run review -w @cube/packdraft -- <초안 YAML 경로>");
    process.exitCode = 1;
    return;
  }
  const path = resolvePath(rawPath);
  const pack = parse(readFileSync(path, "utf8")) as { pack_kind?: string; rules?: PackRule[] };
  const rules = pack.rules ?? [];
  const { articles } = loadCorpus(SNAPSHOT_DIR);

  console.log(`[검토] ${path}`);
  console.log(`[검토] pack_kind=${pack.pack_kind} · 규칙 ${rules.length}개\n`);

  let approved = 0;
  for (const r of rules) {
    const src = r.sources?.find((s) => s.role === "PRIMARY")?.source_id;
    const article = articles.find((a) => a.sourceId === src);
    const ok = r.review?.approved === true;
    if (ok) approved += 1;

    console.log(`${ok ? "✓" : "☐"} ${r.id}`);
    console.log(`    값      ${JSON.stringify(r.effect?.value)} (${r.effect?.unit})`);
    console.log(`    출처    ${src ?? "(없음)"} ${article === undefined ? "← 코퍼스에 없다" : `— ${article.lawName}`}`);
    console.log(`    승인    ${ok ? `${r.review?.reviewer_id} · ${r.review?.reviewed_at}` : "미승인"}`);
    if (article !== undefined) {
      console.log(`    원문(앞 300자):`);
      console.log(`      ${article.text.slice(0, 300).replace(/\n/g, "\n      ")}…`);
    }
    console.log("");
  }

  console.log("─".repeat(70));
  console.log(`승인 ${approved}/${rules.length}`);
  console.log("\n이 도구는 승인하지 않는다. YAML 을 열어 approved/reviewer_id/reviewed_at 을 손으로 적어라.");
  console.log("그 다음 `npm run promote -w @cube/packdraft -- <경로>` 로 검증한다.");
}

main();
