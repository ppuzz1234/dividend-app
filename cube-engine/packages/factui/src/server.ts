/**
 * FACT 데모 서버 — `node:http` + 정적 파일. **React/Vite 없음.**
 *
 * 의존성을 하나도 안 늘린 이유: 이 레포는 "값이 어디서 왔는지"를 추적하는 게 전부인데,
 * 빌드 툴체인이 끼면 브라우저에 도달한 코드가 소스와 같다는 보장이 흐려진다.
 * 화면 하나 띄우는 데 번들러가 필요하지 않다 (사다리 1단: 안 만들어도 되는가).
 *
 * ## 한 턴의 흐름
 * ```
 * 질문 → Router ─PLAN→ 안내로 끝 (검색·LLM 0콜)
 *          │
 *          FACT
 *          ↓
 *      후속 질문 해소 ("예시를 줘" → 앞 질문 + 새 내용어)
 *          ↓
 *      검색 → 조문 묶음 → LLM(말투 모드) → 인용 검증 → 렌더 → 턴 저장
 * ```
 * 말투 토글은 **저장된 묶음을 다시 써서** 답만 새로 만든다 (검색·임베딩 0콜, 답변 1콜).
 * 같은 근거에서 두 말투가 나와야 비교가 의미 있기 때문이다.
 *
 * 이 파일은 값 계산을 하지 않는다. 숫자는 전부 조문·리졸버에서 온 것을 문자열로 옮길 뿐이다.
 */

import { createReadStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";

import {
  assembleBundle,
  buildFactManifest,
  buildUnmodeledAnswer,
  defaultLlm,
  defaultLlmStream,
  correctionForComputedAmounts,
  findComputedAmounts,
  findDerivedAmounts,
  findUnsourcedAmounts,
  generateAnswer,
  generateChecked,
  isAnswerMode,
  loadBundleSource,
  modelVersionOf,
  promptVersionOf,
  reject,
  resolveAnswerConfig,
  resolveFollowUp,
  routeIntent,
  streamAnswer,
} from "@cube/fact";
import type { AnswerMode, Bundle, BundleItem } from "@cube/fact";
import { loadEngine, search } from "@cube/factindex";
import { approvedFactsFor, runPlan } from "@cube/plan";
import { createRegistry, loadPolicyPack } from "@cube/policy";
import type { PolicyRegistry } from "@cube/policy";
import { parse as parseYaml } from "yaml";

import { composeRegistries } from "./composeRegistries.js";
import type { AnswerTurn, Conversation, StoredAnswer } from "./conversation.js";
import {
  ConversationStore,
  historyFor,
  isAnswerTurn,
  commitAndRenumber,
  createRefStreamer,
  lastSearchQuery,
  mergeIntoConversation,
  stageRefs,
} from "./conversation.js";
import {
  RENDERER_TEMPLATE_VERSION,
  renderAnswer,
  renderPlan,
  renderReject,
  renderTurn,
} from "./render.js";
import { renderPlanOffer, renderPlanResult } from "./renderPlan.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

/** 화면 기본 말투. 조문투가 기본이면 사람이 안 읽는다(사용자 실측 피드백). */
const DEFAULT_MODE: AnswerMode = "PLAIN";

/**
 * 묶음에 넣을 조문 수. **10 → 7 로 줄였다.**
 *
 * 조문 원문이 프롬프트 입력의 거의 전부다 — 실측으로 10개면 약 27,500자(~19,000 토큰)이고,
 * 그 처리 시간이 첫 글자까지의 지연에 그대로 얹힌다.
 *
 * 줄여도 되는지는 짐작하지 않고 쟀다: 묶음 상한을 5·6·8·10 으로 바꿔 평가셋을 돌렸는데
 * **묶음 적중이 전부 같았다**(search 25/26 · user 18/19). 나머지 조문들은 답에 인용되지도,
 * 정답 조문을 데려오지도 않았다. 그래도 5 가 아니라 7 로 둔 이유는 평가셋이
 * "정답 조문이 묶음에 있나"만 재고 **후속 질문이 옆 조문을 쓰는 경우는 못 재기** 때문이다.
 * (재현: `npm run check:bundle -w @cube/fact -- --max-items 6`)
 */
const BUNDLE_MAX_ITEMS = 7;

/** KST 오늘. 시차를 직접 더하지 않는다 (절대 규칙 6 — 수동 UTC 변환 금지). */
function todayKst(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

/**
 * 교차 출처 허용.
 *
 * `CUBE_CORS_ORIGIN` 에 출처를 적으면(쉼표로 여러 개) **그 목록만** 허용한다.
 *
 * 비워 두면 **같은 PC 의 로컬 개발 서버**(`localhost` · `127.0.0.1`, 포트 무관)를 허용한다.
 * 프런트를 받아 `npm run dev` 한 사람이 환경변수까지 맞춰야 화면이 도는 건 함정이다 —
 * 버튼은 보이는데 물으면 실패하고, 원인이 CORS 라는 걸 알 방법이 없다(실측으로 겪었다:
 * 검증용 서버를 5174 에 띄웠더니 목록에 없어 전부 실패했다).
 *
 * 로컬만 열어도 안전한 근거: CORS 판정은 **부르는 페이지의 출처**로 한다. 악성 사이트가
 * 브라우저를 시켜 `127.0.0.1:8787` 을 때려도 그 페이지의 Origin 은 `https://evil…` 이라
 * 걸러진다. 서버가 127.0.0.1 에만 바인딩하는 것과 별개의 방어다.
 *
 * 와일드카드 `*` 는 어느 경우에도 쓰지 않는다 — 이 엔진은 LLM 키를 쥐고 호출당 비용이
 * 나가는 물건이라, 아무 페이지나 불러도 되는 대상이 아니다.
 */
const CORS_ORIGINS = (process.env["CUBE_CORS_ORIGIN"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "");

/** 같은 PC 의 개발 서버인가 — 포트는 Vite 가 자동으로 바꾸므로 묶지 않는다. */
const LOCAL_DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

/**
 * 순수 함수로 빼 둔 이유: 허용 판정은 **틀리면 조용히 위험해지는** 종류라 검사가 필요한데,
 * 환경변수는 모듈 로드 시점에 한 번 읽혀 테스트에서 흔들 수가 없다. 목록을 인자로 받는다.
 */
export function corsOriginAllowed(allowList: readonly string[], origin: string): boolean {
  return allowList.length > 0 ? allowList.includes(origin) : LOCAL_DEV_ORIGIN.test(origin);
}

/** @returns preflight 를 여기서 끝냈으면 true (호출부는 즉시 return 한다) */
function applyCors(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin !== undefined && corsOriginAllowed(CORS_ORIGINS, origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin"); // 캐시가 출처별로 갈리게
  }
  if (req.method !== "OPTIONS") return false;
  res.writeHead(204, {
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  });
  res.end();
  return true;
}

export interface ServerDeps {
  readonly publicDir: string;
  readonly snapshotDir: string;
}

export function createFactServer(deps: ServerDeps): ReturnType<typeof createServer> {
  // 색인·코퍼스는 부팅 때 한 번만 읽는다. 질문마다 읽으면 수백 MB 가 매번 돈다.
  const engine = loadEngine();
  const src = loadBundleSource(deps.snapshotDir);
  const store = new ConversationStore();

  /**
   * 승인된 정책 팩을 부팅 때 한 번 읽는다. **없으면 `null`** — 그러면 모든 계산이
   * "승인된 규칙이 없습니다"로 나간다. 조용히 추정하지 않는 것이 요지다.
   * ponytail: 팩 추가 시 서버 재시작이 필요하다. 상한은 그것뿐이고, 승인은 자주 있는 일이 아니다.
   */
  const registry: PolicyRegistry | null = (() => {
    const dir = join(deps.snapshotDir, "..", "..", "policy", "packs");
    let files: string[];
    try {
      // `drafts/` 는 하위 폴더라 여기 안 들어온다 — **폴더 위치가 곧 승격 여부**다.
      // 승격은 `npm run promote -w @cube/packdraft` 가 VERIFIED_LAW 게이트를 태워 판정한다.
      files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
    } catch {
      console.log(`[UI] 정책 팩 폴더 없음 → 계산은 "규칙 없음"으로 답한다`);
      return null;
    }
    if (files.length === 0) return null;

    // ★ 팩을 **전부** 읽는다 (2026-08-11). 예전에는 `files[0]` 하나만 읽었고, 승인이 진행돼
    //   팩이 9개가 되자 **승인 100건 중 8건만 화면에 반영**되고 있었다. 사람이 원문을 대조해
    //   서명한 값이 안 쓰이면 승인 절차가 있으나 마나가 된다.
    //   병합은 `composeRegistries` — YAML 을 이어붙이지 않는 이유는 그 파일 주석 참조.
    const regs: PolicyRegistry[] = [];
    const failed: string[] = [];
    for (const f of files) {
      try {
        regs.push(createRegistry(loadPolicyPack(parseYaml(readFileSync(join(dir, f), "utf8")))));
      } catch (e) {
        // **한 팩이 깨져도 나머지를 버리지 않는다.** 다만 조용히 넘어가지도 않는다 —
        // 어느 팩이 왜 빠졌는지 부팅 로그에 남겨야 사람이 알아챈다.
        failed.push(`${f}(${(e as Error).message.slice(0, 40)})`);
      }
    }
    if (failed.length > 0) console.log(`[UI] ⚠️ 로드 실패한 팩 ${String(failed.length)}개: ${failed.join(" · ")}`);
    if (regs.length === 0) {
      console.log(`[UI] 승인 정책 팩 없음 → 계산은 "규칙 없음"으로 답한다`);
      return null;
    }
    const reg = composeRegistries(regs);
    const d = reg.describePack();
    console.log(
      `[UI] 승인 정책 팩 ${String(regs.length)}개 · 규칙 ${String(d.ruleCount)}개 · ${d.packKind} → 계산 가능`,
    );
    return reg;
  })();

  /**
   * 이번 조문 묶음에 걸린 **승인 규칙**. LLM 이 무엇을 인용했는지와 무관하게
   * 묶음 전체로 찾는다 — ① 이 LLM 의 선택에 좌우되면 ① 이 아니게 된다.
   */
  function approvedFor(items: readonly BundleItem[], queryAsOf: string) {
    // 조문 이름을 함께 넘긴다 — id 만 보이면 승인 값이 엉뚱한 주제로 읽힌다(approved.ts 참조).
    const sources = items.map((i) => ({
      sourceId: i.sourceId,
      label: `${i.lawName} ${i.articleLabel}${i.title === null ? "" : ` (${i.title})`}`,
    }));
    return approvedFactsFor(registry, sources, queryAsOf);
  }

  /**
   * 매니페스트에 적을 정책 스냅샷. 팩이 없으면 **키 자체를 넣지 않아** 기본값
   * `NO_APPROVED_PACK` 이 그대로 남는다 — 없는 것을 있는 것처럼 적지 않기 위해서다.
   */
  function policyFields(): { policySnapshotVersion?: string } {
    return registry === null ? {} : { policySnapshotVersion: registry.describePack().policySnapshot };
  }

  /**
   * 반대 말투를 **응답을 보낸 뒤 백그라운드로** 미리 만들어 둔다.
   *
   * ## 왜 이게 효과가 있나
   * 토글은 저장된 묶음을 다시 써서 답만 새로 만든다 — 검색·임베딩 0콜, 답변 1콜이다.
   * 그 1콜이 20초쯤 걸리는데, **사용자가 토글을 누르는 시점은 답을 읽은 뒤**다.
   * 그 사이 시간을 쓰면 토글이 즉시 뜬다. 첫 답변 시간은 **전혀 늘지 않는다** —
   * `res.end()` 뒤에 돌기 때문이다.
   *
   * ## 실패해도 조용히 넘어간다
   * 미리 만드는 데 실패하면 그냥 안 만들어진 상태가 된다. 그러면 토글이 예전처럼
   * 그때 만들 뿐이다 — **선생성은 최적화이지 기능이 아니다.** 실패가 사용자에게
   * 보이면 안 되고, 첫 답변에는 이미 영향이 없다.
   *
   * ponytail(factui/선생성): 사용자가 토글을 안 누르면 API 콜 하나가 버려진다.
   * 상한은 "질의당 최대 1콜 낭비"이고, 업그레이드 경로는 실제 토글 사용률을 보고
   * 끄거나(플래그) 첫 토글 때만 만드는 것이다. 지금은 데모에서 토글이 핵심 장면이라 켠다.
   */
  function prewarmOtherMode(turn: AnswerTurn, conv: Conversation): Promise<void> {
    const other: AnswerMode = turn.answers.has("PLAIN") ? "LEGAL" : "PLAIN";
    return warm(turn, conv, other).then(
      () => undefined,
      () => undefined, // 조용히 포기 — 토글이 그때 만들면 된다
    );
  }

  /**
   * 진행 중인 생성이 있으면 **그걸 기다린다.** 없으면 시작한다.
   *
   * 없으면 데모에서 정확히 이런 일이 난다: 선생성이 돌고 있는데 사용자가 토글을 눌러
   * **같은 답을 두 번 만든다.** 답은 맞게 나오지만 API 콜이 하나 버려지고, 토글도
   * 기다리게 된다 — 선생성을 넣은 이유가 사라진다.
   */
  const inFlight = new Map<string, Promise<{ html: string }>>();
  function warm(turn: AnswerTurn, conv: Conversation, mode: AnswerMode): Promise<{ html: string }> {
    if (turn.answers.has(mode)) return answerFrom(turn, conv, mode); // 캐시 적중 — LLM 0콜
    const key = `${conv.id}:${turn.id}:${mode}`;
    const running = inFlight.get(key);
    if (running !== undefined) return running;
    const p = answerFrom(turn, conv, mode).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  }

  /** 저장된 묶음으로 답을 만들고 검증까지 끝낸다. 검색은 하지 않는다. */
  async function answerFrom(
    turn: AnswerTurn,
    conv: Conversation,
    mode: AnswerMode,
  ): Promise<{ html: string }> {
    const cached = turn.answers.get(mode);
    const config = resolveAnswerConfig();
    let stored = cached;
    if (stored === undefined) {
      // 자기 자신은 id 로 뺀다 — 질문 텍스트로 거르면 같은 질문을 두 번 했을 때 옛 턴까지 날아간다.
      const history = historyFor(conv, mode, turn.id);
      // ★ 번호는 **생성 직전에 붙이고 생성 직후에 확정**한다 (conversation.ts).
      //   묶음 조문 10~14개 중 실제 인용은 1~3개라, 들어오자마자 확정하면
      //   안 쓰인 조문이 번호를 먹어 다음 턴이 11번부터 시작한다(실측).
      const staged = stageRefs(conv, turn.bundle.items);
      const { text: raw } = await generateChecked(turn.query, staged, defaultLlm(config), {
        mode,
        history,
        queryAsOf: turn.queryAsOf,
      });
      const { text, items } = commitAndRenumber(conv, raw, staged);
      const answer = buildUnmodeledAnswer(turn.query, { ...turn.bundle, items }, text);
      const manifest = buildFactManifest(answer, {
        queryAsOf: turn.queryAsOf,
        ragIndexVersion: engine.manifest.ragIndexVersion,
        // ★ 답의 모양을 정하는 템플릿은 **둘**이다 — LLM 프롬프트(문장 구성)와 HTML 렌더러(표시).
        //   프롬프트 식별자에 말투 모드가 들어가야 "쉬운 말 답"과 "법령 답"이 구분돼 재현된다(§1.3).
        rendererTemplateVersion: `${promptVersionOf(mode)}+${RENDERER_TEMPLATE_VERSION}`,
        rendererModelVersion: modelVersionOf(config),
        ...policyFields(),
      });
      stored = { answer, manifest };
      turn.answers.set(mode, stored);
    }
    return {
      html: renderAnswer({
        answer: stored.answer,
        manifest: stored.manifest,
        mode,
        turnId: turn.id,
        approved: approvedFor(turn.bundle.items, turn.queryAsOf),
        resolvedFrom:
          turn.followUpOf.length === 0
            ? null
            : { searchQuery: turn.searchQuery, matched: turn.followUpOf },
        alsoConsidered: uncited(turn.bundle.items, stored.answer),
      }),
    };
  }

  /** NDJSON 한 줄 = 이벤트 하나. 청크 경계 문제가 없고 SSE 보다 파싱이 단순하다. */
  function sendEvent(res: ServerResponse, ev: unknown): void {
    res.write(`${JSON.stringify(ev)}
`);
  }

  /**
   * 스트리밍 질의 — **단계와 토큰을 실시간으로 흘린다.**
   *
   * 왜 필요한가: 근거를 다 읽고 답하는 설계라 10~20초가 걸리는데, 그동안 스피너만 돌면
   * **멈춘 것처럼 보인다.** 시간은 못 줄이니 **무엇을 하고 있는지**를 보여준다.
   *
   * ★ 검증은 스트림이 끝난 뒤에 한다. 그래서 흐르는 동안에는 근거 카드·매니페스트를
   *   붙이지 않고, 끝나면 **검증된 최종 HTML 로 통째로 교체**한다.
   *   검증되지 않은 텍스트에 근거를 달면 "검증했다"는 신호가 거짓이 된다.
   */
  async function handleAskStream(res: ServerResponse, raw: string): Promise<void> {
    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    });

    const body = JSON.parse(raw) as { query?: string; asOf?: string; convId?: string };
    const q = (body.query ?? "").trim();
    if (q === "") {
      sendEvent(res, { type: "final", kind: "REJECT", html: renderReject("질문이 비어 있습니다.", "EMPTY_QUERY") });
      res.end();
      return;
    }

    const conv = (body.convId === undefined ? undefined : store.get(body.convId)) ?? store.create();
    const turnId = store.nextTurnId(conv);
    const queryAsOf = (body.asOf ?? "").trim() === "" ? todayKst() : (body.asOf as string);
    sendEvent(res, { type: "start", convId: conv.id, turnId, query: q });

    // Router 는 여전히 맨 앞이다 — PLAN 질의는 검색·LLM 을 아예 타지 않는다.
    const route = routeIntent(q);
    if (route.intent === "PLAN") {
      // ★ 예전에는 여기서 "미션 2 미구현" 안내만 냈다. 이제 **계산을 시도**한다 —
      //   승인된 규칙으로 되는 것은 계산하고, 안 되는 것은 **무엇이 없는지** 말한다.
      const plan = runPlan(q, { registry, queryAsOf });
      const html =
        plan.outcome.kind === "NO_SCENARIO"
          ? renderPlan(route.message ?? "", route.matched)
          : renderPlanResult(plan);
      store.addTurn(conv, { kind: "PLAN", id: turnId, query: q, html });
      sendEvent(res, { type: "final", kind: "PLAN", html: renderTurn(q, html, turnId) });
      res.end();
      return;
    }

    // ★ Router 가 FACT 로 보냈어도 **계산할 수 있으면 계산한다.**
    //   실측: `"IRP에 2천만원 넣어도 되나?"` 는 개인 지시어가 없어 FACT 로 갔는데,
    //   사용자는 **자기 상황을 적은 것**이고 승인된 규칙으로 정확히 답할 수 있었다.
    //   단 `COMPUTED` 일 때만 가로챈다 — 계산이 안 되면 조문 설명이 더 낫기 때문이다.
    const early = runPlan(q, { registry, queryAsOf });
    if (early.outcome.kind === "COMPUTED") {
      const html = renderPlanResult(early);
      store.addTurn(conv, { kind: "PLAN", id: turnId, query: q, html });
      sendEvent(res, { type: "final", kind: "PLAN", html: renderTurn(q, html, turnId) });
      res.end();
      return;
    }

    sendEvent(res, { type: "stage", text: "관련 조문을 찾는 중…" });
    const fu = resolveFollowUp(q, lastSearchQuery(conv));
    if (fu.isFollowUp) sendEvent(res, { type: "stage", text: `앞 질문을 이어받아 "${fu.searchQuery}" 로 찾는 중…` });

    const r = await search(engine, fu.searchQuery, { queryAsOf, topK: 10 });
    if (r.articles.length === 0) {
      const rj = reject("검색 결과 없음");
      const html = renderReject(rj.message, rj.reason);
      store.addTurn(conv, { kind: "REJECT", id: turnId, query: q, html });
      sendEvent(res, { type: "final", kind: "REJECT", html: renderTurn(q, html, turnId) });
      res.end();
      return;
    }

    const bundle: Bundle = mergeIntoConversation(
      conv,
      assembleBundle(src, r.articles, { seedTopK: 4, maxItems: BUNDLE_MAX_ITEMS }),
    );
    const turn: AnswerTurn = {
      kind: "ANSWER",
      id: turnId,
      query: q,
      searchQuery: fu.searchQuery,
      followUpOf: fu.isFollowUp ? fu.matched : [],
      queryAsOf,
      bundle,
      answers: new Map(),
    };
    store.addTurn(conv, turn);
    sendEvent(res, { type: "stage", text: `조문 ${String(bundle.items.length)}개를 읽는 중…` });

    const config = resolveAnswerConfig();
    const staged = stageRefs(conv, bundle.items);
    // ★ 번호를 **등장 순서로 그 자리에서 확정**하므로, 흘려보낸 번호가 나중에 바뀌지 않는다.
    const streamer = createRefStreamer(conv, staged);
    const history = historyFor(conv, mode0(), turn.id);

    let full = "";
    sendEvent(res, { type: "stage", text: "" });
    for await (const delta of streamAnswer(q, staged, defaultLlmStream(config), {
      mode: DEFAULT_MODE,
      history,
      queryAsOf,
    })) {
      const out = streamer.rewrite(delta);
      if (out !== "") {
        full += out;
        sendEvent(res, { type: "delta", text: out });
      }
    }
    full += streamer.flush();

    // ★ 흘려보낸 답이 **금액을 계산했으면** 다시 쓰게 한다(규칙 10 · 절대 규칙 3).
    //   스트리밍이라 사용자는 이미 계산식을 봤지만, 최종 HTML 로 교체되므로 남지 않는다.
    //   흐르는 동안 아무것도 보증하지 않는다는 원칙은 그대로다 — 보증은 여기서 시작한다.
    let active = streamer;
    // 등호형 + 유도형 둘 다 본다 — 등호를 막으면 등호 없이 새기 때문이다(실측).
    const computed = [
      ...findComputedAmounts(full),
      ...findDerivedAmounts(full, findUnsourcedAmounts(full, staged.map((i) => i.text)).map((u) => u.asWritten)),
    ];
    if (computed.length > 0) {
      sendEvent(res, { type: "stage", text: "계산한 금액이 있어 다시 쓰는 중… (계산은 승인된 규칙으로만 합니다)" });
      const fixed = await generateAnswer(q, staged, defaultLlm(config), {
        mode: DEFAULT_MODE,
        history,
        queryAsOf,
        correction: correctionForComputedAmounts(computed.map((c) => c.expression)),
      });
      if (findComputedAmounts(fixed).length < computed.length) {
        // ★ 새 스트리머로 한 번에 통과시킨다. `remap` 은 `conv.refs` 에서 다시 만들어지므로
        //   1차에서 확정된 번호는 그대로 유지되고, 새로 인용된 조문만 다음 번호를 받는다.
        active = createRefStreamer(conv, staged);
        full = active.rewrite(fixed) + active.flush();
      }
    }

    // 검증은 여기서 — 흐르는 동안에는 아무것도 보증하지 않았다.
    const items = active.items();
    const answer = buildUnmodeledAnswer(q, { ...bundle, items }, full);
    const manifest = buildFactManifest(answer, {
      queryAsOf,
      ragIndexVersion: engine.manifest.ragIndexVersion,
      rendererTemplateVersion: `${promptVersionOf(DEFAULT_MODE)}+${RENDERER_TEMPLATE_VERSION}`,
      rendererModelVersion: modelVersionOf(config),
      ...policyFields(),
    });
    turn.answers.set(DEFAULT_MODE, { answer, manifest });

    sendEvent(res, {
      type: "final",
      kind: "ANSWER",
      html: renderTurn(
        q,
        renderAnswer({
          answer,
          manifest,
          mode: DEFAULT_MODE,
          turnId,
          approved: approvedFor(items, queryAsOf),
          resolvedFrom: fu.isFollowUp ? { searchQuery: fu.searchQuery, matched: fu.matched } : null,
          alsoConsidered: uncited(items, answer),
        }) +
          // 조문으로 설명한 뒤, 계산할 수 있는 질문이면 **아래에서 되묻는다.**
          renderPlanOffer(early),
        turnId,
      ),
    });
    res.end();

    // ★ 응답을 끝낸 **뒤에** 반대 말투를 미리 만들어 둔다.
    //   사용자는 이미 답을 받았고, 토글을 누르는 건 대개 그 뒤 몇 초~몇십 초다.
    //   그 사이에 만들어 두면 토글이 **20초 → 0초**가 된다.
    void prewarmOtherMode(turn, conv);
  }

  function mode0(): AnswerMode {
    return DEFAULT_MODE;
  }

  /** 묶음에 있었지만 답이 인용하지 않은 조문 — "다음에 물어볼 것" 후보. */
  function uncited(items: readonly BundleItem[], answer: { citations: readonly BundleItem[] }): BundleItem[] {
    const used = new Set(answer.citations.map((c) => c.sourceId));
    return items.filter((i) => !used.has(i.sourceId));
  }

  async function handleAsk(res: ServerResponse, raw: string): Promise<void> {
    const body = JSON.parse(raw) as { query?: string; asOf?: string; convId?: string };
    const q = (body.query ?? "").trim();
    if (q === "") {
      sendJson(res, 400, { kind: "REJECT", html: renderReject("질문이 비어 있습니다.", "EMPTY_QUERY") });
      return;
    }

    // 대화가 없으면(첫 질문·서버 재시작 후) 새로 만든다. 있는데 못 찾으면 그것도 새로 만들되
    // convId 를 돌려주므로 클라이언트가 갈아탄다.
    const conv = (body.convId === undefined ? undefined : store.get(body.convId)) ?? store.create();
    const turnId = store.nextTurnId(conv);
    const queryAsOf = (body.asOf ?? "").trim() === "" ? todayKst() : (body.asOf as string);

    // ★ Router 가 먼저다. **후속 질문에도 매번 돈다** — 2턴째에 "나는 얼마 넣어야 돼?" 가
    //   들어와도 막혀야 하기 때문이다 (§1.2 개인 적용 금지).
    const route = routeIntent(q);
    if (route.intent === "PLAN") {
      const html = renderPlan(route.message ?? "", route.matched);
      store.addTurn(conv, { kind: "PLAN", id: turnId, query: q, html });
      sendJson(res, 200, { kind: "PLAN", convId: conv.id, turnId, html: renderTurn(q, html, turnId) });
      return;
    }

    // 후속 질문 해소 — "예시를 줘" 를 그대로 검색하면 엉뚱한 조문이 올라온다.
    const fu = resolveFollowUp(q, lastSearchQuery(conv));
    const r = await search(engine, fu.searchQuery, { queryAsOf, topK: 10 });
    if (r.articles.length === 0) {
      const rj = reject("검색 결과 없음");
      const html = renderReject(rj.message, rj.reason);
      store.addTurn(conv, { kind: "REJECT", id: turnId, query: q, html });
      sendJson(res, 200, { kind: "REJECT", convId: conv.id, turnId, html: renderTurn(q, html, turnId) });
      return;
    }

    // ★ 검색 묶음 + **이 대화에서 이미 인용된 조문**을 합치고 [n] 을 대화 기준으로 고정한다.
    //   합치지 않으면 후속 질문이 앞에서 한 말의 근거를 잃는다 (conversation.ts 참조).
    const bundle: Bundle = mergeIntoConversation(
      conv,
      assembleBundle(src, r.articles, { seedTopK: 4, maxItems: BUNDLE_MAX_ITEMS }),
    );
    const turn: AnswerTurn = {
      kind: "ANSWER",
      id: turnId,
      query: q,
      searchQuery: fu.searchQuery,
      followUpOf: fu.isFollowUp ? fu.matched : [],
      queryAsOf,
      bundle,
      answers: new Map(),
    };
    // 답을 만들기 **전에** 턴을 넣는다 — historyFor 가 직전 턴을 보게 하되,
    // answerFrom 이 자기 자신을 맥락으로 넣지 않도록 query 로 걸러낸다.
    store.addTurn(conv, turn);

    const { html } = await answerFrom(turn, conv, DEFAULT_MODE);
    sendJson(res, 200, {
      kind: "ANSWER",
      convId: conv.id,
      turnId,
      html: renderTurn(q, html, turnId),
    });
  }

  /**
   * 말투 토글(스트리밍) — 저장된 묶음을 그대로 쓰므로 **검색·임베딩 0콜**.
   * 이미 만들어 둔 말투면 API 0콜로 즉시 최종본을 준다.
   *
   * 왜 토글도 스트리밍해야 하나: 답을 다시 쓰는 데 걸리는 시간은 첫 답과 같은 10~20초다.
   * 그동안 스피너만 돌면 **"토글이 느리다"가 아니라 "고장났다"로 읽힌다**(실측 피드백).
   */
  async function handleModeStream(res: ServerResponse, raw: string): Promise<void> {
    res.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    });
    const body = JSON.parse(raw) as { convId?: string; turnId?: string; mode?: string };
    const conv = body.convId === undefined ? undefined : store.get(body.convId);
    const turn = conv === undefined || body.turnId === undefined ? undefined : store.findTurn(conv, body.turnId);
    if (conv === undefined || turn === undefined || !isAnswerTurn(turn) || !isAnswerMode(body.mode)) {
      sendEvent(res, {
        type: "final",
        html: renderReject(
          "이 답변을 다시 만들 수 없습니다. 서버가 재시작되어 대화가 사라졌을 수 있습니다 — 질문을 다시 해 주세요.",
          "TURN_NOT_FOUND",
        ),
      });
      res.end();
      return;
    }
    const mode = body.mode;

    const cached = turn.answers.get(mode);
    if (cached !== undefined) {
      sendEvent(res, { type: "final", html: renderStored(turn, cached, mode) });
      res.end();
      return;
    }

    // ★ 선생성이 **돌고 있는 중**이면 그걸 기다린다. 새로 시작하면 같은 답을 두 번 만든다.
    //   기다리는 편이 거의 항상 빠르다 — 선생성은 첫 답 직후에 시작했으므로 이미 진행돼 있다.
    const pending = inFlight.get(`${conv.id}:${turn.id}:${mode}`);
    if (pending !== undefined) {
      sendEvent(res, { type: "stage", text: "미리 준비 중이던 답을 가져오는 중…" });
      try {
        sendEvent(res, { type: "final", html: (await pending).html });
        res.end();
        return;
      } catch {
        // 선생성이 실패했다 — 아래 정상 경로로 새로 만든다.
      }
    }

    const config = resolveAnswerConfig();
    const staged = stageRefs(conv, turn.bundle.items);
    const streamer = createRefStreamer(conv, staged);
    const history = historyFor(conv, mode, turn.id);
    sendEvent(res, { type: "stage", text: `같은 조문 ${String(staged.length)}개로 다시 쓰는 중…` });

    let full = "";
    for await (const delta of streamAnswer(turn.query, staged, defaultLlmStream(config), {
      mode,
      history,
      queryAsOf: turn.queryAsOf,
    })) {
      const out = streamer.rewrite(delta);
      if (out !== "") {
        full += out;
        sendEvent(res, { type: "delta", text: out });
      }
    }
    full += streamer.flush();

    const items = streamer.items();
    const answer = buildUnmodeledAnswer(turn.query, { ...turn.bundle, items }, full);
    const manifest = buildFactManifest(answer, {
      queryAsOf: turn.queryAsOf,
      ragIndexVersion: engine.manifest.ragIndexVersion,
      rendererTemplateVersion: `${promptVersionOf(mode)}+${RENDERER_TEMPLATE_VERSION}`,
      rendererModelVersion: modelVersionOf(config),
      ...policyFields(),
    });
    const stored = { answer, manifest };
    turn.answers.set(mode, stored);
    sendEvent(res, { type: "final", html: renderStored(turn, stored, mode) });
    res.end();
  }

  /** 저장된 답 하나를 화면 조각으로. 토글·대화 다시열기가 같은 모양을 내야 한다. */
  function renderStored(turn: AnswerTurn, stored: StoredAnswer, mode: AnswerMode): string {
    return renderAnswer({
      answer: stored.answer,
      manifest: stored.manifest,
      mode,
      turnId: turn.id,
      approved: approvedFor(turn.bundle.items, turn.queryAsOf),
      resolvedFrom:
        turn.followUpOf.length === 0 ? null : { searchQuery: turn.searchQuery, matched: turn.followUpOf },
      alsoConsidered: uncited(turn.bundle.items, stored.answer),
    });
  }

  /** 말투 토글 — 저장된 묶음을 다시 쓴다. 검색·임베딩 0콜, 답변 1콜(캐시되면 0콜). */
  async function handleMode(res: ServerResponse, raw: string): Promise<void> {
    const body = JSON.parse(raw) as { convId?: string; turnId?: string; mode?: string };
    const conv = body.convId === undefined ? undefined : store.get(body.convId);
    const turn = conv === undefined || body.turnId === undefined ? undefined : store.findTurn(conv, body.turnId);
    if (conv === undefined || turn === undefined || !isAnswerTurn(turn)) {
      sendJson(res, 404, {
        html: renderReject(
          "이 답변을 다시 만들 수 없습니다. 서버가 재시작되어 대화가 사라졌을 수 있습니다 — 질문을 다시 해 주세요.",
          "TURN_NOT_FOUND",
        ),
      });
      return;
    }
    if (!isAnswerMode(body.mode)) {
      sendJson(res, 400, { html: renderReject(`알 수 없는 말투: ${String(body.mode)}`, "BAD_MODE") });
      return;
    }
    const { html } = await answerFrom(turn, conv, body.mode);
    sendJson(res, 200, { turnId: turn.id, html });
  }

  /** 대화를 다시 그린다 — 목록에서 골라 돌아올 때. 저장된 답만 쓰므로 API 콜 0회. */
  function handleOpen(res: ServerResponse, convId: string): void {
    const conv = store.get(convId);
    if (conv === undefined) {
      sendJson(res, 404, { html: renderReject("그 대화를 찾을 수 없습니다.", "CONV_NOT_FOUND") });
      return;
    }
    const turns = conv.turns.map((t) => {
      if (!isAnswerTurn(t)) return renderTurn(t.query, t.html, t.id);
      // 사용자가 마지막으로 본 말투를 알 수 없으므로, 만들어 둔 것 중 기본 말투를 우선한다.
      const mode: AnswerMode = t.answers.has(DEFAULT_MODE) ? DEFAULT_MODE : "LEGAL";
      const stored = t.answers.get(mode);
      if (stored === undefined) return renderTurn(t.query, renderReject("답변이 없습니다.", "NO_ANSWER"), t.id);
      return renderTurn(
        t.query,
        renderAnswer({
          answer: stored.answer,
          manifest: stored.manifest,
          mode,
          turnId: t.id,
          approved: approvedFor(t.bundle.items, t.queryAsOf),
          resolvedFrom:
            t.followUpOf.length === 0 ? null : { searchQuery: t.searchQuery, matched: t.followUpOf },
        }),
        t.id,
      );
    });
    sendJson(res, 200, { convId: conv.id, html: turns.join("\n") });
  }

  function serveStatic(res: ServerResponse, urlPath: string): void {
    const rel = urlPath === "/" ? "index.html" : normalize(urlPath).replace(/^([/\\.]+)/, "");
    const file = join(deps.publicDir, rel);
    if (!file.startsWith(deps.publicDir) || !existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("없다");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  }

  return createServer((req, res) => {
    void (async () => {
      try {
        if (applyCors(req, res)) return; // preflight 는 여기서 끝난다
        const url = req.url ?? "/";
        if (req.method === "POST" && url === "/api/ask/stream") {
          return await handleAskStream(res, await readBody(req));
        }
        if (req.method === "POST" && url === "/api/ask") return await handleAsk(res, await readBody(req));
        if (req.method === "POST" && url === "/api/mode/stream") {
          return await handleModeStream(res, await readBody(req));
        }
        if (req.method === "POST" && url === "/api/mode") return await handleMode(res, await readBody(req));
        if (req.method === "POST" && url === "/api/new") {
          return sendJson(res, 200, { convId: store.create().id });
        }
        if (req.method === "GET" && url === "/api/conversations") {
          return sendJson(res, 200, { conversations: store.list() });
        }
        if (req.method === "GET" && url.startsWith("/api/conversation/")) {
          return handleOpen(res, decodeURIComponent(url.slice("/api/conversation/".length)));
        }
        return serveStatic(res, url);
      } catch (e) {
        // 오류를 그럴듯한 답으로 덮지 않는다 — 실패는 실패로 보여야 한다 (§4.2).
        sendJson(res, 500, {
          kind: "ERROR",
          html: renderReject(`처리 중 오류: ${(e as Error).message}`, "INTERNAL"),
        });
      }
    })();
  });
}
