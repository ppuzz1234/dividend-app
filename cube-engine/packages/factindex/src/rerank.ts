/**
 * LLM 재정렬 — 하이브리드 후보를 **한 번의 호출**로 배치 채점한다.
 *
 * ## A1-v2 `reranker.py:17-49` 에서 가져온 것
 * - 후보 전체를 1콜로 채점(후보당 1콜이 아니다). 후보는 **인덱스 번호**로 참조해 토큰을 아끼고
 *   모델이 이름을 되뱉다 틀리는 경로를 없앤다.
 * - 후보당 원문 앞 N자 cap + 개행 제거 → 프롬프트 구조 파괴 방지.
 * - **graceful degrade**: 파싱 실패 시 hybrid `fused` 순서 유지. 부분 채점도 흡수 —
 *   30개 중 22개만 채점돼도 나머지는 fused 로 메워진다. 둘 다 0~1 스케일이라 순위가 안 깨진다
 *   (min-max 정규화 덕분). 답변 경로가 절대 끊기지 않는 것이 목적이다.
 *
 * ## ⚠️ rerank 점수를 임계값으로 쓰지 마라
 * A1 감사 결론: cross-encoder sigmoid 가 무관 질의에도 ~0.50 을 뱉어 `REFUSAL_THRESHOLD`
 * score gate 가 **13건 중 0건 발화 = 사실상 dead** 였다. 여기서도 **순위에만** 쓴다.
 * 거부 판정은 Registry 유무(Phase 9)가 한다.
 */

import type { ScoredArticle } from "./hybrid.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 후보당 프롬프트에 넣을 원문 길이. A1-v2 는 300자였다. */
const SNIPPET_CHARS = 300;

const SYSTEM = [
  "너는 법령 검색결과 재정렬기다. 사용자 질문과 번호가 매겨진 후보 조문이 주어진다.",
  "각 후보가 질문에 얼마나 관련되는지 0.0~1.0으로 채점하라.",
  "조문 제목·법령명이 질문의 대상과 정확히 일치하면 높게, 비슷하지만 다른 제도면 낮게 매겨라.",
  "예: '개인형퇴직연금(IRP)'을 물었는데 '확정기여형(DC)' 조문이면 낮다.",
  '반드시 JSON만 출력: {"scores":[{"i":<번호>,"s":<0~1>}, ...]} (모든 후보 포함).',
].join(" ");

export interface RerankConfig {
  readonly apiKey: string;
  /** 채점용 모델. 임베딩 모델과 다르다. */
  readonly model: string;
}

export function resolveRerankConfig(): RerankConfig {
  const apiKey = process.env["LLM_API_KEY"] ?? "";
  if (apiKey.trim() === "") throw new Error("LLM_API_KEY 가 없다 — A4/.env 확인");
  return { apiKey, model: process.env["RERANK_MODEL"] ?? "gemini-2.5-flash" };
}

function candidateBlock(articles: readonly ScoredArticle[]): string {
  return articles
    .map((a, i) => {
      const c = a.best.chunk;
      const label = c.articleSubNo === null ? `제${c.articleNo}조` : `제${c.articleNo}조의${c.articleSubNo}`;
      const head = `${c.lawName} ${label}${c.title === null ? "" : `(${c.title})`}`;
      const body = c.text.trim().replace(/\s+/g, " ").slice(0, SNIPPET_CHARS);
      return `[${i}] ${head} :: ${body}`;
    })
    .join("\n");
}

/** LLM 응답에서 {i,s} 맵을 뽑는다. 어떤 실패도 예외로 새어나가지 않는다. */
export function parseScores(raw: string): Map<number, number> {
  const out = new Map<number, number>();
  // 마크다운 펜스로 감싼 응답도 살린다.
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m === null) return out;
  let data: unknown;
  try {
    data = JSON.parse(m[0]);
  } catch {
    return out;
  }
  const scores = (data as { scores?: unknown }).scores;
  if (!Array.isArray(scores)) return out;
  for (const o of scores) {
    if (typeof o !== "object" || o === null) continue;
    const i = (o as { i?: unknown }).i;
    const s = (o as { s?: unknown }).s;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0) continue;
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    // 모델이 1.5 나 -0.2 를 뱉어도 clamp — 융합 점수와 같은 0~1 스케일을 유지해야 섞을 수 있다.
    out.set(i, Math.max(0, Math.min(1, s)));
  }
  return out;
}

/**
 * 후보를 재정렬한다. **LLM 이 실패해도 절대 던지지 않는다** — 원래 순서를 그대로 돌려준다.
 *
 * @param llm 주입 가능한 호출자. 테스트는 스텁을 넣어 네트워크 없이 돈다.
 */
export async function rerank(
  query: string,
  articles: readonly ScoredArticle[],
  opts: {
    readonly topK?: number;
    readonly llm?: (system: string, user: string) => Promise<string>;
    readonly config?: RerankConfig;
  } = {},
): Promise<ScoredArticle[]> {
  if (articles.length === 0) return [];
  const topK = opts.topK ?? articles.length;

  let raw = "";
  try {
    const call = opts.llm ?? defaultLlm(opts.config ?? resolveRerankConfig());
    raw = await call(SYSTEM, `질문: ${query}\n\n후보:\n${candidateBlock(articles)}`);
  } catch {
    // 네트워크·quota·인증 실패 — 검색 결과를 잃는 것보다 원래 순서를 주는 편이 낫다.
    return [...articles].slice(0, topK);
  }

  const scores = parseScores(raw);
  return [...articles]
    .map((a, i) => ({
      article: a,
      // 채점 안 된 후보는 fused 로 메운다. 둘 다 0~1 이라 섞어도 순위가 안 깨진다.
      score: scores.get(i) ?? a.best.fused,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK)
    .map((x) => x.article);
}

function defaultLlm(config: RerankConfig): (system: string, user: string) => Promise<string> {
  return async (system, user) => {
    const url = `${ENDPOINT}/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          // 채점에 사고 과정이 필요 없다. 끄면 지연·비용이 준다.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) throw new Error(`rerank HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  };
}
