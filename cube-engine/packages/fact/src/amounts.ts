/**
 * 금액 표기 정규화 + **답변의 금액이 조문에 실제로 있는지** 대조.
 *
 * ## 왜 필요한가 — 형식 검사를 다 통과한 답이 숫자를 지어냈다
 * 실측(2026-08-03, 유형별 평가셋 #6):
 *
 * > 소득이 낮은 50세 이상 거주자에게 더 높은 한도(**연금저축 900만원, 합계 1,200만원**)를
 * > 인정하던 규정이 있었으나[2]…
 *
 * 원문 `TAXEX_86_4` 는 **600만원 / 900만원**(고소득자 300/700)이다. `1,200만원` 은 어디에도 없다.
 * 그런데 그 답변은 **위조 인용 0 · 조건 앵커 75% · 금지 문구 0 · 내보내기 가능**이었고
 * 적용기한까지 정확히 밝혔다. **모든 자동 검사를 통과하고 값만 틀린 것이다.**
 *
 * 원인은 추론이다: `§86의4` 가 "§59의3 제1항 단서에도 **불구하고**" 로 시작하는 **상향 특례**라
 * 모델이 *"상향이면 현행 600/900 보다 크겠지"* 하고 숫자를 만들었다. **읽는 대신 추론한 것.**
 *
 * ## 무엇을 하고 무엇을 안 하나
 * - ✅ 답변의 금액을 뽑아 **인용 조문 원문에 그 값이 있는지** 본다.
 * - ❌ "그러니 틀렸다"고 **판정하지 않는다.** 규칙 10 은 예시용 가정 금액을 허용하고
 *      (`"총급여 4,500만원인 근로자라면"`), 그건 조문에 없는 게 정상이다.
 *      그래서 결과는 **경고**이고, 화면에 문장째 드러내 사람이 판정한다 — 이 프로젝트의 규율 그대로.
 *
 * ponytail: 계산으로 유도된 값(`600 + 300`)은 못 잡는다. 상한은 "원문에 문자열로 있는가"이고,
 * 업그레이드 경로는 없다 — 그 이상은 세법 계산이라 §1.1 상 RAG 가 할 일이 아니다.
 */

/**
 * 한글 수사를 아라비아로 편다. `1천800` → `1800`, `5천` → `5000`, `3천8백` → `3800`.
 * (`packdraft/diffTable.ts` 에 있던 것을 여기로 올려 **한 벌만 유지**한다.)
 */
export function expandKoreanNumerals(s: string): string {
  return s
    .replace(/(\d+)천(\d+)백/g, (_, a: string, b: string) => String(Number(a) * 1000 + Number(b) * 100))
    .replace(/(\d+)천(\d+)/g, (_, a: string, b: string) => String(Number(a) * 1000 + Number(b)))
    .replace(/(\d+)천/g, (_, a: string) => String(Number(a) * 1000))
    .replace(/(\d+)백/g, (_, a: string) => String(Number(a) * 100));
}

/** 공백·쉼표를 지우고 한글 수사를 펴서 비교 가능한 형태로. */
export function squashAmounts(s: string): string {
  return expandKoreanNumerals(s.replace(/[\s,]/g, ""));
}

/** 답변에 등장한 금액 표기 (`1천800만원` · `1,200만원` · `1억원`). 조문번호는 걸리지 않는다. */
const AMOUNT_RE = /(?<!제\s?)(\d[\d,]*(?:천\d*)?(?:백\d*)?)\s*(억원|만원|억|만)/g;

export interface AmountIssue {
  /** 답변에 쓰인 표기 그대로 */
  readonly asWritten: string;
  /** 정규화된 비교 형태 */
  readonly normalized: string;
  /** 그 금액이 나온 문장(앞부분) */
  readonly sentence: string;
  /**
   * `예를 들어 …` 처럼 **가정임을 밝힌 문장**의 금액인가.
   *
   * 규칙 10 이 가정 상황의 수치를 허용하고(`총급여 4,500만원인 근로자라면`),
   * 규칙 7 이 예시를 권장하므로 이런 금액은 **정상 출력**이다. 그런데 뭉뚱그려 세면
   * 매 답변마다 "미확인 금액 2건" 이 떠서 **경고가 늑대소년이 된다**(실측 피드백).
   * 탐지는 그대로 두고 **표시를 가른다** — 진짜 위험은 법정 값을 지어내는 쪽이다.
   */
  readonly assumed: boolean;
}

/** 가정임을 밝히는 표현. 이게 있으면 그 문장의 금액은 조문 값이 아니라 예시다. */
const ASSUMPTION_RE = /예를 들어|예컨대|가령|라면|이라면/;

/**
 * 답변의 금액 중 **인용 조문 어디에도 없는 것**을 찾는다.
 *
 * `sourceTexts` 는 답이 실제로 인용한 조문의 원문이다. 인용하지 않은 조문까지 넣으면
 * "묶음에 있으니 근거가 있다"가 되어 검사가 헐거워진다 — **답이 가리킨 것만** 본다.
 */
export function findUnsourcedAmounts(answer: string, sourceTexts: readonly string[]): AmountIssue[] {
  const haystack = sourceTexts.map(squashAmounts).join("\n");
  const out: AmountIssue[] = [];
  const seen = new Set<string>();

  for (const line of answer.split(/\n+/)) {
    for (const m of line.matchAll(AMOUNT_RE)) {
      const asWritten = m[0];
      const norm = squashAmounts(asWritten);
      if (seen.has(norm)) continue;
      // `1,200만원` 이 원문에 `1200만원` 으로 있을 수 있으므로 정규화 후 비교한다.
      // 단위까지 붙여 봐야 한다 — `900` 만 보면 `900원`·`900명` 에도 걸린다.
      if (haystack.includes(norm)) continue;
      seen.add(norm);
      out.push({
        asWritten,
        normalized: norm,
        sentence: line.trim().slice(0, 90),
        assumed: ASSUMPTION_RE.test(line),
      });
    }
  }
  return out;
}
