/**
 * 대화 저장소 — 멀티턴과 말투 토글이 **같은 근거 위에서** 도는지 확인한다.
 *
 * 가장 중요한 것: **토글이 조문 묶음을 바꾸지 않는 것.** 바뀌면 "말투를 바꿨더니 근거도
 * 바뀌는" 물건이 되고, 두 답을 비교해 검증한다는 전제가 무너진다.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Bundle } from "@cube/fact";

import type { AnswerTurn, StoredAnswer } from "../src/conversation.js";
import {
  ConversationStore,
  citedSoFar,
  commitAndRenumber,
  createRefStreamer,
  historyFor,
  isAnswerTurn,
  lastSearchQuery,
  mergeIntoConversation,
  stageRefs,
} from "../src/conversation.js";

function stored(text: string, citations: { sourceId: string; ref: number }[] = []): StoredAnswer {
  return { answer: { text, citations } as never, manifest: {} as never };
}

function bundleOf(...ids: string[]): Bundle {
  return {
    items: ids.map((sourceId, i) => ({ sourceId, ref: i + 1, reason: "SEARCH", searchRank: i + 1 })) as never,
    seedCount: ids.length,
    expandedCount: 0,
  };
}

function answerTurn(id: string, query: string, searchQuery = query): AnswerTurn {
  return {
    kind: "ANSWER",
    id,
    query,
    searchQuery,
    followUpOf: [],
    queryAsOf: "2026-07-31",
    bundle: { items: [{ ref: 1 }], seedCount: 1, expandedCount: 0 } as never,
    answers: new Map(),
  };
}

test("새 대화는 서로 다른 id 를 받고 목록에 쌓인다", () => {
  const s = new ConversationStore();
  const a = s.create();
  const b = s.create();
  assert.notEqual(a.id, b.id);
  assert.equal(s.list().length, 2);
  // 최근 대화가 위로
  assert.equal(s.list()[0]?.id, b.id);
});

test("★ 없는 대화 id 는 조용히 만들어주지 않는다 (서버 재시작을 사용자가 알아야 한다)", () => {
  const s = new ConversationStore();
  assert.equal(s.get("c999"), undefined);
});

test("첫 질문이 대화 제목이 된다", () => {
  const s = new ConversationStore();
  const c = s.create();
  assert.equal(c.title, "새 대화");
  s.addTurn(c, answerTurn("c1t1", "ISA 비과세 한도와 서민형 요건"));
  assert.equal(c.title, "ISA 비과세 한도와 서민형 요건");
  s.addTurn(c, answerTurn("c1t2", "예시를 줘"));
  assert.equal(c.title, "ISA 비과세 한도와 서민형 요건", "제목이 후속 질문으로 덮였다");
});

test("★ 말투 토글은 같은 묶음을 다시 쓴다 — 근거가 바뀌면 비교가 무의미해진다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const t = answerTurn("c1t1", "ISA 한도?");
  s.addTurn(c, t);
  t.answers.set("PLAIN", stored("쉽게 쓴 답"));
  t.answers.set("LEGAL", stored("조문 용어 답"));

  const found = s.findTurn(c, "c1t1");
  assert.ok(found !== undefined && isAnswerTurn(found));
  assert.equal(found.answers.size, 2);
  // 두 말투가 같은 bundle 객체를 공유한다.
  assert.equal(found.bundle, t.bundle);
});

test("후속 해소용 '직전 검색어' 는 답변이 나온 턴에서만 가져온다", () => {
  const s = new ConversationStore();
  const c = s.create();
  assert.equal(lastSearchQuery(c), null);
  s.addTurn(c, answerTurn("c1t1", "ISA 한도?", "ISA 비과세 한도"));
  // PLAN 으로 걷어낸 턴이 끼어도 검색어는 앞의 ANSWER 턴에서 온다.
  s.addTurn(c, { kind: "PLAN", id: "c1t2", query: "나는 얼마 넣어야 돼?", html: "<p></p>" });
  assert.equal(lastSearchQuery(c), "ISA 비과세 한도");
});


test("요청한 말투가 아직 없으면 있는 말투라도 맥락으로 준다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const t = answerTurn("c1t1", "ISA 한도?");
  t.answers.set("LEGAL", stored("조문 용어 답"));
  s.addTurn(c, t);
  assert.equal(historyFor(c, "PLAIN")[0]?.answer, "조문 용어 답");
});

test("PLAN·REJECT 턴은 맥락에 들어가지 않는다 (답이 아니므로 이어받을 것이 없다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  s.addTurn(c, { kind: "REJECT", id: "c1t1", query: "날씨?", html: "<p></p>" });
  assert.deepEqual(historyFor(c, "PLAIN"), []);
});

test("턴 id 는 대화 안에서 순서대로 붙는다", () => {
  const s = new ConversationStore();
  const c = s.create();
  assert.equal(s.nextTurnId(c), `${c.id}t1`);
  s.addTurn(c, answerTurn(s.nextTurnId(c), "q"));
  assert.equal(s.nextTurnId(c), `${c.id}t2`);
});


// ─────────────────── 대화 전체에서 [n] 고정 ───────────────────




test("인용되지 않은 조문은 이어싣지 않는다 (묶음이 계속 불어난다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  const b1 = mergeIntoConversation(c, bundleOf("A", "B"));
  const t = answerTurn("c1t1", "질문1");
  t.answers.set("PLAIN", stored("답 [1].", [b1.items[0] as never])); // B 는 인용 안 됨
  s.addTurn(c, t);
  assert.deepEqual(citedSoFar(c).map((i) => i.sourceId), ["A"]);
  assert.equal(mergeIntoConversation(c, bundleOf("C")).items.some((i) => i.sourceId === "B"), false);
});

test("★ 맥락은 대화 전체를 넘긴다 (직전 한 턴만이면 '아까 그 첫 번째'를 못 받는다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  for (const [id, q] of [["c1t1", "질문1"], ["c1t2", "질문2"], ["c1t3", "질문3"]] as const) {
    const t = answerTurn(id, q);
    t.answers.set("PLAIN", stored(`답-${q}`));
    s.addTurn(c, t);
  }
  const h = historyFor(c, "PLAIN");
  assert.deepEqual(h.map((x) => x.query), ["질문1", "질문2", "질문3"]);
});

test("현재 턴은 맥락에서 빠진다 — 같은 질문을 두 번 해도 옛 턴은 남는다", () => {
  const s = new ConversationStore();
  const c = s.create();
  for (const id of ["c1t1", "c1t2"]) {
    const t = answerTurn(id, "같은 질문");
    t.answers.set("PLAIN", stored(`답-${id}`));
    s.addTurn(c, t);
  }
  const h = historyFor(c, "PLAIN", "c1t2");
  assert.deepEqual(h.map((x) => x.answer), ["답-c1t1"], "id 가 아니라 질문 텍스트로 걸렀다");
});

// ─────────────────── 번호 확정: 인용된 것만, 촘촘하게 ───────────────────

/** 생성 → 확정을 한 번에 흉내낸다. */
function turnOf(c: Parameters<typeof stageRefs>[0], ids: string[], write: (r: Record<string, number>) => string) {
  const staged = stageRefs(c, bundleOf(...ids).items);
  const byId: Record<string, number> = {};
  for (const it of staged) byId[it.sourceId] = it.ref;
  const { text, items } = commitAndRenumber(c, write(byId), staged);
  return { text, items, staged };
}

