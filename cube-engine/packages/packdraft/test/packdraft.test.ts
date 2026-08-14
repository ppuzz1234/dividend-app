/**
 * Phase 10 — 초안·공격·대조표·YAML. LLM 을 스텁으로 주입해 **네트워크 없이** 돈다.
 *
 * 이 파일이 지키는 것은 **승인 절차가 우회되지 않는 것**이다:
 *  - 초안은 언제나 `UNVERIFIED_DRAFT` + `approved:false` 로 나온다
 *  - 지어낸 인용은 대조표에서 드러난다
 *  - AI-2 판정이 없으면 **보류가 기본값**이다
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parse } from "yaml";

import { parseAttack } from "../src/attack.js";
import { buildDiffTable, renderDiffTable } from "../src/diffTable.js";
import { PLACEHOLDER, buildDraftPrompt, draftFromArticle, parseDraft } from "../src/draft.js";
import type { DraftRule } from "../src/draft.js";
import { draftToPackYaml } from "../src/toYaml.js";

const ARTICLE =
  "제17조의2(개인형퇴직연금제도의 부담금 납입한도) 법 제24조제3항 단서에서 " +
  '"대통령령으로 정하는 한도"란 연간 1천800만원을 말한다. ' +
  "다목 및 라목에 따라 연금계좌로 납입하는 총 누적금액의 합계액은 1억원을 한도로 한다.";

function rule(over: Partial<DraftRule> = {}): DraftRule {
  return {
    id: "IRP.LIMIT.ANNUAL",
    what: "IRP 연간 납입한도",
    value: "18000000",
    unit: "KRW",
    sourceId: null,
    conditions: [],
    quote: "연간 1천800만원",
    uncertainty: null,
    ...over,
  };
}

// ─────────────────────────── 초안 파싱 ───────────────────────────

test("정상 초안을 파싱한다", () => {
  const r = parseDraft(
    '{"rules":[{"id":"A.B","what":"x","value":"100","unit":"KRW","conditions":["c"],"quote":"q","uncertainty":null}]}',
    "S1",
    "m1",
  );
  assert.equal(r.rules.length, 1);
  assert.equal(r.rules[0]?.value, "100");
  assert.equal(r.sourceId, "S1");
});

test("★ quote 가 없으면 거절한다 — 대조가 불가능한 초안은 검토 절차가 성립하지 않는다", () => {
  assert.throws(
    () => parseDraft('{"rules":[{"id":"A","value":"1","quote":""}]}', "S", "m"),
    /quote 가 없다/,
  );
});

test("id·value 가 없으면 거절한다", () => {
  assert.throws(() => parseDraft('{"rules":[{"value":"1","quote":"q"}]}', "S", "m"), /id 가 없다/);
  assert.throws(() => parseDraft('{"rules":[{"id":"A","quote":"q"}]}', "S", "m"), /value/);
});

test("모르는 unit 은 UNKNOWN 으로 떨어진다 (임의 해석 금지)", () => {
  const r = parseDraft('{"rules":[{"id":"A","value":"1","unit":"평","quote":"q"}]}', "S", "m");
  assert.equal(r.rules[0]?.unit, "UNKNOWN");
});

test("malformed 응답에서 명확히 실패한다", () => {
  assert.throws(() => parseDraft("JSON 아님", "S", "m"), /JSON 을 찾지 못했다/);
  assert.throws(() => parseDraft("{}", "S", "m"), /rules 배열이 없다/);
});

test("프롬프트가 씨앗 조문만 뽑으라고 못 박는다", () => {
  const p = buildDraftPrompt("RETIRE_D_17_2", "근퇴법 시행령", "제17조의2", ARTICLE);
  assert.match(p, /RETIRE_D_17_2 가 정하는 파라미터만/);
  assert.match(p, /파라미터를 수확하는 대상이 아니다/);
});

// ─────────────────────────── AI-2 공격 ───────────────────────────

test("★ 판정이 없으면 보류가 기본값이다 (통과가 기본이면 안 된다)", () => {
  const r = parseAttack('{"verdicts":[{"ruleId":"A"}]}', "m");
  assert.equal(r.verdicts[0]?.refuted, true);
  assert.deepEqual(r.hold, ["A"]);
});

test("명시적으로 refuted:false 여야 통과다", () => {
  const r = parseAttack('{"verdicts":[{"ruleId":"A","refuted":false,"missedConditions":[]}]}', "m");
  assert.deepEqual(r.hold, []);
});

test("조건 누락이 지적되면 통과여도 보류다", () => {
  const r = parseAttack('{"verdicts":[{"ruleId":"A","refuted":false,"missedConditions":["농어민"]}]}', "m");
  assert.deepEqual(r.hold, ["A"]);
});

test("빈 규칙 목록이면 공격을 건너뛴다", async () => {
  const { attackDraft } = await import("../src/attack.js");
  const r = await attackDraft(ARTICLE, [], async () => "", "m");
  assert.deepEqual(r.verdicts, []);
});

// ─────────────────────────── 대조표 ───────────────────────────

test("★ 지어낸 인용은 대조표에서 드러난다", () => {
  const rows = buildDiffTable(ARTICLE, [rule({ quote: "원문에 없는 문장" })], null);
  assert.equal(rows[0]?.quoteFound, false);
  assert.equal(rows[0]?.needsAttention, true);
});

test("★ 한글 수사(1천800만원)와 숫자(18000000)를 맞춘다", () => {
  const rows = buildDiffTable(ARTICLE, [rule()], null);
  assert.equal(rows[0]?.quoteFound, true, "인용을 원문에서 못 찾았다");
  assert.equal(rows[0]?.valueInQuote, true, "1천800만원 ↔ 18000000 대조 실패");
  assert.equal(rows[0]?.needsAttention, false);
});

test("억 단위도 맞춘다 (1억원 ↔ 100000000)", () => {
  const rows = buildDiffTable(
    ARTICLE,
    [rule({ id: "X", value: "100000000", quote: "총 누적금액의 합계액은 1억원을 한도로 한다" })],
    null,
  );
  assert.equal(rows[0]?.valueInQuote, true);
});

test("비율 표기(9/100 ↔ 100분의 9)를 맞춘다", () => {
  const rows = buildDiffTable(
    "초과분에 대해서는 100분의 9의 세율을 적용한다",
    [rule({ value: "9/100", unit: "RATE", quote: "100분의 9의 세율을 적용한다" })],
    null,
  );
  assert.equal(rows[0]?.valueInQuote, true);
});

test("값과 인용이 따로 놀면 잡는다", () => {
  const rows = buildDiffTable(ARTICLE, [rule({ value: "99999999" })], null);
  assert.equal(rows[0]?.valueInQuote, false);
  assert.equal(rows[0]?.needsAttention, true);
});

test("PLACEHOLDER 는 항상 정독 대상이다", () => {
  const rows = buildDiffTable(ARTICLE, [rule({ value: PLACEHOLDER })], null);
  assert.equal(rows[0]?.isPlaceholder, true);
  assert.equal(rows[0]?.needsAttention, true);
  // 미확정 값은 인용 대조를 요구하지 않는다 (확정할 값이 없으므로)
  assert.equal(rows[0]?.valueInQuote, true);
});

test("AI-2 보류가 대조표에 실린다", () => {
  const attack = parseAttack(
    '{"verdicts":[{"ruleId":"IRP.LIMIT.ANNUAL","refuted":true,"evidence":"e","note":"n"}]}',
    "m",
  );
  const rows = buildDiffTable(ARTICLE, [rule()], attack);
  assert.equal(rows[0]?.held, true);
  assert.match(rows[0]?.holdReason ?? "", /AI-2 반박/);
});

test("대조표 렌더에 승인 절차 안내가 들어간다", () => {
  const out = renderDiffTable(buildDiffTable(ARTICLE, [rule()], null));
  assert.match(out, /승인 버튼이 없는 이유/);
  assert.match(out, /YAML 을 열어/);
});

// ─────────────────────────── YAML ───────────────────────────

const META = {
  policySnapshot: "KR-TAX-DRAFT-X",
  sourceId: "RETIRE_D_17_2",
  authorityType: "DECREE" as const,
  promulgatedAt: "2026-03-24",
  validFrom: "2026-03-24",
  recordedAt: "2026-07-31",
  taxYears: [2026],
};

test("★ YAML 은 언제나 UNVERIFIED_DRAFT + approved:false 다", () => {
  const y = parse(draftToPackYaml([rule()], META)) as Record<string, any>;
  assert.equal(y["pack_kind"], "UNVERIFIED_DRAFT");
  assert.equal(y["rules"][0]["review"]["approved"], false);
  assert.equal(y["rules"][0]["review"]["reviewer_id"], null);
  assert.equal(y["rules"][0]["review"]["reviewed_at"], null);
});

test("비율은 유리수 객체로 나간다 (부동소수점 금지)", () => {
  const y = parse(draftToPackYaml([rule({ value: "9/100", unit: "RATE" })], META)) as Record<string, any>;
  assert.deepEqual(y["rules"][0]["effect"]["value"], { numerator: "9", denominator: "100" });
});

test("금액은 정수 문자열로 나간다", () => {
  const y = parse(draftToPackYaml([rule()], META)) as Record<string, any>;
  assert.equal(y["rules"][0]["effect"]["value"], "18000000");
  assert.equal(typeof y["rules"][0]["effect"]["value"], "string");
});

test("★ 반올림 사양은 지어내지도, PLACEHOLDER 로 채우지도 않고 아예 뺀다", () => {
  const y = parse(draftToPackYaml([rule()], META)) as Record<string, any>;
  // PLACEHOLDER 를 넣으면 stage/mode 가 enum 이라 스키마에서 먼저 터져
  // 원인이 "미확정 값"이 아니라 "enum 위반"으로 보고된다(실측). 매트릭스 R15 상 전부 없는 것은 유효.
  assert.equal("rounding" in y["rules"][0]["effect"], false);
});

test("헤더에 승인 절차와 '계산에 못 쓴다'가 적힌다", () => {
  const y = draftToPackYaml([rule()], META);
  assert.match(y, /아직 어떤 계산에도 쓸 수 없다/);
  assert.match(y, /UnverifiedPolicyError/);
  assert.match(y, /승인 버튼이 없는 이유/);
});

test("규칙이 출처를 안 밝히면 씨앗 조문을 PRIMARY 로 쓴다", () => {
  const y = parse(draftToPackYaml([rule()], META)) as Record<string, any>;
  assert.deepEqual(y["rules"][0]["sources"], [{ source_id: "RETIRE_D_17_2", role: "PRIMARY" }]);
});

test("★ 값이 참조 조문에서 왔으면 PRIMARY 도 그 조문이다 (씨앗으로 못박지 않는다)", () => {
  // 실측 사고: 근퇴법 시행령 §17의2 로 뜬 초안의 값 7개가 **전부** 「소득세법 시행령」
  // §40의2 의 것이었는데 PRIMARY 는 §17의2 로 나갔다 — 승인 팩이 없는 근거를 가리켰다.
  const y = parse(draftToPackYaml([rule({ sourceId: "INCTAX_D_40_2" })], META)) as Record<string, any>;
  assert.deepEqual(y["rules"][0]["sources"], [{ source_id: "INCTAX_D_40_2", role: "PRIMARY" }]);
  assert.deepEqual(y["rules"][0]["field_bindings"]["effect_value"], ["INCTAX_D_40_2"]);
});

test("★ 모르는 단위를 KRW 로 조용히 메우지 않는다", () => {
  // 예전엔 UNKNOWN → KRW 였다. 그래서 나이 60 이 `60 KRW` 로 승인 팩까지 들어갔다.
  // 이제 스키마에 없는 자리표시자가 나가 **로딩에서 터진다** — 사람이 채워야 한다.
  const y = parse(draftToPackYaml([rule({ unit: "UNKNOWN", value: "60" })], META)) as Record<string, any>;
  assert.notEqual(y["rules"][0]["effect"]["unit"], "KRW");
  assert.match(String(y["rules"][0]["effect"]["unit"]), /원문 대조 후 기재/);
});

test("빈 규칙 목록도 유효한 팩을 만든다", () => {
  const y = parse(draftToPackYaml([], META)) as Record<string, any>;
  assert.deepEqual(y["rules"], []);
});

// ─────────────────────────── 전체 흐름 ───────────────────────────

test("스텁 LLM 으로 초안 생성이 돈다", async () => {
  const stub = async (): Promise<string> =>
    '{"rules":[{"id":"A.B","what":"x","value":"18000000","unit":"KRW","conditions":[],"quote":"연간 1천800만원","uncertainty":null}]}';
  const d = await draftFromArticle(
    { sourceId: "RETIRE_D_17_2", lawName: "근퇴법 시행령", articleLabel: "제17조의2", text: ARTICLE },
    stub,
    "stub-1",
  );
  const rows = buildDiffTable(ARTICLE, d.rules, null);
  assert.equal(rows[0]?.needsAttention, false, "정상 초안이 정독 대상으로 잡혔다");
});
