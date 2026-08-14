/**
 * **저장된 리포트를 다시 채점한다 — API 를 한 번도 안 쓴다.**
 *
 *   npm run rescore -w @cube/fact
 *   npm run rescore -w @cube/fact -- --glob ANSWER-QUALITY-WIDE
 *
 * ## 왜 필요한가
 * 채점기를 고치면 "그래서 어제 잰 숫자는 뭐가 되나"를 알아야 한다. 그런데 평가를 다시
 * 돌리면 **답변을 새로 생성**하게 되고, 그러면 채점기 변화와 생성 변동이 섞여
 * 무엇 때문에 숫자가 달라졌는지 알 수 없다. 게다가 비싸다.
 *
 * 답변 전문과 인용 조문은 이미 리포트에 있다. 조문 원문은 스냅샷에 있다. 둘을 다시
 * 붙이면 **같은 답변을 새 채점기로** 잴 수 있다 — 생성 변동 0, API 콜 0.
 *
 * ## 한계 (알고 쓰는 것)
 * 리포트에는 **인용된 조문**만 적혀 있고 묶음 전체는 안 적혀 있다. `checkCoverage` 는
 * 인용된 조문만 보므로 결과는 같지만, 묶음에 있었으나 인용 안 된 조문은 재현되지 않는다.
 * 인용 번호(`ref`)는 리포트의 `[n]` 을 그대로 쓴다.
 */

import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkCoverage } from "../src/coverage.js";
import type { BundleItem } from "../src/bundle.js";
import { loadBundleSource } from "../src/bundle.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const DOCS = join(PKG_ROOT, "..", "..", "docs");

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

interface ParsedQ {
  readonly no: string;
  readonly query: string;
  /** 리포트에 기록된 당시 앵커(%) */
  readonly recorded: number;
  readonly answer: string;
  readonly cites: { ref: number; sourceId: string }[];
}

/** 리포트 한 편에서 문항별 답변·인용을 뽑는다. */
function parseReport(md: string): ParsedQ[] {
  const out: ParsedQ[] = [];
  // `## 12. 질문` 머리에서만 쪼갠다.
  // ⚠️ 그냥 `^## ` 로 쪼개면 **답변 본문의 마크다운 제목**(`## 언제 옮길 수 있나요?`)에서도
  //    끊겨서 문항이 조각난다. 실측: 10문항 리포트가 5문항으로 읽혔다.
  //    번호가 붙은 제목만 문항 머리이므로 lookahead 로 숫자를 요구한다.
  for (const seg of md.split(/^## (?=\d+\.\s)/m).slice(1)) {
    const head = /^(\d+)\.\s+(.*)$/m.exec(seg);
    if (head === null) continue;
    const recorded = /조건 앵커 재현율 \*\*(\d+)%\*\*/.exec(seg);
    const answer = /### 답변\n([\s\S]*?)\n### 인용한 조문/.exec(seg);
    if (recorded === null || answer === null) continue;

    const cites: { ref: number; sourceId: string }[] = [];
    const citeBlock = /### 인용한 조문[^\n]*\n([\s\S]*?)(?:\n### |$)/.exec(seg);
    if (citeBlock !== null) {
      for (const m of citeBlock[1]?.matchAll(/`\[(\d+)\]`\s*`([A-Z0-9_]+)`/g) ?? []) {
        cites.push({ ref: Number(m[1]), sourceId: m[2] ?? "" });
      }
    }
    out.push({
      no: head[1] ?? "",
      query: (head[2] ?? "").trim(),
      recorded: Number(recorded[1]),
      answer: answer[1] ?? "",
      cites,
    });
  }
  return out;
}

function main(): void {
  const src = loadBundleSource(SNAPSHOT_DIR);
  const byId = new Map(src.articles.map((a) => [a.sourceId, a]));
  const pattern = arg("glob", "ANSWER-QUALITY-");

  const files = readdirSync(DOCS)
    .filter((f) => f.startsWith(pattern) && f.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    console.log(`재채점할 리포트가 없다 (docs/${pattern}*.md)`);
    return;
  }

  console.log(`[재채점] 리포트 ${files.length}편 · API 콜 0회 · 채점기만 바뀐 결과다\n`);
  let movedUp = 0;
  let movedDown = 0;

  for (const f of files) {
    const qs = parseReport(readFileSync(join(DOCS, f), "utf8"));
    if (qs.length === 0) continue;

    const rows: { no: string; before: number; after: number; q: string }[] = [];
    for (const q of qs) {
      // 리포트에 적힌 인용 조문만으로 묶음을 복원한다.
      const items: BundleItem[] = [];
      for (const c of q.cites) {
        const a = byId.get(c.sourceId);
        if (a === undefined) continue;
        // `checkCoverage` 가 보는 것은 ref·sourceId·text 뿐이다. 나머지는 타입을 채우기
        // 위한 자리이고, 여기서 지어낸 값이 채점에 쓰이지 않는다.
        const item: BundleItem = {
          ref: c.ref,
          sourceId: a.sourceId,
          lawName: a.lawName,
          authorityType: a.authorityType,
          articleLabel: "",
          title: null,
          text: a.text,
          validFrom: a.validFrom,
          textHash: a.textHash,
          reason: "SEARCH",
          searchRank: null,
          hasUnattachedMok: false,
          applicationDeadlines: [],
        };
        items.push(item);
      }
      if (items.length === 0) continue;
      const after = Math.round(
        checkCoverage(q.answer, items, q.cites.map((c) => c.ref)).anchorRecall * 100,
      );
      rows.push({ no: q.no, before: q.recorded, after, q: q.query });
    }
    if (rows.length === 0) continue;

    const avgB = Math.round(rows.reduce((p, r) => p + r.before, 0) / rows.length);
    const avgA = Math.round(rows.reduce((p, r) => p + r.after, 0) / rows.length);
    const changed = rows.filter((r) => r.after !== r.before);
    movedUp += changed.filter((r) => r.after > r.before).length;
    movedDown += changed.filter((r) => r.after < r.before).length;

    console.log(`── ${f}`);
    console.log(`   평균 앵커  ${avgB}%  →  ${avgA}%   (문항 ${rows.length}개 중 ${changed.length}개 변동)`);
    for (const r of changed) {
      const dir = r.after > r.before ? "↑" : "↓";
      console.log(`     ${dir} Q${r.no} ${r.before}% → ${r.after}%  ${r.q.slice(0, 38)}`);
    }
  }

  console.log(`\n총 변동: 상승 ${movedUp}문항 · 하락 ${movedDown}문항`);
  console.log("※ 답변 텍스트는 그대로다. 달라진 것은 채점기뿐이다.");
}

main();
