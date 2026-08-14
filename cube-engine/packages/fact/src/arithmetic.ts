/**
 * 답변이 **금액을 계산했는지** 잡는다 (프롬프트 규칙 10 · 절대 규칙 3).
 *
 * ## 왜 프롬프트가 아니라 검사기인가
 * 규칙 10 은 "곱하기·더하기로 금액을 내지 마라"라고 명시한다. Sonnet 은 지켰고 Haiku 는
 * 뚫었다(실측: `2,000만원의 10% = 200만원`, `1,500만원 + 200만원 = 1,700만원`).
 * **지시를 얼마나 따르는지는 모델마다 다르고, 그건 우리가 통제할 수 없다.**
 * 통제할 수 있는 건 출력 검사뿐이라, 규칙을 문장으로만 두지 않고 기계로 옮긴다.
 *
 * 이 검사가 중요한 이유: 계산된 금액은 **어느 조문에도 없어서 되짚을 수가 없다.**
 * 위조 인용은 닫힌 집합이라 바로 잡히고, 미확인 금액은 원문 대조로 잡히는데,
 * 계산 결과는 재료가 다 근거 있는 값이라 **그 둘을 모두 통과한다.**
 *
 * ## 조문이 정한 산식은 잡지 않는다
 * 조문에는 산식이 자주 나온다 — ISA 연간 납입한도가
 * `2천만원 × [1 + 경과 연수] - 누적 납입금액` 같은 식이다. 그걸 **옮겨 적는 것은 의무**이고
 * (규칙 3), 금지되는 건 거기에 숫자를 넣어 **결과를 내는 것**이다. 그래서 판정 기준은
 * "산술 기호가 있나"가 아니라 **"피연산자와 결과가 전부 구체적인 숫자인가"** 다.
 *   허용: `2천만원 × [1 + 가입 후 경과 연수] - 누적 납입금액`  ← 변수가 남아 있다
 *   금지: `2,000만원의 10% = 200만원`                          ← 전부 수치, 결과까지 나왔다
 */

/** 금액·비율 토큰 하나. `1,800만원` · `2천만원` · `15%` · `200`. */
const NUM = String.raw`\d[\d,]*(?:천\d*)?(?:백\d*)?\s*(?:억원|만원|억|만|원|%|퍼센트)?`;

/**
 * `A <연산> B = C` — 세 자리 전부 구체적 수치인 경우만.
 *
 * 연산자는 기호(`×* +-`)와 한국어 표현(`의 …%`, `곱하면`, `더하면`)을 함께 본다.
 * 모델은 `2,000만원의 10% = 200만원` 처럼 한국어로도 계산하기 때문이다(실측).
 */
const ARITH_RE = new RegExp(
  String.raw`(${NUM})\s*(?:[×xX*+\-−·]|의|곱하면|곱한|더하면|더한|빼면|뺀)\s*(${NUM})\s*(?:을|를|이|가)?\s*(?:곱하면|곱한|더하면|더한|빼면|뺀)?\s*=\s*(${NUM})`,
  "g",
);

export interface ArithmeticIssue {
  /** 잡힌 계산식 그대로 */
  readonly expression: string;
  /** 그 식이 나온 문장(앞부분) */
  readonly sentence: string;
}

/**
 * 답변에서 **계산해서 낸 금액**을 찾는다.
 *
 * 빈 배열이면 계산하지 않은 것이다. 하나라도 있으면 그 답은 내보내면 안 된다 —
 * 계산은 승인된 규칙 위에서 도는 PLAN 엔진의 몫이기 때문이다(사양 §1.1).
 */
export function findComputedAmounts(answer: string): ArithmeticIssue[] {
  const out: ArithmeticIssue[] = [];
  for (const line of answer.split("\n")) {
    // 표 구분선(`|---|---|`)의 하이픈이 뺄셈으로 읽히지 않게 먼저 거른다.
    if (/^\s*\|?[\s:|-]*-[\s:|-]*\|/.test(line)) continue;
    ARITH_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ARITH_RE.exec(line)) !== null) {
      out.push({ expression: m[0].trim(), sentence: line.trim().slice(0, 90) });
    }
  }
  return out;
}

