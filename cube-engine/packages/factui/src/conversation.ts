/**
 * 대화 저장소 — 멀티턴과 말투 토글이 **같은 근거 위에서** 돌게 한다.
 *
 * ## 왜 저장이 필요한가
 * 두 기능이 같은 것을 요구했다:
 *  - **말투 토글** — `쉬운 말` ↔ `법령 그대로`. 두 답은 반드시 **같은 조문 묶음**에서 나와야
 *    비교가 의미 있다. 토글할 때마다 검색을 다시 하면 근거가 달라져 "말투를 바꿨더니
 *    근거도 바뀌는" 이상한 물건이 된다. → 묶음을 턴에 저장하고 재사용한다.
 *  - **후속 질문** — "예시를 줘" 가 무엇을 가리키는지 알려면 직전 질문이 필요하다.
 *
 * ## 저장 범위
 * 프로세스 메모리다. 서버를 끄면 사라진다.
 * ponytail: 데모라 이걸로 충분하다. 상한은 ① 서버 재시작 시 대화 소실 ② 프로세스가 하나여야
 * 함(멀티 워커 불가) ③ 무한 증가. ③ 은 `MAX_CONVERSATIONS` 로 오래된 것부터 버려 막았다.
 * 업그레이드 경로는 SQLite 파일 하나 — 그때도 이 인터페이스는 그대로다.
 *
 * ## 여기서 계산하지 않는다
 * 저장소는 값을 만들지 않는다. 답변·매니페스트를 **받은 그대로** 담고 꺼낼 뿐이다.
 */

import type { AnswerMode, Bundle, BundleItem, FactAnswer } from "@cube/fact";
import type { FactAnswerManifest } from "@cube/policy";

/** 오래된 대화부터 버리는 상한. 데모용 서버가 무한히 커지지 않게 한다. */
const MAX_CONVERSATIONS = 50;

export interface StoredAnswer {
  readonly answer: FactAnswer;
  readonly manifest: FactAnswerManifest;
}

/** 답변이 나온 턴. 묶음을 들고 있어야 다른 말투로 다시 만들 수 있다. */
export interface AnswerTurn {
  readonly kind: "ANSWER";
  readonly id: string;
  /** 사용자가 실제로 친 문장 */
  readonly query: string;
  /** 검색에 쓴 문장. 후속 질문이면 앞 질문이 합쳐져 있다 — **화면에 드러낸다** */
  readonly searchQuery: string;
  readonly followUpOf: readonly string[];
  readonly queryAsOf: string;
  readonly bundle: Bundle;
  /** 말투별 답변. 토글로 요청될 때 하나씩 채워진다 (모드당 API 1콜, 두 번째부터는 캐시) */
  readonly answers: Map<AnswerMode, StoredAnswer>;
}

/** 답변이 아닌 턴 — Router 가 걷어냈거나(§1.2) 근거를 못 찾았거나(§4.2). */
export interface NonAnswerTurn {
  readonly kind: "PLAN" | "REJECT";
  readonly id: string;
  readonly query: string;
  readonly html: string;
}

export type Turn = AnswerTurn | NonAnswerTurn;

export interface Conversation {
  readonly id: string;
  readonly turns: Turn[];
  /** 목록에 보여줄 이름 = 첫 질문. 대화를 골라 돌아올 수 있어야 하므로 */
  title: string;
  /**
   * ★ 대화 전체에서 `[n]` 을 고정하는 등록부 (`sourceId` → `ref`).
   *
   * 이게 없으면 턴마다 묶음이 1 부터 새로 번호를 매겨서 **1턴의 `[1]` 과 3턴의 `[1]` 이
   * 다른 조문**이 된다. 그러면 "아까 그 첫 번째" 같은 말이 성립하지 않고, 이전 답을
   * 맥락으로 넘길 때 모델이 낡은 번호를 그대로 써서 엉뚱한 조문을 가리킨다.
   * 한 번 준 번호는 **회수하지 않는다** — 회수하면 위 문제가 그대로 돌아온다.
   */
  readonly refs: Map<string, number>;
}

export class ConversationStore {
  readonly #map = new Map<string, Conversation>();
  #seq = 0;

  create(): Conversation {
    this.#seq += 1;
    const conv: Conversation = { id: `c${String(this.#seq)}`, turns: [], title: "새 대화", refs: new Map() };
    this.#map.set(conv.id, conv);
    // 가장 오래된 것부터 버린다 — Map 은 삽입 순서를 유지하므로 첫 키가 가장 오래된 것이다.
    while (this.#map.size > MAX_CONVERSATIONS) {
      const oldest = this.#map.keys().next().value;
      if (oldest === undefined) break;
      this.#map.delete(oldest);
    }
    return conv;
  }

