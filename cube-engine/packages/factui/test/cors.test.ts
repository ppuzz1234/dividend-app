/**
 * 교차 출처 허용 판정 회귀.
 *
 * 이 검사가 있는 이유: 허용 판정은 **틀려도 화면상 아무 일이 없어 보인다.** 너무 좁으면
 * "버튼은 보이는데 물으면 실패"(실측 — 검증 서버를 5174 에 띄웠다가 전부 막혔다),
 * 너무 넓으면 아무 페이지나 우리 LLM 키로 호출당 비용을 태울 수 있다. 둘 다 조용하다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { corsOriginAllowed } from "../src/server.js";

test("목록이 비면 같은 PC 의 개발 서버를 허용한다 — 포트는 Vite 가 바꾸므로 묶지 않는다", () => {
  for (const o of [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174", // Vite 가 포트를 자동으로 올린 경우
    "http://localhost",
  ]) {
    assert.equal(corsOriginAllowed([], o), true, o);
  }
});

test("목록이 비어도 바깥 출처는 막는다", () => {
  for (const o of [
    "https://evil.example",
    "http://localhost.evil.example", // 접두사만 같은 도메인
    "https://localhost:5173", // https 로 위장
    "http://127.0.0.1.evil.example",
    "http://192.168.0.10:5173", // 같은 랜의 다른 기기
  ]) {
    assert.equal(corsOriginAllowed([], o), false, o);
  }
});

test("목록을 적으면 그 목록만 허용한다 — 로컬 기본값은 더 이상 적용되지 않는다", () => {
  const list = ["https://cube.example"];
  assert.equal(corsOriginAllowed(list, "https://cube.example"), true);
  assert.equal(corsOriginAllowed(list, "http://localhost:5173"), false);
});

test("와일드카드를 목록에 적어도 만능키가 되지 않는다", () => {
  assert.equal(corsOriginAllowed(["*"], "https://evil.example"), false);
});
