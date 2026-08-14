/**
 * 코퍼스 전체에서 **적용기한이 지난 조문**을 센다.
 *
 * ## 왜 세나
 * `TAXEX_86_4` 한 건을 우연히 발견했다(시행 2026-01-01 인데 내용은 "2022년 12월 31일까지").
 * 한 건은 일화이고, **몇 건인지는 사실**이다. 규모를 모르면 이게 예외인지 구조적 문제인지
 * 판단할 수 없고, 발표에서도 "하나 봤습니다"밖에 말할 게 없다.
 *
 *   npm run scan:deadlines -w @cube/corpus
 *
 * API 콜 0회 — 스냅샷 파일만 읽는다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// dist/scripts/ 에서 두 단계 올라가야 패키지 루트다 (collect.ts 와 같은 방식).
const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "snapshots");

/** `bundle.ts` 의 `extractDeadlines` 와 **같은 규칙**이어야 한다 — 다르면 측정이 실물과 어긋난다. */
function extractDeadlines(text: string): string[] {
  const out = new Set<string>();
  const pad = (s: string): string => (s.length === 1 ? `0${s}` : s);
  for (const m of text.matchAll(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*까지/g)) {
    out.add(`${m[1] ?? ""}-${pad(m[2] ?? "")}-${pad(m[3] ?? "")}`);
  }
  for (const m of text.matchAll(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*까지/g)) {
    out.add(`${m[1] ?? ""}-${pad(m[2] ?? "")}-${pad(m[3] ?? "")}`);
  }
  return [...out].sort();
}

interface Art {
  sourceId: string;
  articleNo: number;
  articleSubNo: number | null;
  title: string | null;
  text: string;
  validFrom: string;
}

const asOf = process.argv[2] ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
// 법령명은 **스냅샷 파일 최상단**에 있고 조문에는 없다 — 조문에서 찾다가 undefined 가 찍혔다(실측).
const arts: (Art & { lawName: string })[] = [];
for (const f of readdirSync(SNAPSHOT_DIR).filter((x) => x.endsWith(".json"))) {
  const d = JSON.parse(readFileSync(join(SNAPSHOT_DIR, f), "utf8")) as { lawName?: string; articles?: Art[] };
  const lawName = d.lawName ?? f;
  for (const a of d.articles ?? []) arts.push({ ...a, lawName });
}

const withDeadline = arts
  .map((a) => ({ a, all: extractDeadlines(a.text) }))
  .filter((x) => x.all.length > 0)
  .map((x) => ({ ...x, expired: x.all.filter((d) => d < asOf) }));

const expired = withDeadline.filter((x) => x.expired.length > 0);

console.log(`조회일 ${asOf} 기준\n`);
console.log(`전체 조문            ${arts.length}`);
console.log(`기한 표현이 있는 조문  ${withDeadline.length}`);
console.log(`★ 기한이 지난 조문     ${expired.length}\n`);

// 법령별 분포 — 특정 법에 몰려 있으면 그 법을 통째로 봐야 한다는 뜻이다.
const byLaw = new Map<string, number>();
for (const x of expired) byLaw.set(x.a.lawName, (byLaw.get(x.a.lawName) ?? 0) + 1);
console.log("법령별:");
for (const [law, n] of [...byLaw.entries()].sort((p, q) => q[1] - p[1])) {
  console.log(`  ${String(n).padStart(3)}건  ${law}`);
}

console.log("\n지난 기한이 오래된 순 (상위 15):");
for (const x of [...expired].sort((p, q) => (p.expired[0] ?? "").localeCompare(q.expired[0] ?? "")).slice(0, 15)) {
  const label = x.a.articleSubNo === null ? `제${x.a.articleNo}조` : `제${x.a.articleNo}조의${x.a.articleSubNo}`;
  console.log(
    `  ${x.expired.join(",")}  ${x.a.sourceId.padEnd(16)} ${x.a.lawName} ${label}` +
      `${x.a.title === null ? "" : `(${x.a.title})`}  [시행 ${x.a.validFrom}]`,
  );
}
