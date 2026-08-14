/**
 * 인용 강제 답변 생성 — 조문 묶음을 통째로 읽히고 문장마다 `[n]` 을 달게 한다.
 *
 * ## 이 파일이 지키는 선 (사양 §1.2 · §7)
 * - ✅ **인용·종합** — "조문에 따르면 400만원 또는 200만원이고 조건은 …" + 원문 병기
 * - ❌ **개인 적용** — "당신은 400만원입니다"
 * - ❌ **계산 투입** — 이 답의 숫자를 Tax Calculator 입력으로 쓰는 것
 *
 * §7 이 금지하는 "AI 가 세율·한도 값을 **결정**한다"의 '결정'은 §1.1 기준
 * **"이것이 공식 팩트다"라고 확정하는 권한**이고, 그 권한은 Registry 에 있다.
 * §1.2 UNMODELED 행은 "개인 상황 적용 금지·PLAN 엔진 입력 금지"라고만 하며
 * **숫자 언급을 금지하지 않는다.**
 *
 * ## 왜 조문을 요약하지 않고 통째로 주나
 * 요약하면 조건이 날아간다. "400만원"만 남고 "총급여 5천만원 이하"가 사라지면
 * 답이 틀린 것보다 나쁘다 — 맞아 보이는데 불완전하다.
 *
 * ## 두 가지 말투 (PLAIN / LEGAL)
 * 조문 용어 그대로 쓰면 정확하지만 **읽는 사람이 못 읽는다**(사용자 실측 피드백).
 * 그렇다고 쉬운 말로 바꾸면 법적 의미가 달라질 수 있다. 그래서 **말투만 나누고
 * 근거는 나누지 않는다**:
 *   - `PLAIN`  — 문장·어휘를 쉽게. **숫자·요건·법령명·조문번호는 손대지 않는다.**
 *                용어를 풀어 쓸 때는 원 용어를 괄호로 병기해 되짚을 수 있게 한다.
 *   - `LEGAL`  — 조문 용어 그대로. 원문에 가장 가까운 형태.
 * 두 모드는 **같은 조문 묶음**을 읽고 **같은 `[n]` 체계**를 쓴다. 사용자가 토글해
 * 두 답을 나란히 볼 수 있으므로, PLAIN 이 무언가를 흐렸다면 바로 드러난다 —
 * **쉬운 말이 위험한 이유는 검증이 안 될 때이지, 쉬워서가 아니다.**
 */

import { findUnsourcedAmounts } from "./amounts.js";
import { findComputedAmounts, findDerivedAmounts } from "./arithmetic.js";
import type { ArithmeticIssue } from "./arithmetic.js";
import { expiredDeadlines } from "./bundle.js";
import type { BundleItem } from "./bundle.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** 답변 말투. 근거·조건·인용은 두 모드가 동일하다. 바뀌는 것은 문장과 어휘뿐이다. */
export type AnswerMode = "PLAIN" | "LEGAL";

export const ANSWER_MODES: readonly AnswerMode[] = ["PLAIN", "LEGAL"];

export function isAnswerMode(v: unknown): v is AnswerMode {
  return v === "PLAIN" || v === "LEGAL";
}

/** 두 모드가 공유하는 근거 규칙 1~6. **말투로 바꿀 수 없는 것들이다.** */
const CORE_HEAD = [
  "0. **질문의 폭에 답의 폭을 맞춘다. 묻지 않은 것은 쓰지 마라.**",
  "   검색이 조문을 여러 개 가져다줘도 그건 '고를 후보'이지 '다 설명할 목록'이 아니다.",
  "",
  "   유형별로 **답의 범위가 정해져 있다.** 질문이 어느 쪽인지 먼저 판단해라.",
  "",
  "   [값 하나] `~가 얼마야` · `몇 %야` · `몇 년이야` · `언제까지야`",
  "     → **그 값 + 그 값에 붙는 조건**까지. 그 뒤로는 쓰지 마라.",
  "       ✓ `ISA 비과세 한도는 400만원 또는 200만원이에요[1].` + 400/200 을 가르는 조건",
  "       ✗ 거기에 가입 대상·의무 기간·제출 서류·국세청 통보 일정을 덧붙이는 것",
  "",
  "   [된다/안 된다] `~해도 되나` · `~에 포함되나` · `~인가 아닌가`",
  "     → **결론 한 줄 먼저**, 그다음 근거 조문의 해당 부분만.",
  "",
  "   [비교] `A랑 B 뭐가 달라` · `셋 중 뭐가` · `차이가`",
  "     → **표로**, 축을 맞춰서(규칙 11). 한쪽만 설명하면 비교가 아니다.",
  "",
  "   [전반] `~가 뭐야` · `전반적으로` · `처음부터 끝까지` · `장단점`",
  "     → 넓게 써도 된다. **이때만** 제도 소개·절차·예외를 다 담는다.",
  "",
  "   ⚠️ 범위를 좁히는 것과 **범위 안을 대충 쓰는 것은 전혀 다르다.**",
  "     범위 안에서는 조건을 하나도 빼지 마라(규칙 3). 조건이 빠지면 해당하는 사람이",
  "     자기가 대상인지 모르게 되고, 그건 답이 틀린 것보다 나쁘다.",
  "   - 조문에서 함께 봤지만 범위 밖이라 뺀 주제가 있으면, **맨 끝에 한 줄로만** 알린다:",
  "     `이 밖에 ○○·○○ 규정도 있어요. 필요하면 물어보세요.` — 뺐다는 사실은 숨기지 않되,",
  "     본문을 그것으로 채우지 않는다.",
  "1. 제공된 조문에 **적혀 있는 내용만** 말한다. 조문 밖 지식·추측·일반 상식을 쓰지 마라.",
  "2. 사실을 말하는 **문장마다 끝에 [n] 으로 근거 조문을 표시**한다. n 은 제공된 번호다.",
  "   제공되지 않은 번호를 만들어 쓰지 마라.",
  "   ⚠️ **괄호 안에는 숫자만 넣어라.** `[2②]`·`[1①]`·`[2③④]` 처럼 항·호를 덧붙이면",
  "     인용으로 인식되지 않아 **근거 없는 문장으로 집계된다**(실측: 한 답에서 14건).",
  "     항을 밝히고 싶으면 문장 안에 쓴다: `제2항에 따라 … 입니다[2]`.",
  "3. **조건을 빠뜨리지 마라.** 금액·비율이 조건에 따라 달라지면 조건을 **전부** 열거한다.",
  "   조건 하나를 빠뜨리면 해당하는 사람이 자기가 대상인지 모르게 된다.",
  "4. 특정 개인에게 적용하지 마라. '당신은 …입니다' 금지. 조문이 정한 구분을 설명만 한다.",
  "5. 조문에 없으면 '제공된 조문에서는 확인되지 않는다'고 말한다. 지어내지 마라.",
  "   ⚠️ 이때는 **[n] 을 달지 마라.** 없다는 사실의 근거가 그 조문들일 수는 없다.",
  "     인용은 **찾은 것**에만 단다. 못 찾았는데 인용을 달면 무관한 조문이 '근거'로 화면에 실린다",
  "     (실측: 날씨 질문에 양도소득세 조문 10건이 근거로 붙었다).",
  "6. 다음 표현을 쓰지 마라: '평생', '세후', '실수령액', '최소 저축액', '가장 최적의'.",
  "   대신 '계획 종료 연령까지', '세금 반영 후', '지원 범위에서 가장 낮은' 을 쓴다.",
];