/** `1,800만원` · `2천만원` → 원 단위 정수. 못 읽으면 null. */
function toWon(token: string): bigint | null {
  const m = /^(\d[\d,]*)(?:(천)(\d*))?(?:(백)(\d*))?\s*(억원|만원|억|만|원)?$/.exec(token.replace(/\s/g, ""));
  if (m === null) return null;
  let n = Number((m[1] ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (m[2] !== undefined) n = n * 1000 + Number(m[3] === "" ? 0 : m[3]);
  if (m[4] !== undefined) n = n * 100 + Number(m[5] === "" ? 0 : m[5]);
  const unit = m[6] ?? "";
  const scale = unit.startsWith("억") ? 100000000n : unit.startsWith("만") ? 10000n : 1n;
  return BigInt(Math.round(n)) * scale;
}

const MONEY_TOKEN_RE = /\d[\d,]*(?:천\d*)?(?:백\d*)?\s*(?:억원|만원|억|만)/g;

/**
 * **계산 결과임을 드러내는 말.** 이게 있는 문장의 금액만 유도형 검사 대상이다.
 *
 * ## 왜 필요했나 (실측)
 * 유도형 검사는 답 안의 두 금액에서 산술로 나오는지 본다. 그런데 **금액이 많아지면
 * 쌍이 제곱으로 늘어난다** — 넓은 질문 답에는 금액이 10개쯤 나오고 그럼 쌍이 45개다.
 * 우연히 `A + B = C` 가 맞아떨어질 확률이 좁은 질문(쌍 3개)보다 15배 높다.
 *
 * 실제로 넓은 질문 벤치마크에서 재생성이 3~7회 걸렸고, **재생성이 많은 회차가 오히려
 * 조건 앵커가 낮았다**(7회 재생성 → 70%, 3회 → 75%). 시간만 40% 늘고 품질은 안 올랐다.
 *
 * 진짜 계산은 말로 드러난다. Haiku 가 실제로 계산했을 때도 그랬다:
 * `"합쳐서 3,800만원까지 납입 가능이에요"`. 그 신호를 요구하면 우연을 걸러낼 수 있다.
 *
 * ponytail(arithmetic/신호): 신호 없이 조용히 계산하면 놓친다. 상한은 그것이고,
 * 업그레이드 경로는 실제로 새는 사례가 나오면 목록을 늘리는 것이다. 등호형(`A + B = C`)은
 * 이 신호와 무관하게 **항상** 잡으므로, 놓치는 범위는 "등호도 없고 말로도 안 드러낸 계산"뿐이다.
 */
const SUM_CUE_RE = /합(쳐|치|계|해서|하면)|총\s*액|모두\s*더|더하면|합산|따라서|그러면|결과적으로|최대\s*\d/;

/**
 * **등호 없이 계산한 금액**을 찾는다.
 *
 * ## 왜 필요했나
 * `findComputedAmounts` 로 `A + B = C` 를 막았더니 Haiku 가 **등호를 빼고** 우회했다(실측):
 * ```
 * - 기본 한도 1,800만원과
 * - 전환금액 2,000만원을
 * 합쳐서 3,800만원까지 납입 가능이에요.
 * ```
 * 형태를 하나 막으면 다른 형태로 새는 건 검사기의 숙명이다. 그래서 **형태가 아니라 값**으로
 * 판정한다: 조문에 없는 금액인데 **답 안의 다른 두 금액에서 산술로 나오면** 계산한 것이다.
 *
 * ## 오탐이 낮은 이유
 * 대상은 이미 `findUnsourcedAmounts` 가 "인용 조문에 없다"고 걸러낸 금액뿐이다.
 * 조문에 있는 정상 값은 애초에 후보에 들어오지 않는다.
 *
 * ponytail(arithmetic/2항): 두 항 조합(합·차·곱)만 본다. 세 항 이상은 안 잡힌다 —
 * 상한은 그것이고, 업그레이드는 실제로 새는 사례가 나오면 항 수를 늘리는 것이다.
 */
export function findDerivedAmounts(answer: string, unsourced: readonly string[]): ArithmeticIssue[] {
  const inText = [...answer.matchAll(MONEY_TOKEN_RE)].map((m) => m[0].trim());
  const values = inText.map(toWon).filter((v): v is bigint => v !== null && v > 0n);
  const out: ArithmeticIssue[] = [];

  const lines = answer.split("\n");
  for (const target of new Set(unsourced)) {
    const t = toWon(target);
    if (t === null || t <= 0n) continue;
    // ★ **계산이라고 말하는 문장**의 금액만 본다. 안 그러면 금액이 많은 답에서
    //   우연한 조합이 잡혀 재생성만 늘고 품질은 안 오른다(SUM_CUE_RE 주석의 실측).
    if (!lines.some((l) => l.includes(target) && SUM_CUE_RE.test(l))) continue;
    for (let i = 0; i < values.length; i += 1) {
      for (let j = i + 1; j < values.length; j += 1) {
        const a = values[i];
        const b = values[j];
        if (a === undefined || b === undefined || a === t || b === t) continue;
        // 합·차·곱만. 나눗셈은 비율(`10%`)이 이미 곱으로 잡히므로 중복이다.
        const hit = a + b === t || (a > b ? a - b === t : b - a === t) || a * b === t;
        if (!hit) continue;
        const line = answer.split("\n").find((l) => l.includes(target)) ?? "";
        out.push({
          expression: `${target} (= 답 안의 다른 금액에서 유도됨)`,
          sentence: line.trim().slice(0, 90),
        });
        i = values.length; // 같은 값을 여러 조합으로 중복 보고하지 않는다
        break;
      }
    }
  }
  return out;
}
