/**
 * **묶음 적중률** — 답변이 볼 조문 안에 정답이 들어 있는가.
 *
 *   npm run check:bundle -w @cube/fact
 *
 * ## 왜 hit@1 만으로는 부족한가
 * `check-retrieval` 은 **검색 순위**를 잰다. 그런데 이 시스템은 상위 1건으로 답하지 않는다 —
 * 씨앗 4건을 뽑고 **인용 폐포로 확장**해 10~14개를 통째로 읽힌다.
 *
 * 실측 예: `"개인형퇴직연금 부담금을 얼마까지 낼 수 있나"` 는 hit@1 을 놓쳤다(1위가 `RETIRE_24`,
 * 정답은 `RETIRE_D_17_2`). 그런데 `RETIRE_24`(법률)가 **자기 시행령을 인용**하므로 묶음에는
 * 정답이 들어온다. 즉 **검색이 틀려도 답은 맞을 수 있다.**
 *
 * 그래서 두 수치를 같이 봐야 한다:
 *  - `hit@1`    — 검색 자체의 품질. 낮으면 프롬프트가 무관한 조문으로 붐빈다.
 *  - `묶음 적중` — **답변 정확도의 상한.** 여기 없으면 어떤 프롬프트로도 답할 수 없다.
 *
 * ## API 콜
 * 질의당 임베딩 1회. LLM 은 부르지 않는다 — 묶음까지만 보므로.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEngine, search } from "@cube/factindex";

import { assembleBundle, loadBundleSource } from "../src/bundle.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVAL_DIR = join(PKG_ROOT, "..", "factindex", "eval");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

interface EvalQ {
  readonly bucket: string;
  readonly q: string;
  /** 문자열 하나이거나 배열(둘 중 하나면 정답)이거나 null(정답 없음). */
  readonly expected: string | readonly string[] | null;
  readonly why?: string;
}

function expectedList(e: EvalQ["expected"]): string[] {
  if (e === null || e === undefined) return [];
  return (Array.isArray(e) ? e : [e]).map((t) => t.trim()).filter((t) => t !== "");
}

/** 실제 서비스와 **같은 값**이어야 한다 — 다르면 이 측정이 실물을 말하지 않는다 (server.ts 참조). */
const miArg = process.argv.indexOf("--max-items");
const SEED_TOP_K = 4;
const MAX_ITEMS = miArg >= 0 ? Number(process.argv[miArg + 1]) : 10;

