/**
 * Router 고정 케이스 (Phase 11 DoD ②).
 *
 * 여기서 지키는 것: **PLAN 질의가 FACT 엔진에 도달하지 않는 것**, 그리고 PLAN 판정이
 * 계산이 아니라 **안내**로 끝나는 것. 한국어 부분문자열 함정 회귀도 같이 잡는다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PLAN_MESSAGE, routeIntent } from "../src/router.js";

// ─────────────────── FACT 로 가야 하는 것 ───────────────────

const FACT_CASES = [
  "ISA 비과세 한도 얼마야?",
  "IRP 연간 납입한도가 얼마인가",
  "연금계좌 중도인출 사유",
  "소득세법 제55조 세율",
  "국내 상장주식 양도소득 과세 방법",
  "ISA 서민형 가입 요건",
  "퇴직연금 담보대출 한도",
  "세액공제 대상 저축 상품",
  "40세 이상 가입 제한이 있나", // 조문의 연령 요건을 묻는 것 — 개인 수치가 아니다
];

for (const q of FACT_CASES) {
  test(`FACT 로 간다: ${q}`, () => {
    const r = routeIntent(q);
    assert.equal(r.intent, "FACT", `PLAN 으로 잘못 갔다 (걸린 신호: ${r.matched.join(", ")})`);
    assert.equal(r.message, null);
  });
}

// ─────────────────── PLAN 으로 걷어내야 하는 것 ───────────────────

const PLAN_CASES: readonly [string, string][] = [
  ["나는 연봉 6000만원인데 IRP 얼마 넣어야 돼?", "개인 소득 + 저축액 설계"],
  ["제가 35살인데 ISA랑 연금저축 중 뭐가 나아요?", "개인 나이 + 비교 조언"],
  ["ISA랑 IRP 중 뭐가 유리해?", "주어가 없어도 최적화 질문이다"],
  ["절세 방법 추천해줘", "조언 요구"],
  ["내 소득 기준으로 절세 플랜 짜줘", "개인 + 설계"],
  ["연말정산 가장 좋은 조합 알려줘", "최적화"],
  ["세금 아끼려면 어떻게 해야 해?", "조언"],
];

for (const [q, why] of PLAN_CASES) {
  test(`PLAN 으로 걷어낸다 (${why}): ${q}`, () => {
    const r = routeIntent(q);
    assert.equal(r.intent, "PLAN", "FACT 엔진으로 샜다 — §1.2 개인 적용 금지가 뚫린다");
    assert.ok(r.matched.length > 0, "무엇에 걸렸는지 추적할 수 없으면 목록을 못 고친다");
  });
}

// ─────────────────── 안내이지 계산이 아니다 ───────────────────

test("★ PLAN 판정은 계산이 아니라 안내로 끝난다", () => {
  const r = routeIntent("나는 연봉 6000만원인데 IRP 얼마 넣어야 돼?");
  assert.equal(r.message, PLAN_MESSAGE);
  // 숫자·금액을 되돌려주면 그건 이미 개인 적용이다.
  assert.equal(/\d{3,}/.test(PLAN_MESSAGE), false, "안내문에 계산으로 읽힐 수치가 있다");
  assert.match(PLAN_MESSAGE, /아직 구현되지 않았습니다/);
  assert.match(PLAN_MESSAGE, /법령 원문 근거만/);
});

// ─────────────────── 한국어 부분문자열 함정 (회귀) ───────────────────

test("★ '제55조' 의 제, '국내' 의 내, '저축' 의 저에 걸리지 않는다", () => {
  for (const q of ["소득세법 제55조", "국내외 소득", "저축성보험 과세", "내국법인 원천징수"]) {
    const r = routeIntent(q);
    assert.equal(r.intent, "FACT", `${q} → 오탐 (${r.matched.join(", ")})`);
  }
});

test("★ 조문의 금액(1천800만원)을 개인 수치로 오인하지 않는다", () => {
  assert.equal(routeIntent("IRP 한도가 1천800만원 맞나요?").intent, "FACT");
  assert.equal(routeIntent("세율 15퍼센트 적용 대상").intent, "FACT");
});

test("빈 질의는 FACT 로 떨어져 검색 단계에서 거절된다", () => {
  assert.equal(routeIntent("   ").intent, "FACT");
});

// ─────────── 실측 누락 회귀 (2026-08-04): 답이 세액을 계산해 버렸다 ───────────

test("★ 개인 수치 + 결과 금액 요구는 PLAN 이다 — 안 그러면 답이 계산한다", () => {
  // 실측: `"총급여 5천만원인데 연금저축 600만원 넣으면 세액공제 얼마 받아?"` 가 FACT 로 새어
  // 답이 **"90만원이다. 600만원 × 15%"** 라고 계산했다.
  // §1.2 개인 적용 금지 + 절대 규칙 3(계산 경로 LLM 금지)을 동시에 어긴 것이다.
  for (const q of [
    "총급여 5천만원인데 연금저축 600만원 넣으면 세액공제 얼마 받아?",
    "연봉 7천이면 세금 얼마 돌려받나",
    "급여 6000만원인데 얼마 절세되나",
  ]) {
    assert.equal(routeIntent(q).intent, "PLAN", `FACT 로 샜다 — 답이 계산해 버린다: ${q}`);
  }
});

test("★ 같은 낱말이라도 **조문의 기준**을 묻는 것은 FACT 다", () => {
  // `총급여` 는 조문에도 흔하다. 개인 값이 아니라 **기준**을 묻는 질의를 막으면 안 된다.
  for (const q of [
    "총급여 5천만원 이하면 공제율이 몇 퍼센트인가",
    "종합소득금액 4500만원 기준은 어느 조문에 있나",
    "연금계좌 세액공제율이 어떻게 되나",
  ]) {
    assert.equal(routeIntent(q).intent, "FACT", `기준 질의가 막혔다: ${q}`);
  }
});

test("약한 소득 신호는 같은 자리를 두 번 세지 않는다", () => {
  // 패턴을 `총급여\d` 와 `급여\d` 로 쪼개면 한 자리가 2건으로 세어져
  // 약한 신호만으로 PLAN 이 된다(실측 오탐). 교대 패턴 하나로 묶어야 한다.
  const r = routeIntent("총급여 5천만원 이하 기준");
  assert.equal(r.intent, "FACT");
  assert.ok(r.matched.length <= 1, `같은 자리를 여러 번 셌다: ${r.matched.join(", ")}`);
});