test("★ 인용된 조문만 번호를 확정한다 — 안 쓰인 조문이 번호를 먹지 않는다", () => {
  const s = new ConversationStore();
  const c = s.create();
  // 10개를 보여주고 첫 번째만 인용
  const t1 = turnOf(c, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"], (r) => `답 [${r["A"]}].`);
  assert.equal(t1.text, "답 [1].");
  assert.deepEqual([...c.refs.entries()], [["A", 1]]);

  // 다음 턴의 새 조문은 11번이 아니라 **2번**부터 시작해야 한다.
  const t2 = turnOf(c, ["K", "L"], (r) => `답 [${r["K"]}].`);
  assert.equal(t2.text, "답 [2].", "안 쓰인 조문이 번호를 먹어 번호가 듬성해졌다");
  assert.deepEqual([...c.refs.entries()], [["A", 1], ["K", 2]]);
});

test("★ 확정된 번호는 대화 내내 같은 조문을 가리킨다", () => {
  const s = new ConversationStore();
  const c = s.create();
  turnOf(c, ["A", "B"], (r) => `답 [${r["A"]}].`); // A=1 확정
  // 검색 순서가 바뀌고 새 조문이 껴도 A 는 계속 1
  const t2 = turnOf(c, ["Z", "A", "Y"], (r) => `답 [${r["A"]}] 그리고 [${r["Z"]}].`);
  assert.equal(t2.text, "답 [1] 그리고 [2].");
  assert.equal(c.refs.get("A"), 1);
});

test("★ 본문 치환은 한 번에 이뤄진다 (순차 치환이면 5→3→7 로 번져 틀린다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  c.refs.set("X", 1);
  const staged = stageRefs(c, bundleOf("X", "P", "Q").items); // X=1, P=2, Q=3
  const { text } = commitAndRenumber(c, "가 [2]. 나 [3]. 다 [1].", staged);
  // P·Q 가 인용됐으므로 2·3 이 그대로 확정된다 — 번호가 서로 바뀌면 안 된다.
  assert.equal(text, "가 [2]. 나 [3]. 다 [1].");
  assert.equal(c.refs.get("P"), 2);
  assert.equal(c.refs.get("Q"), 3);
});

