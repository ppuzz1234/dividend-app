/**
 * AI-1 초안 생성 — 조문 원문 → 정책 팩 초안 (사양 §2.2 3단계).
 *
 * ## 절대 규칙과의 관계
 * 초안은 **반드시 `pack_kind: UNVERIFIED_DRAFT`** 로 나온다. `registry.ts` 가 그 등급의 팩에서
 * 값을 인출하면 `UnverifiedPolicyError` 를 던지므로, **초안이 레포에 있어도 계산에 절대 못 들어간다.**
 * 로딩은 허용된다 — 사람이 검토해야 하니까.
 *
 * 확정할 수 없는 값은 지어내지 않고 `PLACEHOLDER` 로 남긴다 (절대 규칙 1:
 * *"임시값이 필요하면 값을 지어내지 말고 실패 경로를 구현하라"*). `VERIFIED_LAW` 승격 시
 * `loadPolicyPack` 이 `PLACEHOLDER_IN_VERIFIED_PACK` 으로 거절한다.
 *
 * ## LLM 이 여기 있어도 되는 이유
 * 사양 §7 은 AI 에게 "법 개정 diff·정책 팩 변경 **초안**"을 허용한다. 금지되는 것은
 * "정책 자동 배포"다. 초안은 사람 승인 전까지 아무 효력이 없다.
 */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 확정 못 한 값의 표식. `VERIFIED_LAW` 팩에 남아 있으면 로더가 거절한다. */
export const PLACEHOLDER = "<원문 대조 후 기재>";

export interface DraftConfig {
  readonly apiKey: string;
  readonly model: string;
}

export function resolveDraftConfig(): DraftConfig {
  const apiKey = process.env["LLM_API_KEY"] ?? "";
  if (apiKey.trim() === "") throw new Error("LLM_API_KEY 가 없다 — A4/.env 확인");
  return { apiKey, model: process.env["DRAFT_MODEL"] ?? "gemini-2.5-flash" };
}

/** 초안 규칙 하나 — 사람이 검토할 최소 단위. */
export interface DraftRule {
  readonly id: string;
  /** 이 규칙이 정하는 것 (사람이 읽을 한 줄) */
  readonly what: string;
  /** 값. 확정 못 하면 PLACEHOLDER */
  readonly value: string;
  /**
   * 단위. **YEARS·MONTHS 가 없어서 사고가 났다** — 나이 `60`, 기간 `10년`, 기한 `6개월` 이
   * 전부 `UNKNOWN` 으로 떨어졌고 YAML 변환기가 그걸 조용히 `KRW` 로 바꿔 승인 팩에
   * `60 KRW` 가 들어갔다(실측, 2026-08-04 재승인에서 정정).
   * *표현할 수 없는 단위는 UNKNOWN 이 되고, UNKNOWN 을 조용히 메우면 거짓말이 된다.*
   */
  readonly unit: "KRW" | "RATE" | "COUNT" | "YEARS" | "MONTHS" | "UNKNOWN";
  /**
   * 이 값이 실제로 적힌 조문의 source_id.
   *
   * ★ 씨앗 조문과 **다를 수 있다.** 생성기는 위임 사슬을 통째로 읽히므로
   * (`scripts/draft.ts`), 값이 참조 조문에 있는 경우가 흔하다 — 실측: 근퇴법 시행령
   * §17의2 로 초안을 뜨면 값은 전부 「소득세법 시행령」 §40의2 에서 나온다.
   * 이걸 안 받아 적으면 PRIMARY 가 씨앗 조문으로 고정돼 **근거가 틀린 팩**이 만들어진다.
   */
  readonly sourceId: string | null;
  /** 값이 붙는 조건 (원문 표현 그대로) */
  readonly conditions: readonly string[];
  /** 이 값이 나온 원문 구절 — **사람이 대조할 앵커.** 지어내면 대조에서 바로 걸린다 */
  readonly quote: string;
  /** 모델이 확신하지 못한 부분 — 사람이 먼저 봐야 할 곳 */
  readonly uncertainty: string | null;
}

export interface DraftResult {
  readonly sourceId: string;
  readonly rules: readonly DraftRule[];
  readonly modelVersion: string;
}

