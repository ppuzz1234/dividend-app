/**
 * ① 공식 팩트 경로 점검 — **규칙을 승인할 때마다 돌린다.**
 *
 *   node --env-file=.env packages/plan/scripts/check-approved.mjs
 *
 * 단위 테스트는 `approvedFactsFor` 의 판정을 검사한다. 여기서 보는 건 그 앞단이다:
 * **검색이 그 조문을 실제로 가져오는가.** 규칙을 아무리 승인해도 RAG 가 그 조문을
 * 안 물어오면 ① 은 화면에 뜨지 않는다 — 그 이음매는 코드가 아니라 색인에 있어서
 * 유닛 테스트로는 절대 안 잡힌다.
 *
 * 빌드 산출물(dist)을 쓰므로 `npm run build` 뒤에 돌린다. .mjs 인 이유는 이게
 * 배포물이 아니라 점검 도구라서다 — 타입 빌드 대상에 넣을 이유가 없다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleBundle, loadBundleSource } from "@cube/fact";
import { loadEngine, search } from "@cube/factindex";
import { approvedFactsFor } from "@cube/plan";
import { createRegistry, loadPolicyPack } from "@cube/policy";
import { parse as parseYaml } from "yaml";

/** 점검 질문 — 승인된 팩이 걸려야 하는 것과, 아직 0건인 것을 **둘 다** 넣는다. */
const QUERIES = [
  "IRP 납입한도가 얼마야",
  "ISA 비과세 한도와 서민형 요건",
  "연금저축 세액공제율",
];

// 경로는 **스크립트 위치 기준**이다. cwd 기준으로 두면 레포 루트에서만 돌아간다.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dir = join(REPO, "packages", "policy", "packs");
const file = readdirSync(dir).filter((x) => x.endsWith(".yaml"))[0];
if (file === undefined) {
  console.log("승인된 정책 팩이 없다 — ① 은 어떤 질문에도 뜨지 않는다.");
  process.exit(0);
}
const reg = createRegistry(loadPolicyPack(parseYaml(readFileSync(join(dir, file), "utf8"))));
const pack = reg.describePack();
console.log(`팩 ${file} · 스냅샷 ${pack.policySnapshot} · 등급 ${pack.packKind} · 규칙 ${pack.ruleCount}개\n`);

const engine = loadEngine();
const src = loadBundleSource(join(REPO, "packages", "corpus", "snapshots"));
const asOf = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

for (const q of QUERIES) {
  const r = await search(engine, q, { queryAsOf: asOf, topK: 10 });
  const bundle = assembleBundle(src, r.articles, { seedTopK: 4, maxItems: 10 });
  const ap = approvedFactsFor(reg, bundle.items.map((i) => ({ sourceId: i.sourceId, label: `${i.lawName} ${i.articleLabel}` })), asOf);
  console.log(`Q: ${q}`);
  console.log(`   조문: ${bundle.items.map((i) => i.sourceId).join(", ")}`);
  console.log(`   ① 승인 규칙 ${ap.facts.length}건`);
  for (const f of ap.facts) {
    // 단위가 값과 안 맞으면 여기서 눈에 띈다 (예: 나이가 KRW 로 찍힌 경우).
    console.log(`      ${f.ruleId} = ${f.display} [${f.unit}] · 시행 ${f.validFrom} · ← ${f.sourceIds.join(",")}`);
  }
  console.log();
}
