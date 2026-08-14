/**
 * 검색 CLI — 미션 1 의 **첫 동작물**.
 *
 *   npm run ask -w @cube/factindex -- "IRP 중도인출 사유"
 *   npm run ask -w @cube/factindex -- "ISA 비과세 한도" --asof 2026-07-31 --top 5
 *
 * ⚠️ 이 CLI 가 내놓는 것은 **검색 결과이지 팩트가 아니다.** 근거 조문을 찾아 보여줄 뿐,
 * "그래서 답이 무엇인가"는 Registry 가 결정한다(사양 §1.1). 팩트 응답은 Phase 9 의 일이다.
 *
 * API 콜: 질의당 임베딩 1회.
 */

import { loadEngine, search } from "../src/search.js";

function parseArgs(argv: readonly string[]): { query: string; asOf: string; top: number } {
  const rest: string[] = [];
  let asOf = "";
  let top = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--asof" && argv[i + 1] !== undefined) asOf = argv[++i]!;
    else if (argv[i] === "--top" && argv[i + 1] !== undefined) top = Number(argv[++i]);
    else rest.push(argv[i]!);
  }
  if (asOf === "") {
    // 조회일 기본값은 오늘(KST). 시간 상태를 저장하지 않고 조회 시점에 계산한다(사양 §5.1).
    const now = new Date(Date.now() + 9 * 3600 * 1000);
    asOf = now.toISOString().slice(0, 10);
  }
  return { query: rest.join(" ").trim(), asOf, top };
}

async function main(): Promise<void> {
  const { query, asOf, top } = parseArgs(process.argv.slice(2));
  if (query === "") {
    console.error('사용법: npm run ask -w @cube/factindex -- "질문" [--asof YYYY-MM-DD] [--top N]');
    process.exitCode = 1;
    return;
  }

  const engine = loadEngine();
  console.log(
    `[검색] 청크 ${engine.chunks.length} · 색인 ${engine.manifest.ragIndexVersion.slice(0, 12)}… · 조회일 ${asOf}\n`,
  );

  const r = await search(engine, query, { queryAsOf: asOf, topK: top });

  if (r.appliedAliases.length > 0) {
    console.log(`[별칭] ${r.appliedAliases.map((a) => `${a.term}→${a.expandsTo.join("/")}`).join(", ")}`);
  }
  if (r.skippedUnapproved.length > 0) {
    console.log(`[별칭] ⚠️ 미승인이라 건너뜀: ${r.skippedUnapproved.join(", ")} (사람 승인 필요)`);
  }
  if (r.effectiveQuery !== query) console.log(`[질의] "${query}" → "${r.effectiveQuery}"`);
  console.log(`[시점] ${r.filteredByDate}개 청크가 조회일 기준 미시행으로 제외됨\n`);

  if (r.articles.length === 0) {
    console.log("결과 없음.");
    return;
  }

  for (const [i, a] of r.articles.entries()) {
    const c = a.best.chunk;
    const label = c.articleSubNo === null ? `제${c.articleNo}조` : `제${c.articleNo}조의${c.articleSubNo}`;
    console.log(
      `${String(i + 1).padStart(2)}. ${a.sourceId.padEnd(16)} ${c.lawName} ${label}` +
        `${c.title === null ? "" : `(${c.title})`}`,
    );
    console.log(
      `    fused ${a.best.fused.toFixed(3)} = bm25 ${a.best.bm25.toFixed(3)}·${(0.5).toFixed(1)} + vec ${a.best.vector.toFixed(3)}·${(0.5).toFixed(1)}` +
        `  | 시행 ${c.validFrom} | 매칭청크 ${a.matchedChunks}`,
    );
    if (c.hasUnattachedMok) {
      console.log(`    ⚠️ 이 조각에는 소속 호 미상인 「[각 목]」 항목이 있다`);
    }
    console.log(`    ${c.text.trim().replace(/\n/g, " ").slice(0, 160)}…\n`);
  }

  console.log(
    "※ 이것은 검색 결과이지 팩트가 아니다. 승인된 규칙에 근거한 답변은 Fact Resolver(Phase 9)가 만든다.",
  );
}

await main();
