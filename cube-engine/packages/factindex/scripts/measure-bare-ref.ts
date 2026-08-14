/**
 * 같은 법령 안의 bare 참조(`제2조`)를 확장해도 되는가 — 측정 스크립트.
 *
 *   npm run measure:bareref -w @cube/factindex
 *
 * ## 왜 재는가
 * Phase 1 에서 bare `제N조` 확장을 **16% 오류**라며 기각했다. 그런데 Phase 9 에서
 * `RETIRE_D_18`(IRP 중도인출)이 같은 법령의 `제2조` 를 bare 로 참조하는데 그게 묶음에
 * 안 들어가 답변이 *"해당 조문의 구체적인 내용은 제공된 조문에서 확인되지 않는다"* 로 나왔다.
 *
 * 기각 근거를 다시 보니 실패 사례가 전부 **법을 잘못 붙인 경우**(`INCTAX_91_18` 등
 * 코퍼스에 없는 id)였다. **코퍼스 실재 여부로 필터하면** 그 부류는 자동으로 걸러진다.
 * 남는 위험은 "존재하지만 다른 법을 가리키는" 경우다. 그게 얼마나 되는지가 이 측정의 대상이다.
 *
 * ## 핵심 주의
 * `「소득세법」 제17조제1항제5호` 같은 **명시 인용 안의 조문번호를 bare 로 오인하면 안 된다.**
 * 명시 인용 구간을 먼저 지우고 남은 것만 bare 로 센다.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCorpus } from "../src/corpusLoad.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

/** 명시 인용 — 이 구간은 bare 후보에서 제외한다 (이미 인용 그래프가 처리한다). */
const EXPLICIT_RE = /「[^」\n]{1,40}」\s*제\s*\d+\s*조(?:\s*의\s*\d+)?/g;
/** 남은 텍스트에서의 조문 참조 */
const BARE_RE = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/g;

/** sourceId 접두사 → 그 법령이 자기를 가리킬 때 쓸 접두사 (자기 자신) */
function prefixOf(sourceId: string): string {
  // `INCTAX_D_40_2` → `INCTAX_D` / `TAXEX_91_18` → `TAXEX`
  const m = /^([A-Z]+(?:_D)?)_/.exec(sourceId);
  return m?.[1] ?? sourceId;
}

function main(): void {
  const { articles } = loadCorpus(SNAPSHOT_DIR);
  const known = new Set(articles.map((a) => a.sourceId));

  let bareTotal = 0;
  let resolved = 0;
  let dangling = 0;
  let selfRef = 0;
  const samples: string[] = [];
  const danglingSamples: string[] = [];

  for (const a of articles) {
    const stripped = a.text.replace(EXPLICIT_RE, " ");
    const prefix = prefixOf(a.sourceId);
    BARE_RE.lastIndex = 0;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = BARE_RE.exec(stripped)) !== null) {
      const [raw, no, sub] = m;
      if (no === undefined) continue;
      const to = sub === undefined ? `${prefix}_${no}` : `${prefix}_${no}_${sub}`;
      if (seen.has(to)) continue;
      seen.add(to);
      bareTotal += 1;

      if (to === a.sourceId) {
        selfRef += 1;
        continue;
      }
      if (known.has(to)) {
        resolved += 1;
        if (samples.length < 8) samples.push(`${a.sourceId} → ${to}   ("${raw.trim()}")`);
      } else {
        dangling += 1;
        if (danglingSamples.length < 8) danglingSamples.push(`${a.sourceId} → ${to}   ("${raw.trim()}")`);
      }
    }
  }

  const decidable = bareTotal - selfRef;
  const rate = decidable === 0 ? 0 : (resolved / decidable) * 100;

  console.log(`대상 조문 ${articles.length}개\n`);
  console.log(`bare 참조 (명시 인용 제외, 조문당 중복 제거)`);
  console.log(`  총계          ${bareTotal}`);
  console.log(`  자기 참조     ${selfRef}  (확장 대상 아님)`);
  console.log(`  ─────────────────────`);
  console.log(`  코퍼스 실재   ${resolved}  (${rate.toFixed(1)}%)`);
  console.log(`  dangling      ${dangling}  (${(100 - rate).toFixed(1)}%)  ← 실재 필터가 자동으로 거른다`);

  console.log(`\n실재 샘플 (확장 후보):`);
  for (const s of samples) console.log(`  ${s}`);
  console.log(`\ndangling 샘플 (버려짐):`);
  for (const s of danglingSamples) console.log(`  ${s}`);

  console.log(
    `\n판정 근거: dangling 은 **자동으로 걸러진다**(코퍼스에 없으므로).\n` +
      `          남는 위험은 "실재하지만 다른 법을 가리키는" 경우이며, 이 측정으로는 구분할 수 없다.\n` +
      `          법제 관행상 조문 안의 「법령명」 없는 "제N조"는 그 법령 자신을 가리키므로\n` +
      `          위험은 낮다고 보이나, **눈으로 확인한 표본 외에는 근거가 없다.**`,
  );
}

main();
