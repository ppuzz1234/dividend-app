/**
 * Phase 9 — 조문 묶음 · 인용 검증 · 조건 누락 · Resolver.
 * LLM 을 스텁으로 주입해 **네트워크 없이** 돈다. 실코퍼스는 읽는다.
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { findUnsourcedAmounts } from "../src/amounts.js";
import { findComputedAmounts, findDerivedAmounts } from "../src/arithmetic.js";
import { assembleBundle, expiredDeadlines, extractDeadlines, loadBundleSource } from "../src/bundle.js";
import type { BundleItem, BundleSource } from "../src/bundle.js";
import { SYSTEM_PROMPT, buildUserPrompt, correctionForComputedAmounts, generateAnswer, generateChecked } from "../src/answer.js";
import { checkCoverage } from "../src/coverage.js";
import { UNMODELED_NOTICE, buildUnmodeledAnswer, isPublishable, isRejected, reject } from "../src/resolve.js";
import { hasForgedCitation, normalizeCitations, verifyCitations } from "../src/verifyCite.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

let cached: BundleSource | null = null;
function source(): BundleSource {
  cached ??= loadBundleSource(SNAPSHOT_DIR);
  return cached;
}

function ranked(...ids: string[]): { sourceId: string }[] {
  return ids.map((sourceId) => ({ sourceId }));
}

function item(over: Partial<BundleItem> & { ref: number }): BundleItem {
  const base = {
    sourceId: `S${over.ref}`,
    lawName: "테스트법",
    authorityType: "STATUTE" as const,
    articleLabel: "제1조",
    title: null,
    text: "본문",
    validFrom: "2026-01-01",
    textHash: "0".repeat(64),
    reason: "SEARCH" as const,
    searchRank: 1,
    ...over,
  };
  // 플래그를 손으로 넣지 않는다 — assembleBundle 과 같은 방식으로 본문에서 계산해야
  // fixture 가 실제 동작과 어긋나지 않는다.
  return {
    ...base,
    hasUnattachedMok: over.hasUnattachedMok ?? base.text.includes("[각 목]"),
    applicationDeadlines: over.applicationDeadlines ?? extractDeadlines(base.text),
  };
}

// ─────────────────────────── 조문 묶음 ───────────────────────────

test("★ 씨앗이 인용하는 조문까지 딸려온다 (조건이 다른 조문에 있어도 읽는다)", () => {
  const b = assembleBundle(source(), ranked("TAXEX_91_18") as never, { seedTopK: 1, maxItems: 12 });
  assert.equal(b.seedCount, 1);
  assert.ok(b.expandedCount > 0, "인용 확장이 하나도 안 일어났다");
  const ids = b.items.map((i) => i.sourceId);
  assert.equal(ids[0], "TAXEX_91_18", "씨앗이 첫 번째가 아니다");
  console.log(`  [bundle] ISA → ${b.items.length}개 (씨앗 ${b.seedCount} + 확장 ${b.expandedCount}): ${ids.join(", ")}`);
});

test("씨앗은 절대 잘리지 않는다 (상한은 확장분부터 자른다)", () => {
  const b = assembleBundle(source(), ranked("TAXEX_91_18", "INCTAX_59_3", "INCTAX_129") as never, {
    seedTopK: 3,
    maxItems: 3,
  });
  assert.equal(b.items.length, 3);
  assert.deepEqual(b.items.map((i) => i.sourceId), ["TAXEX_91_18", "INCTAX_59_3", "INCTAX_129"]);
  assert.equal(b.expandedCount, 0);
});

test("묶음 조문은 전문을 담는다 — 요약하면 조건을 잃는다", () => {
  const b = assembleBundle(source(), ranked("TAXEX_91_18") as never, { seedTopK: 1 });
  const isa = b.items.find((i) => i.sourceId === "TAXEX_91_18");
  assert.ok(isa);
  assert.ok(isa.text.length > 3000, `ISA 조문이 ${isa.text.length}자뿐 — 잘렸다`);
  assert.match(isa.text, /400만원/);
  assert.match(isa.text, /200만원/);
  assert.equal(isa.hasUnattachedMok, true, "[각 목] 표식이 감지되지 않았다");
});

test("ref 번호는 1부터 연속이고 중복이 없다", () => {
  const b = assembleBundle(source(), ranked("INCTAX_59_3", "INCTAX_129") as never, { seedTopK: 2 });
  assert.deepEqual(b.items.map((i) => i.ref), b.items.map((_, i) => i + 1));
});

test("빈 검색 결과·없는 sourceId 에서 터지지 않는다", () => {
  assert.equal(assembleBundle(source(), [] as never, {}).items.length, 0);
  assert.equal(assembleBundle(source(), ranked("없는조문_9999") as never, {}).items.length, 0);
});

test("옵션 경계값을 거절한다", () => {
  assert.throws(() => assembleBundle(source(), [] as never, { seedTopK: 0 }), /양수/);
  assert.throws(() => assembleBundle(source(), [] as never, { maxItems: -1 }), /양수/);
});

// ─────────────────────────── 인용 검증 ───────────────────────────

test("★ 제공하지 않은 번호를 인용하면 위조로 잡는다", () => {
  const r = verifyCitations("한도는 400만원이다 [1]. 조건은 다음과 같다 [9].", 3);
  assert.ok(hasForgedCitation(r), "위조 인용을 못 잡았다");
  assert.equal(r.issues.filter((i) => i.kind === "UNKNOWN_REF").length, 1);
  assert.deepEqual(r.usedRefs, [1]);
});

test("여러 형식의 인용을 다 인식한다", () => {
  const r = verifyCitations("가 400만원 [1][2]. 나 200만원 [1, 3]. 다 100만원 [2·3].", 3);
  assert.deepEqual(r.usedRefs, [1, 2, 3]);
  assert.equal(hasForgedCitation(r), false);
});

test("사실 주장인데 인용이 없으면 잡는다", () => {
  const r = verifyCitations("비과세 한도는 400만원이다.", 3);
  assert.equal(r.issues.filter((i) => i.kind === "UNCITED_CLAIM").length, 1);
});

test("안내 문구는 인용을 요구하지 않는다 (소음 방지)", () => {
  const r = verifyCitations("아래에 정리했습니다.\n참고하세요.", 3);
  assert.equal(r.issues.length, 0);
});

test("쓰이지 않은 출처를 보고한다 (묶음이 과했다는 신호)", () => {
  const r = verifyCitations("한도는 400만원이다 [1].", 3);
  assert.deepEqual(r.unusedRefs, [2, 3]);
});

test("maxRef 0 이면 모든 인용이 위조다", () => {
  assert.ok(hasForgedCitation(verifyCitations("내용 [1]", 0)));
  assert.throws(() => verifyCitations("x", -1), /maxRef/);
});

// ─────────────────────────── 조건 누락 ───────────────────────────

const ISA_LIKE = item({
  ref: 1,
  sourceId: "TAXEX_91_18",
  text: [
    "② 비과세 한도금액은 다음 각 호의 구분에 따른 금액으로 한다.",
    "1. 다음 각 목의 어느 하나에 해당하는 경우: 400만원",
    "2. 제1호에 해당하지 아니하는 자의 경우: 200만원",
    "[각 목] 가. 직전 과세기간의 총급여액이 5,000만원 이하인 거주자",
    "[각 목] 나. 종합소득금액이 3,800만원 이하인 거주자",
    "[각 목] 다. 대통령령으로 정하는 농어민",
  ].join("\n"),
});

test("★ 조건을 빠뜨리면 잡는다 — 숫자 오류보다 조용한 실패", () => {
  const partial = "한도는 400만원 또는 200만원이다 [1]. 총급여 5,000만원 이하면 400만원이다 [1].";
  const r = checkCoverage(partial, [ISA_LIKE], [1]);
  assert.ok(
    r.issues.some((i) => i.kind === "MISSING_ANCHOR"),
    "3,800만원 조건이 빠졌는데 못 잡았다",
  );
  assert.ok(r.anchorRecall < 1);
});

test("조건을 다 담으면 통과한다", () => {
  const full =
    "한도는 400만원 또는 200만원이다 [1]. 400만원 조건은 총급여 5,000만원 이하, " +
    "종합소득금액 3,800만원 이하, 대통령령으로 정하는 농어민 중 하나다 [1].";
  const r = checkCoverage(full, [ISA_LIKE], [1]);
  assert.equal(r.issues.filter((i) => i.kind === "MISSING_ANCHOR").length, 0);
  assert.equal(r.anchorRecall, 1);
});

test("숫자 표기가 달라도 같게 본다 (5,000만원 == 5000만원)", () => {
  const r = checkCoverage(
    "400만원 200만원 총급여 5000만원 종합소득 3800만원 농어민 [1]",
    [ISA_LIKE],
    [1],
  );
  assert.equal(r.anchorRecall, 1);
});

/**
 * 실측 재현(2026-08-07, 넓은질문 Q8 3회차). 소득세법 제129조는 원천징수세율을 `100분의N`
 * 으로 쓰고, 답변은 사람이 읽는 `N%` 로 쓴다. 정규화 전에는 세율표를 다 넣은 답이
 * "세율이 빠졌다"로 잡혀 앵커 25% 가 나왔다 — 같은 질문 다른 회차는 이 조문을 안 건드려서
 * 60~67%. **조문을 하나 더 정확히 인용한 답이 점수가 반토막 났다.**
 */