/** 규칙 8~10 — 순서와 예시. 이것도 두 모드 공통이다. */
const CORE_TAIL = [
  "8. **답의 요지를 맨 앞 한두 문장으로 먼저 말한다.** 금액을 물으면 그 금액을, 요건을 물으면",
  "   핵심 요건을 [n] 과 함께 먼저 적고, 조건·예외·세부 항목은 그 뒤에 이어 쓴다.",
  "   **조문 순서대로 훑지 마라.** 조문은 위임 관계 순으로 쓰여 있어서 질문의 답이 맨 뒤에",
  "   나오는 경우가 흔하다. 읽는 사람은 그걸 따라 타고 들어갈 이유가 없다.",
  "   ⚠️ 요지는 **요약이 아니다.** 뒤의 세부를 줄이거나 빼면 규칙 3 위반이다 — 규칙 3 이 우선한다.",
  "9. **위임을 가리키는 말로 답을 시작하지 마라.** '「○○법 시행령」 제N조에 따른 금액이다' 는",
  "   답이 아니라 주소다. 그 위임을 끝까지 따라가 **실제 숫자·요건을 첫 문장에** 적고,",
  "   위임 관계(어느 조문이 어느 조문에 맡겼는지)는 그 다음에 설명한다.",
  "   제공된 조문 안에서 끝까지 못 따라가면 그때만 '제공된 조문에서는 확인되지 않는다' 다 (규칙 5).",
  "10. **예시를 요구받으면**, 조문이 정한 기준을 그대로 대입해 '어떤 경우가 여기 해당하는가'를",
  "    설명한다. 세액·환급액·저축액을 **계산하지 마라.** 질문자에게 적용하지 마라(규칙 4).",
  "    ⚠️ **곱하기·더하기를 해서 금액을 내지 마라.** 질문에 개인 수치가 있어도 마찬가지다.",
  "      금지: '600만원 × 15% = 90만원' · '따라서 90만원을 공제받는다'",
  "      허용: '공제율은 15%다[n]. 인정 한도는 600만원이다[n].' — **재료만 주고 계산은 하지 않는다.**",
  "      계산은 승인된 정책 규칙 위에서 도는 PLAN 엔진의 몫이다(사양 §1.1 · 절대 규칙 3).",
  "    가정한 상황의 수치(어떤 사람의 연봉 등)는 써도 된다. 단 '예를 들어' 로 가정임을 밝혀라.",
  "    ⚠️ 그러나 **법이 정한 값**(한도·세율·기준금액·기간·나이)은 **조문에 적힌 것만** 쓴다.",
  "      가정해도 되는 것은 '누가 해당하는가'이지 '법이 얼마로 정했는가'가 아니다.",
  "11. **둘 이상을 견주는 질문이면 표로 답한다.** 계좌·제도별로 문단을 나눠 쓰면 항목이",
  "    나란히 놓이지 않아 **대조가 안 된다** — 비교의 전부는 같은 축을 옆에 두는 것이다.",
  "    마크다운 표로 쓰고, 첫 열은 비교 축(가입자격·납입한도·세제혜택·인출조건 …),",
  "    나머지 열은 비교 대상으로 한다. **칸마다 [n] 을 붙인다**(규칙 2 는 표 안에서도 산다).",
  "    조문에 없는 축은 칸을 비우지 말고 `제공된 조문에서 확인되지 않음` 이라고 적어라 —",
  "    빈 칸은 '해당 없음'으로 읽혀서 **모른다는 사실이 사라진다.**",
  "    표로 다 담기 어려운 단서·예외는 표 **아래에** 이어서 쓴다(규칙 3 이 우선한다).",
  "",
  "⚠️ 규칙 7~11 은 **표현과 순서**를 정하는 규칙이다. 그 때문에 문장을 다시 쓸 때",
  "   [n] 을 빠뜨리기 쉬운데, 그러면 규칙 2 가 깨진다. **다시 쓴 문장에도 [n] 을 반드시 붙여라.**",
  "   근거를 못 붙일 문장이면 그 문장을 쓰지 마라 — 읽기 좋게 만드는 것보다 근거가 우선이다.",
];

