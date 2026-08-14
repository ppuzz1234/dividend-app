/**
 * 원문 ↔ 초안 대조표 — **승인 절차의 핵심.**
 *
 * ## 왜 `--approve` 버튼을 만들지 않았나
 * 플래그 하나로 승인이 끝나면 **사람이 원문을 안 본다.** 그러면 절차는 남고 검증은 사라진다.
 * 그건 "AI 가 판단했는데 사람 이름이 찍힌" 상태이고, 이 프로젝트가 없애려는 바로 그것이다.
 *
 * 그래서 이 도구는 **대조표만 출력**한다. 승인은 사람이 YAML 을 직접 편집해
 * `approved: true` + `reviewer_id` + `reviewed_at` 을 적는 것으로만 이뤄진다.
 * **절차를 불편하게 만드는 것이 목적이다.**
 *
 * ## 대조표가 잡는 것
 * 1. **인용이 원문에 실제로 있는가** — 지어낸 quote 는 여기서 즉시 드러난다
 * 2. **값이 원문 구절 안에 있는가** — 값과 인용이 따로 노는 경우
 * 3. AI-2 가 보류를 건 규칙
 * 4. PLACEHOLDER 잔존
 */

import { squashAmounts } from "@cube/fact";

import type { AttackResult } from "./attack.js";
import type { DraftRule } from "./draft.js";
import { PLACEHOLDER } from "./draft.js";

export interface DiffRow {
  readonly ruleId: string;
  readonly what: string;
  readonly value: string;
  readonly conditions: readonly string[];
  readonly quote: string;
  /** quote 가 원문에 실제로 존재하는가 */
  readonly quoteFound: boolean;
  /** 값이 quote 안에서 확인되는가 (숫자 표기 흔들림 흡수) */
  readonly valueInQuote: boolean;
  readonly isPlaceholder: boolean;
  /** AI-2 가 보류를 걸었는가 */
  readonly held: boolean;
  readonly holdReason: string;
  readonly uncertainty: string | null;
  /** 사람이 반드시 정독해야 하는 행인가 */
  readonly needsAttention: boolean;
}

/**
 * 공백·쉼표를 지우고 한글 수사를 펴서 비교한다.
 * 한글 수사 확장은 `@cube/fact` 로 올려 **한 벌만 유지**한다 — 답변 검사와 초안 대조가
 * 같은 규칙을 써야 한쪽만 고쳐지는 사고가 안 난다.
 */
function squash(s: string): string {
  return squashAmounts(s);
}

/** `4000000` · `400만원` · `100분의 9` 를 원문에서 찾을 수 있게 변형을 만든다. */
function valueVariants(value: string): string[] {
  const v = squash(value);
  const out = new Set<string>([v]);
  // 9/100 → 100분의9
  const frac = /^(\d+)\/(\d+)$/.exec(v);
  if (frac) out.add(`${frac[2]}분의${frac[1]}`);
  // 4000000 → 400만원 / 400만 · 100000000 → 1억원
  const n = Number(v);
  if (Number.isInteger(n) && n >= 10000 && n % 10000 === 0) {
    out.add(`${n / 10000}만원`);
    out.add(`${n / 10000}만`);
  }
  if (Number.isInteger(n) && n >= 100000000 && n % 100000000 === 0) {
    out.add(`${n / 100000000}억원`);
    out.add(`${n / 100000000}억`);
  }
  return [...out];
}

export function buildDiffTable(
  articleText: string,
  rules: readonly DraftRule[],
  attack: AttackResult | null,
): DiffRow[] {
  const corpus = squash(articleText);
  const holdMap = new Map(
    (attack?.verdicts ?? []).map((v) => [
      v.ruleId,
      [v.refuted ? "AI-2 반박" : "", ...v.missedConditions.map((c) => `조건 누락: ${c}`)]
        .filter((x) => x !== "")
        .join(" · "),
    ]),
  );

  return rules.map((r) => {
    const quoteFound = corpus.includes(squash(r.quote));
    const isPlaceholder = r.value === PLACEHOLDER;
    const valueInQuote = isPlaceholder || valueVariants(r.value).some((v) => squash(r.quote).includes(v));
    const held = (attack?.hold ?? []).includes(r.id);
    const holdReason = holdMap.get(r.id) ?? "";

    return {
      ruleId: r.id,
      what: r.what,
      value: r.value,
      conditions: r.conditions,
      quote: r.quote,
      quoteFound,
      valueInQuote,
      isPlaceholder,
      held,
      holdReason,
      uncertainty: r.uncertainty,
      // 하나라도 걸리면 사람이 정독해야 한다. PLACEHOLDER 는 애초에 미확정이라 당연히 포함.
      needsAttention: !quoteFound || !valueInQuote || held || isPlaceholder || r.uncertainty !== null,
    };
  });
}

/** 사람이 읽을 대조표 텍스트. 터미널에 그대로 찍는다. */
export function renderDiffTable(rows: readonly DiffRow[]): string {
  const lines: string[] = [];
  const attention = rows.filter((r) => r.needsAttention);

  lines.push(`규칙 ${rows.length}개 · 정독 필요 ${attention.length}개\n`);
  for (const r of rows) {
    const mark = r.needsAttention ? "⚠️ " : "   ";
    lines.push(`${mark}${r.ruleId}`);
    lines.push(`     무엇  ${r.what}`);
    lines.push(`     값    ${r.value}${r.isPlaceholder ? "  ← 미확정" : ""}`);
    if (r.conditions.length > 0) lines.push(`     조건  ${r.conditions.join("\n           ")}`);
    lines.push(`     인용  "${r.quote.slice(0, 120)}${r.quote.length > 120 ? "…" : ""}"`);
    lines.push(
      `     검사  원문에 인용 존재 ${r.quoteFound ? "✓" : "✗ ← 지어낸 인용일 수 있다"}` +
        ` · 인용 안에 값 ${r.valueInQuote ? "✓" : "✗ ← 값과 근거가 따로 논다"}`,
    );
    if (r.held) lines.push(`     보류  ${r.holdReason}`);
    if (r.uncertainty !== null) lines.push(`     불확실 ${r.uncertainty}`);
    lines.push("");
  }

  lines.push("─".repeat(70));
  lines.push("이 표는 **판단을 대신하지 않는다.** 각 행의 인용을 원문에서 직접 확인한 뒤,");
  lines.push("YAML 을 열어 approved / reviewer_id / reviewed_at 을 손으로 적어야 승인이다.");
  lines.push("승인 버튼이 없는 이유: 버튼이 있으면 원문을 안 보게 된다.");
  return lines.join("\n");
}