const RATE_LIKE = item({
  ref: 1,
  sourceId: "INCTAX_129",
  text: [
    "① 원천징수의무자가 원천징수하는 소득세는 다음 각 호의 세율을 적용한다.",
    "1. 연금소득: 다음 각 목의 세율",
    "[각 목] 가. 70세 미만: 100분의 5",
    "[각 목] 나. 70세 이상 80세 미만: 100분의 4",
    "[각 목] 다. 80세 이상: 100분의 3",
  ].join("\n"),
});

test("★ 법령의 `100분의N` 과 답변의 `N%` 를 같게 본다 (실측 오탐 재현)", () => {
  const withTable = "연금수령 세율은 70세 미만 5%, 70세 이상 80세 미만 4%, 80세 이상 3% 예요 [1].";
  const r = checkCoverage(withTable, [RATE_LIKE], [1]);
  assert.equal(r.anchorRecall, 1, `세율표를 다 넣었는데 누락으로 잡혔다: ${JSON.stringify(r.issues)}`);
  assert.equal(r.issues.filter((i) => i.kind === "MISSING_ANCHOR").length, 0);
});

test("★ 짧아진 비율 토큰이 다른 수치에 잘못 걸리지 않는다 (5% ≠ 15%)", () => {
  // 답변은 15%·14%·13% 만 말했다 — 5%·4%·3% 는 **없다.** 부분문자열로 세면 셋 다 있다고 잡힌다.
  const wrong = "세율은 70세 미만 15%, 70세 이상 80세 미만 14%, 80세 이상 13% 예요 [1].";
  const r = checkCoverage(wrong, [RATE_LIKE], [1]);
  assert.ok(r.anchorRecall < 1, "15% 를 5% 로 착각해 만점을 줬다 — 앵커가 부풀면 누락을 못 잡는다");
});

