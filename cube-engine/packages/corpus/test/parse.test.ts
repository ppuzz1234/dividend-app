/**
 * parse.ts 자체 점검 — 네트워크 없이 fixture 로만 돈다.
 *
 * fixture 는 실제 응답(조세특례제한법 제91조의18)의 key 구조를 손으로 줄여 쓴 것이다.
 * textHash 기대값을 hex 로 박지 않는 이유: sha256 은 @cube/numeric 이 외부 공표 벡터로 이미 검증했고,
 * 여기서 우리 출력을 복사해 넣으면 그 순간 버그가 정답지로 승격된다 (CLAUDE.md 정답지 규약).
 * 그래서 여기서는 **배선**(형식·결정성·차이 반영)만 확인한다.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { mapAuthorityType, mapLifecycle, parseArticles, toLocalDate } from "../src/parse.js";

function body(units: unknown[]): unknown {
  return { 법령: { 조문: { 조문단위: units } } };
}

// 실제 응답의 key 순서를 그대로 흉내낸다 — `항` 이 `조문내용` 보다 **먼저** 온다.
// key 순서대로 훑으면 조문 첫 문장이 맨 끝으로 밀리므로, 이 순서가 이 fixture 의 핵심이다.
const 제91조의18 = {
  조문번호: "91",
  조문시행일자: "20260101",
  항: [
    { 항번호: "①", 항내용: "거주자가 계좌를 개설하는 경우" },
    {
      항번호: "②",
      항내용: "다음 각 호의 요건을 갖추어야 한다",
      호: [
        { 호번호: "1", 호내용: "가입 당시 19세 이상일 것" },
        { 호번호: "2", 호내용: "직전 과세기간에 금융소득종합과세 대상이 아닐 것" },
      ],
    },
  ],
  조문내용: "제91조의18(개인종합자산관리계좌에 대한 과세특례)",
  조문제목: "개인종합자산관리계좌에 대한 과세특례",
  조문여부: "조문",
  조문가지번호: "18",
};

test("응답 key 순서와 무관하게 조문 첫 문장이 맨 앞에 온다", () => {
  const [a] = parseArticles(body([제91조의18]), "TAXEX");
  assert.ok(a);
  assert.equal(a.sourceId, "TAXEX_91_18");
  assert.equal(a.articleNo, "91");
  assert.equal(a.articleSubNo, "18");
  assert.equal(a.title, "개인종합자산관리계좌에 대한 과세특례");
  assert.equal(a.validFrom, "2026-01-01");

  assert.equal(
    a.text,
    [
      "제91조의18(개인종합자산관리계좌에 대한 과세특례)",
      "거주자가 계좌를 개설하는 경우",
      "다음 각 호의 요건을 갖추어야 한다",
      "가입 당시 19세 이상일 것",
      "직전 과세기간에 금융소득종합과세 대상이 아닐 것",
    ].join("\n"),
  );

  // 호가 통째로 빠지면 "19세 이상" 같은 요건이 사라진 채 원문 행세를 한다 — 요약 금지의 핵심.
  assert.match(a.text, /19세 이상/);
  assert.match(a.textHash, /^[0-9a-f]{64}$/);
});

test("소속 호를 알 수 없는 목은 표식을 달아 오독을 막는다", () => {
  // 실제 조특법 §91의18 ② 구조: 목이 호의 자식이 아니라 항의 형제로 온다.
  // 표식 없이 이어붙이면 '5천만원 이하 → 200만원' 으로 뒤집혀 읽힌다 (실제 값은 400만원).
  const [a] = parseArticles(
    body([
      {
        조문번호: "91",
        조문가지번호: "18",
        조문시행일자: "20260101",
        조문여부: "조문",
        항: [
          {
            항번호: "②",
            항내용: "비과세 한도금액은 다음 각 호의 구분에 따른 금액으로 한다",
            호: [
              { 호번호: "1", 호내용: "1. 다음 각 목의 어느 하나에 해당하는 경우: 400만원" },
              { 호번호: "2", 호내용: "2. 제1호에 해당하지 아니하는 자의 경우: 200만원" },
            ],
            목: [{ 목번호: "가.", 목내용: "가. 직전 과세기간의 총급여액이 5천만원 이하인 거주자" }],
          },
        ],
        조문내용: "제91조의18(개인종합자산관리계좌에 대한 과세특례)",
      },
    ]),
    "TAXEX",
  );
  assert.ok(a);
  assert.match(a.text, /\[각 목\] 가\. 직전 과세기간의 총급여액이 5천만원 이하/);
  // 마지막 호(200만원) 바로 뒤에 표식 없이 붙으면 소속을 오인하게 된다.
  assert.ok(!/200만원\n가\./.test(a.text));
});

test("소속이 확정된 목(호의 자식)에는 표식을 달지 않는다", () => {
  const [a] = parseArticles(
    body([
      {
        조문번호: "1",
        조문시행일자: "20260101",
        조문여부: "조문",
        조문내용: "제1조(정의)",
        항: [{ 항번호: "①", 항내용: "다음과 같다", 호: [{ 호내용: "1. 계좌", 목: [{ 목내용: "가. 예금" }] }] }],
      },
    ]),
    "X",
  );
  assert.ok(a);
  assert.equal(a.text, "제1조(정의)\n다음과 같다\n1. 계좌\n가. 예금");
});

test("목내용이 중첩 배열로 와도 세목까지 전부 살린다", () => {
  // 실례: 소득세법 시행령 §20 ① 나목 — 목 아래 (1)(2)(3) 이 배열의 배열로 온다.
  // 문자열만 읽으면 이 세목들이 사라진 채 '원문' 으로 저장된다.
  const [a] = parseArticles(
    body([
      {
        조문번호: "20",
        조문시행일자: "20260101",
        조문여부: "조문",
        조문내용: "제20조(일용근로자의 범위)",
        항: [
          {
            항번호: "①",
            항내용: "일용근로자란 다음 각 호의 자를 말한다",
            호: [{ 호내용: "1. 건설공사에 종사하는 자로서 다음 각목의 자를 제외한 자" }],
            목: [
              {
                목번호: "나.",
                목내용: [
                  [
                    "나. 다음의 업무에 종사하기 위하여 계속하여 고용되는 자",
                    "      (1) 작업준비를 하고 노무에 종사하는 자를 지휘ㆍ감독하는 업무",
                    "      (2) 건설기계의 운전 또는 정비업무",
                  ],
                ],
              },
            ],
          },
        ],
      },
    ]),
    "INCTAX_D",
  );
  assert.ok(a);
  assert.match(a.text, /\(1\) 작업준비를 하고/);
  assert.match(a.text, /\(2\) 건설기계의 운전/);
  // 표식은 목의 첫 줄에만 — 세목은 그 목의 하위라 소속이 명확하다.
  assert.match(a.text, /\[각 목\] 나\. 다음의 업무에/);
  assert.ok(!/\[각 목\] {6}\(1\)/.test(a.text));
});

test("모르는 계층에 원문이 숨어 있으면 조용히 자르지 않고 실패한다", () => {
  assert.throws(
    () =>
      parseArticles(
        body([
          {
            조문번호: "1",
            조문시행일자: "20260101",
            조문여부: "조문",
            조문내용: "제1조(목적)",
            신설계층: { 신설내용: "articleText 가 모르는 자리에 있는 원문" },
          },
        ]),
        "X",
      ),
    /모르는 계층이 생겨 원문이 잘렸을 수 있다/,
  );
});

test("가지번호 없는 조문은 source_id 에 접미사를 붙이지 않는다", () => {
  const [a] = parseArticles(
    body([
      {
        조문번호: "59",
        조문가지번호: "",
        조문내용: "제59조(세액공제)",
        조문시행일자: "20260101",
        조문여부: "조문",
      },
    ]),
    "INCTAX",
  );
  assert.ok(a);
  assert.equal(a.sourceId, "INCTAX_59");
  assert.equal(a.articleSubNo, null);
  assert.equal(a.title, null);
});

test("편·장·절 표제(조문여부='전문')는 뒤 조문의 번호를 달고 오므로 반드시 걸러낸다", () => {
  // 실제 응답 재현: '제1장 총칙' 이 조문번호 "1" 을 갖는다. 안 거르면 제1조와 source_id 가 충돌한다.
  const articles = parseArticles(
    body([
      { 조문번호: "1", 조문내용: "            제1장 총칙 <개정 2010.1.1>", 조문여부: "전문" },
      { 조문번호: "1", 조문내용: "제1조(목적)", 조문시행일자: "20260101", 조문여부: "조문" },
    ]),
    "TAXEX",
  );
  assert.equal(articles.length, 1);
  assert.equal(articles[0]?.sourceId, "TAXEX_1");
  assert.equal(articles[0]?.text, "제1조(목적)");
});

test("같은 내용은 같은 해시, 다른 내용은 다른 해시", () => {
  const unit = { 조문번호: "1", 조문내용: "제1조(목적)", 조문시행일자: "20260101", 조문여부: "조문" };
  const h1 = parseArticles(body([unit]), "X")[0]?.textHash;
  const h2 = parseArticles(body([{ ...unit }]), "X")[0]?.textHash;
  const h3 = parseArticles(body([{ ...unit, 조문내용: "제1조(정의)" }]), "X")[0]?.textHash;
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
});

test("원문이 비면 조용히 넘어가지 않고 실패한다", () => {
  // '…내용' key 규칙이 깨진 상황을 흉내낸다. 빈 조문이 통과하면 요약된 원문과 구분이 안 된다.
  assert.throws(
    () =>
      parseArticles(
        body([{ 조문번호: "1", 조문본문: "제1조", 조문시행일자: "20260101", 조문여부: "조문" }]),
        "X",
      ),
    /원문이 비었다/,
  );
});

test("source_id 가 충돌하면 조용히 덮지 않고 실패한다", () => {
  const unit = { 조문번호: "1", 조문내용: "제1조(목적)", 조문시행일자: "20260101", 조문여부: "조문" };
  assert.throws(() => parseArticles(body([unit, { ...unit }]), "X"), /source_id 충돌/);
});

test("시행예정은 PROPOSED 가 아니라 ENACTED — 이미 공포된 법이고 시행일만 미래다", () => {
  assert.equal(mapLifecycle("현행"), "ENACTED");
  assert.equal(mapLifecycle("시행예정"), "ENACTED");
  assert.equal(mapLifecycle("연혁"), "REPEALED");
  assert.throws(() => mapLifecycle("알수없음"), /알 수 없는 현행연혁코드/);
});

test("법령구분명 → authority 서열. 모르는 구분은 추측하지 않고 실패한다", () => {
  assert.equal(mapAuthorityType("법률"), "STATUTE");
  assert.equal(mapAuthorityType("대통령령"), "DECREE");
  assert.equal(mapAuthorityType("기획재정부령"), "RULE");
  assert.equal(mapAuthorityType("총리령"), "RULE");
  assert.throws(() => mapAuthorityType("조약"), /알 수 없는 법령구분명/);
});

test("날짜는 KST LocalDate 로만 (UTC 변환 없음)", () => {
  assert.equal(toLocalDate("20260101"), "2026-01-01");
  assert.throws(() => toLocalDate("2026-01-01"), /YYYYMMDD/);
  assert.throws(() => toLocalDate(""), /YYYYMMDD/);
});
