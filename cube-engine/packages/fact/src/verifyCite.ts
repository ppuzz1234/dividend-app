/**
 * 인용 검증 — 답변의 `[n]` 이 **실제로 제공한 조문**을 가리키는지 확인한다.
 *
 * ## 왜 필요한가
 * Perplexity 류의 알려진 결함이 둘이다:
 *  ① 존재하지 않는 출처를 지어낸다 (hallucinated citation)
 *  ② 인용은 붙었는데 그 출처에 그 내용이 없다
 *
 * ①은 **우리 구조에서 기계적으로 막을 수 있다.** 컨텍스트가 닫힌 집합(묶음 N개)이라
 * `[n]` 의 n 이 1..N 밖이면 즉시 위조다. 웹 검색과 달리 출처 목록이 유한하다는 점이 유리하다.
 *
 * ②는 완전히는 못 막는다 — "이 문장이 저 조문에서 나왔나"는 의미 판단이다.
 * 대신 **원문 병기**로 사람이 즉시 대조할 수 있게 하고, 여기서는 ①과
 * "인용이 아예 없는 문장"만 잡는다.
 *
 * A1 의 `_name_in_text`("답변에 언급된 작가만 출처로 붙인다")와 같은 아이디어를 뒤집은 것 —
 * 거기선 출처를 답에 맞췄고, 여기선 답을 출처에 맞춘다.
 */

/** `[1]` `[2][3]` `[1, 2]` 를 모두 잡는다. */
const CITE_RE = /\[(\d+(?:\s*[,·]\s*\d+)*)\]/g;

/**
 * 인용 표기를 **표준형으로 되돌린다** — `[3②1]` → `[3]`, `[2③④]` → `[2]`.
 *
 * ## 왜 프롬프트가 아니라 파서인가
 * 규칙 2 에 "괄호 안에는 숫자만"이라고 명시했는데도 Haiku 는 항·호를 계속 덧붙였다(실측).
 * 그 결과 인용이 **하나도 인식되지 않아** 기대 조문 인용률이 8/8 → 6/8 로 떨어지고
 * 무인용 주장이 10건씩 잡혔다. 그런데 답 자체는 멀쩡했다 — 모델은 오히려 **더 정확히**
 * 가리키려 한 것이고, 우리 정규식이 그 형태를 몰랐을 뿐이다.
 *
 * 지시를 얼마나 따르는지는 모델마다 다르고 그건 통제할 수 없다. **표기 변형을 읽어 주는 건
 * 우리가 통제할 수 있다.** 표 헤더·번호 붙은 제목을 구조로 인정한 것과 같은 판단이다.
 *
 * ## 정보를 지어내지 않는다
 * 버리는 건 항·호 표시뿐이고 **조문 번호는 그대로 둔다.** 우리가 검증하는 단위가 조문이라
 * 잃는 정보가 없다. `[32]` 처럼 두 자리 번호는 숫자가 이어지므로 영향받지 않는다.
 */
export function normalizeCitations(text: string): string {
  // 여는 괄호 뒤 **숫자(와 구분자)로 시작**하는 것만 손댄다 — `[각 목]` 같은 건 건드리지 않는다.
  return text.replace(/\[(\d+(?:\s*[,·]\s*\d+)*)([^\]\d][^\]]*)?\]/g, (whole, nums: string, tail?: string) => {
    if (tail === undefined || tail.trim() === "") return whole;
    // ★ 꼬리가 **원문자(①②③)로 시작할 때만** 떼어낸다 — 그게 항 표기의 신호다.
    //   `②1`·`②1가` 처럼 뒤에 숫자·한글이 섞여도 항 표기이므로 함께 버린다.
    //   그 밖의 형태(`[1-2]`, `[3 주석]` 등)는 손대지 않는다 — 모르면 그대로 두는 쪽이 안전하다.
    return /^[①-⑳㉑-㉟]/.test(tail.trim()) ? `[${nums.replace(/\s/g, "")}]` : whole;
  });
}

export interface CiteIssue {
  readonly kind:
    /** 제공하지 않은 번호를 인용 — 위조 */
    | "UNKNOWN_REF"
    /** 사실을 주장하는데 인용이 없다 */
    | "UNCITED_CLAIM";
  readonly detail: string;
  /** 문제가 된 문장(앞부분) */
  readonly sentence: string;
}

export interface CiteReport {
  readonly issues: readonly CiteIssue[];
  /** 실제로 인용된 ref 번호 (오름차순) */
  readonly usedRefs: readonly number[];
  /** 제공했으나 인용되지 않은 ref — 묶음이 과했다는 신호(오류는 아님) */
  readonly unusedRefs: readonly number[];
}

/**
 * 빈 줄을 걸러낸 줄 목록. **들여쓰기 깊이를 함께 들고 다닌다.**
 *
 * 깊이가 필요한 이유: 하위 목록을 거느린 줄은 **도입부**이고 사실은 아래 항목에 있다.
 * 들여쓰기를 버리면 그 관계를 알 수 없어 도입부가 무인용 주장으로 잡힌다(실측).
 */