test("연도 표기는 조건 앵커로 세지 않는다", () => {
  const withYear = item({ ref: 1, text: "제1조 본문 <개정 2024년> 한도는 100만원" });
  const r = checkCoverage("한도는 100만원이다 [1]", [withYear], [1]);
  assert.equal(r.anchorRecall, 1, "2024년이 앵커로 잡혔다");
});

test("인용 안 된 조문은 조건 검사 대상이 아니다", () => {
  const r = checkCoverage("아무 말 [2]", [ISA_LIKE], [2]);
  assert.equal(r.issues.length, 0);
});

// ─────────────────────────── Resolver ───────────────────────────

const BUNDLE = { items: [ISA_LIKE], seedCount: 1, expandedCount: 0 };

test("★ UNMODELED 는 resolvedRuleIds 가 반드시 빈 배열이다 (사양 §1.2)", () => {
  const a = buildUnmodeledAnswer("q", BUNDLE, "한도는 400만원이다 [1].");
  assert.equal(a.answerClass, "UNMODELED_OFFICIAL_SOURCE");
  assert.deepEqual(a.resolvedRuleIds, []);
  assert.equal(a.notice, UNMODELED_NOTICE);
});

test("★ UNMODELED 는 개인 적용·PLAN 입력이 타입 레벨로 막혀 있다 (사양 §1.2)", () => {
  const a = buildUnmodeledAnswer("q", BUNDLE, "한도는 400만원이다 [1].");
  assert.equal(a.personalApplicationAllowed, false);
  assert.equal(a.planEngineInputAllowed, false);
});

test("인용된 조문만 근거로 싣는다 (근거 부풀리기 방지)", () => {
  const two = { items: [ISA_LIKE, item({ ref: 2, sourceId: "OTHER" })], seedCount: 2, expandedCount: 0 };
  const a = buildUnmodeledAnswer("q", two, "한도는 400만원이다 [1].");
  assert.deepEqual(a.citations.map((c) => c.sourceId), ["TAXEX_91_18"]);
});

test("★ 위조 인용이 있으면 내보낼 수 없다", () => {
  const a = buildUnmodeledAnswer("q", BUNDLE, "한도는 400만원이다 [7].");
  assert.equal(isPublishable(a), false);
});

test("★ 사양 §4.4 금지 문구가 있으면 내보낼 수 없다", () => {
  const a = buildUnmodeledAnswer("q", BUNDLE, "평생 받을 수 있다 [1].");
  assert.deepEqual(a.forbiddenPhrases, ["평생"]);
  assert.equal(isPublishable(a), false);
});

