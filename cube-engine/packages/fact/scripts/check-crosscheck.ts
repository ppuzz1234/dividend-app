/**
 * **기계 교차검증** — 답변을 조문 원문과 대조해 ○/✗ 를 매긴다.
 *
 *   npm run check:cross -w @cube/fact -- --set user
 *
 * ## 이것은 사람 검증이 아니다
 * `check-answers` 가 잰 것은 **형식**(위조 인용·앵커·금지 문구)이고, 여기서 재는 것은
 * **원문과의 일치**다. 그래도 여전히 기계다 — 그래서 결과를 `사람 검증:` 칸에 쓰지 않고
 * **별도 `기계 교차검증:` 칸**에 쓴다. *사람 판정을 대신하는 게 아니라, 사람이 어디를
 * 먼저 볼지 좁히는 것이다.* ✗ 가 붙은 문항부터 읽으면 된다.
 *
 * ## 왜 다른 모델인가 (사양 §2.2 독립성)
 * 답을 쓴 것이 Claude 인데 검사도 Claude 가 하면 **같은 오독을 두 번 하고
 * "일치했으니 맞다"는 거짓 확신**만 얻는다. 그래서 검사자는 Gemini 다.
 * `packdraft` 의 AI-1(초안 Gemini) ↔ AI-2(반박 Claude) 와 같은 규율을 뒤집어 적용한 것.
 *
 * ## 무엇을 묻나 — "맞습니까?"가 아니라 "틀린 곳을 찾아라"
 * 확인 지향 질문은 모델이 동의하는 쪽으로 기운다. 그래서 **반증을 요구**한다.
 *   ① 답의 숫자가 원문과 다른가
 *   ② 원문에 없는 내용을 말했는가
 *   ③ 원문의 조건을 빠뜨렸는가
 * 판단이 안 서면 `uncertain` — **모호하면 사람에게 넘긴다.**
 *
 * ## 비용
 * 문항당 1콜(Gemini). 답변은 이미 만들어 둔 리포트에서 읽으므로 다시 생성하지 않는다.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadBundleSource } from "../src/bundle.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const DOCS = join(PKG_ROOT, "..", "..", "docs");
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface Verdict {
  readonly verdict: "ok" | "wrong" | "uncertain";
  readonly numberMismatch: string[];
  readonly notInSource: string[];
  readonly missedConditions: string[];
  readonly note: string;
}

const SYSTEM = [
  "너는 법령 조문과 답변을 대조하는 **검사자**다. 동의하는 것이 목적이 아니라 **틀린 곳을 찾는 것**이다.",
  "",
  "아래 세 가지만 본다:",
  "1. numberMismatch — 답변의 금액·비율·기간·나이가 **원문과 다른 것**. 표기 차이(1천800만원 = 18,000,000)는 같은 것으로 본다.",
  "2. notInSource — **원문에 없는데 답변이 사실처럼 말한 것.** 다만 답변이 '확인되지 않는다'고 밝힌 것은 문제가 아니다.",
  "3. missedConditions — 원문이 값에 붙인 **조건인데 답변이 빠뜨린 것**. 질문과 무관한 조항은 세지 마라.",
  "",
  "판정:",
  "  ok        — 위 셋 다 없음",
  "  wrong     — 하나라도 확실히 있음",
  "  uncertain — 판단이 안 섬 (**모호하면 여기다. 사람이 본다**)",
  "",
  "⚠️ 답변이 원문을 **쉬운 말로 풀어 쓴 것**은 문제가 아니다. 값과 조건이 같으면 된다.",
  "⚠️ 답변이 원문보다 **덜 말한 것**도 그 자체로는 문제가 아니다 — 질문에 답하는 데 필요한 조건을 빠뜨렸을 때만 3번이다.",
  "",
  'JSON 만 출력: {"verdict":"ok","numberMismatch":[],"notInSource":[],"missedConditions":[],"note":""}',
].join("\n");

function parseVerdict(raw: string): Verdict {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m === null) return { verdict: "uncertain", numberMismatch: [], notInSource: [], missedConditions: [], note: "응답 파싱 실패" };
  try {
    const o = JSON.parse(m[0]) as Partial<Verdict>;
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return {
      // ★ 모르면 uncertain 이 기본값이다 — ok 가 기본이면 파싱이 어긋날 때 조용히 통과한다.
      verdict: o.verdict === "ok" || o.verdict === "wrong" ? o.verdict : "uncertain",
      numberMismatch: arr(o.numberMismatch),
      notInSource: arr(o.notInSource),
      missedConditions: arr(o.missedConditions),
      note: typeof o.note === "string" ? o.note : "",
    };
  } catch {
    return { verdict: "uncertain", numberMismatch: [], notInSource: [], missedConditions: [], note: "JSON 파싱 실패" };
  }
}

async function ask(apiKey: string, model: string, user: string): Promise<string> {
  const res = await fetch(`${ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // 조문 원문이 길면 지적 목록도 길어진다. 2048 로는 **JSON 이 잘려 파싱이 실패**했고,
      // 그게 전부 `uncertain` 으로 집계돼 "판단 보류 6건"처럼 보였다(실측). 잘림은 판단이 아니다.
      generationConfig: { responseMimeType: "application/json", maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) throw new Error(`교차검증 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * 503(일시 과부하)은 재시도로 넘어간다. 429(쿼터)는 **재시도하지 않는다** —
 * 쿼터는 기다린다고 나아지지 않고 사용자의 quota 만 더 태운다.
 *
 * 실측: 17문항을 돌던 중 503 하나로 **전체가 죽어 작업이 통째로 날아갔다.**
 * 긴 배치에서 한 건의 일시 실패가 전부를 잃게 하면 안 된다.
 */
