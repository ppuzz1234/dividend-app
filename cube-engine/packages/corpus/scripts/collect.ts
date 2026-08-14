/**
 * 정책 코퍼스 수집 러너 (사양 §13 순서 4).
 *
 *   npm run collect -w @cube/corpus
 *   npm run collect -w @cube/corpus -- 소득세법        # 일부만
 *
 * 산출물: `snapshots/<abbrev>.json` — 원문 스냅샷. **정책 팩이 아니다.**
 * 여기서 세율·한도를 뽑아 정책 팩으로 만드는 건 다음 단계이고 사람 승인이 필요하다 (절대 규칙 0·1).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { fetchLawBody, resolveOc, searchLaw } from "../src/lawApi.js";
import { buildSnapshot } from "../src/parse.js";
import type { CollectTarget } from "../src/types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(PKG_ROOT, "snapshots");

/** 법제처 서버에 예의. 개발계정 트래픽 한도(1만/일)에도 여유가 크다. */
const THROTTLE_MS = 400;

function pickEntry(
  hits: readonly Awaited<ReturnType<typeof searchLaw>>[number][],
  lawName: string,
): Awaited<ReturnType<typeof searchLaw>>[number] {
  // 정확일치만 — 부분일치로 고르면 "소득세법" 질의에 "소득세법 시행령" 이 잡힌다.
  const exact = hits.filter((h) => h.lawName === lawName);
  if (exact.length === 0) {
    const candidates = hits.slice(0, 8).map((h) => `    - ${h.lawName}`).join("\n");
    throw new Error(
      `"${lawName}" 과 정확히 일치하는 법령이 없다. targets.json 의 lawName 을 아래 중 하나로 맞춰라:\n${candidates}`,
    );
  }
  // 같은 이름이 여러 판(현행/시행예정/연혁)으로 잡히면 현행을 쓴다.
  return exact.find((h) => h.historyCode === "현행") ?? exact[0]!;
}

async function main(): Promise<void> {
  const only = process.argv.slice(2);
  const raw = JSON.parse(await readFile(join(PKG_ROOT, "targets.json"), "utf8")) as {
    targets: CollectTarget[];
  };
  const targets = only.length > 0 ? raw.targets.filter((t) => only.includes(t.lawName)) : raw.targets;

  if (targets.length === 0) throw new Error(`수집 대상이 없다 (인자: ${only.join(", ") || "없음"})`);

  const oc = resolveOc();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[코퍼스] 수집 시작 — 대상 ${targets.length}건, 출력 ${OUT_DIR}\n`);

  const failures: string[] = [];
  let totalArticles = 0;

  for (const [i, target] of targets.entries()) {
    const n = `${i + 1}/${targets.length}`;
    try {
      console.log(`[${n}] ${target.lawName} (${target.abbrev}) — 검색 중…`);
      const hits = await searchLaw(oc, target.lawName);
      const entry = pickEntry(hits, target.lawName);
      console.log(
        `[${n}]   MST=${entry.mst} ${entry.lawKind} ${entry.historyCode} ` +
          `공포 ${entry.promulgatedAt} 시행 ${entry.enforcedAt}`,
      );

      await sleep(THROTTLE_MS);
      console.log(`[${n}]   본문 조회 중…`);
      const { json, url } = await fetchLawBody(oc, entry.mst);

      const snapshot = buildSnapshot({
        entry,
        body: json,
        abbrev: target.abbrev,
        sourceUrl: url,
        collectedAt: new Date().toISOString(),
      });

      const outPath = join(OUT_DIR, `${target.abbrev}.json`);
      await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      totalArticles += snapshot.articles.length;
      console.log(`[${n}]   ✓ 조문 ${snapshot.articles.length}개 → ${target.abbrev}.json\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${target.lawName}: ${msg}`);
      console.error(`[${n}]   ✗ 실패 — ${msg}\n`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(
    `[코퍼스] 완료 — 성공 ${targets.length - failures.length}/${targets.length}건, 조문 ${totalArticles}개`,
  );
  if (failures.length > 0) {
    console.error(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

await main();