  /** 없으면 **만들지 않고 undefined** 를 준다 — 서버 재시작 후 옛 id 로 오면 사용자에게 알려야 한다. */
  get(id: string): Conversation | undefined {
    return this.#map.get(id);
  }

  list(): readonly { id: string; title: string; turns: number }[] {
    // 최근 대화가 위로 오게 뒤집는다.
    return [...this.#map.values()].reverse().map((c) => ({ id: c.id, title: c.title, turns: c.turns.length }));
  }

  addTurn(conv: Conversation, turn: Turn): void {
    conv.turns.push(turn);
    if (conv.turns.length === 1) conv.title = turn.query.slice(0, 40);
  }

  nextTurnId(conv: Conversation): string {
    return `${conv.id}t${String(conv.turns.length + 1)}`;
  }

  findTurn(conv: Conversation, turnId: string): Turn | undefined {
    return conv.turns.find((t) => t.id === turnId);
  }
}

export function isAnswerTurn(t: Turn): t is AnswerTurn {
  return t.kind === "ANSWER";
}

/**
 * LLM 에 넘길 대화 맥락 — **이 대화의 모든 답변 턴.**
 *
 * 처음엔 직전 한 턴만 넘겼다. 이유는 두 가지였는데, 하나는 이제 사라졌다:
 *  - ~~오래된 답의 인용 번호가 지금 묶음과 어긋난다~~ → **`conv.refs` 로 번호를 고정**해서 해결.
 *    `[2]` 는 1턴이든 5턴이든 같은 조문이다. 그래서 옛 답을 그대로 넘겨도 안전하다.
 *  - 토큰이 길이에 비례해 는다 → 이건 남아 있으므로 `MAX_HISTORY_TURNS` 로만 자른다.
 *
 * 한 턴만 넘기던 시절에는 "아까 그 첫 번째" 같은 말을 못 받았다. 대화가 이어지는 느낌은
 * **모델이 대화 전체를 보는 것**에서 나온다.
 */
const MAX_HISTORY_TURNS = 8;

export function historyFor(
  conv: Conversation,
  mode: AnswerMode,
  /** 지금 답을 만들고 있는 턴 — 자기 자신을 맥락으로 넣으면 안 된다. **id 로 거른다** */
  excludeTurnId?: string,
): { query: string; answer: string }[] {
  const out: { query: string; answer: string }[] = [];
  for (const t of conv.turns) {
    if (!isAnswerTurn(t) || t.id === excludeTurnId) continue;
    // 요청한 말투가 없으면 만들어 둔 다른 말투라도 쓴다 — 맥락은 내용이지 말투가 아니다.
    const stored = t.answers.get(mode) ?? [...t.answers.values()][0];
    if (stored === undefined) continue;
    out.push({ query: t.query, answer: stored.answer.text });
  }
  return out.slice(-MAX_HISTORY_TURNS);
}

/** 이 대화에서 지금까지 **실제로 인용된** 조문들 (sourceId 중복 제거, ref 오름차순). */
export function citedSoFar(conv: Conversation): BundleItem[] {
  const seen = new Map<string, BundleItem>();
  for (const t of conv.turns) {
    if (!isAnswerTurn(t)) continue;
    for (const stored of t.answers.values()) {
      for (const c of stored.answer.citations) if (!seen.has(c.sourceId)) seen.set(c.sourceId, c);
    }
  }
  return [...seen.values()].sort((a, b) => a.ref - b.ref);
}

/** 한 묶음이 가질 수 있는 최대 조문 수. 이어싣기 때문에 대화가 길어져도 무한히 안 커지게 한다. */
const MAX_BUNDLE_ITEMS = 14;

/**
 * 이번 턴의 검색 묶음 + **앞 턴에서 인용된 조문**을 합치고, `[n]` 을 대화 전체 기준으로 고정한다.
 *
 * 왜 앞 근거를 이어싣나: 후속 질문("아까 두 번째 조건 더 설명해줘")은 앞 답이 근거로 삼은
 * 조문을 가리킨다. 그런데 검색은 질문이 바뀌면 다른 조문을 물어온다. 이어싣지 않으면
 * 모델은 **앞에서 한 말의 근거를 잃은 채** 답하게 되고, 그러면 규칙 1(조문에 있는 것만)에 걸려
 * "확인되지 않는다"만 반복하거나 근거 없이 지어낸다.
 *
 * 우선순위: 이번 검색 결과 > 앞 턴 인용 조문. 상한을 넘으면 **뒤(이어싣기)부터** 자른다 —
 * 지금 질문에 답하는 것이 먼저다.
 * ponytail: 상한을 넘겨 잘린 조문은 이번 턴에서 인용할 수 없다. 대화가 아주 길어지면
 * 오래된 근거가 밀려난다. 업그레이드 경로는 질문과의 관련도로 이어싣기를 고르는 것.
 */
export function mergeIntoConversation(conv: Conversation, fresh: Bundle): Bundle {
  const freshIds = new Set(fresh.items.map((i) => i.sourceId));
  const carried = citedSoFar(conv)
    .filter((c) => !freshIds.has(c.sourceId))
    .map((c) => ({ ...c, reason: "CARRIED" as const, searchRank: null }));

  const items = [...fresh.items, ...carried].slice(0, MAX_BUNDLE_ITEMS);
  return { items, seedCount: fresh.seedCount, expandedCount: items.length - fresh.seedCount };
}

/** 이 대화에서 이미 확정된 번호의 최댓값. 확정 번호는 촘촘하므로 곧 개수와 같다. */
function committedCount(conv: Conversation): number {
  return conv.refs.size;
}

/**
 * ① 생성 직전 — 이번 답에 쓸 번호를 붙인다.
 *
 * **확정된 조문**(= 앞서 실제로 인용돼 사용자에게 보인 것)은 그 번호를 그대로 쓴다.
 * 나머지는 **임시 번호**를 받는다. 임시 번호는 이 생성 한 번에만 유효하다.
 *
 * 왜 여기서 확정하지 않나: 묶음에는 조문이 10~14개 들어가는데 실제로 인용되는 건 1~3개다.
 * 들어오자마자 번호를 확정하면 **안 쓰인 조문이 번호를 먹어치워** 다음 턴이 11번부터 시작한다.
 * 사용자에게 한 번도 보인 적 없는 번호는 **재사용해도 안전하다** — 그래서 확정을 생성 뒤로 미룬다.
 */
export function stageRefs(conv: Conversation, items: readonly BundleItem[]): BundleItem[] {
  let next = committedCount(conv) + 1;
  const staged = items.map((it) => {
    const committed = conv.refs.get(it.sourceId);
    if (committed !== undefined) return { ...it, ref: committed };
    const ref = next;
    next += 1;
    return { ...it, ref };
  });
  return staged.sort((a, b) => a.ref - b.ref);
}

const CITE_RE = /\[(\d+(?:\s*[,·]\s*\d+)*)\]/g;

/** 답변 본문에 등장한 인용 번호를 **등장 순서대로**, 중복 없이. */
function refsInOrderOfAppearance(text: string): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const m of text.matchAll(CITE_RE)) {
    for (const part of (m[1] ?? "").split(/[,·]/)) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * 스트리밍용 점진 번호 매김 — 토큰이 흐르는 도중에 `[n]` 을 최종 번호로 바꿔 내보낸다.
 *
 * 등장 순서로 확정하기 때문에 **뒤를 안 봐도 번호가 정해진다.** 그래서 화면에 찍힌 번호가
 * 나중에 바뀌지 않는다 — 이게 스트리밍의 전제다.
 *
 * `[` 가 청크 경계에서 잘릴 수 있으므로 닫는 `]` 가 올 때까지 **꼬리를 붙들어 둔다.**
 * 너무 길어지면(인용이 아니었던 것) 그대로 흘려보낸다.
 */
export function createRefStreamer(conv: Conversation, staged: readonly BundleItem[]) {
  const byRef = new Map(staged.map((it) => [it.ref, it]));
  const remap = new Map<number, number>();
  for (const it of staged) {
    const committed = conv.refs.get(it.sourceId);
    if (committed !== undefined) remap.set(it.ref, committed);
  }
  const mapOne = (n: number): number => {
    const known = remap.get(n);
    if (known !== undefined) return known;
    const it = byRef.get(n);
    if (it === undefined) return n; // 위조 인용은 그대로 흘린다 — 검증기가 잡는다
    const next = conv.refs.size + 1;
    conv.refs.set(it.sourceId, next);
    remap.set(n, next);
    return next;
  };

  let buf = "";
  const rewrite = (chunk: string): string => {
    buf += chunk;
    let out = "";
    for (;;) {
      const open = buf.indexOf("[");
      if (open === -1) {
        out += buf;
        buf = "";
        break;
      }
      out += buf.slice(0, open);
      const close = buf.indexOf("]", open);
      // 아직 안 닫혔다 — 다음 청크를 기다린다. 단 인용이라기엔 너무 길면 포기하고 흘린다.
      if (close === -1) {
        if (buf.length - open > 24) {
          out += buf.slice(open);
          buf = "";
          break;
        }
        buf = buf.slice(open);
        break;
      }
      const inner = buf.slice(open + 1, close);
      out += /^\d+(?:\s*[,·]\s*\d+)*$/.test(inner)
        ? `[${inner.split(/[,·]/).map((p) => String(mapOne(Number(p.trim())))).join(",")}]`
        : buf.slice(open, close + 1);
      buf = buf.slice(close + 1);
    }
    return out;
  };

  return {
    rewrite,
    /** 스트림이 끝났을 때 붙들고 있던 꼬리를 마저 내보낸다. */
    flush: (): string => {
      const rest = buf;
      buf = "";
      return rest;
    },
    /** 확정된 번호로 다시 매긴 묶음 — 근거 카드·검증에 쓴다. */
    items: (): BundleItem[] => {
      let spare = conv.refs.size + 1;
      return staged
        .map((it) => {
          const to = remap.get(it.ref);
          if (to !== undefined) return { ...it, ref: to };
          const n = spare;
          spare += 1;
          return { ...it, ref: n };
        })
        .sort((a, b) => a.ref - b.ref);
    },
  };
}

/**
 * ② 생성 직후 — **실제로 인용된 조문만** 번호를 확정하고, 본문의 `[n]` 을 확정 번호로 다시 매긴다.
 *
 * 결과: 사용자가 보는 번호는 **1,2,3… 으로 촘촘**하면서도 대화 내내 같은 조문을 가리킨다.
 * 한 번 확정된 번호는 회수하지 않는다 — 회수하면 앞 답에 이미 찍힌 `[1]` 이 다른 조문이 된다.
 *
 * 임시 번호였다가 인용되지 않은 조문은 **번호를 반납**하고, 이 묶음 안에서는 확정 번호들 뒤로
 * 밀린다(이번 답에 등장하지 않으므로 사용자는 볼 일이 없다).
 *
 * ⚠️ 치환은 **한 번에** 해야 한다. `5→3` 을 먼저 하고 `3→7` 을 하면 원래 5가 7이 된다.
 */
export function commitAndRenumber(
  conv: Conversation,
  text: string,
  staged: readonly BundleItem[],
): { text: string; items: BundleItem[] } {
  const byRef = new Map(staged.map((it) => [it.ref, it]));
  const remap = new Map<number, number>();

  // 이미 확정된 조문은 그 번호 그대로.
  for (const it of staged) {
    const committed = conv.refs.get(it.sourceId);
    if (committed !== undefined) remap.set(it.ref, committed);
  }

  // ★ 새 조문은 **답에 처음 등장한 순서**로 번호를 받는다 (임시 번호 순서가 아니라).
  //   왜 등장 순서인가: ① 읽는 순서와 번호가 맞아 자연스럽다(첫 인용이 [1]).
  //   ② **스트리밍이 가능해진다** — 토큰이 흐르는 중에 `[n]` 을 만나는 즉시 최종 번호를
  //      알 수 있으므로, 다 쓴 뒤에 번호를 갈아끼울 필요가 없다. 임시 번호 순서로 매기면
  //      마지막 토큰을 봐야 번호가 정해져서 화면에서 번호가 뒤바뀐다.
  for (const n of refsInOrderOfAppearance(text)) {
    if (remap.has(n)) continue;
    const it = byRef.get(n);
    if (it === undefined) continue; // 위조 인용 — 건드리지 않는다
    const next = committedCount(conv) + 1;
    conv.refs.set(it.sourceId, next);
    remap.set(n, next);
  }

  // 인용 안 된 임시 조문은 확정 번호들 **뒤로** 몰아 충돌을 피한다.
  let spare = committedCount(conv) + 1;
  for (const it of staged) {
    if (remap.has(it.ref)) continue;
    remap.set(it.ref, spare);
    spare += 1;
  }

  const renumbered = text.replace(CITE_RE, (whole, inner: string) => {
    const parts = inner.split(/([,·])/).map((p) => {
      const n = Number(p.trim());
      // 구분자거나 모르는 번호(위조 인용)는 그대로 둔다 — 위조는 검증기가 잡아야 한다.
      if (!Number.isInteger(n)) return p;
      const to = remap.get(n);
      return to === undefined ? p : String(to);
    });
    return parts.length === 0 ? whole : `[${parts.join("")}]`;
  });

  const items = staged
    .map((it) => ({ ...it, ref: remap.get(it.ref) ?? it.ref }))
    .sort((a, b) => a.ref - b.ref);

  return { text: renumbered, items };
}

/** 후속 질문 해소에 쓸 '직전 검색어'. 답변이 나온 턴만 대상이다. */
export function lastSearchQuery(conv: Conversation): string | null {
  for (let i = conv.turns.length - 1; i >= 0; i--) {
    const t = conv.turns[i];
    if (t !== undefined && isAnswerTurn(t)) return t.searchQuery;
  }
  return null;
}