test("여러 번호를 한 대괄호에 쓴 인용도 다시 매긴다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const staged = stageRefs(c, bundleOf("A", "B", "C").items);
  const { text } = commitAndRenumber(c, "답 [2, 3].", staged);
  // A 는 인용 안 됨 → B=1, C=2 로 촘촘해진다
  assert.equal(text, "답 [1,2].");
  assert.deepEqual([...c.refs.entries()], [["B", 1], ["C", 2]]);
});

test("위조 인용 번호는 건드리지 않는다 (검증기가 잡아야 한다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  const staged = stageRefs(c, bundleOf("A").items);
  const { text, items } = commitAndRenumber(c, "답 [1]. 거짓 [99].", staged);
  assert.match(text, /\[99\]/);
  assert.equal(items.some((i) => i.ref === 99), false);
});

test("★ 앞 턴에서 인용된 조문은 다음 턴 묶음에 이어 실린다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const t1 = turnOf(c, ["A", "B"], (r) => `답 [${r["A"]}].`);
  const turn = answerTurn("c1t1", "질문1");
  turn.answers.set("PLAIN", stored(t1.text, [t1.items[0] as never]));
  s.addTurn(c, turn);

  const merged = mergeIntoConversation(c, bundleOf("C"));
  const ids = merged.items.map((i) => i.sourceId);
  assert.ok(ids.includes("A"), "앞에서 인용한 조문이 사라졌다 — 후속 질문이 근거를 잃는다");
  assert.equal(merged.items.find((i) => i.sourceId === "A")?.reason, "CARRIED");
  // 이어실린 A 는 stage 를 거치면 여전히 1번이다.
  assert.equal(stageRefs(c, merged.items).find((i) => i.sourceId === "A")?.ref, 1);
});

// ─────────────────── 스트리밍 중 번호 매김 ───────────────────

/** 델타를 임의 크기로 쪼개 흘려보낸다 — 실제 스트림처럼 `[` 가 경계에서 잘리게. */
function streamThrough(st: ReturnType<typeof createRefStreamer>, text: string, size: number): string {
  let out = "";
  for (let i = 0; i < text.length; i += size) out += st.rewrite(text.slice(i, i + size));
  return out + st.flush();
}

test("★ 흘려보낸 번호는 나중에 바뀌지 않는다 (등장 순서로 그 자리에서 확정)", () => {
  const s = new ConversationStore();
  const c = s.create();
  const staged = stageRefs(c, bundleOf("A", "B", "C").items); // A=1 B=2 C=3
  const st = createRefStreamer(c, staged);
  // 답이 C 를 먼저 인용하면 C 가 [1] 이 된다 — 읽는 순서와 번호가 맞는다.
  const out = streamThrough(st, "먼저 [3] 그리고 [2]. 다시 [3].", 3);
  assert.equal(out, "먼저 [1] 그리고 [2]. 다시 [1].");
  assert.equal(c.refs.get("C"), 1);
  assert.equal(c.refs.get("B"), 2);
  assert.equal(c.refs.has("A"), false, "인용 안 된 조문이 번호를 먹었다");
});

test("★ 청크 경계에서 `[` 가 잘려도 번호가 깨지지 않는다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const staged = stageRefs(c, bundleOf("A", "B").items);
  for (const size of [1, 2, 5, 1000]) {
    const c2 = new ConversationStore().create();
    const st = createRefStreamer(c2, stageRefs(c2, bundleOf("A", "B").items));
    assert.equal(streamThrough(st, "가 [2]. 나 [1].", size), "가 [1]. 나 [2].", `청크 ${size}`);
  }
  assert.ok(staged.length === 2);
});

test("대괄호가 인용이 아니면 그대로 흘린다", () => {
  const s = new ConversationStore();
  const c = s.create();
  const st = createRefStreamer(c, stageRefs(c, bundleOf("A").items));
  assert.equal(streamThrough(st, "배열 [각 목] 과 [1] 은 다르다.", 4), "배열 [각 목] 과 [1] 은 다르다.");
});

test("위조 인용 번호는 스트림에서도 건드리지 않는다 (검증기가 잡아야 한다)", () => {
  const s = new ConversationStore();
  const c = s.create();
  const st = createRefStreamer(c, stageRefs(c, bundleOf("A").items));
  assert.match(streamThrough(st, "답 [1]. 거짓 [99].", 3), /\[99\]/);
});

test("★ 이미 확정된 번호는 스트림에서도 그대로 나온다 (대화 안정성)", () => {
  const s = new ConversationStore();
  const c = s.create();
  c.refs.set("A", 1);
  c.refs.set("B", 2);
  const st = createRefStreamer(c, stageRefs(c, bundleOf("B", "A").items));
  assert.equal(streamThrough(st, "가 [2]. 나 [1].", 3), "가 [2]. 나 [1].");
});
