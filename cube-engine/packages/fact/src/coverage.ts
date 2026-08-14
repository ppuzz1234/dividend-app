/**
 * 조건 누락 검사 — **숫자 오류보다 위험한 실패를 잡는다.**
 *
 * ## 왜 이게 더 위험한가
 * "400만원"을 "200만원"이라고 하면 **틀렸다는 걸 알 수 있다** — 원문과 대조하면 바로 드러난다.
 * 그런데 "400만원입니다"라고 맞게 말하면서 **조건 3개 중 농어민을 빼먹으면**, 농어민인 사람은
 * 자기가 대상인지 모른 채 지나간다. 답이 틀린 게 아니라 **불완전한데, 불완전은 조용하다.**
 *
 * 사양 §0-A.7 이 "비포함 항목을 조용히 빼지 마라 — 표기 없는 '세후 금액'은 거짓이다"라고
 * 한 것과 같은 정신이다. 여기서는 조건이 그 대상이다.
 *
 * ## 어떻게 검사하나
 * 조문 원문에서 **조건을 나타내는 표현**을 뽑아 답변에 다 나왔는지 본다.
 * 완벽한 의미 판단은 못 하지만, 금액·비율·연령 같은 **검증 가능한 앵커**는 기계적으로 잡힌다.
 *
 * ## ⚠️ 이것은 **경고**이지 오류가 아니다
 * 앵커 기반 heuristic 이라 두 방향으로 틀린다:
 *  - **놓침** — 서술형 조건("대통령령으로 정하는 농어민")은 수치 앵커가 없어 못 잡는다.
 *  - **오탐** — 한 항이 여러 주제를 담으면(조특법 §91의18 ①은 가입요건 + 비과세 + 초과분 세율)
 *    질문 범위 밖 수치가 누락으로 잡힌다.
 *
 * 그래서 `isPublishable` 은 이 결과를 **막지 않는다.** 위조 인용·금지 문구만 차단하고,
 * 조건 커버리지는 사람이 보고 판단할 신호로 남긴다. 검사가 항상 켜지면 아무도 안 보게 되므로
 * 범위를 항 단위로 좁히고 "실제로 다룬 항"만 검사하지만, **경고가 사라질 때까지 조이지는 않는다** —
 * 그건 결과에 맞춰 검사를 무디게 하는 것이다.
 *
 * 정식 해결은 조건을 구조화한 정책 팩(Phase 10)이다. 그때는 조건이 데이터라 열거 여부를
 * 기계적으로 확인할 수 있다.
 */

import type { BundleItem } from "./bundle.js";

/** 원문에서 뽑은 검증 가능한 앵커 — 금액·비율·연령·기간 */
const ANCHOR_RE = /(\d[\d,]*\s*(?:만원|억원|원|퍼센트|%|세|년|개월|일)|100분의\s*\d+)/g;

export interface CoverageIssue {
  readonly sourceId: string;
  readonly kind:
    /** 원문의 수치 앵커가 답변에 없다 */
    | "MISSING_ANCHOR"
    /** 원문의 조건 항목 수보다 답변이 적게 열거했다 */
    | "FEWER_CONDITIONS";
  readonly detail: string;
}

export interface CoverageReport {
  readonly issues: readonly CoverageIssue[];
  /** 인용된 조문별로 원문 앵커 대비 답변에 나온 비율 */
  readonly anchorRecall: number;
}

/**
 * 숫자 표기 흔들림 흡수 — `5,000만원` / `5000만원` / `5,000 만원` 을 같게 본다.
 *
 * ## ★ 비율 표기까지 같게 본다 (2026-08-07)
 * 법령 원문은 **`100분의 5`**, 사람이 읽는 답변은 **`5%`** 로 쓴다. 같은 값인데 글자가 달라
 * 매칭이 안 됐고, 그래서 **세율표를 버젓이 넣은 답이 "세율이 빠졌다"로 잡혔다.**
 *
 * 실측(Q8, 넓은질문 3회차): 답변에 5%/4%/3% 표가 있는데 원문이 `100분의5·4·3` 이라
 * 전부 누락 처리 → 앵커 25%. 같은 질문 다른 회차는 그 조문을 안 건드려서 60~67%.
 * **조문을 하나 더 정확히 인용한 답이 점수가 반토막 났다.**
 *
 * 부작용도 같이 고쳐진다: `70세`·`80세` 같은 무관한 앵커로 `hit >= 2` 게이트만 우연히
 * 통과하고 정작 본문 수치는 못 알아보던 상태가 사라진다.
 */
