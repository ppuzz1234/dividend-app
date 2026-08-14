/**
 * **답변 품질 측정** — 평가셋 전체를 실제로 답하게 하고, 사람이 검증할 리포트를 남긴다.
 *
 *   npm run check:answers -w @cube/fact
 *   npm run check:answers -w @cube/fact -- --mode LEGAL --asof 2026-07-31
 *
 * ## 자동으로 잴 수 있는 것 / 없는 것
 * 기계가 아는 것은 **형식**뿐이다:
 *   - 위조 인용 (`[n]` 이 제공 범위 밖) — 닫힌 집합이라 확실히 잡힌다
 *   - 인용 없는 주장
 *   - 조건 앵커 재현율 (조문의 숫자·조건이 답에 살아 있는가)
 *   - §4.4 금지 문구
 *   - **기대 조문을 실제로 인용했는가** ← 묶음에 있어도 안 쓰면 소용없다
 *   - 기한 지난 조문을 인용했다면 답이 그 사실을 밝혔는가
 *
 * 기계가 **모르는 것**: 그 문장이 사실인가. 조건을 정확히 옮겼는가. 오해를 낳지 않는가.
 * 그건 사람이 원문과 대조해야 한다. 그래서 이 스크립트는 점수만 내지 않고
 * **답변 전문 + 인용 조문 + 기대 조문 원문**을 한 파일에 붙여 `docs/` 에 남긴다.
 * *"측정했다"와 "검증됐다"는 다르고, 이 파일은 전자를 후자로 만들기 위한 재료다.*
 *
 * ## 비용
 * 질의당 임베딩 1 + 답변 1 = **문항당 2콜**. 평가셋 31문항 = 62콜.
 * 중간에 죽어도 잃지 않도록 **한 문항 끝날 때마다 파일에 append** 한다.
 */

import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEngine, search } from "@cube/factindex";

import {
  defaultLlm,
  generateChecked,
  parseEffort,
  parseThinking,
  resolveAnswerConfig,
  modelVersionOf,
  promptVersionOf,
} from "../src/answer.js";
import type { AnswerConfig, AnswerMode } from "../src/answer.js";
import { assembleBundle, expiredDeadlines, loadBundleSource } from "../src/bundle.js";
import type { BundleItem } from "../src/bundle.js";
import { buildUnmodeledAnswer, isPublishable } from "../src/resolve.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EVAL_DIR = join(PKG_ROOT, "..", "factindex", "eval");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const DOCS = join(PKG_ROOT, "..", "..", "docs");

interface EvalQ {
  readonly bucket: string;
  readonly q: string;
  readonly expected: string | readonly string[] | null;
  readonly why?: string;
}

function expectedList(e: EvalQ["expected"]): string[] {
  if (e === null || e === undefined) return [];
  return (Array.isArray(e) ? e : [e]).map((t) => t.trim()).filter((t) => t !== "");
}

/**
 * 실제 서비스와 같은 값이어야 한다 (server.ts `BUNDLE_MAX_ITEMS`).
 * 다르면 이 측정이 실물을 말하지 않는다 — 실제로 서버를 7 로 줄인 뒤 여기가 10 으로
 * 남아 있었고, 그동안 이 리포트는 **더 이상 존재하지 않는 설정**을 재고 있었다.
 */
const SEED_TOP_K = 4;
const MAX_ITEMS = 7;

/** `out` 버킷(정답 조문 없음)에서 "모른다"로 읽히는 표현. 이게 없으면 지어낸 것이다. */
const IDK_MARKERS = ["확인되지 않", "확인할 수 없", "제공된 조문에", "나와 있지 않", "포함되어 있지 않"];

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * 스윕 한 칸의 설정. CLI 로 받는 이유는 **한 칸 = 한 명령**이 되게 하려는 것이다 —
 * env 를 바꿔가며 돌리면 어느 결과가 어느 설정이었는지 나중에 못 맞춘다.
 */