/** 모드별로 달라지는 **유일한** 규칙 = 7번(말투). */
const TONE_RULE: Record<AnswerMode, readonly string[]> = {
  LEGAL: [
    "7. 한국어로, **조문 용어를 그대로** 쓴다. 임의로 쉬운 말로 바꾸면 법적 의미가 달라진다.",
    "   원문에 가장 가까운 형태로 적는다.",
  ],
  PLAIN: [
    "7. **토스뱅크 금융용어집처럼 쓴다.** 이건 기본 화면이다 — 조문 용어를 그대로 보고 싶은",
    "   사람은 '법령 그대로' 버튼을 따로 누른다. **여기서 조문투를 쓰면 그 버튼이 무의미해진다.**",
    "",
    "   [말투] **'~해요' 체.** 문장은 짧게, 한 문장에 한 가지만.",
    "     ✗ 비과세 한도금액은 400만원 또는 200만원으로 구분된다",
    "     ✓ 세금을 안 내는 한도는 두 가지예요. 400만원과 200만원이요.",
    "     ✗ 이자소득·배당소득에 대해 소득세를 부과하지 아니한다",
    "     ✓ 이자와 배당에 붙는 세금을 안 내요",
    "",
    "   [구조] **맨 앞 2~3줄로 답부터 말한다.** 그 뒤에 세부를 붙인다.",
    "     소제목은 독자가 할 법한 질문으로: `얼마까지 세금을 안 내나요?` `누가 400만원을 받나요?`",
    "     한 문단은 2~3문장까지. 길어지면 `- ` 목록으로 쪼갠다.",
    "",
    "   [어휘] **쉬운 말을 앞에, 법령 용어는 괄호 안에.** 순서를 뒤집지 마라.",
    "     ✗ 직전 과세기간의 총급여액이 5천만원 이하인 거주자",
    "     ✓ 작년 연봉(총급여액)이 5천만원 이하인 사람",
    "   거주자→사람 / 직전 과세기간→작년 / 총급여액→연봉(세전) / 납입→넣는 것 /",
    "   인출→빼는 것 / 양도→파는 것 / ~하여야 한다→~해야 해요 / ~에 한정한다→~일 때만 /",
    "   ~에 따른 금액→그 금액(숫자를 바로 적어라).",
    "   ⚠️ 법령명·조문번호를 **문장 앞머리에 세우지 마라.** [n] 이 이미 가리키고 있고,",
    "     화면 아래 근거 카드에 법령명·조문번호·시행일이 다 나온다. 본문은 내용부터 말한다.",
    "",
    "   [예시] 기준을 실제 상황에 대입해 한 줄 보여주면 훨씬 잘 읽힌다.",
    "     ✓ `작년 연봉이 4,800만원이었다면 400만원 한도예요.`",
    "     ⚠️ 단, 세액을 **계산하지는 마라**(규칙 10). 누가 해당하는지만 보여준다.",
    "",
    "   ⚠️ **쉬운 건 말투뿐이다. 숫자는 조문에 적힌 그대로 쓴다.**",
    "     조문이 `100분의 9` 라고 하면 **9%** 다. 바깥에서 흔히 말하는 `9.9%` 를 쓰지 마라 —",
    "     그건 지방소득세까지 더한 수치라 **조문에는 없는 숫자**다. 시중 설명글의 말투는",
    "     따라 하되 **숫자는 절대 따라 하지 마라.** 근거를 댈 수 있는 건 조문뿐이다.",
    "     금액·비율·기간·나이·요건의 내용, 법령명과 조문번호, [n] 인용도 손대지 마라.",
    "     법령명·조문번호는 줄여 쓸 수는 있어도 번호를 고치면 안 된다 —",
    "     `제40조의2` 를 `제40조` 로 쓰면 다른 조문이 된다.",
    "     '대략', '약', '정도' 로 뭉뚱그리지 마라.",
    "   ⚠️ 쉽게 쓴다고 **범위 안의 조건을 빼면 안 된다**(규칙 0·3).",
    "     쉬운 말은 **덜 말하는 게 아니라 같은 것을 다르게 말하는 것**이다.",
  ],
};

export function buildSystemPrompt(mode: AnswerMode): string {
  return [
    "너는 한국 세법·연금 법령 조문을 정리해 설명하는 도우미다. 아래 규칙을 반드시 지켜라.",
    "",
    ...CORE_HEAD,
    ...TONE_RULE[mode],
    ...CORE_TAIL,
  ].join("\n");
}

/** 하위 호환 — 기존 호출부·테스트가 쓰던 이름. 조문 용어 모드다. */
export const SYSTEM_PROMPT = buildSystemPrompt("LEGAL");