test("정상 답변은 내보낼 수 있다", () => {
  const good =
    "한도는 400만원 또는 200만원이다 [1]. 400만원 조건은 총급여 5,000만원 이하, " +
    "종합소득금액 3,800만원 이하, 대통령령으로 정하는 농어민 중 하나다 [1].";
  assert.equal(isPublishable(buildUnmodeledAnswer("q", BUNDLE, good)), true);
});

test("answerPayloadHash 는 결정론적이고 내용이 바뀌면 달라진다", () => {
  const a = buildUnmodeledAnswer("q", BUNDLE, "한도는 400만원이다 [1].");
  const same = buildUnmodeledAnswer("q", BUNDLE, "한도는 400만원이다 [1].");
  const diff = buildUnmodeledAnswer("q", BUNDLE, "한도는 200만원이다 [1].");
  assert.match(a.answerPayloadHash, /^[0-9a-f]{64}$/);
  assert.equal(a.answerPayloadHash, same.answerPayloadHash);
  assert.notEqual(a.answerPayloadHash, diff.answerPayloadHash);
});

test("거절은 명시적 문구를 갖는다 (조용한 무응답 금지)", () => {
  const r = reject("코퍼스에 근거 없음");
  assert.ok(isRejected(r));
  assert.match(r.message, /확인하지 못했습니다/);
});

// ─────────────────────────── 프롬프트 ───────────────────────────

test("프롬프트가 조문 전문과 인용 규칙을 담는다", () => {
  const p = buildUserPrompt("ISA 한도?", [ISA_LIKE]);
  assert.match(p, /\[1\]/);
  assert.match(p, /400만원/);
  assert.match(p, /3,800만원/);
  assert.match(SYSTEM_PROMPT, /문장마다 끝에 \[n\]/);
  assert.match(SYSTEM_PROMPT, /조건을 빠뜨리지 마라/);
});

test("[각 목] 조문에는 소속 미상 주의가 프롬프트에 붙는다", () => {
  assert.match(buildUserPrompt("q", [ISA_LIKE]), /어느 호에 속하는지 확정할 수 없다/);
});

test("LLM 을 스텁으로 주입해 전체 흐름이 돈다", async () => {
  const stub = async (): Promise<string> => "한도는 400만원이다 [1].";
  const text = await generateAnswer("q", [ISA_LIKE], stub);
  assert.equal(buildUnmodeledAnswer("q", BUNDLE, text).citations.length, 1);
});

test("빈 묶음으로는 답변을 만들지 않는다", async () => {
  await assert.rejects(() => generateAnswer("q", [], async () => "x"), /근거가 없다/);
});

// ─────────── 목록 도입부 (실측 회귀: 규칙 8·9 도입 후 0 → 4건 오탐) ───────────

test("★ 콜론으로 끝나는 목록 도입부는 인용 없는 주장으로 세지 않는다", () => {
  const answer = [
    "연간 납입한도에 포함되는 금액은 다음과 같습니다:",
    "• 연간 1천800만원 [1].",
    "이 경우 다음 요건을 모두 갖추어야 합니다:",
    "• 60세 이상일 것 [1].",
  ].join("\n");
  const r = verifyCitations(answer, 1);
  assert.deepEqual(r.issues.filter((i) => i.kind === "UNCITED_CLAIM"), [],
    "도입부에 인용을 요구하면 LLM 이 콜론 뒤에 [n] 을 뿌린다 — 근거가 아니라 소음");
});

test("도입부 예외가 진짜 무인용 주장을 가려주지는 않는다", () => {
  // 콜론으로 끝나지 않는 사실 문장은 여전히 잡혀야 한다.
  const r = verifyCitations("한도는 연간 1천800만원이다.", 1);
  assert.equal(r.issues.filter((i) => i.kind === "UNCITED_CLAIM").length, 1);
});

test("★ 마크다운 제목은 인용 없는 주장으로 세지 않는다 (구조 표시다)", () => {
  const answer = ["## 2. 비과세 한도", "한도는 200만원이다 [1].", "### 3. 예시", "총급여 5천만원 이하면 해당한다 [1]."].join("\n");
  const r = verifyCitations(answer, 1);
  assert.deepEqual(r.issues.filter((i) => i.kind === "UNCITED_CLAIM"), []);
});

test("★ 목록 항목 가운데 마침표가 있어도 끝의 인용이 항목 전체를 덮는다", () => {
  // 실측 부작용: `• …거주자. 단, …한정한다[1]` 이 문장 분리기 때문에 둘로 쪼개져
  // 앞쪽("…거주자.")이 무인용 주장으로 잡혔다. 모델 잘못이 아니라 분리기 부작용이다.
  const a = "• 총급여액이 5천만원 이하인 거주자. 단, 근로소득만 있는 경우로 한정한다[1]";
  assert.deepEqual(verifyCitations(a, 1).issues.filter((i) => i.kind === "UNCITED_CLAIM"), []);
});

