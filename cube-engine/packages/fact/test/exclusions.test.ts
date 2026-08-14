/**
 * 비포함 고지 회귀 — 사양 §0-A.7.
 *
 * 여기서 지키는 것은 두 가지다.
 * ① 비율을 말한 답에는 **반드시** 지방소득세 비포함 고지가 붙는다 (실측 사고의 재발 방지).
 * ② 고지 문구 자체에 **세법 값이 리터럴로 들어가지 않는다** (절대 규칙 1).
 *    ②가 없으면 "친절하게 16.5% 라고 적어 두자" 는 선의로 규칙이 조용히 깨진다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { findExclusionIds, findExclusions } from "../src/exclusions.js";

test("비율을 말한 답에는 지방소득세 비포함 고지가 붙는다", () => {
  // 실측 사고 재현: 조문 그대로 답했는데 사용자가 "틀렸다" 고 판정한 형태
  assert.ok(findExclusionIds("연금저축 세액공제율은 12% 예요 [1].").includes("LOCAL_INCOME_TAX"));
  // 조문 표기(100분의 N)로 답한 경우도 같은 사건이다
  assert.ok(findExclusionIds("납입액의 100분의 15 를 공제한다 [1].").includes("LOCAL_INCOME_TAX"));
});

test("비율이 없는 답에는 붙지 않는다 — 매번 뜨면 아무도 안 읽는다", () => {
  assert.deepEqual(findExclusionIds("연금저축계좌 납입액은 연 600만원까지 인정돼요 [1]."), []);
});

test("금융소득·연금수령 답에는 준조세 비포함 고지가 붙는다", () => {
  assert.ok(findExclusionIds("금융소득이 기준을 넘으면 종합과세됩니다 [1].").includes("SOCIAL_INSURANCE"));
});

test("고지 문구에 세법 값을 리터럴로 적지 않는다 (절대 규칙 1)", () => {
  // 두 규칙이 다 걸리는 답으로 모든 문구를 한 번에 검사한다
  const all = findExclusions("연금소득 원천징수 비율은 100분의 5 입니다 [1].").join(" ");
  assert.ok(all.length > 0, "고지가 하나도 안 나오면 이 검사가 무의미하다");
  // 퍼센트·분수·금액 표기가 문구에 섞이는 순간 실패한다
  assert.doesNotMatch(all, /\d\s*%/, "고지에 세율을 적었다");
  assert.doesNotMatch(all, /100분의\s*\d/, "고지에 조문 비율 표기를 적었다");
  assert.doesNotMatch(all, /\d[\d,]*\s*(만원|억원|원)/, "고지에 금액을 적었다");
});