function lines(text: string): { text: string; indent: number }[] {
  return text
    .split(/\n+/)
    .map((l) => ({ text: l.trim(), indent: l.length - l.trimStart().length }))
    .filter((l) => l.text !== "");
}

/** 문장 분리. 한국어 종결어미 + 마침표 기준의 얕은 분리로 충분하다. */
function sentencesIn(line: string): string[] {
  return line
    .split(/(?<=[.。!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * 목록 항목인가 (`• …`, `- …`, `1. …`, `가. …`).
 *
 * ★ 목록 항목은 **한 덩어리**다. 모델은 항목 끝에 `[n]` 을 한 번 단다:
 *     `• 총급여액 5천만원 이하인 거주자. 단, 근로소득만 있는 경우로 한정한다[1]`
 * 그런데 문장 분리기가 가운데 마침표에서 쪼개면 앞쪽("…거주자.")이 무인용 주장으로 잡힌다(실측).
 * 그건 모델의 잘못이 아니라 **내 분리기의 부작용**이다. 그래서 목록 항목에 한해
 * 인용 범위를 줄 전체로 본다. 문단은 그대로 문장 단위로 검사한다 — 문단까지 줄 범위로 보면
 * 문장 다섯 개에 인용 하나만 달아도 통과해 검사가 실제로 약해진다.
 */
const LIST_ITEM_RE = /^(?:[•·▸▪◦*+-]|\(?\d+[.)]|[가-힣][.)])\s/;

/**
 * 마크다운 표의 **구분선**(`|---|---|`)과, 그 바로 위의 **헤더행**.
 *
 * ★ 헤더행은 주장이 아니라 **축 이름**이다. `| 구분 | 비과세 한도 | 적용 대상 |` 은
 *   `한도` 때문에 주장으로 잡혔지만(실측), 여기엔 확인할 사실이 없다 — 사실은 아래 칸에 있고
 *   그 행들은 각각 따로 검사된다. 콜론 도입부·`##` 제목을 뺀 것과 **같은 이유**다: 구조 표시.
 *   데이터 행은 계속 인용을 요구한다. 안 그러면 표 안에서 근거 없는 값이 통과한다.
 */
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;

/**
 * 사실 주장으로 보이는 문장인가 — 인용을 요구할 대상.
 *
 * 숫자·금액·비율·조건 표현이 있으면 사실 주장으로 본다. 인사말이나 안내 문구까지
 * 인용을 요구하면 소음이 되므로, **검증 가능한 내용이 있는 문장만** 대상으로 한다.
 */
function looksLikeClaim(s: string): boolean {
  if (s.length < 10) return false;
  // 목록 머리표·구분선 등은 제외
  if (/^[·\-*—▸▪◦\s]*$/.test(s)) return false;
  // ★ 콜론으로 끝나는 목록 도입부는 주장이 아니라 **연결어**다.
  //   "연간 납입한도에 포함되는 금액은 다음과 같습니다:" 는 `한도` 때문에 주장으로 잡히지만,
  //   실제 사실은 바로 아래 항목들에 있고 그 항목들은 각각 따로 검사된다.
  //   여기에 인용을 요구하면 LLM 이 콜론 뒤에 [n] 을 뿌리게 되는데, 그건 근거가 아니라 소음이다.
  //   (실측: 규칙 8·9 로 답 구조를 잡자 이런 도입부가 늘어 `인용 없는 주장` 이 0→4 로 뛰었다.)
  if (/[:：]\s*$/.test(s)) return false;
  // ★ 마크다운 제목도 마찬가지로 **구조 표시**다. (제목 판정은 줄 단위로 먼저 하지만,
  //   여기서도 남겨 둔다 — 문장 하나만 넣고 부르는 호출부가 있다.)
  if (/^#{1,6}\s/.test(s)) return false;
  // ★ "제공된 조문에서는 확인되지 않는다" 류는 **인용을 달면 안 되는** 문장이다(규칙 5).
  //   없다는 사실의 근거가 그 조문들일 수는 없기 때문이다. 그런데 `확인`·`경우` 같은 낱말 때문에
  //   주장으로 잡혀 **규칙을 지킨 답이 위반으로 세어졌다**(평가셋 실측 10건).
  //   검사기가 프롬프트 규칙과 어긋나면, 지표가 옳은 행동을 벌한다.
  //   `확정되지 않`·`특정하지 못` 도 같은 식구다 — 답이 스스로 "여기까지는 모르겠다"고 말하는 문장이다.
  if (/확인되지 않|확인할 수 없|나와 있지 않|포함되어 있지 않|찾을 수 없|확정되지 않|특정하지 못|특정할 수 없/.test(s)) {
    return false;
  }
  // ★ 규칙 0 이 시키는 **범위 밖 알림** 문장. `이 밖에 ○○·○○ 규정도 있어요` 는
  //   조문 내용을 주장하는 게 아니라 **안 다룬 주제의 이름을 대는 것**이다.
  //   여기에 인용을 요구하면, 프롬프트가 시킨 문장을 검사기가 위반으로 세게 된다(실측)
  //   — "확인되지 않는다" 류를 뺀 것과 정확히 같은 이유다.
  if (/^이 밖에.*(있어요|있습니다|있다)|필요하면 물어보|물어보시면/.test(s)) return false;
  return /\d/.test(s) || /이하|이상|초과|미만|경우|해당|한도|비율|세율|기간|요건/.test(s);
}

/**
 * 유효한 인용 번호 집합.
 *
 * 예전에는 "1..N" 이면 충분했다 — 묶음이 매번 1 부터 새로 번호를 매겼기 때문이다.
 * 그런데 **대화 안에서 번호를 고정**하면(`[1]` 이 3턴 뒤에도 같은 조문) 번호가 더 이상
 * 연속이 아니다. 앞 턴에서 쓴 [2] 가 이번 묶음에 없을 수 있다. 그래서 상한이 아니라
 * **집합**을 받는다. 숫자를 넘기면 예전처럼 1..N 으로 해석한다(기존 호출부 보존).
 */
function validSet(v: number | readonly number[]): Set<number> {
  if (typeof v === "number") {
    if (!Number.isInteger(v) || v < 0) throw new Error(`maxRef 가 음이 아닌 정수여야 한다: ${v}`);
    return new Set(Array.from({ length: v }, (_, i) => i + 1));
  }
  return new Set(v);
}

export function verifyCitations(answer: string, refs: number | readonly number[]): CiteReport {
  const valid = validSet(refs);

  const issues: CiteIssue[] = [];
  const used = new Set<number>();

  const all = lines(answer);
  for (let i = 0; i < all.length; i += 1) {
    const cur = all[i];
    if (cur === undefined) continue;
    const line = cur.text;
    // 구분선 자체와, 구분선이 바로 뒤따르는 헤더행은 **구조**다 — 건너뛴다.
    if (TABLE_SEP_RE.test(line)) continue;
    if (TABLE_SEP_RE.test(all[i + 1]?.text ?? "") && line.includes("|")) continue;
    // ★ 제목도 **줄 단위로** 걸러야 한다. `## 1. 비과세 한도금액` 을 문장으로 쪼개면
    //   `1.` 뒤에서 갈라져 뒷조각이 `##` 를 잃고 주장으로 잡힌다(실측 4건).
    //   목록 항목을 줄 단위로 본 것과 **같은 부작용, 같은 처방**이다.
    if (/^#{1,6}\s/.test(line)) continue;
    // ★ 하위 목록을 거느린 줄은 **도입부**다. 사실은 아래 항목들에 있고 각각 따로 검사된다.
    //   실측: `- **400만원**: 아래 셋 중 하나에 해당하면 이 한도예요.` 가 무인용으로 잡혔는데,
    //   바로 아래 세 항목에는 [1] 이 각각 붙어 있었다. 콜론이 줄 **끝**이 아니라 중간에 있어
    //   기존 도입부 규칙에 안 걸린 것 — 판정 근거를 문장부호가 아니라 **구조**로 옮긴다.
    const next = all[i + 1];
    if (next !== undefined && next.indent > cur.indent && LIST_ITEM_RE.test(next.text)) continue;
    // 목록 항목이면 줄 전체가 한 단위 — 문장으로 쪼개지 않는다.
    const units = LIST_ITEM_RE.test(line) ? [line] : sentencesIn(line);
    for (const s of units) {
    CITE_RE.lastIndex = 0;
    const refsInSentence: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = CITE_RE.exec(s)) !== null) {
      for (const part of (m[1] ?? "").split(/[,·]/)) {
        const n = Number(part.trim());
        if (!Number.isInteger(n)) continue;
        refsInSentence.push(n);
        if (!valid.has(n)) {
          issues.push({
            kind: "UNKNOWN_REF",
            detail: `[${n}] 은 이번에 제공하지 않은 출처다 (유효: ${[...valid].sort((a, b) => a - b).join(", ") || "없음"})`,
            sentence: s.slice(0, 80),
          });
        } else {
          used.add(n);
        }
      }
    }
    if (refsInSentence.length === 0 && looksLikeClaim(s)) {
      issues.push({
        kind: "UNCITED_CLAIM",
        detail: "사실을 주장하는데 근거 조문 인용이 없다",
        sentence: s.slice(0, 80),
      });
    }
    }
  }

  const usedRefs = [...used].sort((a, b) => a - b);
  const unusedRefs = [...valid].filter((n) => !used.has(n)).sort((a, b) => a - b);
  return { issues, usedRefs, unusedRefs };
}

/** 위조 인용이 하나라도 있으면 그 답변은 내보내면 안 된다. */
export function hasForgedCitation(report: CiteReport): boolean {
  return report.issues.some((i) => i.kind === "UNKNOWN_REF");
}