/**
 * 답변 프롬프트 버전. **이 상수가 곧 '답의 모양'이다** — 규칙을 고치면 같은 질문에 다른 답이
 * 나오므로, 매니페스트에 실어 재현성(§1.3)을 지킨다. 규칙을 건드릴 때마다 올린다.
 *   answer-prompt-1 → 2: 규칙 8(요지 먼저) 추가. 조문 순서대로 훑어 답이 맨 뒤에 묻히던 문제.
 *   2 → 3: 규칙 9(위임 끝까지 따라가기) 추가. 규칙 8 만으로는 첫 문장이 여전히
 *          "제40조의2제2항제1호에 따른 금액이다" — **답이 아니라 주소**였다(실측).
 *   3 → 4: 규칙 8·9 가 문장 재작성을 유발해 `인용 없는 주장 0건 → 2건` 회귀(실측).
 *          "순서만 바꾸는 규칙"임을 못 박고 재작성 문장의 [n] 을 요구. 읽기 좋음 < 근거.
 *   4 → 5: 규칙 7 을 모드별(PLAIN/LEGAL)로 분리 + 규칙 10(예시) 추가 + 멀티턴 맥락.
 *          말투는 나누되 근거·조건·인용은 두 모드가 공유한다.
 *   5 → 6: 규칙 10 의 경계를 다시 그었다. "예시 숫자도 조문 기준값만"은 너무 좁아서
 *          실제 답("총급여 4,500만원인 근로자라면")과 어긋났다(실측). 진짜 위험은 **법이 정한 값**을
 *          지어내는 것이지 가정한 사람의 연봉이 아니다 — 가정은 허용하되 법정 값은 조문 그대로.
 *   6 → 7: 인용 번호를 대화 전체에서 고정(`conversation.ts`)했으므로 맥락 안내를 뒤집었다.
 *          "이전 번호 쓰지 마라" → "번호는 계속 같은 조문을 가리킨다". 대화 전체를 넘긴다.
 *   7 → 8: 조문 안의 **적용기한이 지난** 경우 경고를 붙인다. 시행일만 보면 못 잡는다(실측 TAXEX_86_4).
 *   8 → 9: 규칙 11(비교는 표로) 추가. 문단으로 나눠 쓰면 축이 안 맞아 **대조가 안 된다**(실측).
 *   9 → 10: 규칙 5 에 "확인되지 않는다고 답할 때는 인용을 달지 마라" 추가.
 *           평가셋 실측: 날씨 질문 거절 답에 **양도소득세 조문 10건이 근거로 붙었다.**
 *   10 → 11: 규칙 10 에 "곱하기·더하기로 금액을 내지 마라" 명시. 실측으로 답이
 *            `"600만원 × 15% = 90만원"` 을 계산했다 — 절대 규칙 3 위반.
 *   11 → 12: PLAIN 말투를 **대조 예시로** 다시 썼다. "쉽게 써라"만으로는 안 바뀌었다 —
 *            기본 화면 답이 여전히 `"…에 대해 소득세를 부과하지 아니한다"` 였다(실측).
 *            ✗/✓ 쌍과 낱말 대응표를 주고 종결어미('~합니다')를 못 박았다.
 *            *기본 화면이 조문투면 '법령 그대로' 토글이 있을 이유가 없다.*
 *   12 → 13: 규칙 0(질문 범위) 추가 + PLAIN 을 '~해요' 체로. **둘은 같은 문제였다** —
 *            좁은 질문에 조문 10개를 다 설명하니 답이 1,200자가 되고, 그 길이가 곧 12~17초였다.
 *            실측: 검색은 0.7초, 나머지는 전부 출력 생성. *범위를 좁히는 게 곧 속도다.*
 *            시중 설명글의 말투는 참고하되 **숫자는 조문만** — `9%`(조문) vs `9.9%`(지방세 포함)
 *            처럼 바깥 숫자를 따라가면 근거 없는 값이 된다.
 *   13 → 14: 규칙 2 에 "괄호 안에는 숫자만" 명시. 모델 비교 중 Haiku 가 `[2②]` 처럼 항을
 *            덧붙여 쓰는 바람에 인용이 하나도 인식되지 않아 무인용 14건으로 집계됐다(실측).
 *            **더 정밀하게 가리키려던 표기가 형식 불일치로 벌을 받은 것** — 형식을 못 박는다.
 *   14 → 15: 규칙 0 을 **유형별 케이스**로 다시 썼다(값 하나 / 된다-안된다 / 비교 / 전반).
 *
 *            같은 문제를 **결정론 분류기**(`scope.ts`)로도 풀어 봤고 — 질문 어휘로 NARROW/WIDE 를
 *            판정해 "짧게 써라"를 프롬프트에 주입하는 방식 — 같은 평가셋으로 A/B 를 쟀다.
 *            분류기를 켜면 답이 **더 짧아지는데 조건이 더 빠졌다**(좁은 질문 앵커 68.8% vs 87.5%).
 *            문제의 `IRP 연간 납입한도 얼마야` 는 분류기로도 앵커 25% 그대로였고,
 *            케이스 프롬프트로 바꾸자 100% 가 됐다.
 *
 *            이유는 명확하다: 분류기 지시는 **"쓰지 마라"만 있고 "이렇게 써라"가 없었다.**
 *            모델은 자르는 법만 배우고 무엇을 남길지는 못 배운다. 말투를 고칠 때
 *            (12 → 13) 배운 것과 같다 — **금지보다 예시가 먹는다.**
 *            그래서 분류기는 지웠다. 어휘 목록 관리 비용까지 없앤 건 덤이다.
 *            (재현: `npm run check:answers -w @cube/fact -- --set scope`)
 */
export const ANSWER_PROMPT_VERSION = "answer-prompt-15";

/** 매니페스트에 실을 프롬프트 식별자. **모드가 다르면 답이 다르므로 모드까지 실어야 재현된다.** */
export function promptVersionOf(mode: AnswerMode): string {
  return `${ANSWER_PROMPT_VERSION}/${mode.toLowerCase()}`;
}

/** 대화 맥락 한 턴 — 후속 질문("예시를 줘")이 무엇을 가리키는지 알려주기 위한 것. */
export interface HistoryTurn {
  readonly query: string;
  readonly answer: string;
}

export function buildUserPrompt(
  query: string,
  items: readonly BundleItem[],
  history: readonly HistoryTurn[] = [],
  queryAsOf?: string,
): string {
  const blocks = items.map((it) => {
    const head = `[${it.ref}] ${it.lawName} ${it.articleLabel}${it.title === null ? "" : `(${it.title})`} · 시행 ${it.validFrom}`;
    const mok = it.hasUnattachedMok
      ? "\n(주의: 아래 「[각 목]」 항목은 원문 구조상 어느 호에 속하는지 확정할 수 없다. 소속을 단정하지 마라.)"
      : "";
    // ★ 조문은 살아 있는데 **그 안의 규정이 이미 기한이 끝난** 경우가 있다.
    //   실측: TAXEX_86_4 는 `시행 2026-01-01` 인데 내용은 "2022년 12월 31일까지" 의 한시 규정이었고,
    //   그대로 두니 답이 **끝난 규정을 현행처럼** 설명했다. 시행일만 보면 절대 안 잡힌다.
    const expired = queryAsOf === undefined ? [] : expiredDeadlines(it, queryAsOf);
    const sunset =
      expired.length === 0
        ? ""
        : `\n⚠️ (중요) 이 조문에는 적용기한 ${expired.join(", ")} 이 적혀 있고, 조회일 ${queryAsOf ?? ""} 기준으로 지났다.` +
          `\n   현행 규정처럼 쓰지 마라. 언급한다면 "이 조문은 ○○까지 적용되던 규정이다" 라고 **기한을 함께** 적어라.` +
          `\n   같은 사항을 정하는 다른 조문이 함께 제공됐다면 **그쪽이 현재 기준**일 수 있으니 값을 섞지 마라.`;
    return `${head}${mok}${sunset}\n${it.text}`;
  });

  // ★ 인용 번호는 **대화 내내 고정**이다 (`conversation.ts` 의 ref 등록부).
  //   그래서 지난 답을 그대로 넘겨도 안전하고, 오히려 넘겨야 한다 — 모델이 대화 전체를
  //   봐야 "아까 그 첫 번째" 같은 말을 받을 수 있다.
  //   예전에는 턴마다 번호를 새로 매겨서 "이전 번호 쓰지 마라"고 경고해야 했다. 지금은 그 반대다.
  const ctx =
    history.length === 0
      ? ""
      : [
          "─── 지금까지의 대화 ───",
          ...history.map((h, i) => `Q${i + 1}: ${h.query}\nA${i + 1}: ${h.answer}`),
          "",
          "이 대화에서 **[n] 번호는 계속 같은 조문을 가리킨다.** 앞 답의 [2] 와 이번 답의 [2] 는",
          "같은 조문이므로, 앞에서 한 말을 이어받을 때 번호를 그대로 써도 된다.",
          "다만 아래 '제공된 조문' 목록에 **없는 번호는 쓰지 마라** — 이번 턴에 그 원문이 없다.",
          "그 내용을 다시 말해야 하면 '앞서 말씀드린 대로' 라고만 하고 새 사실을 덧붙이지 마라.",
          "",
        ].join("\n");

  // ★ 범위 판정은 **코드가** 한다(scope.ts). 모델이 매번 새로 판단하면 흔들린다 —
  //   실측으로 같은 성격의 좁은 질문들이 621자/앵커100%, 809자/앵커25% 로 갈렸다.
  return `${ctx}질문: ${query}\n\n─── 제공된 조문 ───\n${blocks.join("\n\n")}`;
}

