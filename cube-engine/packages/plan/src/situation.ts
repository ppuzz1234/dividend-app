/**
 * 사용자 문장 → **상황 값** 추출. LLM 을 쓰지 않는다.
 *
 * ## 왜 결정론적인가
 * 추출한 값이 곧바로 계산에 들어간다. LLM 이 `"총급여 5천만원"` 을 `55000000` 으로 잘못 읽으면
 * **그 뒤 계산이 전부 틀리는데 아무도 모른다** — 계산 자체는 정확히 수행되므로 검증기가 안 잡는다.
 * 절대 규칙 3 이 "계산·판정 경로에 LLM 금지"라고 한 이유가 이것이고, **입력 추출도 그 경로**다.
 *
 * ## 왜 라벨→금액 순서로 찾지 않나
 * 처음엔 `"총급여" 뒤 25자 안의 금액` 으로 찾았는데 **한국어에서 깨졌다**(실측):
 *   `"연금저축에 600만원 넣으면"` — 금액이 라벨(`넣`)보다 **앞**에 온다.
 * 그래서 **금액을 먼저 다 찾고**, 그 주변 창(앞뒤 각 14자)에 어떤 낱말이 있는지로 자리를 정한다.
 * 조사·어순이 흔들려도 창 안에는 남는다.
 *
 * ## 못 읽으면 조용히 넘어가지 않는다
 * 규칙에 없는 표현은 **없는 것으로 둔다**(추측 금지). 그러면 계산기가 "무엇이 부족한지"를
 * 사용자에게 말한다. *잘못 읽는 것보다 못 읽는 것이 낫다 — 잘못 읽으면 아무도 모른다.*
 */

/** 상황 항목 하나 — 값과 **어느 표현에서 읽었는지**를 함께 들고 다닌다(사용자가 확인할 수 있게). */
export interface Extracted {
  readonly value: bigint;
  readonly asWritten: string;
}

export interface Situation {
  /** 총급여액 (원) */
  readonly grossSalary?: Extracted;
  /** 종합소득금액 (원) */
  readonly comprehensiveIncome?: Extracted;
  /** 연금계좌 납입액 (원) */
  readonly contribution?: Extracted;
  /** 나이 (세) */
  readonly age?: Extracted;
}

/** `5천만원` · `1,800만원` · `1억원` · `600만` → 원 단위 정수. */
export function toWon(digits: string, unit: string): bigint {
  const expanded = digits
    .replace(/,/g, "")
    .replace(/(\d+)천(\d+)백/g, (_, a: string, b: string) => String(Number(a) * 1000 + Number(b) * 100))
    .replace(/(\d+)천(\d+)/g, (_, a: string, b: string) => String(Number(a) * 1000 + Number(b)))
    .replace(/(\d+)천/g, (_, a: string) => String(Number(a) * 1000))
    .replace(/(\d+)백/g, (_, a: string) => String(Number(a) * 100));
  // 못 읽으면 0 이 아니라 **없는 것으로** 다뤄야 한다 — 호출부가 0n 을 걸러낸다.
  if (!/^\d+$/.test(expanded)) return 0n;
  const n = BigInt(expanded);
  if (unit.startsWith("억")) return n * 100000000n;
  if (unit.startsWith("만")) return n * 10000n;
  return n;
}

const MONEY_RE = /(\d[\d,]*(?:천\d*)?(?:백\d*)?)\s*(억원|만원|억|만|원)/g;

/** 금액 주변 창. 너무 넓으면 옆 문장의 낱말을 끌어온다. */
const WINDOW = 14;

/** 어떤 낱말이 창 안에 보이면 그 자리로 본다. 배열 순서가 곧 우선순위다. */
const SLOTS: readonly { key: keyof Situation; words: readonly string[] }[] = [
  // `월급` 도 여기 둔다 — 아래에서 **거절하기 위해서**다. 목록에 없으면 슬롯이 안 걸리고
  //   금액이 그대로 `contribution` 으로 흘러간다(실측: "월급 300만원인데 얼마 넣어야" 의
  //   300만원이 납입액으로 잡혔다). **거절하려면 먼저 잡아야 한다.**
  { key: "grossSalary", words: ["총급여", "연봉", "급여", "월급"] },
  { key: "comprehensiveIncome", words: ["종합소득", "사업소득", "소득금액"] },
  { key: "contribution", words: ["납입", "넣", "불입", "저축", "적립", "입금"] },
];

export function extractSituation(text: string): Situation {
  const out: { -readonly [K in keyof Situation]: Situation[K] } = {};

  for (const m of text.matchAll(MONEY_RE)) {
    const whole = m[0];
    const digits = m[1];
    const unit = m[2];
    if (digits === undefined || unit === undefined) continue;
    const value = toWon(digits, unit);
    if (value === 0n) continue;

    const at = m.index;
    const around = text.slice(Math.max(0, at - WINDOW), at + whole.length + WINDOW);

    for (const slot of SLOTS) {
      if (!slot.words.some((w) => around.includes(w))) continue;
      // ⚠️ 월급은 **연 환산이 필요한데 환산은 가정이다**(상여·비과세 포함 여부).
      //    지어내지 않고 아예 안 읽는다 — 그러면 계산기가 "총급여액이 필요합니다"라고 말한다.
      if (slot.key === "grossSalary" && /월급|월\s*소득/.test(around)) break;
      if (out[slot.key] !== undefined) break; // 같은 자리는 먼저 나온 것을 쓴다
      out[slot.key] = { value, asWritten: whole };
      break;
    }
  }

  // 나이는 단위가 붙어 명확하다. 다만 **뒤에 한글이 오면 전부 막으면 안 된다** —
  // `"62살인데"` 의 `인데` 는 정상 조사인데 막혔다(실측). 막아야 할 것은 `세액`·`세율` 처럼
  // `세` 가 **다른 낱말의 첫 글자**인 경우뿐이다.
  const age = /(\d{1,3})\s*(?:살|세(?![액율금목표]))/.exec(text);
  if (age !== null && age[1] !== undefined) out.age = { value: BigInt(age[1]), asWritten: age[0] };

  return out;
}