const SYSTEM = [
  "너는 한국 세법 조문에서 **계산에 쓸 파라미터**를 뽑아 초안을 만든다. 규칙:",
  "",
  "1. 조문에 **명시된 값만** 뽑는다. 계산하거나 추론한 값은 넣지 마라.",
  `2. 값을 확정할 수 없으면 value 에 정확히 "${PLACEHOLDER}" 를 넣는다. 추측한 숫자 금지.`,
  "3. **조건을 빠뜨리지 마라.** 값이 조건에 따라 달라지면 조건마다 별도 규칙으로 나눈다.",
  "4. quote 에는 그 값이 나온 **원문 구절을 그대로** 옮긴다. 요약·의역 금지 — 사람이 대조한다.",
  "5. 확신하지 못한 부분은 uncertainty 에 적는다. 비워두지 말고 솔직히 적어라.",
  "6. 금액은 원 단위 정수 문자열(예: 4000000), 비율은 분자/분모(예: 9/100) 로 적는다.",
  "7. unit 은 KRW(금액) · RATE(비율) · YEARS(나이·연 단위 기간) · MONTHS(월 단위 기한) ·",
  "   COUNT(개수) 중 하나다. **금액이 아닌 값에 KRW 를 쓰지 마라** — 나이 60 은 YEARS 다.",
  "8. source_id 에는 그 값이 **실제로 적힌 조문**의 id 를 적는다. 대상 조문이 다른 조문을",
  "   가리키기만 하고 값은 거기 있으면, **가리켜진 조문의 id** 를 적어야 한다.",
  "",
  "JSON 만 출력: {\"rules\":[{\"id\":\"\",\"what\":\"\",\"value\":\"\",\"unit\":\"\",\"source_id\":\"\",\"conditions\":[],\"quote\":\"\",\"uncertainty\":null}]}",
].join("\n");

export function buildDraftPrompt(sourceId: string, lawName: string, label: string, text: string): string {
  return [
    `★ 대상 조문: ${lawName} ${label}  (source_id: ${sourceId})`,
    "",
    `**${sourceId} 가 정하는 파라미터만** 뽑아라.`,
    "아래에는 그 조문이 참조하는 다른 조문도 함께 실려 있는데, 그것들은",
    "**대상 조문의 값을 확인하는 용도**이지 거기서 파라미터를 수확하는 대상이 아니다.",
    `예: 대상 조문이 "「소득세법 시행령」 제40조의2에 따른 금액"이라고 하면,`,
    "그 조문에서 **해당 금액만** 찾아 값으로 쓴다. 그 조문의 다른 규정은 무시한다.",
    "",
    "규칙 id 는 대문자·점 표기로 만들어라 (예: ISA.NONTAX_LIMIT.GENERAL).",
    "",
    "─── 대상 조문 및 참조 조문 ───",
    text,
  ].join("\n");
}

export function parseDraft(raw: string, sourceId: string, modelVersion: string): DraftResult {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m === null) throw new Error(`초안 응답에서 JSON 을 찾지 못했다: ${raw.slice(0, 200)}`);
  let data: unknown;
  try {
    data = JSON.parse(m[0]);
  } catch (e) {
    throw new Error(`초안 JSON 파싱 실패: ${(e as Error).message}`);
  }
  const rules = (data as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) throw new Error("초안에 rules 배열이 없다");

  return {
    sourceId,
    modelVersion,
    rules: rules.map((r, i) => {
      const o = r as Partial<DraftRule>;
      if (typeof o.id !== "string" || o.id.trim() === "") throw new Error(`rules[${i}]: id 가 없다`);
      if (typeof o.value !== "string") throw new Error(`rules[${i}]: value 가 문자열이 아니다`);
      if (typeof o.quote !== "string" || o.quote.trim() === "") {
        // quote 없는 초안은 대조가 불가능하다 — 검토 절차 자체가 성립하지 않는다.
        throw new Error(`rules[${i}] (${o.id}): quote 가 없다 — 원문 대조를 할 수 없다`);
      }
      return {
        id: o.id,
        what: typeof o.what === "string" ? o.what : "",
        value: o.value,
        unit: (["KRW", "RATE", "COUNT", "YEARS", "MONTHS"] as const).includes(o.unit as never)
          ? (o.unit as DraftRule["unit"])
          : "UNKNOWN",
        // 씨앗 조문으로 기본값을 채우지 않는다 — 그 기본값이 곧 "근거가 저기 있다"는 거짓 주장이 된다.
        sourceId:
          typeof (r as { source_id?: unknown }).source_id === "string" &&
          (r as { source_id: string }).source_id.trim() !== ""
            ? (r as { source_id: string }).source_id.trim()
            : null,
        conditions: Array.isArray(o.conditions) ? o.conditions.filter((c): c is string => typeof c === "string") : [],
        quote: o.quote,
        uncertainty: typeof o.uncertainty === "string" && o.uncertainty.trim() !== "" ? o.uncertainty : null,
      };
    }),
  };
}

export type LlmCall = (system: string, user: string) => Promise<string>;

export function defaultLlm(config: DraftConfig): LlmCall {
  return async (system, user) => {
    const url = `${ENDPOINT}/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`초안 생성 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  };
}

export async function draftFromArticle(
  article: { sourceId: string; lawName: string; articleLabel: string; text: string },
  llm: LlmCall,
  modelVersion: string,
): Promise<DraftResult> {
  const raw = await llm(
    SYSTEM,
    buildDraftPrompt(article.sourceId, article.lawName, article.articleLabel, article.text),
  );
  return parseDraft(raw, article.sourceId, modelVersion);
}

export { SYSTEM as DRAFT_SYSTEM_PROMPT };
