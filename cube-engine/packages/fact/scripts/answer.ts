/**
 * FACT 답변 CLI — 미션 1 의 실제 산출물.
 *
 *   npm run answer -w @cube/fact -- "ISA 비과세 한도 얼마야?"
 *
 * 흐름: 검색 → 조문 묶음 조립(인용 폐포) → LLM 이 통째로 읽고 인용 달아 답 → 검증 → 출력.
 * API 콜: 임베딩 1 + 답변 1 = **2콜**. ⚠️ quota 는 A1-v2 와 공유.
 *
 * ⚠️ 지금은 Registry 가 비어 있어 **전부 `UNMODELED_OFFICIAL_SOURCE`** 로 나온다.
 * 그게 고장이 아니라 설계대로다 — 승인된 규칙이 생기면 그 부분만 확정 팩트로 올라간다.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEngine, search } from "@cube/factindex";

import { assembleBundle, loadBundleSource } from "../src/bundle.js";
import { defaultLlm, generateAnswer, resolveAnswerConfig } from "../src/answer.js";
import { buildUnmodeledAnswer, isPublishable, reject } from "../src/resolve.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

function today(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let asOf = today();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--asof" && args[i + 1] !== undefined) asOf = args[++i]!;
    else rest.push(args[i]!);
  }
  const query = rest.join(" ").trim();
  if (query === "") {
    console.error('사용법: npm run answer -w @cube/fact -- "질문" [--asof YYYY-MM-DD]');
    process.exitCode = 1;
    return;
  }

  const engine = loadEngine();
  const src = loadBundleSource(SNAPSHOT_DIR);
  const config = resolveAnswerConfig();

  console.log(`[FACT] 조회일 ${asOf} · 색인 ${engine.manifest.ragIndexVersion.slice(0, 12)}… · 모델 ${config.provider}/${config.model}`);
  console.log(`[FACT] 검색 중…`);
  const r = await search(engine, query, { queryAsOf: asOf, topK: 10 });

  if (r.articles.length === 0) {
    const rj = reject("검색 결과 없음");
    console.log(`\n${rj.message}`);
    return;
  }

  const bundle = assembleBundle(src, r.articles, { seedTopK: 4, maxItems: 10 });
  console.log(
    `[FACT] 조문 묶음 ${bundle.items.length}개 (검색 ${bundle.seedCount} + 인용 확장 ${bundle.expandedCount})`,
  );
  console.log(`[FACT] 답변 생성 중…\n`);

  const generated = await generateAnswer(query, bundle.items, defaultLlm(config));
  const a = buildUnmodeledAnswer(query, bundle, generated);

  console.log("─".repeat(70));
  console.log(`[원문 인용 · 검증된 규칙 아님]\n`);
  console.log(a.text.trim());
  console.log(`\n※ ${a.notice}`);

  console.log(`\n${"─".repeat(70)}\n근거 조문 (${a.citations.length}개)`);
  for (const c of a.citations) {
    console.log(
      `  [${c.ref}] ${c.lawName} ${c.articleLabel}${c.title === null ? "" : `(${c.title})`}` +
        `\n      시행 ${c.validFrom} · ${c.authorityType} · 해시 ${c.textHash.slice(0, 12)}…` +
        (c.hasUnattachedMok ? `\n      ⚠️ 소속 호 미상인 「[각 목]」 항목 포함` : ""),
    );
  }

  console.log(`\n${"─".repeat(70)}\n검증`);
  console.log(`  위조 인용        ${a.citeReport.issues.filter((i) => i.kind === "UNKNOWN_REF").length}건`);
  console.log(`  인용 없는 주장   ${a.citeReport.issues.filter((i) => i.kind === "UNCITED_CLAIM").length}건`);
  console.log(`  조건 앵커 재현율 ${(a.coverageReport.anchorRecall * 100).toFixed(0)}%`);
  for (const i of a.coverageReport.issues) console.log(`    ⚠️ ${i.sourceId}: ${i.detail}`);
  console.log(`  §4.4 금지 문구   ${a.forbiddenPhrases.length === 0 ? "없음" : a.forbiddenPhrases.join(", ")}`);
  console.log(`  answerPayloadHash ${a.answerPayloadHash.slice(0, 16)}…`);
  console.log(`\n  내보내기 가능: ${isPublishable(a) ? "✓" : "✗ (위조 인용 또는 금지 문구)"}`);
}

await main();
