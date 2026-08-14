/**
 * Gemini 임베딩 클라이언트 (REST 직접 호출 — SDK 의존성 0).
 *
 * ## A1-v2 에서 가져온 것 / 고친 것
 * - **가져옴**: 배치 32(`encoder.py:19`), `task_type` 문서/질의 분리(비대칭 검색 = recall↑),
 *   L2 정규화의 `or 1.0` zero-vector 방어(`encoder.py:34-36`).
 * - **고침**: A1-v2 의 임베딩 경로에는 **재시도가 없다**(`encoder.py:44-52` 에 try/except 없음).
 *   300건 규모라 안 터졌을 뿐이고, 2,357 청크 × 74콜에서는 한 번의 5xx 가 전체를 날린다.
 *   → LLM 경로의 backoff(`client.py:64-77`)를 여기로 이식했다.
 *
 * ## 429 를 재시도하지 않는 이유
 * 한도 소진은 기다린다고 풀리지 않는다(A1-v2 의 같은 판단). 즉시 올려서 사람이 결정하게 한다.
 * ⚠️ 이 키는 A1-v2 와 공유하므로 **quota 도 공유**한다.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 한 번의 배치 요청에 담을 문서 수. 요청당 토큰·인스턴스 한도의 안전값(A1-v2 실전값). */
export const BATCH_SIZE = 32;

/** 저장 문서와 질의는 다른 task 로 임베딩한다 — 비대칭 검색이 recall 을 올린다. */
export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export interface EmbedConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly dim: number;
}

export function resolveEmbedConfig(): EmbedConfig {
  const apiKey = process.env["LLM_API_KEY"] ?? "";
  if (apiKey.trim() === "") {
    throw new Error(
      "LLM_API_KEY 가 없다 — A4/.env 를 확인하라 (A1-v2 의 Gemini 키를 재사용하도록 복사돼 있어야 한다)",
    );
  }
  const model = process.env["EMBED_MODEL"] ?? "gemini-embedding-001";
  const dim = Number(process.env["EMBED_DIM"] ?? "3072");
  if (!Number.isInteger(dim) || dim <= 0) throw new Error(`EMBED_DIM 이 양의 정수가 아니다: ${dim}`);
  return { apiKey, model, dim };
}

/** 재시도 대기(ms). 2s · 4s · 8s — A1-v2 `client.py:76` 과 같은 스케줄. */
const BACKOFF_MS = [2000, 4000, 8000] as const;

class QuotaExhaustedError extends Error {
  override readonly name = "QuotaExhaustedError";
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // 네트워크 오류는 일시적일 수 있다 → backoff 후 재시도
      lastError = e;
      if (attempt === BACKOFF_MS.length) break;
      await sleep(BACKOFF_MS[attempt]!);
      continue;
    }

    if (res.ok) return res.json();

    const text = await res.text();
    if (res.status === 429 || text.includes("RESOURCE_EXHAUSTED")) {
      // 한도 소진은 기다려도 안 풀린다 — 즉시 올려 사람이 판단하게 한다.
      throw new QuotaExhaustedError(
        `Gemini 임베딩 quota 소진 (HTTP ${res.status}). ⚠️ 이 키는 A1-v2 와 공유한다.\n${text.slice(0, 300)}`,
      );
    }
    if (res.status >= 400 && res.status < 500) {
      // 4xx 는 요청이 잘못된 것 — 재시도해도 같다.
      throw new Error(`Gemini 임베딩 HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    lastError = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    if (attempt === BACKOFF_MS.length) break;
    await sleep(BACKOFF_MS[attempt]!);
  }
  throw new Error(`Gemini 임베딩 재시도 ${BACKOFF_MS.length}회 실패: ${String(lastError)}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * L2 정규화. **생략하면 안 된다** — Gemini 는 3072d 일 때만 단위벡터를 주고,
 * `EMBED_DIM` 을 낮추는 순간 정규화 없이는 코사인 검색 순위가 **조용히** 망가진다.
 * `|| 1` 은 zero-vector 방어(A1-v2 `encoder.py:35` 의 `or 1.0`).
 */
export function l2Normalize(v: readonly number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum) || 1;
  return v.map((x) => x / n);
}

interface BatchResponse {
  embeddings?: { values?: number[] }[];
}

/** 문자열 배열 → 단위벡터 배열. 배치 분할·재시도·정규화를 모두 처리한다. */
export async function embedTexts(
  texts: readonly string[],
  opts: {
    readonly config: EmbedConfig;
    readonly task: EmbedTask;
    /** 진행 표시 콜백. 대량 작업에서만 넘긴다(단건 질의에 로그를 찍으면 소음). */
    readonly onProgress?: (done: number, total: number) => void;
  },
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { config, task, onProgress } = opts;
  const url = `${ENDPOINT}/${config.model}:batchEmbedContents?key=${encodeURIComponent(config.apiKey)}`;
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const slice = texts.slice(i, i + BATCH_SIZE);
    const json = (await postJson(url, {
      requests: slice.map((text) => ({
        model: `models/${config.model}`,
        content: { parts: [{ text }] },
        taskType: task,
        outputDimensionality: config.dim,
      })),
    })) as BatchResponse;

    const embeddings = json.embeddings;
    if (!Array.isArray(embeddings) || embeddings.length !== slice.length) {
      throw new Error(
        `임베딩 응답 개수가 요청과 다르다: 요청 ${slice.length} / 응답 ${embeddings?.length ?? "없음"} — ` +
          `조용히 넘어가면 청크와 벡터의 짝이 어긋난다`,
      );
    }
    for (const [k, e] of embeddings.entries()) {
      const values = e.values;
      if (!Array.isArray(values) || values.length !== config.dim) {
        throw new Error(
          `임베딩 차원이 ${values?.length ?? "없음"} 이다 (기대 ${config.dim}) — 배치 ${i + k}`,
        );
      }
      out.push(l2Normalize(values));
    }
    onProgress?.(Math.min(i + BATCH_SIZE, texts.length), texts.length);
  }
  return out;
}

/** 토큰 수 조회. `measure:tokens` 가 청크 한도를 실측하는 데 쓴다. */
export async function countTokens(text: string, config: EmbedConfig): Promise<number> {
  const url = `${ENDPOINT}/${config.model}:countTokens?key=${encodeURIComponent(config.apiKey)}`;
  const json = (await postJson(url, { contents: [{ parts: [{ text }] }] })) as {
    totalTokens?: number;
  };
  if (typeof json.totalTokens !== "number") {
    throw new Error(`countTokens 응답에 totalTokens 가 없다: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.totalTokens;
}
