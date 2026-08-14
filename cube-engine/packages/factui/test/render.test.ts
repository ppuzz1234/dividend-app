/**
 * 표시 6요소 렌더 검증 (Phase 11 DoD ①·④).
 *
 * 브라우저 없이 HTML 문자열을 직접 본다 — 렌더가 서버의 순수 함수라서 가능하다.
 * 여기서 지키는 것: **답이 무엇인지(클래스)·무엇에 근거했는지(조문·해시)·재현 가능한지
 * (매니페스트)·개인에게 적용하면 안 된다는 사실**이 화면에서 사라지지 않는 것.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { SYNTHETIC_STAMP_TEXT } from "@cube/policy";
import type { FactAnswerManifest } from "@cube/policy";
import type { BundleItem, FactAnswer } from "@cube/fact";
import { UNMODELED_NOTICE } from "@cube/fact";

import { RENDERER_TEMPLATE_VERSION, esc, renderAnswer, renderPlan, renderReject } from "../src/render.js";

const HASH_A = "a".repeat(64);

function item(over: Partial<BundleItem> = {}): BundleItem {
  return {
    ref: 1,
    sourceId: "RETIRE_D_17_2",
    lawName: "근로자퇴직급여 보장법 시행령",
    authorityType: "DECREE",
    articleLabel: "제17조의2",
    title: "개인형퇴직연금제도의 부담금 납입한도",
    text: "법 제24조제3항 단서에서 대통령령으로 정하는 금액이란 연간 1천800만원을 말한다.",
    validFrom: "2026-03-24",
    textHash: HASH_A,
    reason: "SEARCH",
    searchRank: 1,
    hasUnattachedMok: false,
    applicationDeadlines: [],
    ...over,
  };
}

function answer(over: Partial<FactAnswer> = {}): FactAnswer {
  return {
    answerClass: "UNMODELED_OFFICIAL_SOURCE",
    text: "연간 납입한도는 조문에 따라 정해진다[1].",
    notice: UNMODELED_NOTICE,
    citations: [item()],
    resolvedRuleIds: [],
    personalApplicationAllowed: false,
    planEngineInputAllowed: false,
    citeReport: { usedRefs: [1], issues: [] },
    coverageReport: { anchorRecall: 1, issues: [] },
    forbiddenPhrases: [],
    unsourcedAmounts: [],
    computedAmounts: [],
    answerPayloadHash: HASH_A,
    ...over,
  } as FactAnswer;
}

function manifest(over: Partial<FactAnswerManifest> = {}): FactAnswerManifest {
  return {
    queryAsOf: "2026-07-31",
    policySnapshotVersion: "NO_APPROVED_PACK",
    factResolverVersion: "fact-resolver-1",
    answerClass: "UNMODELED_OFFICIAL_SOURCE",
    resolvedRuleIds: [],
    sourceSnapshotIds: ["RETIRE_D_17_2"],
    sourceHashes: [HASH_A],
    ragIndexVersion: "idx-abc",
    rendererTemplateVersion: RENDERER_TEMPLATE_VERSION,
    rendererModelVersion: "gemini-2.5-flash",
    answerPayloadHash: HASH_A,
    ...over,
  } as FactAnswerManifest;
}

// ─────────────────── 6요소 ───────────────────

test("★ ① 클래스 라벨이 나온다 — 이 답이 팩트 결론이 아님을 먼저 말한다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.match(h, /class-label unmodeled/);
  assert.match(h, /팩트 결론이 아님/);
});

test("① REGISTRY_RESOLVED_FACT 는 다른 라벨로 나온다", () => {
  const h = renderAnswer({
    mode: "PLAIN", turnId: "t1", answer: answer({ answerClass: "REGISTRY_RESOLVED_FACT", notice: null, resolvedRuleIds: ["IRP.LIMIT.ANNUAL"] }),
    manifest: manifest({ answerClass: "REGISTRY_RESOLVED_FACT", resolvedRuleIds: ["IRP.LIMIT.ANNUAL"] }),
  });
  assert.match(h, /class-label resolved/);
  assert.match(h, /공식 팩트/);
});

test("★ ② SYNTHETIC 팩이면 스탬프가 DOM 에 실제로 있다 (상수 참조 — 직접 타이핑 아님)", () => {
  const h = renderAnswer({
    mode: "PLAIN", turnId: "t1", answer: answer({ answerClass: "REGISTRY_RESOLVED_FACT", notice: null, resolvedRuleIds: ["DEMO.RULE"] }),
    manifest: manifest({
      answerClass: "REGISTRY_RESOLVED_FACT",
      resolvedRuleIds: ["DEMO.RULE"],
      packKind: "SYNTHETIC_DEMO",
      syntheticStamp: SYNTHETIC_STAMP_TEXT,
    }),
  });
  assert.ok(h.includes(esc(SYNTHETIC_STAMP_TEXT)), "합성 스탬프가 화면에서 사라졌다");
  assert.match(h, /class="stamp"/);
});

test("② 합성 팩이 아니면 스탬프를 붙이지 않는다 (남발하면 경고가 무뎌진다)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.equal(h.includes(SYNTHETIC_STAMP_TEXT), false);
});

test("★ ③ 근거 조문에 법령명·조문번호·제목·시행일·해시 앞자리·원문이 전부 있다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.match(h, /근로자퇴직급여 보장법 시행령/);
  assert.match(h, /제17조의2/);
  assert.match(h, /개인형퇴직연금제도의 부담금 납입한도/);
  assert.match(h, /시행 2026-03-24/);
  assert.match(h, /aaaaaaaa…/, "해시 앞자리가 없다 — 원문 동일성을 확인할 방법이 사라진다");
  assert.match(h, /<details><summary>조문 원문 보기/);
  assert.match(h, /연간 1천800만원/, "조문 원문이 요약돼 사라졌다");
});

test("③ 답변의 [n] 이 근거 카드로 연결된다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.match(h, /href="#src-t1-1"/);
  assert.match(h, /id="src-t1-1"/);
});

test("★ ④ [각 목] 미상 조문이면 caveat 가 붙는다", () => {
  const h = renderAnswer({
    mode: "PLAIN", turnId: "t1", answer: answer({ citations: [item({ hasUnattachedMok: true })] }),
    manifest: manifest(),
  });
  assert.match(h, /소속 호를 특정하지 못한/);
  const clean = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.equal(/소속 호를 특정하지 못한/.test(clean), false, "caveat 가 항상 붙으면 의미가 없다");
});

test("★ ⑤ 매니페스트 4종 버전이 전부 화면에 있다 (§1.3 재현성)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  for (const v of ["NO_APPROVED_PACK", "fact-resolver-1", "idx-abc", RENDERER_TEMPLATE_VERSION, "gemini-2.5-flash"]) {
    assert.ok(h.includes(v), `매니페스트에 ${v} 가 없다`);
  }
  assert.match(h, /resolvedRuleIds/);
  assert.match(h, /승인된 규칙에서 인출하지 않음/);
});

test("★ ⑥ UNMODELED 면 §1.2 표준 문안과 개인 적용 금지 고지가 나온다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.ok(h.includes(esc(UNMODELED_NOTICE)), "§1.2 표준 문안이 빠졌다");
  assert.match(h, /개인별 상황에 적용하거나 저축 계획 산출에 사용할 수 없습니다/);
});

// ─────────────────── 안전 ───────────────────

test("★ LLM 출력이 HTML 로 실행되지 않는다 (인용 원문에 태그가 섞여도)", () => {
  const h = renderAnswer({
    mode: "PLAIN", turnId: "t1", answer: answer({ text: "<img src=x onerror=alert(1)>[1]", citations: [item({ text: "<script>bad()</script>" })] }),
    manifest: manifest(),
  });
  assert.equal(h.includes("<img src=x"), false);
  assert.equal(h.includes("<script>bad()"), false);
  assert.match(h, /&lt;script&gt;/);
});

test("LLM 이 쓴 **굵게** 가 별표로 새지 않는다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: "한도는 **연간 1천800만원** 이다[1]." }), manifest: manifest() });
  assert.match(h, /<strong>연간 1천800만원<\/strong>/);
  assert.equal(h.includes("**"), false, "별표가 그대로 남았다");
});

test("굵게 변환이 이스케이프 뒤에 돌아 태그 주입이 안 된다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: "**<b onclick=x>hi</b>**[1]" }), manifest: manifest() });
  assert.equal(h.includes("<b onclick"), false);
  assert.match(h, /<strong>&lt;b onclick/);
});

test("줄머리 불릿이 별표로 새지 않는다", () => {
  const h = renderAnswer({
    mode: "PLAIN", turnId: "t1", answer: answer({ text: ["요건은 다음과 같다[1].", "*   60세 이상일 것[1].", "- 1주택일 것[1]."].join("\n") }),
    manifest: manifest(),
  });
  assert.match(h, /• 60세 이상일 것/);
  assert.match(h, /• 1주택일 것/);
  assert.equal(/\n[ \t]*[*-][ \t]/.test(h), false, "줄머리 별표·하이픈이 남았다");
});

test("굵게가 줄 맨 앞에 와도 불릿으로 오인하지 않는다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: "**연간 1천800만원**[1]." }), manifest: manifest() });
  assert.match(h, /<strong>연간 1천800만원<\/strong>/);
  assert.equal(h.includes("•"), false);
});

test("PLAN 은 계산이 아니라 안내를 렌더한다", () => {
  const h = renderPlan("개인 상황 판단은 PLAN 엔진의 몫입니다.", ["나는", "얼마 넣"]);
  assert.match(h, /class-label plan/);
  // ★ 라벨 문구를 그대로 박지 않는다. 예전엔 `미션 2 (미구현)` 을 검사했는데, 미션 2 가
  //   구현되자 **사실이 된 문구를 테스트가 되돌리라고 요구했다.** 여기서 지켜야 할 것은
  //   문구가 아니라 "계산 결과를 렌더하지 않는다"는 불변식이다.
  assert.doesNotMatch(h, /계산 결과|근거 규칙/);
  assert.match(h, /걸린 신호: 나는, 얼마 넣/);
});

test("거절은 사유와 함께 렌더된다", () => {
  const h = renderReject("확인하지 못했습니다.", "검색 결과 없음");
  assert.match(h, /class-label reject/);
  assert.match(h, /사유: 검색 결과 없음/);
});

test("인용된 조문이 없으면 근거 0건을 정직하게 말한다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ citations: [] }), manifest: manifest({ sourceSnapshotIds: [], sourceHashes: [] }) });
  assert.match(h, /근거 조문 없음/);
  assert.match(h, /인용된 조문이 없습니다/);
});

test("근거 요약줄은 조문 이름을 말한다 (펼치지 않아도 뭘 봤는지 읽히게)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  const summary = /<summary>([^<]*)/.exec(h.slice(h.indexOf("src-fold")))?.[1] ?? "";
  assert.match(summary, /근로자퇴직급여 보장법 시행령/, `요약줄에 조문 이름이 없다: ${summary}`);
});

test("★ 답이 등급 라벨·매니페스트보다 **먼저** 온다", () => {
  // 사용자 피드백: 라벨·①패널이 답 위에 쌓이면 읽기 전에 지친다.
  // 근거는 펼친 채(open), 등급·검증·매니페스트는 접은 채 답 **아래**에 둔다.
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.ok(h.indexOf("answer-body") < h.indexOf("class-label"), "답이 등급 라벨보다 앞이어야 한다");
  assert.ok(h.indexOf("answer-body") < h.indexOf("manifest"), "답이 매니페스트보다 앞이어야 한다");
  // 근거·등급 **둘 다 접힌 채로** 시작한다. 답변 밑에 조문 카드가 펼쳐져 있으면
  // 어디까지가 답인지 안 보인다(사용자 피드백).
  assert.doesNotMatch(h, /<details[^>]* open>/, "답변 아래 칸이 펼쳐진 채로 시작하면 답과 근거가 안 갈린다");
  assert.match(h, /<details class="ev src-fold"/, "근거 조문 칸이 있어야 한다");
  assert.match(h, /<details class="ev meta">/, "등급·검증 칸이 있어야 한다");
  // 고지는 접으면 고지가 아니다 — details 밖에 남아 있어야 한다.
  assert.ok(h.indexOf("개인별 상황에 적용하거나") < h.indexOf('<details class="ev'));
});

test("★ 마크다운 제목이 샵으로 새지 않는다 (Sonnet 은 긴 답을 제목으로 나눈다)", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({ text: ["## 1. ISA란 무엇인가", "1명당 1개만 가입할 수 있다[1]."].join("\n") }),
    manifest: manifest(),
  });
  assert.match(h, /<b class="ans-h">1\. ISA란 무엇인가<\/b>/);
  assert.equal(/(^|\n)#/.test(h), false, "샵이 그대로 남았다");
});

test("★ 적용기한이 지난 조문은 근거 카드에 경고가 붙는다", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({ citations: [item({ applicationDeadlines: ["2022-12-31"] })] }),
    manifest: manifest({ queryAsOf: "2026-07-31" }),
  });
  assert.match(h, /caveat sunset/);
  assert.match(h, /적용기한/);
  assert.match(h, /2022-12-31/);
});

test("기한이 안 지났으면 경고가 없다 (남발하면 무뎌진다)", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({ citations: [item({ applicationDeadlines: ["2030-12-31"] })] }),
    manifest: manifest({ queryAsOf: "2026-07-31" }),
  });
  assert.equal(h.includes("caveat sunset"), false);
});

// ─────────────────── 표 (비교형 답) ───────────────────

const TABLE = [
  "핵심 비교",
  "",
  "| 축 | ISA | 연금저축 |",
  "| --- | ---: | :---: |",
  "| 비과세 한도 | **200만원**[1] | 제공된 조문에서 확인되지 않음 |",
  "| 가입 자격 | 19세 이상[1] | 확인되지 않음 |",
  "",
  "표 밖 단서도 이어 쓴다[1].",
].join("\n");

test("★ 마크다운 표가 <table> 로 렌더된다 (비교는 축을 나란히 놔야 대조가 된다)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: TABLE }), manifest: manifest() });
  assert.match(h, /<table><thead><tr><th/);
  assert.match(h, /<th[^>]*>축<\/th>/);
  assert.match(h, /<td[^>]*><strong>200만원<\/strong>/);
  assert.equal(h.includes("| 축 |"), false, "표 원문이 그대로 남았다");
  assert.match(h, /표 밖 단서도 이어 쓴다/, "표 뒤 문단이 사라졌다");
});

test("★ 표 칸 안의 [n] 도 근거 카드로 연결된다 (규칙 2 는 표 안에서도 산다)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: TABLE }), manifest: manifest() });
  assert.match(h, /<td[^>]*><strong>200만원<\/strong><a class="ref" href="#src-t1-1">\[1\]<\/a>/);
});

test("★ 링크가 이중 변환되지 않는다 (앵커 안에 앵커가 생기면 안 된다)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: TABLE }), manifest: manifest() });
  assert.equal(/<a class="ref"[^>]*>\[?<a /.test(h), false, "앵커가 중첩됐다");
});

test("정렬 지시(`---:` `:--:`)를 살린다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: TABLE }), manifest: manifest() });
  assert.match(h, /text-align:right/);
  assert.match(h, /text-align:center/);
});

test("넓은 표는 자기 안에서 가로 스크롤한다 (본문이 밀리면 안 된다)", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer({ text: TABLE }), manifest: manifest() });
  assert.match(h, /<div class="tbl">/);
});

test("표가 아닌 파이프 문자는 표로 오인하지 않는다", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({ text: "A | B 는 논리 연산이다[1]." }),
    manifest: manifest(),
  });
  assert.equal(h.includes("<table><thead>"), false);
});

test("표 안의 HTML 도 실행되지 않는다", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({ text: "| a |\n| --- |\n| <img src=x onerror=alert(1)> |" }),
    manifest: manifest(),
  });
  assert.equal(h.includes("<img src=x"), false);
  assert.match(h, /&lt;img/);
});

// ─────────────────── 이어서 물어볼 것 ───────────────────

test("★ 답에 안 쓰인 묶음 조문이 제안 칩으로 나온다 (지어낸 질문이 아니다)", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer(),
    manifest: manifest(),
    alsoConsidered: [item({ ref: 9, sourceId: "INCTAX_59_3", lawName: "소득세법", articleLabel: "제59조의3", title: "연금계좌세액공제" })],
  });
  assert.match(h, /class="suggest"/);
  assert.match(h, /소득세법 제59조의3 \(연금계좌세액공제\)/);
  // 누르면 보낼 질문이 실려 있어야 한다 — 조문을 그대로 가리키므로 반드시 근거가 나온다.
  assert.match(h, /data-ask="소득세법 제59조의3 연금계좌세액공제 에 대해 알려줘"/);
});

test("남은 조문이 없으면 제안 영역을 만들지 않는다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest(), alsoConsidered: [] });
  assert.equal(h.includes("suggests"), false);
});

test("★ 근거 없는 문장을 개수만 말하지 않고 펼쳐 보여준다", () => {
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({
      citeReport: {
        usedRefs: [1],
        issues: [
          { kind: "UNCITED_CLAIM", detail: "d", sentence: "한도는 연 600만원이다." },
          { kind: "UNKNOWN_REF", detail: "d", sentence: "어떤 문장 [9]" },
        ],
      },
    } as never),
    manifest: manifest(),
  });
  assert.match(h, /class="issues"/);
  assert.match(h, /한도는 연 600만원이다\./, "어느 문장인지 안 보이면 확인할 방법이 없다");
  assert.match(h, /위조 인용/);
  assert.match(h, /틀렸다는 뜻이 아니라/);
});

test("문제가 없으면 펼침 영역을 만들지 않는다", () => {
  const h = renderAnswer({ mode: "PLAIN", turnId: "t1", answer: answer(), manifest: manifest() });
  assert.equal(h.includes('class="issues"'), false);
});

test("★ 인용 조문에 없는 금액을 문장째 드러낸다 (형식은 통과했는데 값이 틀린 경우)", () => {
  // 실측: 위조 인용 0 · 앵커 75% 로 다 통과한 답이 `1,200만원` 을 지어냈다.
  // 개수만 적으면 못 찾는다 — 어느 금액인지, 어느 문장인지 보여야 확인이 된다.
  const h = renderAnswer({
    mode: "PLAIN",
    turnId: "t1",
    answer: answer({
      unsourcedAmounts: [
        { asWritten: "1,200만원", normalized: "1200만원", sentence: "더 높은 한도(합계 1,200만원)를 인정하던 규정", assumed: false },
        // 규칙 10 이 허용하는 가정 예시. **같이 세면 안 된다** — 매 답변마다 떠서 경고가 죽는다.
        { asWritten: "4,800만원", normalized: "4800만원", sentence: "예를 들어 작년 연봉이 4,800만원이었다면", assumed: true },
      ],
    } as never),
    manifest: manifest(),
  });
  assert.match(h, /미확인 금액 1건/, "가정 예시는 미확인 금액 수에 들어가면 안 된다");
  assert.match(h, /예시 가정값 1건 별도/);
  assert.match(h, /1,200만원/);
  // 가정값도 숨기지는 않는다 — 가정으로 위장한 법정 값을 사람이 알아볼 수 있어야 한다.
  assert.match(h, /4,800만원/);
});