async function main(): Promise<void> {
  // `--set user` 로 유형별 평가셋을 잰다. 기본은 검색 평가셋.
  const setArg = process.argv.indexOf("--set");
  const setName = setArg >= 0 ? (process.argv[setArg + 1] ?? "search") : "search";
  const EVAL_PATH = join(EVAL_DIR, setName === "user" ? "user-queries.json" : "queries.json");
  const dateArg = process.argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const asOf = dateArg ?? "2026-07-31";
  // 평가셋은 { version, queries: [...] } 형태다 — 배열로 가정했다가 터졌다(실측).
  const raw = JSON.parse(readFileSync(EVAL_PATH, "utf8")) as
    | { queries?: EvalQ[]; authority?: string }
    | EvalQ[];
  if (!Array.isArray(raw) && raw.authority !== "ORACLE") {
    console.log(`[묶음] ⚠️ 정답지 authority=${raw.authority ?? "?"} — '측정했다'이지 '검증됐다'가 아니다
`);
  }
  const all = Array.isArray(raw) ? raw : (raw.queries ?? []);
  const qs = all.filter((x) => expectedList(x.expected).length > 0);

  // `--aliases <경로>` — 별칭 사전을 갈아끼워 **"승인하면 얼마나 달라지나"** 를 잰다.
  //   레포의 사전은 건드리지 않는다. 승인은 사람의 것이고, 측정은 사본으로 한다.
  const alArg = process.argv.indexOf("--aliases");
  const aliasesPath = alArg >= 0 ? process.argv[alArg + 1] : undefined;
  const engine = aliasesPath === undefined ? loadEngine() : loadEngine({ aliasesPath });
  if (aliasesPath !== undefined) console.log(`[묶음] 별칭 사전 교체: ${aliasesPath}\n`);
  const src = loadBundleSource(SNAPSHOT_DIR);
  console.log(`[묶음] 세트 ${setName} · ${qs.length}문항 · 조회일 ${asOf} · 씨앗 ${SEED_TOP_K} / 상한 ${MAX_ITEMS}`);
  console.log(`[묶음] API 콜 ${qs.length}회 예정 (임베딩만 — LLM 은 안 부른다)\n`);

  const byBucket = new Map<string, { n: number; rank1: number; inBundle: number }>();
  const misses: { q: string; expected: string; got: string[] }[] = [];
  let viaExpansion = 0;

  for (const x of qs) {
    const r = await search(engine, x.q, { queryAsOf: asOf, topK: 10 });
    const b = assembleBundle(src, r.articles, { seedTopK: SEED_TOP_K, maxItems: MAX_ITEMS });
    const ids = b.items.map((i) => i.sourceId);
    // `expected` 는 **문자열이거나 배열**이다(배열 = 이 중 하나면 정답).
    // 배열을 문자열로 가정했다가 담긴 것을 miss 로 셌다(실측) —
    // **평가 코드의 버그가 시스템의 결함으로 보였다.** 측정기부터 의심해야 한다.
    const wanted = expectedList(x.expected);
    const hit1 = wanted.includes(r.articles[0]?.sourceId ?? "");
    const inBundle = wanted.some((w) => ids.includes(w));

    const cur = byBucket.get(x.bucket) ?? { n: 0, rank1: 0, inBundle: 0 };
    cur.n += 1;
    if (hit1) cur.rank1 += 1;
    if (inBundle) cur.inBundle += 1;
    byBucket.set(x.bucket, cur);

    // ★ 검색 상위 4건에는 없는데 묶음에는 있다 = **인용 확장이 구해낸 것**이다.
    const seedIds = r.articles.slice(0, SEED_TOP_K).map((a) => a.sourceId);
    if (inBundle && !wanted.some((w) => seedIds.includes(w))) {
      viaExpansion += 1;
      const via = b.items.find((i) => wanted.includes(i.sourceId));
      console.log(`  [확장이 구함] "${x.q}" → ${via?.sourceId ?? "?"} (편입 ${via?.reason ?? "?"})`);
    }
    if (!inBundle) misses.push({ q: x.q, expected: wanted.join(" 또는 "), got: ids });
  }

  console.log("");
  let n = 0;
  let r1 = 0;
  let ib = 0;
  for (const [bucket, v] of byBucket) {
    n += v.n;
    r1 += v.rank1;
    ib += v.inBundle;
    console.log(
      `  ${bucket.padEnd(9)} n=${String(v.n).padStart(2)}  hit@1 ${v.rank1}/${v.n}  ` +
        `묶음 적중 ${v.inBundle}/${v.n}`,
    );
  }
  console.log(`  ${"합계".padEnd(9)} n=${String(n).padStart(2)}  hit@1 ${r1}/${n}  묶음 적중 ${ib}/${n}`);
  console.log(`\n  인용 확장이 구해낸 건수: ${viaExpansion}건 — 검색만으로는 놓쳤을 질의다.`);

  // ─── 게이트 ───
  // 숫자만 찍으면 다음 사람이 조용히 떨어뜨린다. **baseline 을 코드에 박고 exit code 로 막는다.**
  // 올릴 때는 측정을 근거로 이 숫자를 함께 올린다 (2026-08-03 측정 기준).
  // 세트마다 baseline 이 다르다. 유형별 세트는 **처음 측정한 값**을 박는다(2026-08-03).
  const BASE: Record<string, { bundle: number; hit1: number }> = {
    search: { bundle: 25, hit1: 22 },
    // 유형별 세트. **별칭 9건 승인 후** 값이다(2026-08-03, Seohyun Park 승인).
    //   승인 전 16/10 → 승인 후 18/13. 예측치와 정확히 일치했다.
    //   ★ 개선은 baseline 을 올려야 잠긴다 — 안 올리면 누가 16 으로 되돌려도 게이트가 조용하다.
    user: { bundle: 18, hit1: 13 },
  };
  const b0 = BASE[setName] ?? { bundle: 0, hit1: 0 };
  const BASELINE_IN_BUNDLE = b0.bundle;
  const BASELINE_HIT1 = b0.hit1;
  console.log(
    `
[게이트] 묶음 적중 ${ib}/${n} (baseline ${String(BASELINE_IN_BUNDLE)}) · hit@1 ${r1}/${n} (baseline ${String(BASELINE_HIT1)})`,
  );
  if (ib < BASELINE_IN_BUNDLE || r1 < BASELINE_HIT1) {
    console.error("✗ 회귀 — 답변 컨텍스트에서 정답 조문이 빠졌다. 검색·묶음 변경을 되돌려라.");
    process.exitCode = 1;
  } else {
    console.log("✓ 회귀 없음");
  }

  if (misses.length > 0) {
    console.log(`\n[구멍] 묶음에도 없는 ${misses.length}건 — **어떤 프롬프트로도 답할 수 없다**:`);
    for (const m of misses) console.log(`  "${m.q}" 기대 ${m.expected}\n     묶음: ${m.got.join(", ")}`);
  } else {
    console.log("\n[구멍] 없음 — 모든 정답 조문이 답변 컨텍스트에 들어갔다.");
  }
}

await main();
