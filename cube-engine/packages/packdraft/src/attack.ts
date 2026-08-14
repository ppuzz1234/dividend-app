/**
 * AI-2 반례 공격 — 초안을 **독립적으로 검증**한다 (사양 §2.2 4단계).
 *
 * ## 왜 다른 모델이어야 하나
 * 사양 §2.2 는 "AI-2가 **독립적으로** 반례·누락 조건 공격"이라고 한다. 같은 모델로 하면
 * 같은 오독을 두 번 하고 "일치했으니 맞다"는 거짓 확신만 얻는다. 그래서
 * **AI-1 은 Gemini, AI-2 는 Claude** 로 갈린다(`.env` 의 `ATTACK_MODEL`).
 *
 * ## 불일치는 자동 보류다
 * 사양 §7: *"두 AI 의 답을 평균 내지 않는다."* 평균은 두 오답의 중간값을 만들 뿐이다.
 * 불일치하면 `hold: true` 로 표시하고 **사람이 정독할 목록에 올린다.**
 *
 * ## 무엇을 공격하나
 * "이 값이 맞나"가 아니라 **"이 초안을 반박할 근거가 원문에 있나"** 를 묻는다.
 * 확인 지향 질문("맞습니까?")은 모델이 동의하는 쪽으로 기울기 때문이다.
 */

import type { DraftRule } from "./draft.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";

export interface AttackConfig {
  readonly apiKey: string;
  readonly model: string;
}

/**
 * AI-2 설정. AI-1(Gemini)과 **다른 provider** 를 쓴다.
 * 키가 없으면 던진다 — 조용히 같은 모델로 떨어지면 독립성이 사라진다.
 */
export function resolveAttackConfig(): AttackConfig {
  const apiKey = process.env["ATTACK_API_KEY"] ?? "";
  if (apiKey.trim() === "") {
    throw new Error(
      "ATTACK_API_KEY 가 없다 — AI-2 는 AI-1(Gemini)과 **다른 provider** 여야 한다(사양 §2.2 독립성).\n" +
        "  같은 모델로 두 번 돌리면 같은 오독을 반복하고 '일치했으니 맞다'는 거짓 확신만 얻는다.\n" +
        "  Anthropic 키를 .env 의 ATTACK_API_KEY 에 넣어라.",
    );
  }
  return { apiKey, model: process.env["ATTACK_MODEL"] ?? "claude-sonnet-5" };
}

export interface AttackVerdict {
  readonly ruleId: string;
  /** 원문에 반박 근거가 있는가 */
  readonly refuted: boolean;
  /** 초안이 놓친 조건 */
  readonly missedConditions: readonly string[];
  /** 근거가 되는 원문 구절 */
  readonly evidence: string;
  readonly note: string;
}

export interface AttackResult {
  readonly verdicts: readonly AttackVerdict[];
  /** 사람이 정독해야 할 규칙 id — 반박됐거나 조건 누락이 지적된 것 */
  readonly hold: readonly string[];
  readonly modelVersion: string;
}

const SYSTEM = [
  "너는 세법 파라미터 초안을 **반박하는** 검토자다. 동의하는 것이 목적이 아니다.",
  "",
  "각 초안 규칙에 대해 원문을 근거로 다음을 찾아라:",
  "1. 값이 원문과 다른가 (숫자·단위·부호)",
  "2. **조건이 빠졌는가** — 값이 적용되는 경우가 초안보다 많거나 적은가",
  "3. quote 가 원문에 **실제로 존재하는가** (지어낸 인용인가)",
  "4. 예외·단서 조항을 놓쳤는가",
  "",
  "확실하지 않으면 refuted 를 true 로 둬라. **의심스러우면 보류가 기본값이다.**",
  "evidence 에는 반박 근거가 되는 원문 구절을 그대로 옮겨라.",
  "",
  'JSON 만 출력: {"verdicts":[{"ruleId":"","refuted":false,"missedConditions":[],"evidence":"","note":""}]}',
].join("\n");

export function buildAttackPrompt(text: string, rules: readonly DraftRule[]): string {
  const draft = rules
    .map(
      (r) =>
        `- id: ${r.id}\n  값: ${r.value} (${r.unit})\n  조건: ${r.conditions.join(" / ") || "(없음)"}\n  근거 인용: ${r.quote}`,
    )
    .join("\n");
  return `─── 원문 ───\n${text}\n\n─── 검토할 초안 ───\n${draft}`;
}

export function parseAttack(raw: string, modelVersion: string): AttackResult {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (m === null) throw new Error(`공격 응답에서 JSON 을 찾지 못했다: ${raw.slice(0, 200)}`);
  const data = JSON.parse(m[0]) as { verdicts?: unknown };
  if (!Array.isArray(data.verdicts)) throw new Error("공격 결과에 verdicts 배열이 없다");

  const verdicts: AttackVerdict[] = data.verdicts.map((v) => {
    const o = v as Partial<AttackVerdict>;
    return {
      ruleId: typeof o.ruleId === "string" ? o.ruleId : "",
      // 판정이 없으면 **보류** 쪽으로 — 기본값이 통과가 되면 안 된다.
      refuted: o.refuted !== false,
      missedConditions: Array.isArray(o.missedConditions)
        ? o.missedConditions.filter((c): c is string => typeof c === "string")
        : [],
      evidence: typeof o.evidence === "string" ? o.evidence : "",
      note: typeof o.note === "string" ? o.note : "",
    };
  });

  const hold = verdicts.filter((v) => v.refuted || v.missedConditions.length > 0).map((v) => v.ruleId);
  return { verdicts, hold, modelVersion };
}

export type LlmCall = (system: string, user: string) => Promise<string>;

export function defaultAttackLlm(config: AttackConfig): LlmCall {
  return async (system, user) => {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        // thinking 이 켜진 모델은 여기서 생각까지 같이 쓴다. 4096 으로 두면 생각만 하다
        // stop_reason=max_tokens 로 끊겨 본문이 안 나온다 (실측). 반례 검토는 조문 전체를
        // 훑는 작업이라 넉넉히 준다.
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`반례 공격 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
    };

    // content[0] 을 그냥 읽으면 안 된다 — thinking 이 켜져 있으면 첫 블록이 thinking 이라
    // `.text` 가 없고 조용히 "" 가 된다. 그러면 "응답이 비었다"로 오진하게 된다.
    // 실제로 그렇게 한 번 오진했다. type === "text" 인 블록만 모은다.
    const text = (json.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    if (text === "") {
      const kinds = (json.content ?? []).map((b) => b.type ?? "?").join(",") || "(없음)";
      throw new Error(`반례 공격 응답에 text 블록이 없다 — 블록 [${kinds}] · stop_reason=${json.stop_reason ?? "?"}`);
    }
    return text;
  };
}

export async function attackDraft(
  articleText: string,
  rules: readonly DraftRule[],
  llm: LlmCall,
  modelVersion: string,
): Promise<AttackResult> {
  if (rules.length === 0) return { verdicts: [], hold: [], modelVersion };
  return parseAttack(await llm(SYSTEM, buildAttackPrompt(articleText, rules)), modelVersion);
}

export { SYSTEM as ATTACK_SYSTEM_PROMPT };