function sweepOverrides(): Partial<AnswerConfig> {
  const o: Partial<AnswerConfig> = {};
  const model = arg("model", "");
  if (model !== "") Object.assign(o, { model });
  if (process.argv.includes("--effort")) Object.assign(o, { effort: parseEffort(arg("effort", "")) });
  if (process.argv.includes("--thinking")) Object.assign(o, { thinking: parseThinking(arg("thinking", "")) });
  if (flag("nudge")) Object.assign(o, { thinkNudge: true });
  if (flag("brief")) Object.assign(o, { briefNudge: true });
  return o;
}

/** 설정마다 리포트 파일이 달라야 한다 — 안 그러면 다음 칸이 앞 칸을 덮어써서 비교가 불가능해진다. */
function tagOf(c: AnswerConfig): string {
  const bits = [
    c.model.replace(/^claude-/, ""),
    c.effort === null ? "effortDefault" : `e-${c.effort}`,
    c.thinking === null ? "thinkDefault" : `t-${String(c.thinking)}`,
    c.thinkNudge ? "nudge" : null,
    c.briefNudge ? "brief" : null,
  ].filter((s): s is string => s !== null);
  return bits.join("_");
}

function label(c: BundleItem): string {
  return `${c.lawName} ${c.articleLabel}${c.title === null ? "" : `(${c.title})`}`;
}