test("★ 문단은 여전히 문장 단위로 검사한다 (줄 범위로 보면 검사가 약해진다)", () => {
  // 목록이 아닌 줄은 예외가 아니다 — 문장 다섯 개에 인용 하나만 달고 통과하면 안 된다.
  const a = "한도는 400만원이다. 조건은 총급여 5천만원 이하다. 농어민도 해당한다[1]";
  const n = verifyCitations(a, 1).issues.filter((i) => i.kind === "UNCITED_CLAIM").length;
  assert.equal(n, 2, "문단의 무인용 문장을 놓쳤다");
});

test("번호 목록·한글 목록도 항목으로 본다", () => {
  for (const a of ["1. 총급여 5천만원 이하인 거주자. 단서가 있다[1]", "가. 종합소득 3천8백만원 이하. 단서가 있다[1]"]) {
    assert.deepEqual(verifyCitations(a, 1).issues.filter((i) => i.kind === "UNCITED_CLAIM"), [], a);
  }
});

// ─────────── 조문 안의 적용기한 (실측: TAXEX_86_4 는 시행 중인데 내용은 2022년까지) ───────────

test("★ 조문 본문의 적용기한을 뽑는다 — 시행일로는 못 잡는 것이다", () => {
  assert.deepEqual(extractDeadlines("…거주자는 2022년 12월 31일까지 「소득세법」…"), ["2022-12-31"]);
  assert.deepEqual(extractDeadlines("2025. 6. 3. 까지 적용한다"), ["2025-06-03"]);
  assert.deepEqual(extractDeadlines("한도는 400만원으로 한다"), []);
});

test("여러 기한이 있으면 다 뽑고 정렬한다", () => {
  assert.deepEqual(
    extractDeadlines("2022년 12월 31일까지 …하고 2027년 1월 1일까지 …한다"),
    ["2022-12-31", "2027-01-01"],
  );
});

test("★ 조회일 기준으로 지난 기한만 골라낸다 (판정은 날짜 비교일 뿐 법적 결론이 아니다)", () => {
  const it = item({ ref: 1, text: "2022년 12월 31일까지 적용한다" });
  assert.deepEqual(expiredDeadlines(it, "2026-07-31"), ["2022-12-31"]);
  assert.deepEqual(expiredDeadlines(it, "2020-01-01"), [], "아직 안 지난 기한을 지났다고 했다");
});

test("★ 실코퍼스의 TAXEX_86_4 가 실제로 기한 지난 조문으로 잡힌다", () => {
  const b = assembleBundle(source(), ranked("TAXEX_86_4") as never, { seedTopK: 1, maxItems: 1 });
  const a = b.items[0];
  assert.ok(a !== undefined);
  assert.deepEqual(a.applicationDeadlines, ["2022-12-31"]);
  // 조문 자체는 시행 중이다 — 그래서 시행일만 보면 절대 안 걸린다.
  assert.ok(a.validFrom >= "2026-01-01", "시행일이 미래인데도 내용은 끝난 규정이다");
  assert.equal(expiredDeadlines(a, "2026-07-31").length, 1);
});

test("★ 기한 지난 조문이면 프롬프트에 경고가 붙는다", () => {
  const it = item({ ref: 1, text: "2022년 12월 31일까지 연 600만원으로 한다" });
  const p = buildUserPrompt("연금저축 세액공제 한도", [it], [], "2026-07-31");
  assert.match(p, /적용기한 2022-12-31/);
  assert.match(p, /현행 규정처럼 쓰지 마라/);
  assert.match(p, /값을 섞지 마라/);
});

test("기한이 안 지났으면 경고를 붙이지 않는다 (남발하면 무뎌진다)", () => {
  const it = item({ ref: 1, text: "2030년 12월 31일까지 연 600만원으로 한다" });
  assert.equal(buildUserPrompt("q", [it], [], "2026-07-31").includes("현행 규정처럼"), false);
});

test("★ '확인되지 않는다' 는 인용 없어도 위반이 아니다 (규칙 5 가 달지 말라고 한다)", () => {
  // 검사기가 프롬프트 규칙과 어긋나면 **지표가 옳은 행동을 벌한다** (평가셋 실측 10건).
  for (const a of [
    "제공된 조문에서는 확인되지 않는다.",
    "건강보험료 산정 시 반영 여부는 포함되어 있지 않다.",
    "해당 요건은 제공된 자료에서 확인할 수 없다.",
  ]) {
    assert.deepEqual(verifyCitations(a, 1).issues.filter((i) => i.kind === "UNCITED_CLAIM"), [], a);
  }
});