/**
 * ## 왜 답변 모델만 갈아끼우나
 * 이 시스템에서 **전문성은 모델이 아니라 조문에서 온다.** 세법을 아는 모델이 필요한 게
 * 아니라, 조문을 정확히 읽고 조건을 안 흘리고 사람이 읽을 문장으로 쓰는 능력이 필요하다.
 * 그건 **대화 능력**이고, 그래서 답변 모델만 바꾸면 된다.
 *
 * **임베딩은 바꾸지 않는다.** 색인이 `gemini-embedding-001`(3072차원)으로 이미 만들어져 있어
 * 바꾸면 전 청크 재색인이고, `ragIndexVersion` 이 바뀌어 이전 측정치가 전부 무효가 된다.
 * 검색 품질은 대화 품질과 별개의 문제다 (`packages/factindex/src/embed.ts`).
 *
 * ## packdraft 의 AI-2 와 키를 공유해도 되는 이유
 * 사양 §2.2 의 독립성은 **AI-1(초안) ↔ AI-2(반박)** 사이의 것이다. 초안은 여전히 Gemini 이므로
 * 답변이 Claude 여도 그 독립성은 깨지지 않는다. 그래서 `ATTACK_API_KEY` 를 재사용한다
 * (키를 두 번 적게 하면 한쪽만 갱신되는 사고가 난다).
 */
export type LlmProvider = "claude" | "gemini";

/** `output_config.effort` — 답변 전체 토큰(생각 포함)의 양을 정한다. `null` = 미지정(API 기본 high). */
export type AnswerEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * 생각 설정. **모델 세대마다 표현이 다르다.**
 *   - `"adaptive"` — Sonnet 5 등 4.6+ 세대. 얼마나 생각할지는 effort 가 정한다.
 *   - `"off"`      — 생각 끔.
 *   - 숫자          — Haiku 4.5 등 구세대의 `budget_tokens`. 신세대에 보내면 400.
 *   - `null`       — 미지정(모델 기본값에 맡긴다).
 */
export type AnswerThinking = "adaptive" | "off" | number;

export interface AnswerConfig {
  readonly provider: LlmProvider;
  readonly apiKey: string;
  readonly model: string;
  readonly effort: AnswerEffort | null;
  readonly thinking: AnswerThinking | null;
  /**
   * 시스템 프롬프트 끝에 **"꼭 필요할 때만 생각해라"** 한 줄을 덧붙일지.
   *
   * 이걸 `ANSWER_PROMPT_VERSION` 이 아니라 모델 설정에 둔 이유: 답의 *내용*을 정하는
   * 지시가 아니라 **모델을 어느 깊이로 돌릴지**를 정하는 지시라서다. 프롬프트 버전을
   * 실험 때문에 올리면 나중에 어느 버전이 무엇이었는지 못 찾는다.
   */
  readonly thinkNudge: boolean;
  /** 시스템 프롬프트 끝에 **간결하게 쓰되 수치 조건은 빼지 마라** 를 덧붙일지 (`BRIEF_NUDGE`). */
  readonly briefNudge: boolean;
}

/**
 * 매니페스트에 실을 모델 식별자. provider 까지 적어야 어디서 나온 답인지 재현된다(§1.3).
 *
 * ★ effort·thinking 도 **출력을 바꾸는 요청 파라미터**이므로 여기 실어야 한다. 같은 모델
 *   같은 프롬프트라도 effort 가 다르면 다른 답이 나온다 — 안 적으면 재현이 안 된다.
 */
export function modelVersionOf(c: AnswerConfig): string {
  const knobs = [
    c.effort === null ? null : `effort=${c.effort}`,
    c.thinking === null ? null : `think=${String(c.thinking)}`,
    c.thinkNudge ? "nudge" : null,
    c.briefNudge ? "brief" : null,
  ].filter((s): s is string => s !== null);
  return `${c.provider}/${c.model}${knobs.length === 0 ? "" : `[${knobs.join(",")}]`}`;
}

/**
 * 생각을 덜 하게 만드는 지시. Anthropic 문서가 주는 문구를 그대로 쓴다.
 *
 * 우리 시스템 프롬프트는 4천자·규칙 12개로 크고 복잡한데, 문서는 바로 그런 프롬프트가
 * adaptive thinking 을 **필요 이상으로 자주 트리거한다**고 적고 있다.
 */