async function askWithRetry(apiKey: string, model: string, user: string): Promise<string> {
  const waits = [2000, 4000, 8000];
  for (const [i, w] of waits.entries()) {
    try {
      return await ask(apiKey, model, user);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("429") || i === waits.length - 1) throw e;
      if (!msg.includes("503") && !msg.includes("500")) throw e;
      process.stdout.write(`(재시도 ${String(i + 1)}) `);
      await new Promise((r) => setTimeout(r, w));
    }
  }
  throw new Error("unreachable");
}

/** 리포트 마크다운에서 문항별 (질문, 답변, 인용 sourceId) 를 뽑는다. */
function parseReport(md: string): { n: string; q: string; answer: string; cited: string[] }[] {
  const out: { n: string; q: string; answer: string; cited: string[] }[] = [];
  // ★ `---` 로 쪼개면 안 된다 — **답변 본문에 구분선이 들어 있으면** 한 문항이 두 조각으로
  //   갈라져 헤더와 인용 섹션이 흩어진다(실측: 21문항 중 4개가 조용히 건너뛰어졌다).
  //   문항 머리(`## N. …`)를 경계로 쓴다.
  for (const b of md.split(/\n(?=## \d+\. )/)) {
    const h = /^## (\d+)\. (.+)$/m.exec(b);
    const a = /### 답변\n([\s\S]*?)\n### 인용한 조문/.exec(b);
    if (h === null || a === null) continue;
    const cited = [...b.matchAll(/`\[\d+\]` `([A-Z_0-9]+)`/g)].map((m) => m[1] ?? "");
    out.push({ n: h[1] ?? "", q: h[2] ?? "", answer: a[1]?.trim() ?? "", cited });
  }
  return out;
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--set");
  const setName = i >= 0 ? (process.argv[i + 1] ?? "user") : "user";
  const REPORT = join(DOCS, setName === "user" ? "ANSWER-QUALITY-USER.md" : "ANSWER-QUALITY-REPORT.md");
  const OUT = join(DOCS, setName === "user" ? "CROSSCHECK-USER.md" : "CROSSCHECK-SEARCH.md");

  // ★ 답을 쓴 모델과 **다른 provider** 여야 한다. 같으면 같은 오독을 두 번 한다.
  const apiKey = (process.env["LLM_API_KEY"] ?? "").trim();
  if (apiKey === "") throw new Error("LLM_API_KEY 가 없다 — 교차검증은 답변 모델과 다른 provider(Gemini)로 돌린다");
  const model = process.env["CROSSCHECK_MODEL"] ?? "gemini-2.5-flash";

  const items = parseReport(readFileSync(REPORT, "utf8"));
  const src = loadBundleSource(SNAPSHOT_DIR);
  const byId = new Map(src.articles.map((a) => [a.sourceId, a]));

  console.log(`[교차검증] ${items.length}문항 · 검사자 ${model} (답변은 claude — 독립성)`);
  console.log(`[교차검증] API 콜 ${items.length}회 예정\n`);

  const rows: { n: string; q: string; v: Verdict }[] = [];
  for (const it of items) {
    process.stdout.write(`  [${it.n}] ${it.q.slice(0, 30)}… `);
    const sources = it.cited
      .map((id) => {
        const a = byId.get(id);
        return a === undefined ? "" : `── ${a.lawName} ${a.sourceId}\n${a.text}`;
      })
      .filter((x) => x !== "")
      .join("\n\n");
    if (sources === "") {
      console.log("인용 없음 → 건너뜀");
      continue;
    }
    // 한 건이 끝내 실패해도 **나머지를 잃지 않는다.** 실패는 uncertain 으로 남겨 사람에게 넘긴다.
    // 실측: 503 하나가 17문항 작업을 통째로 날렸다. 긴 배치에서 그러면 안 된다.
    let v: Verdict;
    try {
      const prompt = [`질문: ${it.q}`, "", "─── 답변 ───", it.answer, "", "─── 조문 원문 ───", sources].join("\n");
      v = parseVerdict(await askWithRetry(apiKey, model, prompt));
    } catch (e) {
      v = {
        verdict: "uncertain",
        numberMismatch: [],
        notInSource: [],
        missedConditions: [],
        note: `검사 실패: ${(e as Error).message.slice(0, 60)}`,
      };
    }
    rows.push({ n: it.n, q: it.q, v });
    console.log(v.verdict === "ok" ? "○" : v.verdict === "wrong" ? "✗ " + v.note.slice(0, 40) : "△ 판단 보류");
  }

  const mark = (v: Verdict): string => (v.verdict === "ok" ? "○" : v.verdict === "wrong" ? "✗" : "△");
  const lines = [
    `# 기계 교차검증 — ${setName}`,
    "",
    `- 검사자 \`${model}\` · 답변 작성자 \`claude-sonnet-5\` (**서로 다른 provider — 사양 §2.2 독립성**)`,
    `- ${rows.length}문항 · ○ ${rows.filter((r) => r.v.verdict === "ok").length} · ✗ ${rows.filter((r) => r.v.verdict === "wrong").length} · △ ${rows.filter((r) => r.v.verdict === "uncertain").length}`,
    "",
    "> ⚠️ **이것은 사람 검증이 아니다.** 기계가 원문과 답을 대조한 결과이고, 사람 판정을 대신하지 않는다.",
    "> 쓰임새는 **어디를 먼저 볼지 좁히는 것**이다 — `✗` 와 `△` 부터 읽으면 된다.",
    "> `○` 라도 검사자가 놓쳤을 수 있다.",
    "",
    "| | 문항 | 판정 | 지적 |",
    "|---:|---|:---:|---|",
    ...rows.map((r) => {
      const issues = [...r.v.numberMismatch.map((x) => `숫자: ${x}`), ...r.v.notInSource.map((x) => `원문에 없음: ${x}`), ...r.v.missedConditions.map((x) => `조건 누락: ${x}`)];
      return `| ${r.n} | ${r.q} | ${mark(r.v)} | ${issues.length === 0 ? (r.v.note || "—") : issues.join(" · ")} |`;
    }),
    "",
    "## 사람이 먼저 볼 것",
    "",
    ...rows
      .filter((r) => r.v.verdict !== "ok")
      .map((r) => `- **#${r.n} ${r.q}** — ${r.v.note || "판단 보류"}`),
  ];
  writeFileSync(OUT, lines.join("\n") + "\n", "utf8");
  console.log(`\n○ ${rows.filter((r) => r.v.verdict === "ok").length} · ✗ ${rows.filter((r) => r.v.verdict === "wrong").length} · △ ${rows.filter((r) => r.v.verdict === "uncertain").length}`);
  console.log(`리포트: ${OUT}`);
}

await main();