test("그래도 진짜 무인용 주장은 계속 잡는다", () => {
  const r = verifyCitations("연금저축계좌 세액공제 한도는 연 600만원이다.", 1);
  assert.equal(r.issues.filter((i) => i.kind === "UNCITED_CLAIM").length, 1);
});

// ─────── 금액 대조 (실측: 형식 검사를 다 통과하고 값만 틀린 답) ───────

const TAXEX_86_4_LIKE =
  "…연금저축계좌에 납입한 금액이 연 600만원을 초과하는 경우에는 그 초과하는 금액은 없는 것으로 하고, " +
  "600만원 이내의 금액과 퇴직연금계좌에 납입한 금액을 합한 금액이 연 900만원을 초과하는 경우에는…";

test("★ 답변이 지어낸 금액을 잡는다 (원문에 없는 1,200만원)", () => {
  // 실측 답변: "더 높은 한도(연금저축 900만원, 합계 1,200만원)를 인정하던 규정" —
  // 원문은 600/900 이고 1,200만원은 어디에도 없다. 위조 인용 0 · 앵커 75% 로 **다 통과한 답**이었다.
  const bad = "더 높은 한도(연금저축 900만원, 합계 1,200만원)를 인정하던 규정이 있었다[1].";
  const found = findUnsourcedAmounts(bad, [TAXEX_86_4_LIKE]);
  assert.deepEqual(found.map((x) => x.asWritten), ["1,200만원"], "지어낸 금액을 놓쳤다");
});

test("원문에 있는 금액은 잡지 않는다 (표기가 달라도)", () => {
  assert.deepEqual(findUnsourcedAmounts("한도는 600만원이고 합계는 900만원이다[1].", [TAXEX_86_4_LIKE]), []);
  // 한글 수사 ↔ 아라비아
  assert.deepEqual(findUnsourcedAmounts("연 1천800만원[1]", ["연 1,800만원을 말한다"]), []);
});

test("조문번호는 금액으로 오인하지 않는다", () => {
  assert.deepEqual(findUnsourcedAmounts("제59조의3에 따른다[1]. 제91조의18도 본다[1].", [TAXEX_86_4_LIKE]), []);
});

test("★ 예시용 가정 금액도 걸리지만 그건 오류가 아니라 경고다 (규칙 10)", () => {
  // 규칙 10 은 "예를 들어 총급여 4,500만원인 근로자" 를 허용한다. 그래서 이 검사는
  // **판정이 아니라 드러내기**다 — 화면에 문장째 보여주고 사람이 가린다.
  const r = findUnsourcedAmounts("예를 들어 총급여액이 4,500만원인 근로자라면[1]", [TAXEX_86_4_LIKE]);
  assert.equal(r.length, 1);
  assert.match(r[0]?.sentence ?? "", /예를 들어/);
});

test("★ 표 헤더행은 무인용 주장이 아니다 — 데이터 행은 여전히 검사한다", () => {
  // 실측: `| 구분 | 비과세 한도 | 적용 대상 |` 이 `한도` 때문에 주장으로 잡혔다.
  // 축 이름에는 확인할 사실이 없다. 반면 값이 든 데이터 행은 인용이 있어야 한다.
  const table = [
    "| 구분 | 비과세 한도 | 적용 대상 |",
    "|---|---|---|",
    "| 서민형 | 400만원 | 총급여 5천만원 이하인 거주자[1] |",
    "| 일반형 | 200만원 | 위에 해당하지 않는 자 |",
  ].join("\n");
  const uncited = verifyCitations(table, [1]).issues.filter((i) => i.kind === "UNCITED_CLAIM");
  assert.equal(uncited.length, 1, `헤더·구분선은 빠지고 무인용 데이터 행만 남아야 한다: ${JSON.stringify(uncited)}`);
  assert.match(uncited[0]?.sentence ?? "", /일반형/);
});

test("★ 번호가 붙은 제목은 문장 분리기에 쪼개져도 주장이 아니다", () => {
  // 실측: `## 1. 비과세 한도금액 (400만원 vs 200만원)` 이 `1.` 뒤에서 갈라져
  // 뒷조각이 `##` 를 잃고 무인용 주장으로 잡혔다. 제목 판정은 줄 단위여야 한다.
  const text = "## 1. 비과세 한도금액 (400만원 vs 200만원)\n한도는 400만원이다[1].";
  const uncited = verifyCitations(text, [1]).issues.filter((i) => i.kind === "UNCITED_CLAIM");
  assert.deepEqual(uncited, []);
});