/**
 * 답을 짧게 쓰게 하는 지시. Anthropic 이 Sonnet 5 용으로 권하는 문구를 옮겼다.
 *
 * ⚠️ 이건 **위험한 knob 이다.** 이 시스템이 막으려는 실패가 정확히 "조건을 조용히 빼는 것"
 * 인데(§0-A.7), 짧게 쓰라는 지시는 그걸 시키는 것과 종이 한 장 차이다. 그래서 붙일 때는
 * 반드시 앵커 재현율을 같이 본다 — 시간이 줄고 앵커가 유지되면 채택, 앵커가 떨어지면
 * **시간이 얼마나 줄든 폐기**다. 문서가 "부정 지시보다 긍정 예시가 낫다"고 해서 금지가
 * 아니라 무엇을 남길지를 적는다.
 */
export const BRIEF_NUDGE =
  "\n\n답은 핵심에 집중해 간결하게 써라. 배경 설명·부연·예시는 최소화한다. " +
  "다만 **금액·비율·연령·기간 같은 수치 조건과 그 적용 요건은 하나도 빼지 마라** — " +
  "짧게 만드느라 조건을 빠뜨리면 해당자가 자기가 대상인지 모르게 되고, 그건 틀린 답보다 나쁘다.";

export const THINK_NUDGE =
  "\n\n생각(thinking)은 지연을 늘린다. 여러 단계의 추론이 필요해 **답의 질이 실제로 좋아질 때만** 사용하고, " +
  "애매하면 바로 답해라.";

/**
 * 답변 모델 설정.
 *
 * 기본은 **Claude** 다 — 사람이 읽는 화면의 문장 품질이 이 시스템의 실사용 가치를 정하는데,
 * Gemini Flash 는 조문을 나열하는 쪽으로 기운다(실측). Claude 키가 없으면 Gemini 로 떨어지되
 * **조용히 떨어지지 않고** 어느 모델로 답했는지는 매니페스트에 남는다.
 *
 * `.env`:
 *   ANSWER_PROVIDER=claude|gemini   (없으면 Claude 키 유무로 자동 결정)
 *   ANSWER_MODEL=claude-sonnet-5    (provider 기본값 있음)
 *   ANSWER_API_KEY=…                (없으면 claude→ATTACK_API_KEY, gemini→LLM_API_KEY)
 *   ANSWER_EFFORT=low|medium|high|xhigh|max   (없으면 미지정 = API 기본 high)
 *   ANSWER_THINKING=adaptive|off|<숫자>        (없으면 미지정 = 모델 기본값)
 *   ANSWER_THINK_NUDGE=1                      (생각 억제 한 줄 덧붙임)
 *
 * `overrides` 는 벤치마크 스윕용이다 — 한 프로세스 안에서 설정만 바꿔 여러 번 돌린다.
 */
export function resolveAnswerConfig(overrides: Partial<AnswerConfig> = {}): AnswerConfig {
  const claudeKey = (process.env["ANSWER_API_KEY"] ?? process.env["ATTACK_API_KEY"] ?? "").trim();
  const geminiKey = (process.env["LLM_API_KEY"] ?? "").trim();
  const declared = process.env["ANSWER_PROVIDER"]?.trim().toLowerCase();

  const provider: LlmProvider =
    declared === "gemini" || declared === "claude" ? declared : claudeKey !== "" ? "claude" : "gemini";

  const knobs = {
    effort: parseEffort(process.env["ANSWER_EFFORT"]),
    thinking: parseThinking(process.env["ANSWER_THINKING"]),
    thinkNudge: (process.env["ANSWER_THINK_NUDGE"] ?? "") === "1",
    briefNudge: (process.env["ANSWER_BRIEF"] ?? "") === "1",
  };

  const base: AnswerConfig =
    provider === "claude"
      ? (() => {
          if (claudeKey === "") {
            throw new Error(
              "ANSWER_PROVIDER=claude 인데 키가 없다 — .env 의 ANSWER_API_KEY 또는 ATTACK_API_KEY 를 확인해라.",
            );
          }
          return { provider, apiKey: claudeKey, model: process.env["ANSWER_MODEL"] ?? "claude-sonnet-5", ...knobs };
        })()
      : (() => {
          if (geminiKey === "") throw new Error("LLM_API_KEY 가 없다 — A4/.env 확인");
          return { provider, apiKey: geminiKey, model: process.env["ANSWER_MODEL"] ?? "gemini-2.5-flash", ...knobs };
        })();

  const merged = { ...base, ...overrides };
  assertKnobsValid(merged);
  return merged;
}

const EFFORTS: readonly AnswerEffort[] = ["low", "medium", "high", "xhigh", "max"];

export function parseEffort(raw: string | undefined): AnswerEffort | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return null;
  const hit = EFFORTS.find((e) => e === v);
  if (hit === undefined) throw new Error(`effort 값이 잘못됐다: ${v} (가능: ${EFFORTS.join("|")})`);
  return hit;
}

export function parseThinking(raw: string | undefined): AnswerThinking | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return null;
  if (v === "adaptive" || v === "off") return v;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`thinking 값이 잘못됐다: ${v} (가능: adaptive|off|양의 정수 budget_tokens)`);
  }
  return n;
}

/**
 * **모델 세대와 knob 조합이 맞는지 미리 본다.** 안 보면 API 가 400 을 주는데, 그 본문은
 * 스윕 로그 한복판에서 원인을 짚기 어렵다. 여기서 막으면 어느 칸이 왜 불가능한지 바로 안다.
 */
function assertKnobsValid(c: AnswerConfig): void {
  if (c.provider !== "claude") {
    if (c.effort !== null || c.thinking !== null) {
      throw new Error(`effort·thinking 은 claude 전용이다 (현재 provider=${c.provider})`);
    }
    return;
  }
  // Haiku 4.5 는 effort 미지원(지원 목록에 없음)이고 생각은 구식 budget_tokens 로만 켠다.
  const isLegacyThinking = c.model.startsWith("claude-haiku");
  if (isLegacyThinking && c.effort !== null) {
    throw new Error(`${c.model} 은 effort 를 지원하지 않는다 — thinking 예산(숫자)으로만 조절할 수 있다.`);
  }
  if (!isLegacyThinking && typeof c.thinking === "number") {
    throw new Error(`${c.model} 은 budget_tokens 를 받지 않는다 (4.6+ 세대) — adaptive|off 를 써라.`);
  }
  if (typeof c.thinking === "number" && c.thinking >= MAX_OUTPUT_TOKENS) {
    throw new Error(`thinking 예산(${String(c.thinking)})은 max_tokens(${String(MAX_OUTPUT_TOKENS)}) 보다 작아야 한다.`);
  }
}

