/**
 * 검색 정확도 게이트 — 버킷별 hit@1 / hit@5 / hit@10 + CI exit code.
 *
 *   npm run check:retrieval -w @cube/factindex
 *   npm run check:retrieval -w @cube/factindex -- --sweep     # 가중치 3점 스윕
 *
 * ## API 콜 비용
 * 질의당 임베딩 1회. 평가셋 30문항 = **30콜** (스윕 시 90콜).
 * ⚠️ 키를 A1-v2 와 공유하므로 quota 도 공유한다.
 *
 * ## 왜 버킷별로 따로 재나
 * A1 은 "hit@1 100%" 를 얻었는데 그 평가셋이 **작가 이름 → 그 작가** 뿐이라 exact-match 만 잰
 * 것이었다. browse·semantic 정확도는 한 번도 측정되지 않았다. 전체 평균 하나만 적으면
 * 쉬운 버킷이 어려운 버킷을 가린다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEngine, search } from "../src/search.js";
import type { SearchEngine } from "../src/search.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVAL_PATH = join(PKG_ROOT, "eval", "queries.json");

type Bucket = "exact" | "semantic" | "josa" | "out";

interface EvalQuery {
  readonly bucket: Bucket;
  readonly q: string;
  /**
   * 정답 sourceId. **배열이면 그중 하나만 맞아도 hit** 이다.
   *
   * 왜 복수 정답을 허용하나: 법률과 시행령이 같은 사안을 나눠 규정하는 경우
   * (`RETIRE_22` 적립금의 중도인출 ↔ `RETIRE_D_14` 그 사유 목록) **둘 다 정당한 근거**다.
   * 사양 §5.1 이 `role: PRIMARY`(법률)와 `IMPLEMENTING_DETAIL`(시행령)을 둘 다 출처로 인정한다.
   * 시행령만 정답으로 두면 법률을 1위로 낸 것을 오답으로 세게 되는데, 그건 도메인을 잘못 반영한 것이다.
   *
   * ⚠️ 이건 "결과에 맞춰 평가셋을 고친 것"이 아니다 — 근거는 사양이지 측정 결과가 아니다.
   * 애초에 한 조문만 정답으로 둔 것이 실수였고, 각 항목의 `why` 에 그 판단 근거를 적었다.
   */
  readonly expected: string | readonly string[] | null;
  readonly why: string;
}

function acceptable(expected: string | readonly string[]): string[] {
  return typeof expected === "string" ? [expected] : [...expected];
}

/** 정답 후보 중 가장 앞선 순위 (0-base, 없으면 -1) */
function bestRank(ranked: readonly string[], expected: string | readonly string[]): number {
  let best = -1;
  for (const e of acceptable(expected)) {
    const i = ranked.indexOf(e);
    if (i >= 0 && (best === -1 || i < best)) best = i;
  }
  return best;
}

interface EvalSet {
  readonly authority: string;
  readonly version: string;
  readonly reviewer: string | null;
  readonly queries: readonly EvalQuery[];
}

const AS_OF = "2026-07-31";

interface BucketStat {
  n: number;
  hit1: number;
  hit5: number;
  hit10: number;
  misses: { q: string; expected: string; got: string[] }[];
  /** out 버킷 전용 — 1위 융합 점수 분포 */
  topScores: number[];
}

function emptyStat(): BucketStat {
  return { n: 0, hit1: 0, hit5: 0, hit10: 0, misses: [], topScores: [] };
}

async function runOnce(
  engine: SearchEngine,
  evalSet: EvalSet,
  weights: { bm25Weight: number; vectorWeight: number },
): Promise<Map<Bucket, BucketStat>> {
  const stats = new Map<Bucket, BucketStat>();
  for (const q of evalSet.queries) {
    const stat = stats.get(q.bucket) ?? emptyStat();
    stats.set(q.bucket, stat);
    stat.n += 1;

    const r = await search(engine, q.q, { queryAsOf: AS_OF, topK: 10, ...weights });
    const ranked = r.articles.map((a) => a.sourceId);

    if (q.expected === null) {
      // out 버킷: 정답이 없다. 상위 점수가 낮아야 "모른다"로 이어질 수 있다.
      stat.topScores.push(r.articles[0]?.best.fused ?? 0);
      continue;
    }
    const idx = bestRank(ranked, q.expected);
    if (idx === 0) stat.hit1 += 1;
    if (idx >= 0 && idx < 5) stat.hit5 += 1;
    if (idx >= 0 && idx < 10) stat.hit10 += 1;
    if (idx !== 0) {
      stat.misses.push({ q: q.q, expected: acceptable(q.expected).join(" | "), got: ranked.slice(0, 3) });
    }
  }
  return stats;
}