function normalize(s: string): string {
  return (
    s
      .replace(/[,\s]/g, "")
      // `100분의12` → `12%`. 법령의 분수 표기를 백분율로 통일한다.
      .replace(/100분의(\d+(?:\.\d+)?)/g, "$1%")
      // `12퍼센트` → `12%`
      .replace(/(\d+(?:\.\d+)?)퍼센트/g, "$1%")
  );
}

/**
 * 앵커가 답변에 있는지 — **숫자 경계를 지켜서** 본다.
 *
 * 단순 `includes` 면 `5%` 가 `15%` 에 걸리고 `400만원` 이 `1400만원` 에 걸린다. 비율을
 * `N%` 로 통일하면서 토큰이 짧아져 이 위험이 커졌으므로 같이 막는다. 앞자리에 숫자가
 * 오면 다른 수치이므로 불일치로 본다. (없는 조건을 있다고 세면 앵커가 부풀고,
 * 그건 조건 누락을 못 잡는다는 뜻이라 이 검사의 존재 이유가 사라진다.)
 */
function containsAnchor(haystack: string, anchor: string): boolean {
  const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\d)${esc}`).test(haystack);
}

function anchorsOf(text: string): Set<string> {
  ANCHOR_RE.lastIndex = 0;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_RE.exec(text)) !== null) {
    const a = normalize(m[1] ?? "");
    // 연도(2026년)·개정 표기는 조건이 아니다.
    if (/^(19|20)\d{2}년$/.test(a)) continue;
    if (a !== "") out.add(a);
  }
  return out;
}

/** 원문의 호(`1.` `2.`)·목(`가.` `나.`) 개수 — 조건 항목의 하한 추정 */
function conditionCount(text: string): number {
  const ho = (text.match(/^\d+(?:의\d+)?\.\s/gm) ?? []).length;
  const mok = (text.match(/^(?:\[각 목\]\s*)?[가-힣]\.\s/gm) ?? []).length;
  return ho + mok;
}

/**
 * 조문을 **항 단위**로 쪼갠다.
 *
 * 왜 항 단위인가 (실측): 조특법 §91의18 은 3,740자에 12개 항이고 가입요건(①)·한도(②)·
 * 계좌요건(③)·전환(④…) 이 한 조문에 다 들어 있다. 조문 전체 앵커와 비교하면
 * "한도가 얼마냐"는 질문에 `19세`·`3년`·`1억원`(가입요건·계약기간)이 **누락으로 잡힌다.**
 * 실제로 첫 실행에서 재현율 38%가 나왔고 그건 전부 오탐이었다.
 *
 * **항상 켜지는 검사는 안 켜지는 검사만큼 쓸모없다.** 조건은 항 안에서 묶이므로
 * 답변이 건드린 항에 한해 그 항의 나머지 조건을 요구한다.
 */
function paragraphs(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (/^[①-⑳]/.test(line) && cur.length > 0) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length > 0) blocks.push(cur);
  return blocks.map((b) => b.join("\n"));
}

/**
 * 항을 **호·목 단위**로 한 번 더 쪼갠다.
 *
 * ## 왜 항으로는 부족했나 (실측)
 * 항 단위로 좁혔는데도 오탐이 남았다. 답이 정확한데 벌점을 받은 사례:
 * ```
 * Q: 조세특례제한법 제86조의4는 언제까지 적용되는 규정인가
 * A: 2022년 12월 31일까지 적용되던 규정이에요[1].          ← 정확한 답
 * 검사: 600만원·900만원·1억원·300만원·700만원 이 빠졌다   ← 그건 특례의 '내용'이지
 *                                                            '언제까지'의 답이 아니다
 * ```
 * 한 항에 여러 주제가 들어 있으면, 범위를 좁히라는 규칙 0 을 지킬수록 이 검사가 벌을 준다.
 * **규칙과 검사가 싸우면 지표가 옳은 행동을 벌한다** — 오늘만 세 번째 겪는 형태다.
 *
 * ## 왜 호까지만 쪼개고 목은 안 쪼개나
 * **목은 호에 딸린 조건**이다 — `1. … 400만원` 과 `가. 총급여 5천만원 이하` 는 한 덩어리이고,
 * 그 둘을 갈라놓으면 "400만원은 말했는데 5천만원 조건을 뺐다"를 **못 잡게 된다.**
 * 그게 이 검사가 존재하는 이유인데 말이다. 그래서 끊는 자리는 호까지다.
 * (목까지 쪼개 봤더니 단위마다 앵커가 1개뿐이라 `hit >= 2` 게이트가 아예 안 걸렸다.)
 */
function clauses(paragraph: string): string[] {
  const lines = paragraph.split("\n");
  const blocks: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    // 호(`1.` `2의2.`) 머리에서만 끊는다. 목(`가.` `[각 목] 나.`)은 앞 호에 붙여 둔다.
    if (/^\d+(?:의\d+)?[.)]\s/.test(line.trim()) && cur.length > 0) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(line);
  }
  if (cur.length > 0) blocks.push(cur);
  return blocks.map((b) => b.join("\n"));
}

export function checkCoverage(
  answer: string,
  items: readonly BundleItem[],
  citedRefs: readonly number[],
): CoverageReport {
  const issues: CoverageIssue[] = [];
  const answerNorm = normalize(answer);
  let anchorTotal = 0;
  let anchorHit = 0;

  for (const ref of citedRefs) {
    const item = items.find((i) => i.ref === ref);
    if (item === undefined) continue;

    // 답변이 **건드린 호**만 검사한다. 항 단위로도 오탐이 남았다 —
    // 한 항에 여러 주제가 섞이면 범위를 좁힌 정확한 답이 벌점을 받는다(clauses 주석 참조).
    for (const para of paragraphs(item.text).flatMap(clauses)) {
      const anchors = anchorsOf(para);
      if (anchors.size === 0) continue;

      const missing: string[] = [];
      let hit = 0;
      for (const a of anchors) {
        if (containsAnchor(answerNorm, a)) hit += 1;
        else missing.push(a);
      }
      // 그 항을 **실제로 다뤘다**고 볼 근거가 있어야 검사한다.
      // 앵커 1개 일치는 우연일 수 있다 — 같은 수치가 여러 항에 나오고, 답변이 다른 목적으로
      // 인용했을 수 있다(실측: 한도 질문의 답이 ①항의 `100분의 9`만 언급했는데 그 항에는
      // 가입요건 `19세`·`15세`도 있어 누락으로 잡혔다). 2개 이상이면 그 항을 다뤘다고 본다.
      //
      // KNOWN-LIMITATION(coverage): **큰 호에서는 이 게이트가 여전히 헐겁다.**
      //   소득세법 제129조는 한 호에 소득 종류별 세율이 17개다. 3자 비교 답변이 연금 세율만
      //   말하면 앵커 2개로 통과하고, 그 순간 이자·배당용 `100분의25·100분의14` 까지
      //   "누락"으로 잡힌다 — 말할 이유가 없는 수치인데도. 실측 Q2 가 이 때문에 57% 다.
      //
      //   과반 게이트(`hit > missing`)를 시도했다가 **되돌렸다.** 나이(70세·80세)는 맞고
      //   세율은 셋 다 틀린 답에 만점을 주기 때문이다 — "큰 호를 스쳤다"와 "다뤘는데
      //   숫자를 틀렸다"를 구분하지 못한다. 전 리포트 평균이 84~98% 로 뛰었고, 그건
      //   지표가 측정을 멈췄다는 뜻이다. (재현: 회귀 테스트 `5% ≠ 15%` 가 깨진다.)
      //
      //   올바른 해결은 게이트를 조이는 게 아니라 **호 안의 주제 경계**를 아는 것이고,
      //   그건 조건을 구조화한 정책 팩(Phase 10)에서 데이터로 풀린다.
      if (hit < 2) continue;

      anchorTotal += anchors.size;
      anchorHit += hit;

      if (missing.length > 0) {
        issues.push({
          sourceId: item.sourceId,
          kind: "MISSING_ANCHOR",
          detail:
            `답변이 다룬 호에서 수치 ${missing.slice(0, 5).join(" · ")} 가 빠졌다 ` +
            `(조건 누락 가능 — 해당자가 자기가 대상인지 모르게 된다)`,
        });
      }

      const need = conditionCount(para);
      if (need >= 2) {
        // 답변의 열거 항목 수. 번호(`1.`)·가나다(`가.`)뿐 아니라 **마크다운 bullet 도 센다** —
        // LLM 은 호를 번호로, 목을 bullet 으로 쓰는 경우가 많다. bullet 을 빼고 세면
        // 조건을 다 담은 답변이 "2개만 열거했다"로 잡힌다(실측 오탐).
        const listed = (answer.match(/^\s*(?:[*\-·•]|\d+(?:의\d+)?\.|[가-힣]\.)\s/gm) ?? []).length;
        if (listed > 0 && listed < need) {
          issues.push({
            sourceId: item.sourceId,
            kind: "FEWER_CONDITIONS",
            detail: `그 호의 조건 항목 ${need}개인데 답변은 ${listed}개만 열거했다`,
          });
        }
      }
    }
  }

  return { issues, anchorRecall: anchorTotal === 0 ? 1 : anchorHit / anchorTotal };
}