export type LlmCall = (system: string, user: string) => Promise<string>;

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";

/**
 * 출력 상한. 짧게 잡으면 **조건이 뒤에서 잘린다** — 그건 답이 틀린 것보다 나쁘다
 * (맞아 보이는데 불완전하다). 조문 종합 답은 한국어 2천자를 넘길 수 있으므로 넉넉히 잡는다.
 */
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Anthropic 요청 본문. **비스트림·스트림이 같은 함수를 쓴다** — 두 벌로 두면 한쪽에만
 * knob 이 붙는 사고가 난다(실제로 캐시 설정이 그럴 뻔했다).
 */
function anthropicBody(config: AnswerConfig, system: string, user: string, stream: boolean): string {
  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // 시스템 프롬프트는 **모드가 같으면 모든 요청에서 글자 그대로 같다**(규칙 11개).
    // 캐시해 두면 매 요청 재업로드가 사라진다. 조문 원문까지 캐시하려면 프리픽스를
    // 재배치해야 하는데, 조문은 턴마다 달라져 이득이 토글 때뿐이라 지금은 안 한다.
    // ⚠️ effort 를 바꾸면 이 캐시는 무효화된다(문서 명시). 측정상 캐시 이득이 3% 라 감수한다.
    system: [
      {
        type: "text",
        text: system + (config.thinkNudge ? THINK_NUDGE : "") + (config.briefNudge ? BRIEF_NUDGE : ""),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: user }],
  };
  if (stream) body["stream"] = true;
  if (config.effort !== null) body["output_config"] = { effort: config.effort };
  if (config.thinking === "off") body["thinking"] = { type: "disabled" };
  else if (config.thinking === "adaptive") body["thinking"] = { type: "adaptive" };
  else if (typeof config.thinking === "number") {
    body["thinking"] = { type: "enabled", budget_tokens: config.thinking };
  }
  return JSON.stringify(body);
}