test("답이 스스로 '확정되지 않는다'고 말한 문장은 인용을 요구하지 않는다", () => {
  // 규칙 5 는 이럴 때 [n] 을 달지 말라고 한다. 검사기가 반대로 요구하면 옳은 행동을 벌한다.
  const text = "어느 호에 속하는지는 조문 표기상 확정되지 않는다.";
  assert.deepEqual(verifyCitations(text, [1]).issues, []);
});

test("★ 하위 목록을 거느린 줄은 도입부다 (콜론이 줄 끝에 없어도)", () => {
  // 실측: `- **400만원**: 아래 셋 중 하나에 해당하면 이 한도예요.` 가 무인용으로 잡혔는데
  // 바로 아래 항목에는 [1] 이 각각 붙어 있었다. 판정 근거는 문장부호가 아니라 구조다.
  const text = [
    "- **400만원**: 아래 셋 중 하나에 해당하면 이 한도예요.",
    "  - 작년 연봉이 5천만원 이하인 사람[1]",
    "  - 종합소득금액이 3천8백만원 이하인 사람[1]",
  ].join("\n");
  assert.deepEqual(verifyCitations(text, [1]).issues, []);
});

test("★ 규칙 0 의 '범위 밖 알림' 문장은 인용을 요구하지 않는다", () => {
  // 프롬프트가 시킨 형식을 검사기가 위반으로 세면, 지표가 옳은 행동을 벌한다.
  const text = "이 밖에 가입요건 확인 절차·중도해지 시 세액 추징 규정도 있어요. 필요하면 물어보세요.";
  assert.deepEqual(verifyCitations(text, [1]).issues, []);
});

test("★ 예시 가정 금액과 진짜 미확인 금액을 가른다", () => {
  const src = ["비과세 한도는 400만원으로 한다."];
  const found = findUnsourcedAmounts(
    "예를 들어 작년 연봉이 4,800만원이었다면 400만원 한도예요.\n공제 한도는 900만원입니다.",
    src,
  );
  const assumed = found.filter((x) => x.assumed).map((x) => x.asWritten);
  const real = found.filter((x) => !x.assumed).map((x) => x.asWritten);
  assert.deepEqual(assumed, ["4,800만원"], `가정값 판정이 틀렸다: ${JSON.stringify(found)}`);
  assert.deepEqual(real, ["900만원"], "조문에 없는 법정 값은 여전히 잡혀야 한다");
});

// ─────────────────────────────────────────────────────────────────────────────
// 계산 금지 (규칙 10 · 절대 규칙 3) — **프롬프트가 아니라 출력 검사로 막는다.**
// 지시를 얼마나 따르는지는 모델마다 다르고, 그건 우리가 통제할 수 없다.
// ─────────────────────────────────────────────────────────────────────────────

test("★ 답변이 계산해서 낸 금액을 잡는다", () => {
  // 실측: Haiku 가 낸 식. 위조 인용 0 · 앵커 100% 로 다른 검사를 전부 통과했다.
  for (const bad of [
    "전환금액 한도: 2,000만원의 10% = 200만원",
    "합계: 1,500만원 + 200만원 = 1,700만원",
    "600만원 × 15% = 90만원 을 공제받는다",
  ]) {
    assert.equal(findComputedAmounts(bad).length, 1, `못 잡았다: ${bad}`);
  }
});

test("★ 조문이 정한 산식은 계산이 아니다 (옮겨 적는 건 의무다)", () => {
  // 금지되는 건 산술 기호가 아니라 **결과를 내는 것**이다. 변수가 남아 있으면 결과가 아니다.
  for (const ok of [
    "연간 납입한도는 2천만원 × [1 + 가입 후 경과 연수] - 누적 납입금액 으로 계산해요[1].",
    "공제율은 15%예요[1]. 인정 한도는 600만원이에요[1].",
    "비과세 한도는 400만원 또는 200만원이에요[1].",
    "|---|---|",
  ]) {
    assert.deepEqual(findComputedAmounts(ok), [], `오탐: ${ok}`);
  }
});

test("★ 계산한 금액이 있으면 내보낼 수 없다", () => {
  const bundle = { items: [item({ ref: 1 })], seedCount: 1, expandedCount: 0 };
  const good = buildUnmodeledAnswer("q", bundle, "공제율은 15%예요[1].");
  const bad = buildUnmodeledAnswer("q", bundle, "600만원 × 15% = 90만원 이에요[1].");
  assert.equal(isPublishable(good), true);
  assert.equal(isPublishable(bad), false, "계산 결과는 근거를 댈 수 없는 숫자다 — 위조 인용과 같은 급");
  assert.equal(bad.computedAmounts.length, 1);
});