async function main(): Promise<void> {
  const asOf = arg("asof", "2026-07-31");
  const mode = arg("mode", "PLAIN") as AnswerMode;
  // `--set user` 로 실사용 유형 평가셋을 잰다. 리포트 파일도 세트별로 나눈다 —
  // 한 파일에 덮어쓰면 사람이 채운 판정이 날아간다.
  const setName = arg("set", "search");
  const EVAL_PATH = join(EVAL_DIR, setName === "user" ? "user-queries.json" : setName === "wide" ? "wide-queries.json" : setName === "narrow" ? "narrow-queries.json" : setName === "scope" ? "scope-queries.json" : "queries.json");
  const BASE_OUT = setName === "user" ? "ANSWER-QUALITY-USER" : setName === "wide" ? "ANSWER-QUALITY-WIDE" : setName === "narrow" ? "ANSWER-QUALITY-NARROW" : setName === "scope" ? "ANSWER-QUALITY-SCOPE" : "ANSWER-QUALITY-REPORT";
  const raw = JSON.parse(readFileSync(EVAL_PATH, "utf8")) as { queries?: EvalQ[] } | EvalQ[];
  // `--limit N` — 모델 비교처럼 **같은 문항을 여러 번** 돌릴 때 비용을 묶는다.
  // 앞에서부터 자르므로 어떤 모델이든 같은 문항을 본다(비교 가능성 유지).
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;
  const all = Array.isArray(raw) ? raw : (raw.queries ?? []);
  const qs = Number.isFinite(limit) ? all.slice(0, limit) : all;

  const engine = loadEngine();
  const src = loadBundleSource(SNAPSHOT_DIR);
  // knob 조합이 모델 세대와 안 맞으면 여기서 던진다 — API 400 을 스윕 중간에 맞는 것보다 낫다.
  const config = resolveAnswerConfig(sweepOverrides());
  const byId = new Map(src.articles.map((a) => [a.sourceId, a]));

  // 스윕 칸마다 파일이 갈리게 한다. 설정을 안 준 기본 실행은 예전 파일명을 그대로 쓴다.
  // `--run N` — 같은 설정을 여러 번 돌려 편차를 볼 때. 안 붙이면 2회차가 1회차를 덮어써서
  // **편차를 재려고 돌린 실행이 편차를 지운다.**
  const runNo = arg("run", "");
  const tag = Object.keys(sweepOverrides()).length === 0 ? "" : `-${tagOf(config)}`;
  const OUT_PATH = join(DOCS, `${BASE_OUT}${tag}${runNo === "" ? "" : `-r${runNo}`}.md`);

  console.log(`[답변평가] 세트 ${setName} · ${qs.length}문항 · 말투 ${mode} · 조회일 ${asOf}`);
  console.log(`[답변평가] 모델 ${modelVersionOf(config)} · 프롬프트 ${promptVersionOf(mode)}`);
  console.log(`[답변평가] API 콜 ${qs.length * 2}회 예정 — 문항마다 파일에 append 한다\n`);

  writeFileSync(
    OUT_PATH,
    [
      `# 답변 품질 리포트`,
      "",
      `- 평가셋 \`${setName}\` **${qs.length}문항** · 말투 **${mode}** · 조회일 **${asOf}**`,
      `- 모델 \`${modelVersionOf(config)}\` · 프롬프트 \`${promptVersionOf(mode)}\` · 색인 \`${engine.manifest.ragIndexVersion.slice(0, 12)}…\``,
      `- 묶음: 씨앗 ${String(SEED_TOP_K)} / 상한 ${String(MAX_ITEMS)}`,
      "",
      "> ⚠️ **기계가 잰 것은 형식뿐이다.** 위조 인용·조건 앵커·금지 문구는 자동으로 잡히지만,",
      "> *그 문장이 사실인가* 는 사람이 원문과 대조해야 안다. 각 문항에 **기대 조문 원문**을",
      "> 붙여 두었으니 답변과 나란히 읽고 판정해 주세요. 판정란(`사람 검증:`)은 비워 뒀습니다.",
      "",
      "---",
      "",
    ].join("\n"),
    "utf8",
  );

  const rows: {
    q: string;
    bucket: string;
    citedExpected: boolean | null;
    forged: number;
    uncited: number;
    recall: number;
    forbidden: number;
    publishable: boolean;
    saidIdk: boolean | null;
    sunsetFlagged: boolean | null;
    ms: number;
    chars: number;
    computed: number;
    retried: boolean;
  }[] = [];

  for (const [i, x] of qs.entries()) {
    const wanted = expectedList(x.expected);
    process.stdout.write(`  [${String(i + 1)}/${String(qs.length)}] ${x.q.slice(0, 34)}… `);

    const r = await search(engine, x.q, { queryAsOf: asOf, topK: 10 });
    if (r.articles.length === 0) {
      console.log("검색 0건 → 거절");
      appendFileSync(OUT_PATH, `## ${String(i + 1)}. ${x.q}\n\n검색 결과 0건 → **거절**\n\n---\n\n`, "utf8");
      continue;
    }
    const bundle = assembleBundle(src, r.articles, { seedTopK: SEED_TOP_K, maxItems: MAX_ITEMS });
    // ★ 답변 1콜만 잰다(검색은 따로 0.7초로 측정됨). 모델을 고를 때 품질만 보면
    //   "정확하지만 아무도 안 기다리는 답"을 고르게 된다 — 속도도 지표다.
    const t0 = Date.now();
    const { text: generated, retried } = await generateChecked(x.q, bundle.items, defaultLlm(config), { mode, queryAsOf: asOf });
    const ms = Date.now() - t0;
    const a = buildUnmodeledAnswer(x.q, bundle, generated);

    const citedIds = a.citations.map((c) => c.sourceId);
    const citedExpected = wanted.length === 0 ? null : wanted.some((w) => citedIds.includes(w));
    const forged = a.citeReport.issues.filter((z) => z.kind === "UNKNOWN_REF").length;
    const uncited = a.citeReport.issues.filter((z) => z.kind === "UNCITED_CLAIM").length;
    const saidIdk = wanted.length > 0 ? null : IDK_MARKERS.some((m) => a.text.includes(m));

    // 기한 지난 조문을 인용했다면, 답이 그 기한을 명시했는가 (오늘 도입한 경고의 효과 측정)
    const expiredCited = a.citations.filter((c) => expiredDeadlines(c, asOf).length > 0);
    const sunsetFlagged =
      expiredCited.length === 0
        ? null
        : expiredCited.every((c) => expiredDeadlines(c, asOf).some((d) => a.text.includes(d.slice(0, 4))));

    rows.push({
      q: x.q,
      bucket: x.bucket,
      citedExpected,
      forged,
      uncited,
      recall: a.coverageReport.anchorRecall,
      forbidden: a.forbiddenPhrases.length,
      publishable: isPublishable(a),
      saidIdk,
      sunsetFlagged,
      ms,
      chars: a.text.length,
      computed: a.computedAmounts.length,
      retried,
    });

    const mark =
      citedExpected === null ? (saidIdk === true ? "○ 모른다고 함" : "✗ 지어냈을 수 있음") : citedExpected ? "✓" : "✗";
    console.log(`${mark} 위조${String(forged)} 무인용${String(uncited)} 앵커${(a.coverageReport.anchorRecall * 100).toFixed(0)}% ${String(a.text.length)}자 ${(ms / 1000).toFixed(1)}s${retried ? " ↻재생성" : ""}${a.computedAmounts.length > 0 ? ` ⛔계산${String(a.computedAmounts.length)}` : ""}`);

    // ─── 사람이 검증할 블록 ───
    const expectedTexts = wanted
      .map((w) => {
        const art = byId.get(w);
        return art === undefined
          ? `- \`${w}\` — 코퍼스에 없음`
          : [
              `<details><summary><b>${w}</b> ${art.lawName} 원문 (앞 900자)</summary>`,
              "",
              "```",
              art.text.slice(0, 900),
              "```",
              "</details>",
            ].join("\n");
      })
      .join("\n\n");

    appendFileSync(
      OUT_PATH,
      [
        `## ${String(i + 1)}. ${x.q}`,
        "",
        `- 버킷 \`${x.bucket}\` · 기대 조문 ${wanted.length === 0 ? "**없음 (모른다고 답해야 정답)**" : wanted.map((w) => `\`${w}\``).join(", ")}`,
        `- 자동 검사: 위조 인용 **${String(forged)}** · 인용 없는 주장 **${String(uncited)}** · 조건 앵커 재현율 **${(a.coverageReport.anchorRecall * 100).toFixed(0)}%** · 금지 문구 **${String(a.forbiddenPhrases.length)}** · 내보내기 ${isPublishable(a) ? "가능" : "**불가**"}`,
        wanted.length === 0
          ? `- 모른다고 말했는가: ${saidIdk === true ? "**예**" : "**아니오** ← 지어냈을 수 있다"}`
          : `- 기대 조문을 인용했는가: ${citedExpected === true ? "**예**" : "**아니오** ← 근거가 다른 조문에서 왔다"}`,
        sunsetFlagged === null ? "" : `- 기한 지난 조문 인용 ${String(expiredCited.length)}건 · 답이 기한을 밝혔는가: ${sunsetFlagged ? "**예**" : "**아니오** ← 끝난 규정을 현행처럼 말했을 수 있다"}`,
        "",
        `### 답변`,
        "",
        a.text.trim(),
        "",
        `### 인용한 조문 (${String(a.citations.length)}건)`,
        "",
        ...(a.citations.length === 0
          ? ["_없음_"]
          : a.citations.map((c) => `- \`[${String(c.ref)}]\` \`${c.sourceId}\` ${label(c)} · 시행 ${c.validFrom}`)),
        "",
        ...(a.coverageReport.issues.length === 0
          ? []
          : [`### ⚠️ 조건 누락 의심`, "", ...a.coverageReport.issues.map((z) => `- \`${z.sourceId}\`: ${z.detail}`), ""]),
        ...(wanted.length === 0 ? [] : [`### 기대 조문 원문 (대조용)`, "", expectedTexts, ""]),
        `### 사람 검증:`,
        "",
        `- [ ] 사실이 맞다`,
        `- [ ] 조건이 빠지지 않았다`,
        `- [ ] 오해를 낳지 않는다`,
        `- 메모: `,
        "",
        "---",
        "",
      ]
        .filter((l) => l !== "")
        .join("\n") + "\n",
      "utf8",
    );
  }

  // ─── 집계 ───
  const answered = rows.filter((z) => z.citedExpected !== null);
  const outQs = rows.filter((z) => z.citedExpected === null);
  const sunsetRows = rows.filter((z) => z.sunsetFlagged !== null);
  const pct = (n: number, d: number): string => (d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`);
  const avg = (xs: number[]): string => (xs.length === 0 ? "—" : `${((xs.reduce((p, q) => p + q, 0) / xs.length) * 100).toFixed(0)}%`);

  const summary = [
    "",
    "## 집계 (자동 검사)",
    "",
    `| 지표 | 값 | 뜻 |`,
    `|---|---:|---|`,
    `| 기대 조문 인용률 | ${answered.filter((z) => z.citedExpected === true).length}/${answered.length} (${pct(answered.filter((z) => z.citedExpected === true).length, answered.length)}) | 답이 **정답 조문에서** 왔는가 |`,
    `| 위조 인용 | ${String(rows.reduce((p, z) => p + z.forged, 0))}건 | **0 이어야 한다.** 닫힌 집합이라 새면 곧 결함 |`,
    `| 인용 없는 주장 | ${String(rows.reduce((p, z) => p + z.uncited, 0))}건 | 근거 없이 단정한 문장 수 |`,
    `| 조건 앵커 재현율 | ${avg(rows.map((z) => z.recall))} | 조문의 숫자·조건이 답에 살아 있는 비율 |`,
    `| §4.4 금지 문구 | ${String(rows.reduce((p, z) => p + z.forbidden, 0))}건 | **0 이어야 한다** |`,
    `| 내보내기 가능 | ${rows.filter((z) => z.publishable).length}/${rows.length} | 위조·금지문구 없는 답 |`,
    `| 범위 밖 질의에서 "모른다" | ${outQs.filter((z) => z.saidIdk === true).length}/${outQs.length} | 지어내지 않았는가 |`,
    sunsetRows.length === 0
      ? `| 기한 지난 조문 인용 | 0건 | 이번 평가셋에 없음 |`
      : `| 기한 지난 조문 인용 시 기한 명시 | ${sunsetRows.filter((z) => z.sunsetFlagged === true).length}/${sunsetRows.length} | 끝난 규정을 현행처럼 말하지 않았는가 |`,
    `| **계산한 금액(규칙10 위반)** | ${String(rows.reduce((p, z) => p + z.computed, 0))}건 | **0 이어야 한다.** 재생성 후에도 남은 것 |`,
    `| 재생성 발생 | ${String(rows.filter((z) => z.retried).length)}/${rows.length} | 첫 답이 계산해서 다시 시킨 횟수 |`,
    `| 평균 답변 길이 | ${rows.length === 0 ? "—" : String(Math.round(rows.reduce((p, z) => p + z.chars, 0) / rows.length))}자 | 길이가 곧 생성 시간이다 |`,
    `| 평균 답변 생성 | ${rows.length === 0 ? "—" : (rows.reduce((p, z) => p + z.ms, 0) / rows.length / 1000).toFixed(1)}초 | 검색 제외, LLM 1콜만 |`,
    "",
    "> 이 표는 **형식**만 말한다. 사실 정확성은 위 각 문항의 `사람 검증:` 칸을 채워야 나온다.",
    "",
  ].join("\n");

  appendFileSync(OUT_PATH, summary, "utf8");
  console.log(summary);
  console.log(`리포트: ${OUT_PATH}`);
}

await main();
