/**
 * 손으로 쓴 초안의 **값이 조문 원문에 실제로 있는지** 기계로 확인한다.
 *
 * packdraft 는 "원문에 인용 존재 / 인용 안에 값 존재" 를 자동 검사하는데, 손으로 쓴 초안은
 * 그 검사를 안 거쳤다. 37개를 사람 눈으로만 대조하면 반드시 하나는 놓친다.
 *
 * 방법: 금액을 조문이 쓰는 한국어 표기(1,400만원 / 1억5천만원 / 100분의 15 …)로 **여러 형태**
 * 만들어 원문에서 찾는다. 하나도 안 걸리면 그 규칙은 승인 후보에서 빼야 한다.
 *
 * 이 검사가 통과한다고 규칙이 옳은 건 아니다 — **값이 그 조문 어딘가에 존재한다**까지만 말한다.
 * 그 값이 그 자리의 값인지는 사람이 인용을 읽어야 안다.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";

const CORPUS = process.argv[2];
const PACKS = process.argv[3];

const arts = new Map();
for (const f of readdirSync(CORPUS).filter((f) => f.endsWith(".json"))) {
  const j = JSON.parse(readFileSync(join(CORPUS, f), "utf8"));
  for (const a of j.articles ?? []) {
    // 조문 표는 괘선(│─┌┐…)이 숫자 중간에 끼어 "100분의 ││ │10" 처럼 쪼개진다.
    // 괘선을 공백으로 바꾼 사본에서 찾는다 — 안 그러면 맞는 값이 틀렸다고 나온다.
    if (a.sourceId) arts.set(a.sourceId,
      (a.text ?? a.body ?? "").replace(/[─-╿]/g, " ").replace(/\s+/g, " "));
  }
}

/** 금액 → 조문이 쓸 법한 한국어 표기들. 하나라도 원문에 있으면 통과. */
function krwForms(n) {
  const out = new Set([String(n), Number(n).toLocaleString("en-US")]);
  const eok = Math.floor(n / 100_000_000);
  const man = Math.floor((n % 100_000_000) / 10_000);
  if (eok > 0 && man === 0) out.add(`${eok}억원`).add(`${eok}억`);
  if (eok > 0 && man > 0) {
    const m = man.toLocaleString("en-US");
    out.add(`${eok}억${man >= 1000 ? `${Math.floor(man / 1000)}천` : ""}만원`);
    out.add(`${eok}억${m}만원`);
    out.add(`${eok}억 ${m}만원`);
  }
  if (eok === 0 && man > 0) {
    const m = man.toLocaleString("en-US");
    out.add(`${m}만원`).add(`${man}만원`);
    if (man % 1000 === 0) out.add(`${man / 1000}천만원`);
    if (man >= 1000 && man % 100 === 0 && man % 1000 !== 0) {
      out.add(`${Math.floor(man / 1000)}천${(man % 1000) / 100}백만원`);
    }
  }
  return [...out];
}

const rateForms = (num, den) =>
  den === 100 ? [`100분의 ${num}`, `${num}퍼센트`, `${num}%`] : [`${num}/${den}`];

let total = 0, hit = 0;
const misses = [];

for (const f of readdirSync(PACKS).filter((f) => f.endsWith(".draft.yaml"))) {
  const pack = YAML.parse(readFileSync(join(PACKS, f), "utf8"));
  if (pack.pack_kind !== "UNVERIFIED_DRAFT") continue;
  console.log(`\n═══ ${f}  (규칙 ${pack.rules.length})`);
  for (const r of pack.rules) {
    const src = r.sources?.[0]?.source_id;
    const text = arts.get(src);
    const v = r.effect?.value;
    if (v === undefined || v === null || text === undefined) continue;
    total++;
    const forms = typeof v === "object"
      ? rateForms(Number(v.numerator), Number(v.denominator))
      : krwForms(Number(v));
    const found = forms.find((s) => text.includes(s));
    if (found !== undefined) { hit++; console.log(`  ✓ ${r.id.padEnd(52)} ${found}`); }
    else { misses.push([f, r.id, String(typeof v === "object" ? `${v.numerator}/${v.denominator}` : v), forms]); console.log(`  ✗ ${r.id.padEnd(52)} 원문에서 못 찾음`); }
  }
}

console.log(`\n${hit}/${total} 값이 원문에 존재`);
if (misses.length > 0) {
  console.log("\n확인 필요:");
  for (const [f, id, v, forms] of misses) {
    console.log(`  ${f} · ${id}\n     값 ${v} · 찾아본 표기: ${forms.slice(0, 6).join(" / ")}`);
  }
}
