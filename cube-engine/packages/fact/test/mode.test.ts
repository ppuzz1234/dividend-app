/**
 * 말투 모드(PLAIN/LEGAL) + 후속 질문 해소.
 *
 * 여기서 지키는 것:
 *  - **쉬운 말이 근거를 깎지 않는다** — 근거 규칙 1~6·8~10 은 두 모드가 글자 그대로 공유한다
 *  - **"예시를 줘"가 검색어로 나가지 않는다** — 나가면 엉뚱한 조문으로 조용히 틀린다
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANSWER_MODES,
  buildSystemPrompt,
  buildUserPrompt,
  modelVersionOf,
  promptVersionOf,
  resolveAnswerConfig,
} from "../src/answer.js";
import type { BundleItem } from "../src/bundle.js";
import { resolveFollowUp } from "../src/followup.js";
import { normalizeQuery } from "../src/normalize.js";

const ITEM: BundleItem = {
  ref: 1,
  sourceId: "TAXEX_91_18",
  lawName: "조세특례제한법",
  authorityType: "STATUTE",
  articleLabel: "제91조의18",
  title: "개인종합자산관리계좌에 대한 과세특례",
  text: "이자소득과 배당소득의 합계액 중 200만원까지는 소득세를 부과하지 아니한다.",
  validFrom: "2026-01-01",
  textHash: "b".repeat(64),
  reason: "SEARCH",
  searchRank: 1,
  hasUnattachedMok: false,
  applicationDeadlines: [],
};

// ─────────────────── 두 모드가 공유하는 것 ───────────────────

const SHARED_RULES = [
  /적혀 있는 내용만/,
  /문장마다 끝에 \[n\]/,
  /조건을 빠뜨리지 마라/,
  /특정 개인에게 적용하지 마라/,
  /확인되지 않는다/,
  /평생/, // §4.4 금지 문구 목록
  /요지를 맨 앞/,
  /위임을 가리키는 말로 답을 시작하지 마라/,
  /세액·환급액·저축액을 \*\*계산하지 마라/,
];

for (const mode of ANSWER_MODES) {
  test(`★ ${mode} 모드도 근거 규칙을 전부 갖는다 — 말투는 근거를 깎지 못한다`, () => {
    const p = buildSystemPrompt(mode);
    for (const re of SHARED_RULES) {
      assert.match(p, re, `${mode} 에서 근거 규칙이 빠졌다: ${String(re)}`);
    }
  });
}

test("★ 쉬운 말 모드는 숫자·요건·조문번호를 손대지 말라고 못 박는다", () => {
  const p = buildSystemPrompt("PLAIN");
  // ★ 말투 문구는 계속 다듬는다(쉬운 말 → ~합니다 → ~해요). 그래서 **문구가 아니라
  //   보장**을 검사한다. 예전엔 문구를 그대로 박아 둬서, 말투를 고칠 때마다 테스트가
  //   "되돌려라"라고 요구했다 — 그건 개선을 벌하는 검사다.
  assert.match(p, /금액·비율·기간·나이·요건의 내용/);
  assert.match(p, /법령명과 조문번호/);
  assert.match(p, /'대략', '약', '정도' 로 뭉뚱그리지 마라/);
  // 법령 용어를 아주 버리면 쉬운 말이 원문 행세를 한다 — 괄호로 남겨 되짚을 수 있어야 한다.
  assert.match(p, /법령 용어(는|를) 괄호/);
});

test("★ 쉬운 말 모드는 조문투를 **예시로** 금지한다 (말로만 하면 안 바뀐다)", () => {
  // 실측: "쉽게 써라"만 적었더니 기본 화면 답이 `"…소득세를 부과하지 아니한다"` 로 나왔다.
  // 모델이 바뀌는 건 규칙 문장이 아니라 ✗/✓ 대조 예시다.
  const p = buildSystemPrompt("PLAIN");
  assert.match(p, /부과하지 아니한다/, "금지할 조문투를 실물로 보여줘야 한다");
  assert.ok(p.includes("✗") && p.includes("✓"), "대조 예시가 없으면 말투 규칙은 안 먹는다");
  // LEGAL 은 반대여야 한다 — 두 모드가 같아지면 토글이 있을 이유가 없다.
  // LEGAL 에는 말투 대조 예시가 없어야 한다 — 두 모드가 같아지면 토글이 있을 이유가 없다.
  assert.doesNotMatch(buildSystemPrompt("LEGAL"), /~해요' 체|조문투를 쓰면/);
});

test("★ 시중 설명글의 말투는 빌리되 숫자는 빌리지 않는다", () => {
  // ISA 분리과세율은 조문상 `100분의 9` 인데 시중 글은 지방소득세를 더해 `9.9%` 라고 쓴다.
  // 말투를 참고하라고 하면 숫자까지 따라올 위험이 생기므로, 그 경계를 프롬프트에 박는다.
  const p = buildSystemPrompt("PLAIN");
  assert.match(p, /9\.9%/, "따라 하면 안 되는 바깥 숫자를 실물로 지목해야 한다");
  assert.match(p, /숫자는 절대 따라 하지 마라|숫자는 조문/);
});

test("★ 규칙 0 — 묻지 않은 것은 쓰지 않는다 (두 모드 공통)", () => {
  // 실측: 좁은 질문에도 조문 10개를 다 설명해 답이 1,200자가 됐고, 그 길이가 곧 응답 지연이었다.
  for (const mode of ["PLAIN", "LEGAL"] as const) {
    const p = buildSystemPrompt(mode);
    assert.match(p, /묻지 않은 것은 쓰지 마라/);
    assert.match(p, /고를 후보/, "검색 결과 개수가 곧 설명 목록이 아님을 못 박아야 한다");
    // 범위를 좁히는 것이 조건을 빼도 된다는 뜻이 되면 규칙 3 이 무너진다.
    assert.match(p, /조건을 하나도 빼지 마라/);
    // ★ 유형별 케이스가 실물로 들어 있어야 한다 — 추상 지시만으로는 안 바뀐다(말투에서 겪음).
    for (const kind of ["\[값 하나\]", "\[비교\]", "\[전반\]"]) {
      assert.match(p, new RegExp(kind), `유형 예시 ${kind} 가 없다`);
    }
  }
});

test("★ 예시 규칙은 '가정한 상황'과 '법이 정한 값'을 가른다", () => {
  // 처음엔 "예시 숫자도 조문 기준값만"으로 썼는데, 그러면 "총급여 4,500만원인 근로자라면"
  // 같은 정상적인 예시가 규칙 위반이 된다(실측). 지켜야 할 선은 **법정 값**이다.
  const p = buildSystemPrompt("PLAIN");
  assert.match(p, /가정한 상황의 수치.*써도 된다/);
  assert.match(p, /법이 정한 값.*조문에 적힌 것만/s);
  assert.match(p, /가정해도 되는 것은 '누가 해당하는가'/);
});

test("법령 모드는 조문 용어 그대로를 요구한다", () => {
  const p = buildSystemPrompt("LEGAL");
  assert.match(p, /조문 용어를 그대로/);
  assert.equal(/쉬운 말로 설명한다/.test(p), false);
});

test("두 모드의 프롬프트는 실제로 다르다 (토글이 무의미하면 안 된다)", () => {
  assert.notEqual(buildSystemPrompt("PLAIN"), buildSystemPrompt("LEGAL"));
});

test("★ 프롬프트 버전에 모드가 들어간다 — 같은 질문에 다른 답이 나오므로 재현 단위가 다르다", () => {
  assert.notEqual(promptVersionOf("PLAIN"), promptVersionOf("LEGAL"));
  assert.match(promptVersionOf("PLAIN"), /plain$/);
});

// ─────────────────── 멀티턴 맥락 ───────────────────

test("이전 대화가 없으면 맥락 블록을 넣지 않는다", () => {
  const p = buildUserPrompt("ISA 한도?", [ITEM]);
  assert.equal(p.includes("이전 대화"), false);
});

test("★ 인용 번호가 대화 내내 고정임을 알려준다", () => {
  // 예전에는 정반대였다 — 턴마다 번호를 새로 매겼으므로 "이전 번호 쓰지 마라"고 경고해야 했다.
  // `conversation.ts` 의 ref 등록부로 번호를 고정한 뒤로는 **이어받는 것이 맞다.**
  const p = buildUserPrompt("예시를 줘", [ITEM], [{ query: "ISA 한도?", answer: "200만원이다 [2]." }]);
  assert.match(p, /지금까지의 대화/);
  assert.match(p, /\[n\] 번호는 계속 같은 조문을 가리킨다/);
  assert.match(p, /Q1: ISA 한도\?/);
  // 다만 이번 묶음에 없는 번호는 여전히 금지 — 원문이 없는데 인용하면 위조다.
  assert.match(p, /없는 번호는 쓰지 마라/);
});

// ─────────────────── 후속 질문 해소 ───────────────────

test("첫 질문은 후속이 아니다", () => {
  const r = resolveFollowUp("ISA 비과세 한도와 서민형 요건", null);
  assert.equal(r.isFollowUp, false);
  assert.equal(r.searchQuery, "ISA 비과세 한도와 서민형 요건");
});

test('★ "예시를 줘" 는 그대로 검색되지 않고 앞 질문으로 검색된다', () => {
  const r = resolveFollowUp("예시를 줘", "ISA 비과세 한도와 서민형 요건");
  assert.equal(r.isFollowUp, true);
  assert.equal(r.searchQuery, "ISA 비과세 한도와 서민형 요건");
  assert.equal(r.searchQuery.includes("예시"), false, "후속어가 검색을 오염시킨다");
});

test("★ 후속 질문의 새 내용어는 살려서 합친다", () => {
  const r = resolveFollowUp("그럼 서민형은?", "ISA 비과세 한도");
  assert.equal(r.isFollowUp, true);
  assert.match(r.searchQuery, /ISA 비과세 한도/);
  assert.match(r.searchQuery, /서민형/, "새 내용어가 사라지면 후속 질문이 무시된다");
  assert.equal(r.searchQuery.includes("그럼"), false);
});

test("짧은 질문은 후속어가 없어도 앞 질문에 붙인다", () => {
  const r = resolveFollowUp("서민형은?", "ISA 비과세 한도");
  assert.equal(r.isFollowUp, true);
  assert.match(r.searchQuery, /ISA 비과세 한도/);
  assert.match(r.searchQuery, /서민형/);
});

test("★ 온전한 새 질문은 앞 질문에 오염되지 않는다", () => {
  const r = resolveFollowUp("퇴직소득세 이연 요건이 무엇인가", "ISA 비과세 한도");
  assert.equal(r.isFollowUp, false);
  assert.equal(r.searchQuery, "퇴직소득세 이연 요건이 무엇인가");
  assert.equal(r.searchQuery.includes("ISA"), false, "앞 질문이 새 검색을 오염시켰다");
});

test("무엇 때문에 후속으로 봤는지 드러낸다 (오판을 사람이 알아채야 고칠 수 있다)", () => {
  assert.deepEqual(resolveFollowUp("예시를 줘", "ISA 한도").matched, ["예시"]);
  assert.ok(resolveFollowUp("서민형은?", "ISA 한도").matched.length > 0);
});

// ─────────────────── 답변 모델 provider ───────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("★ Claude 키가 있으면 기본이 Claude 다 (문장 품질이 실사용 가치를 정한다)", () => {
  withEnv({ ANSWER_PROVIDER: undefined, ANSWER_API_KEY: undefined, ATTACK_API_KEY: "k", LLM_API_KEY: "g" }, () => {
    const c = resolveAnswerConfig();
    assert.equal(c.provider, "claude");
    assert.equal(c.model, "claude-sonnet-5");
  });
});

test("Claude 키가 없으면 Gemini 로 떨어지되 매니페스트에 그대로 남는다", () => {
  withEnv({ ANSWER_PROVIDER: undefined, ANSWER_API_KEY: undefined, ATTACK_API_KEY: undefined, LLM_API_KEY: "g" }, () => {
    const c = resolveAnswerConfig();
    assert.equal(c.provider, "gemini");
    assert.equal(modelVersionOf(c), "gemini/gemini-2.5-flash");
  });
});

test("★ provider 를 명시했는데 키가 없으면 조용히 갈아타지 않고 실패한다", () => {
  // 조용히 다른 모델로 떨어지면 "왜 답이 달라졌지"를 추적할 수 없다.
  withEnv({ ANSWER_PROVIDER: "claude", ANSWER_API_KEY: undefined, ATTACK_API_KEY: undefined, LLM_API_KEY: "g" }, () => {
    assert.throws(() => resolveAnswerConfig(), /키가 없다/);
  });
});

test("ANSWER_PROVIDER 가 자동 판정을 이긴다", () => {
  withEnv({ ANSWER_PROVIDER: "gemini", ATTACK_API_KEY: "k", LLM_API_KEY: "g" }, () => {
    assert.equal(resolveAnswerConfig().provider, "gemini");
  });
});

test("★ 매니페스트 모델 식별자에 provider 가 들어간다 (어디서 나온 답인지 재현)", () => {
  assert.equal(
    modelVersionOf({
      provider: "claude",
      apiKey: "x",
      model: "claude-sonnet-5",
      effort: null,
      thinking: null,
      thinkNudge: false, briefNudge: false,
    }),
    "claude/claude-sonnet-5",
  );
});

test("★ effort·thinking 을 바꾸면 매니페스트 식별자가 달라진다 (§1.3 — 같은 모델이어도 답이 다르다)", () => {
  const base = { provider: "claude" as const, apiKey: "x", model: "claude-sonnet-5" };
  const a = modelVersionOf({ ...base, effort: "medium", thinking: "off", thinkNudge: true, briefNudge: false });
  const b = modelVersionOf({ ...base, effort: null, thinking: null, thinkNudge: false, briefNudge: false });
  assert.notEqual(a, b);
  // 세 knob 이 모두 식별자에 남아야 한다 — 하나라도 빠지면 두 설정이 같은 이름으로 기록된다.
  for (const bit of ["medium", "off", "nudge"]) assert.ok(a.includes(bit), `${bit} 이 빠졌다: ${a}`);
});

// ─────────────────── 입력 정리 · 구어체 후속 ───────────────────

test("★ 다듬지 않은 입력의 잡음을 걷어낸다 (의미는 안 건드린다)", () => {
  assert.equal(normalizeQuery("ISA   한도???"), "ISA 한도?");
  assert.equal(normalizeQuery("연금저축 중도해지 ㅋㅋㅋ"), "연금저축 중도해지");
  assert.equal(normalizeQuery("  IRP 중도인출  "), "IRP 중도인출");
});

test("정리는 오타·동의어를 손대지 않는다 (그건 승인된 별칭 사전의 몫)", () => {
  assert.equal(normalizeQuery("연금저측 한도"), "연금저측 한도", "오타를 몰래 고쳤다");
});

test("★ 구어체 후속도 앞 질문을 이어받는다", () => {
  for (const q of ["글면 서민형은?", "근데 중도해지하면?", "암튼 한도가 얼마랬지"]) {
    const r = resolveFollowUp(q, "ISA 비과세 한도");
    assert.equal(r.isFollowUp, true, `놓쳤다: ${q}`);
    assert.match(r.searchQuery, /ISA 비과세 한도/);
  }
});

test("★ 혼자서 주제가 되는 낱말은 후속어가 아니다 (앞 질문 오염 방지)", () => {
  // `그리고`·`더`·`또`·`좀` 을 후속어로 두면 새 질문이 앞 질문을 끌어와 검색이 망가진다.
  const r = resolveFollowUp("ISA랑 연금저축 그리고 IRP 차이가 뭔가요", "퇴직소득세 이연 요건");
  assert.equal(r.searchQuery.includes("퇴직소득세"), false, "새 질문이 앞 질문에 오염됐다");
});

test("★ 짧으면 제도명이 있어도 이어받는다 (\"글면 IRP는?\" = 앞 질문의 그 항목)", () => {
  const r = resolveFollowUp("글면 IRP는?", "ISA 비과세 한도");
  assert.equal(r.isFollowUp, true);
  assert.match(r.searchQuery, /ISA 비과세 한도/);
  assert.match(r.searchQuery, /IRP/);
});

test("주제 없이 이어지는 말은 후속으로 본다", () => {
  for (const q of ["암튼 한도가 얼마랬지", "근데 중도해지하면 어떻게 되나"]) {
    assert.equal(resolveFollowUp(q, "ISA 비과세 한도").isFollowUp, true, q);
  }
});

test("★ '확인되지 않는다'에는 인용을 달지 말라고 못 박는다", () => {
  // 실측: 날씨 질문 거절 답이 [1]~[10] 을 달아, 양도소득세 조문 10건이 '근거'로 화면에 실렸다.
  // 없다는 사실의 근거가 그 조문들일 수는 없다.
  for (const mode of ANSWER_MODES) {
    const p = buildSystemPrompt(mode);
    assert.match(p, /\[n\] 을 달지 마라/);
    assert.match(p, /인용은 \*\*찾은 것\*\*에만 단다/);
  }
});

test("★ 프롬프트가 '곱하기·더하기로 금액을 내지 마라'를 못 박는다", () => {
  // 실측: 답이 "600만원 × 15% = 90만원" 을 계산했다. 규칙 10 의 '계산하지 마라' 만으로는
  // 부족해서 **금지·허용 예시를 함께** 넣었다.
  for (const mode of ANSWER_MODES) {
    const p = buildSystemPrompt(mode);
    assert.match(p, /곱하기·더하기를 해서 금액을 내지 마라/);
    assert.match(p, /재료만 주고 계산은 하지 않는다/);
    assert.match(p, /PLAN 엔진의 몫/);
  }
});
