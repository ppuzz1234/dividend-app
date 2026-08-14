/**
 * 목(目)의 소속 호를 추론할 수 있는가 — 측정 스크립트.
 *
 *   npm run measure:mok -w @cube/corpus
 *
 * ## 왜 이 스크립트가 레포에 있는가
 *
 * `parse.ts` 의 `UNATTACHED_MOK` 표식은 "추론을 시도했지만 정확도가 모자라 포기했다"는 결정의 산물이다.
 * 그 결정의 근거가 **일회성 측정 한 번**이면, 나중에 "왜 안 붙였냐 / 80% 는 어떻게 쟀냐"에 답할 수 없다.
 * 이 파일은 그 측정을 재현 가능하게 만든다. 결론이 아니라 **측정 절차**가 산출물이다.
 *
 * ## 무엇을 재는가
 *
 * 법제처 `lawService.do` 는 목을 호의 자식이 아니라 **항의 형제**로 준다. 한 항의 여러 호에 걸린 목이
 * 하나의 평평한 배열로 합쳐지고 부모 호 참조가 없다 (조특법 §91의18 ③ = 호 5개에 목 9개).
 *
 * 추론 가설: 법률 작성 관행상 **"다음 각 목" 이라고 말하는 호만 목을 가진다.** 따라서
 *   (그런 호의 개수) == (목번호가 '가.' 로 리셋되는 묶음의 개수)
 * 이면 두 목록을 순서대로 1:1 매칭할 수 있다.
 *
 * 이 스크립트는 그 등식이 실제로 얼마나 성립하는지 센다. 불일치가 있으면 그만큼은
 * **조용히 틀리게 붙는다** — 그래서 이 수치가 채택/기각의 기준이다.
 *
 * ## 측정 결과 (2026-07-31, 아래 4개 법령)
 *
 *   목이 있는 항 238개 중 일치 191 (80.3%), 불일치 47
 *   → 5건 중 1건꼴로 틀린 구조를 주장하게 되므로 **기각**. 대신 `[각 목]` 표식만 단다.
 *
 * 재실행해서 이 수치가 크게 달라지면 (법 개정 등) 결정을 다시 검토하라.
 */

import { setTimeout as sleep } from "node:timers/promises";

import { asArray, asRecord, str } from "../src/json.js";
import { fetchLawBody, resolveOc, searchLaw } from "../src/lawApi.js";

/** 측정 대상. §12 가 요구한 법령 중 목 구조가 풍부한 것들. */
const TARGETS: readonly string[] = [
  "조세특례제한법",
  "소득세법",
  "소득세법 시행령",
  "근로자퇴직급여 보장법 시행령",
];

/** "다음 각 목" / "각목" 등 표기 흔들림을 흡수한다. */
const SAYS_MOK = /각\s?목/;

interface Row {
  readonly law: string;
  readonly article: string;
  readonly hang: string;
  readonly mokRuns: number;
  readonly ownerHos: number;
  readonly hoCount: number;
  readonly hangSaysMok: boolean;
  readonly matched: boolean;
}

function measureArticle(law: string, unit: Record<string, unknown>): Row[] {
  const rows: Row[] = [];
  const articleNo = str(unit, "조문번호");
  const subNo = str(unit, "조문가지번호");
  const article = subNo === "" ? `제${articleNo}조` : `제${articleNo}조의${subNo}`;

  for (const hang of asArray(unit["항"])) {
    const h = asRecord(hang, "항");
    const moks = asArray(h["목"]);
    if (moks.length === 0) continue;

    // 목 묶음 = 목번호가 '가' 로 돌아올 때마다 새로 시작
    let mokRuns = 0;
    for (const mok of moks) {
      if (str(asRecord(mok, "목"), "목번호").startsWith("가")) mokRuns += 1;
    }

    const hos = asArray(h["호"]);
    const ownerHos = hos.filter((ho) => SAYS_MOK.test(str(asRecord(ho, "호"), "호내용"))).length;
    const hangSaysMok = SAYS_MOK.test(str(h, "항내용"));

    // 호가 아예 없고 항 자체가 "각 목" 을 말하면 그 항이 곧 소유자다 (묶음 1개여야 성립).
    const matched = mokRuns === ownerHos || (hos.length === 0 && mokRuns === 1 && hangSaysMok);

    rows.push({
      law,
      article,
      hang: str(h, "항번호") || "(무항번)",
      mokRuns,
      ownerHos,
      hoCount: hos.length,
      hangSaysMok,
      matched,
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const oc = resolveOc();
  const rows: Row[] = [];

  for (const [i, lawName] of TARGETS.entries()) {
    console.log(`[${i + 1}/${TARGETS.length}] ${lawName} — 조회 중…`);
    const hits = await searchLaw(oc, lawName);
    const entry = hits.filter((h) => h.lawName === lawName).find((h) => h.historyCode === "현행");
    if (!entry) {
      console.error(`  ✗ "${lawName}" 현행판을 찾지 못했다 — 건너뛴다`);
      continue;
    }
    await sleep(400);
    const { json } = await fetchLawBody(oc, entry.mst);

    const law = asRecord(asRecord(json, "본문")["법령"], "법령");
    const units = asArray(asRecord(law["조문"], "법령.조문")["조문단위"]);
    let n = 0;
    for (const unit of units) {
      const rec = asRecord(unit, "조문단위");
      if (str(rec, "조문여부") !== "조문") continue;
      const got = measureArticle(lawName, rec);
      rows.push(...got);
      n += got.length;
    }
    console.log(`  목이 있는 항 ${n}개 수집 (MST=${entry.mst})`);
    await sleep(400);
  }

  const total = rows.length;
  const matched = rows.filter((r) => r.matched).length;
  const pct = total === 0 ? 0 : (matched / total) * 100;

  console.log(`\n${"=".repeat(64)}`);
  console.log(`목이 있는 항: ${total}개`);
  console.log(`  묶음수 == "각 목" 호수 : ${matched}  (${pct.toFixed(1)}%)`);
  console.log(`  불일치                : ${total - matched}`);
  console.log(`${"=".repeat(64)}`);

  const bad = rows.filter((r) => !r.matched);
  console.log(`\n불일치 샘플 (최대 10건):`);
  for (const r of bad.slice(0, 10)) {
    console.log(
      `  - ${r.law} ${r.article} ${r.hang} — 목묶음 ${r.mokRuns} vs "각 목"호 ${r.ownerHos} ` +
        `(호 ${r.hoCount}개, 항이각목언급=${r.hangSaysMok})`,
    );
  }

  console.log(
    `\n판정: ${pct >= 99 ? "채택 가능" : "기각"} — ` +
      `${pct.toFixed(1)}% 는 ${(100 - pct).toFixed(1)}% 를 조용히 틀리게 붙인다는 뜻이다.\n` +
      `현재 parse.ts 는 추론하지 않고 '[각 목]' 표식만 단다 (KNOWN-LIMITATION 참조).`,
  );
}

await main();
