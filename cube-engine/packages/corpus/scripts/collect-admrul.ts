/**
 * 행정규칙 수집 러너 (Phase 3-a).
 *
 *   npm run collect:admrul -w @cube/corpus
 *
 * 사양 §12 "IRP 편입 제한(개별주 불가·위험자산 비중 등)" 의 유일한 근거를 확보한다.
 * `authorityType: RULE` 로 태깅되며, 이는 사양 §5.1 충돌 서열에서 법률·시행령 **아래**다.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { buildAdmRulSnapshot, fetchAdmRulBody, searchAdmRul } from "../src/admrul.js";
import { resolveOc } from "../src/lawApi.js";
import type { AuthorityType } from "../src/types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(PKG_ROOT, "snapshots");
const THROTTLE_MS = 400;

/**
 * 수집 대상. abbrev 는 source_id 접두사이므로 ASCII 만 (사양 §5.2.1).
 *
 * ★ `authorityType` 은 **사람이 명시**한다. 행정규칙 "종류"만으로는 사양 §5.1 서열이 안 갈린다:
 *  - **RULE** — 법령의 위임을 받은 **법규명령성** 고시. 대외적 구속력이 있다.
 *    예: 퇴직연금감독규정(금융위) — 근퇴법 시행령 §26 이 "금융위원회가 고시하는" 이라고 위임한다.
 *  - **ADMIN_GUIDANCE** — 행정청 **내부 사무처리** 훈령. 국민을 직접 구속하지 않는다.
 *    예: 국세청 사무처리규정 — 세무서 직원의 업무 절차를 정한 것이다.
 *
 * 이 구분이 틀리면 상위법이 하위 안내에 밀린다(사양 §5.1 충돌 해소). 그래서 추측하지 않는다.
 * ⚠️ 아래 판단은 **잠정**이다 — 발령 근거 조문을 사람이 대조해 확정해야 한다 (BUILD-PLAN Q7).
 */
const TARGETS: readonly {
  name: string;
  abbrev: string;
  authorityType: AuthorityType;
  why: string;
}[] = [
  {
    name: "퇴직연금감독규정",
    abbrev: "PENSUP",
    authorityType: "RULE",
    why: "§12 IRP 편입 제한 — 증권 종류(§9)·적립금 운용방법(§11)·집중투자한도(§12·§13). 근퇴법 시행령 §26 의 위임을 받은 법규명령성 고시",
  },
  {
    name: "퇴직연금감독규정시행세칙",
    abbrev: "PENSUPD",
    authorityType: "RULE",
    why: "위 고시의 세부 — 금감원 세칙. 같은 위임 사슬 안에 있다",
  },
  {
    name: "원천징수사무처리규정",
    abbrev: "NTSWHT",
    authorityType: "ADMIN_GUIDANCE",
    why: "★ 국세청 훈령. §12 '연금소득 원천징수율' 의 실무 처리 절차. 내부 사무처리라 대외 구속력은 없다",
  },
  {
    name: "소득세사무처리규정",
    abbrev: "NTSINC",
    authorityType: "ADMIN_GUIDANCE",
    why: "★ 국세청 훈령. 소득세 실무 처리 절차 — '서민형 판정 시점' 류 실무 질의의 후보 근거",
  },
];

async function main(): Promise<void> {
  const oc = resolveOc();
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`[행정규칙] 수집 시작 — 대상 ${TARGETS.length}건\n`);

  const failures: string[] = [];
  let total = 0;

  for (const [i, t] of TARGETS.entries()) {
    const n = `${i + 1}/${TARGETS.length}`;
    try {
      console.log(`[${n}] ${t.name} (${t.abbrev}) — 검색 중…`);
      const hits = await searchAdmRul(oc, t.name);
      // 정확일치 + 현행. 부분일치로 고르면 "퇴직연금감독규정시행세칙"이 잡힌다.
      const exact = hits.filter((h) => h.name === t.name);
      const entry = exact.find((h) => h.historyCode === "현행") ?? exact[0];
      if (entry === undefined) {
        const cands = hits.slice(0, 6).map((h) => `    - ${h.name} (${h.kind})`).join("\n");
        throw new Error(`"${t.name}" 정확일치 없음. 후보:\n${cands}`);
      }
      if (entry.id === "") throw new Error("본문 조회 ID 를 얻지 못했다 (상세링크 파싱 실패)");

      console.log(`[${n}]   ID=${entry.id} ${entry.kind} ${entry.historyCode} ${entry.ministry} 시행 ${entry.enforcedAt}`);
      await sleep(THROTTLE_MS);
      console.log(`[${n}]   본문 조회 중…`);
      const { json, url } = await fetchAdmRulBody(oc, entry.id);

      const snapshot = buildAdmRulSnapshot({
        entry,
        body: json,
        abbrev: t.abbrev,
        sourceUrl: url,
        collectedAt: new Date().toISOString(),
        authorityType: t.authorityType,
      });
      await writeFile(join(OUT_DIR, `${t.abbrev}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      total += snapshot.articles.length;
      console.log(`[${n}]   ✓ 조문 ${snapshot.articles.length}개 → ${t.abbrev}.json (authorityType=${snapshot.authorityType})\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${t.name}: ${msg}`);
      console.error(`[${n}]   ✗ 실패 — ${msg}\n`);
    }
    await sleep(THROTTLE_MS);
  }

  console.log(`[행정규칙] 완료 — 성공 ${TARGETS.length - failures.length}/${TARGETS.length}건, 조문 ${total}개`);
  if (failures.length > 0) {
    console.error(`\n실패 ${failures.length}건:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

await main();