function report(stats: Map<Bucket, BucketStat>, label: string): number {
  console.log(`\n=== ${label} ===`);
  let answerable = 0;
  let hit1 = 0;
  let hit5 = 0;
  for (const bucket of ["exact", "semantic", "josa"] as const) {
    const s = stats.get(bucket);
    if (s === undefined) continue;
    answerable += s.n;
    hit1 += s.hit1;
    hit5 += s.hit5;
    console.log(
      `  ${bucket.padEnd(9)} n=${String(s.n).padStart(2)}  ` +
        `hit@1 ${String(s.hit1).padStart(2)}/${s.n} (${((s.hit1 / s.n) * 100).toFixed(0)}%)  ` +
        `hit@5 ${String(s.hit5).padStart(2)}/${s.n}  hit@10 ${String(s.hit10).padStart(2)}/${s.n}`,
    );
  }
  const out = stats.get("out");
  if (out !== undefined) {
    const avg = out.topScores.reduce((a, b) => a + b, 0) / Math.max(out.topScores.length, 1);
    const max = Math.max(...out.topScores);
    console.log(
      `  ${"out".padEnd(9)} n=${String(out.n).padStart(2)}  1위 융합점수 평균 ${avg.toFixed(3)} · 최대 ${max.toFixed(3)}` +
        `  (정답 없음 — 낮을수록 '모른다'로 가기 쉽다)`,
    );
  }
  console.log(
    `  ${"소계".padEnd(9)} 답 있는 질의 ${answerable}건 · hit@1 ${hit1}/${answerable} (${((hit1 / answerable) * 100).toFixed(0)}%) · hit@5 ${hit5}/${answerable}`,
  );
  return hit1;
}

async function main(): Promise<void> {
  const evalSet = JSON.parse(readFileSync(EVAL_PATH, "utf8")) as EvalSet;
  if (evalSet.authority !== "ORACLE") throw new Error("평가셋에 authority: ORACLE 이 없다");

  const engine = loadEngine();
  const answerable = evalSet.queries.filter((q) => q.expected !== null).length;
  const sweep = process.argv.includes("--sweep");

  console.log(`[평가] ${evalSet.queries.length}문항 (답 있는 것 ${answerable}) · 조회일 ${AS_OF}`);
  console.log(`[평가] 색인 ${engine.manifest.ragIndexVersion.slice(0, 12)}… · API 콜 ${evalSet.queries.length * (sweep ? 3 : 1)}회 예정`);
  if (evalSet.reviewer === null) {
    console.log("[평가] ⚠️ 정답지 미서명 — 이 수치는 '측정했다'이지 '검증됐다'가 아니다");
  }
  const unapproved = engine.aliases.aliases.filter((a) => !a.approved).length;
  if (unapproved > 0) console.log(`[평가] ⚠️ 별칭 ${unapproved}건 미승인 — 확장 없이 측정한다`);

  const combos = sweep
    ? [
        { bm25Weight: 0.3, vectorWeight: 0.7 },
        { bm25Weight: 0.5, vectorWeight: 0.5 },
        { bm25Weight: 0.7, vectorWeight: 0.3 },
      ]
    : [{ bm25Weight: 0.5, vectorWeight: 0.5 }];

  let best = -1;
  let bestStats: Map<Bucket, BucketStat> | null = null;
  for (const w of combos) {
    const stats = await runOnce(engine, evalSet, w);
    const h1 = report(stats, `bm25 ${w.bm25Weight} / vector ${w.vectorWeight}`);
    if (h1 > best) {
      best = h1;
      bestStats = stats;
    }
  }

  // 실패 케이스는 이름만이 아니라 질의 원문과 실제 top-3 를 찍어야 디버깅이 된다.
  if (bestStats !== null) {
    const allMisses = [...bestStats.values()].flatMap((s) => s.misses);
    if (allMisses.length > 0) {
      console.log(`\n[실패] hit@1 을 놓친 ${allMisses.length}건:`);
      for (const m of allMisses) {
        console.log(`  "${m.q}"`);
        console.log(`    기대 ${m.expected} / 실제 ${m.got.join(" · ")}`);
      }
    }
  }

  if (sweep) {
    console.log("\n※ 3점 스윕이지 최적화가 아니다. 최선을 골랐을 뿐 전역 최적을 주장하지 않는다.");
  }

  const vals = [...(bestStats ?? new Map<Bucket, BucketStat>()).values()];
  const hit1 = vals.reduce((a, s) => a + s.hit1, 0);
  const hit5 = vals.reduce((a, s) => a + s.hit5, 0);

  // CI 게이트 = **회귀 감지**이지 완벽 요구가 아니다.
  // hit@5 전수를 요구하면 미해결 1건 때문에 항상 빨간색이 되어 게이트가 무의미해진다.
  // baseline 보다 나빠지면 실패. 좋아지면 baseline 을 올리고 근거를 문서에 남긴다.
  // 갱신 이력: 20/23 (Phase 6, 법령만) → 22/25 (Phase 3-a 로 퇴직연금감독규정 합류, 답 있는 질의 24→26)
  const BASELINE = { hit1: 22, hit5: 25 };
  console.log(
    `\n[게이트] hit@1 ${hit1}/${answerable} (baseline ${BASELINE.hit1}) · hit@5 ${hit5}/${answerable} (baseline ${BASELINE.hit5})`,
  );
  if (hit1 < BASELINE.hit1 || hit5 < BASELINE.hit5) {
    console.error("✗ baseline 보다 나빠졌다 — 회귀를 조사하라");
    process.exitCode = 1;
  } else {
    console.log("✓ 회귀 없음");
    if (hit1 > BASELINE.hit1 || hit5 > BASELINE.hit5) {
      console.log("  ↑ baseline 을 갱신했다 — BASELINE 상수를 올리고 문서에 근거를 적어라");
    }
  }
}

await main();
