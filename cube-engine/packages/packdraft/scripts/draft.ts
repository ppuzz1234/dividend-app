/**
 * 초안 생성 CLI (사양 §2.2 3~4단계).
 *
 *   npm run draft -w @cube/packdraft -- RETIRE_D_17_2
 *   npm run draft -w @cube/packdraft -- TAXEX_91_18 --no-attack
 *
 * 산출물: `packages/policy/packs/drafts/<sourceId>.draft.yaml` (pack_kind: UNVERIFIED_DRAFT)
 *
 * API 콜: AI-1 1회 + AI-2 1회 = **2콜**. `--no-attack` 이면 1콜.
 * ⚠️ AI-2 는 AI-1 과 **다른 provider** 여야 한다(§2.2 독립성) — `ATTACK_API_KEY` 필요.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "@cube/factindex";
import { assembleBundle, loadBundleSource } from "@cube/fact";

import { attackDraft, defaultAttackLlm, resolveAttackConfig } from "../src/attack.js";
import { buildDiffTable, renderDiffTable } from "../src/diffTable.js";
import { defaultLlm, draftFromArticle, resolveDraftConfig } from "../src/draft.js";
import { draftToPackYaml } from "../src/toYaml.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const OUT_DIR = join(PKG_ROOT, "..", "policy", "packs", "drafts");

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const noAttack = args.includes("--no-attack");
  const sourceId = args.find((a) => !a.startsWith("--"));
  if (sourceId === undefined) {
    console.error('사용법: npm run draft -w @cube/packdraft -- <sourceId> [--no-attack]');
    process.exitCode = 1;
    return;
  }

  const { articles } = loadCorpus(SNAPSHOT_DIR);
  const a = articles.find((x) => x.sourceId === sourceId);
  if (a === undefined) {
    console.error(`${sourceId} 를 코퍼스에서 찾지 못했다`);
    process.exitCode = 1;
    return;
  }

  const label = a.articleSubNo === null ? `제${a.articleNo}조` : `제${a.articleNo}조의${a.articleSubNo}`;
  console.log(`[초안] ${a.lawName} ${label} (${sourceId}) · 원문 ${a.text.length}자`);

  // ★ 조문 하나만 주면 안 된다. 파라미터가 위임 사슬 끝에 있는 경우가 흔하다 —
  //   실측: RETIRE_D_17_2 는 한도를 직접 정하지 않고 「소득세법 시행령」 §40의2 를 가리킨다.
  //   Phase 9 의 묶음 조립(인용 폐포)을 그대로 써서 참조 조문까지 읽힌다.
  const bundleSrc = loadBundleSource(SNAPSHOT_DIR);
  const bundle = assembleBundle(bundleSrc, [{ sourceId } as never], { seedTopK: 1, maxItems: 6 });
  const context = bundle.items
    .map(
      (i) =>
        `── ${i.lawName} ${i.articleLabel}${i.title === null ? "" : `(${i.title})`} (${i.sourceId})\n${i.text}`,
    )
    .join("\n\n");
  console.log(`[초안] 위임 사슬 포함 ${bundle.items.length}개 조문을 읽힌다 (${bundle.items.map((i) => i.sourceId).join(", ")})`);

  const dcfg = resolveDraftConfig();
  console.log(`[초안] AI-1 ${dcfg.model} 생성 중…`);
  const draft = await draftFromArticle(
    { sourceId, lawName: a.lawName, articleLabel: label, text: context },
    defaultLlm(dcfg),
    dcfg.model,
  );
  console.log(`[초안] 규칙 ${draft.rules.length}개 추출\n`);

  let attack = null;
  if (!noAttack) {
    try {
      const acfg = resolveAttackConfig();
      console.log(`[공격] AI-2 ${acfg.model} 반례 검토 중…`);
      attack = await attackDraft(context, draft.rules, defaultAttackLlm(acfg), acfg.model);
      console.log(`[공격] 보류 ${attack.hold.length}건\n`);
    } catch (e) {
      console.error(`[공격] 건너뜀 — ${(e as Error).message}\n`);
      console.error("       ⚠️ AI-2 없이 만든 초안은 §2.2 4단계를 거치지 않았다. 사람이 더 꼼꼼히 봐야 한다.\n");
    }
  }

  // 대조는 **묶음 전체**와 한다 — 인용이 참조 조문에서 온 것일 수 있다.
  console.log(renderDiffTable(buildDiffTable(context, draft.rules, attack)));

  const yaml = draftToPackYaml(draft.rules, {
    policySnapshot: `KR-TAX-DRAFT-${sourceId}`,
    sourceId,
    authorityType: a.authorityType,
    promulgatedAt: a.validFrom,
    validFrom: a.validFrom,
    recordedAt: new Date().toISOString().slice(0, 10),
    taxYears: [Number(a.validFrom.slice(0, 4))],
  });
  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${sourceId}.draft.yaml`);
  writeFileSync(out, yaml, "utf8");
  console.log(`\n초안 저장: packages/policy/packs/drafts/${sourceId}.draft.yaml`);
  console.log("★ 이 파일은 UNVERIFIED_DRAFT 다. 계산에 못 들어간다. 승인은 사람이 YAML 을 편집해야 한다.");
}

await main();