function claudeLlm(config: AnswerConfig): LlmCall {
  return async (system, user) => {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: anthropicBody(config, system, user, false),
    });
    if (!res.ok) throw new Error(`답변 생성 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
      usage?: { output_tokens?: number };
    };
    // 텍스트 블록만 이어붙인다 — 다른 블록 타입이 섞여도 답이 통째로 날아가지 않게.
    const blocks = json.content ?? [];
    const text = blocks
      .filter((b) => b.type === undefined || b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (text.trim() === "") {
      // ★ "비었다"만 던지면 원인을 모른다 — 실제로 Haiku + budget_tokens 조합에서 이게 터졌고
      //   안전 차단인지, 생각만 하다 max_tokens 로 끊긴 건지, 진짜 빈 응답인지 구분할 수 없었다.
      //   stop_reason 과 받은 블록 종류를 함께 던지면 다음번엔 한 줄로 판별된다.
      const kinds = blocks.map((b) => b.type ?? "?").join(",");
      throw new Error(
        `답변에 텍스트 블록이 없다 — stop_reason=${json.stop_reason ?? "?"} · 블록=[${kinds}] · ` +
          `출력토큰=${String(json.usage?.output_tokens ?? -1)} (max_tokens=${String(MAX_OUTPUT_TOKENS)})`,
      );
    }
    return text;
  };
}

function geminiLlm(config: AnswerConfig): LlmCall {
  return async (system, user) => {
    const url = `${ENDPOINT}/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
    });
    if (!res.ok) {
      throw new Error(`답변 생성 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (text.trim() === "") throw new Error("답변이 비었다 (안전 차단이거나 빈 응답)");
    return text;
  };
}

export function defaultLlm(config: AnswerConfig): LlmCall {
  return config.provider === "claude" ? claudeLlm(config) : geminiLlm(config);
}

export interface GenerateOptions {
  readonly mode?: AnswerMode;
  readonly history?: readonly HistoryTurn[];
  /** 조회일 — 조문 안의 적용기한이 지났는지 판정하는 데 쓴다 */
  readonly queryAsOf?: string;
  /**
   * 재생성 시 덧붙일 **교정 지시**. 첫 답이 검사에 걸렸을 때만 넣는다.
   *
   * 프롬프트에 규칙을 더 쓰는 것과 다르다 — 규칙은 이미 있고, **어긴 결과를 보여주며**
   * 다시 쓰게 하는 것이다. 모델은 자기가 방금 뭘 잘못했는지 알면 훨씬 잘 고친다.
   */
  readonly correction?: string;
}

/**
 * 계산해서 금액을 낸 답을 다시 쓰게 하는 지시.
 *
 * 규칙 10 을 다시 읊지 않고 **잡힌 식을 그대로 들이민다.** "하지 마라"는 이미 프롬프트에
 * 있었고 그걸로 안 막혔으므로, 같은 말을 반복하는 것은 대책이 아니다.
 */
export function correctionForComputedAmounts(expressions: readonly string[]): string {
  return [
    "",
    "─── 다시 써라 ───",
    "방금 쓴 답에 **직접 계산한 금액**이 있었다. 규칙 10 위반이라 내보낼 수 없다:",
    ...expressions.map((e) => `  ✗ ${e}`),
    "",
    "계산 결과는 어느 조문에도 없는 숫자라 근거를 댈 수 없다. 계산은 승인된 정책 규칙 위에서",
    "도는 별도 엔진의 몫이다(사양 §1.1 · 절대 규칙 3).",
    "**재료만 제시하고 결과는 내지 마라.**",
    "  ✗ 전환금액 2,000만원의 10% = 200만원",
    "  ✓ 전환금액의 10% 또는 300만원 중 적은 금액까지 인정돼요[n].",
    "나머지 내용과 인용은 그대로 유지하고, 계산한 부분만 고쳐서 답 전체를 다시 써라.",
  ].join("\n");
}

export async function generateAnswer(
  query: string,
  items: readonly BundleItem[],
  llm: LlmCall,
  opts: GenerateOptions = {},
): Promise<string> {
  if (items.length === 0) throw new Error("조문 묶음이 비었다 — 답변을 생성할 근거가 없다");
  // 기본은 PLAIN 이다 — 사람이 읽는 화면의 기본값이 조문투면 안 읽힌다(사용자 피드백).
  return llm(
    buildSystemPrompt(opts.mode ?? "PLAIN"),
    buildUserPrompt(query, items, opts.history ?? [], opts.queryAsOf) +
      (opts.correction === undefined ? "" : opts.correction),
  );
}

/**
 * 생성 → 계산 검사 → **걸리면 1회 재생성.**
 *
 * ## 왜 재생성인가
 * 계산 금지는 프롬프트 규칙인데, **지시를 얼마나 따르는지는 모델마다 다르다**(실측:
 * Sonnet 은 지켰고 Haiku 는 뚫었다). 프롬프트를 더 강하게 쓰는 것은 같은 종류의 부탁이라
 * 보장이 안 된다. 출력을 검사하고 걸리면 다시 시키는 것만이 **기계적 보장**이다.
 *
 * ## 왜 1회인가
 * 두 번 어기면 그 모델은 이 작업에 안 맞는 것이고, 무한 재시도는 응답 시간을 못 잡는다.
 * 그래도 못 고치면 **고치지 못한 답을 그대로 돌려준다** — 대신 `computedAmounts` 가 남아
 * 화면과 리포트에 "계산함"으로 표시된다. *숨기는 것보다 드러내는 것이 낫다.*
 */
/**
 * 재생성을 부를 **계산 위반 전부** — 등호형 + 유도형.
 *
 * 유도형은 "조문에 없는 금액인데 답 안의 다른 금액에서 산술로 나온다"를 본다. 그래서
 * 후보를 뽑으려면 조문 원문이 필요한데, 생성 직후에는 아직 **어느 조문이 인용됐는지** 모른다.
 * 그래서 묶음 전체를 근거로 본다 — 인용분만 볼 때보다 **덜 잡는 쪽**이라, 재생성 트리거로는
 * 안전한 방향이다(있는 값을 없다고 오해해 괜히 다시 시키지 않는다).
 * 최종 판정은 인용분만 대조하는 `buildUnmodeledAnswer` 가 다시 한다.
 */
function computedIn(text: string, items: readonly BundleItem[]): ArithmeticIssue[] {
  const unsourced = findUnsourcedAmounts(text, items.map((i) => i.text)).map((u) => u.asWritten);
  return [...findComputedAmounts(text), ...findDerivedAmounts(text, unsourced)];
}

export async function generateChecked(
  query: string,
  items: readonly BundleItem[],
  llm: LlmCall,
  opts: GenerateOptions = {},
): Promise<{ text: string; retried: boolean }> {
  const first = await generateAnswer(query, items, llm, opts);
  const bad = computedIn(first, items);
  if (bad.length === 0) return { text: first, retried: false };
  const second = await generateAnswer(query, items, llm, {
    ...opts,
    correction: correctionForComputedAmounts(bad.map((b) => b.expression)),
  });
  // 재생성이 더 나빠졌으면 첫 답을 쓴다 — 고치라고 시켰다가 망가뜨리면 안 된다.
  return computedIn(second, items).length < bad.length
    ? { text: second, retried: true }
    : { text: first, retried: true };
}



/** 스트리밍 호출 — 델타를 순서대로 흘린다. Claude 만 지원한다(Gemini 는 비스트림으로 떨어진다). */
export type LlmStream = (system: string, user: string) => AsyncGenerator<string>;

/**
 * 왜 스트리밍이 필요한가: 답 하나에 10~20초가 걸리는데 그동안 화면이 스피너면
 * **멈춘 것처럼 보인다.** 근거를 다 읽고 답하는 설계라 시간은 줄일 수 없으니, 대신
 * **읽는 중인 것을 보여준다.**
 *
 * ⚠️ 스트리밍은 **검증 전 텍스트**를 흘린다. 그래서 서버는 스트림이 끝난 뒤
 * 인용 검증·조건 커버리지·금지 문구를 돌리고 **최종 HTML 로 교체**한다.
 * 사용자가 잠깐 보는 것과 최종본이 다를 수 있다는 뜻이므로, 교체 전까지는
 * 근거 카드·매니페스트를 붙이지 않는다 — **검증되지 않은 것에 근거를 달면 안 된다.**
 */
export function defaultLlmStream(config: AnswerConfig): LlmStream {
  if (config.provider !== "claude") {
    throw new Error(`스트리밍은 claude 만 지원한다 (현재: ${config.provider})`);
  }
  return async function* (system, user) {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: anthropicBody(config, system, user, true),
    });
    if (!res.ok || res.body === null) {
      throw new Error(`답변 생성 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    // SSE 파싱. 이벤트가 청크 경계에서 잘리므로 줄 단위로 모았다가 처리한다.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "" || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload) as { type?: string; delta?: { type?: string; text?: string } };
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
            const t = ev.delta.text ?? "";
            if (t !== "") yield t;
          }
        } catch {
          // 깨진 이벤트 하나 때문에 스트림 전체를 죽이지 않는다.
        }
      }
    }
  };
}

export function streamAnswer(
  query: string,
  items: readonly BundleItem[],
  llm: LlmStream,
  opts: GenerateOptions = {},
): AsyncGenerator<string> {
  if (items.length === 0) throw new Error("조문 묶음이 비었다 — 답변을 생성할 근거가 없다");
  return llm(
    buildSystemPrompt(opts.mode ?? "PLAIN"),
    buildUserPrompt(query, items, opts.history ?? [], opts.queryAsOf) +
      (opts.correction === undefined ? "" : opts.correction),
  );
}