test("★ 재생성 지시는 규칙을 되풀이하지 않고 **잡힌 식을 들이민다**", () => {
  // "하지 마라"는 이미 프롬프트에 있었고 그걸로 안 막혔다. 같은 말 반복은 대책이 아니다.
  const c = correctionForComputedAmounts(["2,000만원의 10% = 200만원"]);
  assert.match(c, /2,000만원의 10% = 200만원/);
  assert.match(c, /재료만 제시하고 결과는 내지 마라/);
});

test("★ 계산하면 1회 재생성하고, 고쳐지면 그걸 쓴다", async () => {
  let call = 0;
  const llm = async (_s: string, user: string): Promise<string> => {
    call += 1;
    // 2차 호출에는 교정 지시가 붙어 있어야 한다 — 그게 없으면 같은 답이 또 나온다.
    if (call === 2) assert.match(user, /다시 써라/);
    return call === 1 ? "600만원 × 15% = 90만원 이에요[1]." : "공제율은 15%예요[1]. 한도는 600만원이에요[1].";
  };
  const r = await generateChecked("q", [item({ ref: 1 })], llm);
  assert.equal(call, 2);
  assert.equal(r.retried, true);
  assert.deepEqual(findComputedAmounts(r.text), []);
});

test("★ 재생성이 못 고치면 첫 답을 쓰되 위반 표시는 남는다", async () => {
  // 조용히 통과시키면 안 된다. 못 고쳤다는 사실이 화면·리포트에 남아야 한다.
  const llm = async (): Promise<string> => "600만원 × 15% = 90만원 이에요[1].";
  const r = await generateChecked("q", [item({ ref: 1 })], llm);
  assert.equal(r.retried, true);
  assert.equal(findComputedAmounts(r.text).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 표기 변형 흡수 — **지시 불이행을 파서로 받아낸다.**
// 지시를 얼마나 따르는지는 모델마다 다르고 그건 통제할 수 없다. 표기를 읽어 주는 건 우리 몫이다.
// ─────────────────────────────────────────────────────────────────────────────

test("★ 항·호를 덧붙인 인용을 표준형으로 되돌린다", () => {
  // 실측: Haiku 가 `[3②1]` 로 써서 인용이 **하나도 인식되지 않았다**(무인용 10건, 인용률 ✗).
  assert.equal(normalizeCitations("나뉩니다[3②1]."), "나뉩니다[3].");
  assert.equal(normalizeCitations("한도 [3②1가]"), "한도 [3]");
  assert.equal(normalizeCitations("표기[2③④]"), "표기[2]");
});

test("★ 정규화가 멀쩡한 표기를 건드리지 않는다", () => {
  for (const s of ["정상[1] 유지", "복수[1, 2] 유지", "[각 목] 유지", "두 자리[32] 유지", "모르는[3 주석] 유지"]) {
    assert.equal(normalizeCitations(s), s, `건드리면 안 되는 표기를 바꿨다: ${s}`);
  }
});

test("정규화 뒤에는 인용이 실제로 인식된다", () => {
  const bundle = { items: [item({ ref: 3 })], seedCount: 1, expandedCount: 0 };
  const a = buildUnmodeledAnswer("q", bundle, "연간 한도는 1,800만원이에요[3②1].");
  assert.deepEqual(a.citeReport.usedRefs, [3], "정규화가 없으면 인용 0건이 된다");
  assert.equal(a.citations.length, 1);
});

test("★ 등호 없이 계산한 금액도 잡는다 (형태가 아니라 값으로 판정)", () => {
  // 실측: 등호형을 막았더니 Haiku 가 등호를 빼고 결과만 냈다.
  const ans = [
    "- 기본 한도 1,800만원과",
    "- 전환금액 2,000만원을",
    "합쳐서 3,800만원까지 납입 가능이에요.",
  ].join("\n");
  assert.deepEqual(findComputedAmounts(ans), [], "등호가 없으므로 등호형 검사는 못 잡는다");
  const derived = findDerivedAmounts(ans, ["3,800만원"]);
  assert.equal(derived.length, 1, `유도형 검사가 놓쳤다: ${JSON.stringify(derived)}`);
});

test("조문에 있는 값은 유도형 검사의 후보가 아니다 (오탐 방지)", () => {
  // 후보는 `findUnsourcedAmounts` 가 이미 "인용 조문에 없다"고 거른 것뿐이다.
  assert.deepEqual(findDerivedAmounts("한도는 600만원과 900만원이에요.", []), []);
});
