/**
 * 답변 → HTML. **서버에서 렌더한다.**
 *
 * ## 왜 클라이언트 JS 로 안 그리나
 * 사양 CLAUDE.md 절대 규칙 8 = "UI 에서 계산 금지". 브라우저 JS 가 커질수록 거기서
 * 값을 만지는 코드가 자란다. 렌더를 서버의 **순수 함수**로 묶어두면
 * ① `no-computation.test.ts` 가 파일 몇 개만 훑으면 되고
 * ② 스탬프가 DOM 에 실제로 있는지 **테스트에서 문자열로 확인**할 수 있다.
 * 브라우저 쪽은 fetch 하고 innerHTML 에 꽂는 것이 전부다. 원문 접기는 `<details>` 로
 * 브라우저가 해준다 — JS 를 쓸 이유가 없다 (사다리 4단: 네이티브 기능).
 *
 * 이 파일에는 산술 연산이 하나도 없다. 값은 전부 문자열로 받아 그대로 출력한다.
 */

import { SYNTHETIC_STAMP_TEXT } from "@cube/policy";
import type { FactAnswerManifest } from "@cube/policy";
import { expiredDeadlines, findExclusions } from "@cube/fact";
import type { AmountIssue, AnswerMode, ArithmeticIssue, BundleItem, CiteIssue, FactAnswer } from "@cube/fact";
import type { ApprovedFacts } from "@cube/plan";

/**
 * 렌더러 템플릿 버전 — 이 파일의 출력 형태가 바뀌면 올린다 (§5.6 재현성).
 *   2 → 3: 말투 토글 + 대화(턴) 렌더 추가.
 *   3 → 4: 마크다운 제목(`## …`) 렌더 추가.
 *   4 → 5: 조문 적용기한 경고. 5 → 6: 마크다운 표 → <table> (비교형 답의 대조를 위해).
 *   8 → 9: ① 공식 팩트 패널 — 조문에 걸린 승인 규칙을 LLM 과 **독립으로** 띄운다.
 *          없으면 "0개"라고 말한다. 그게 "왜 ② 만 뜨느냐"의 답이다.
 *   9 → 10: **답을 맨 위로.** 등급 라벨·①패널·검증·매니페스트를 답 아래 접힌 칸으로 내렸다.
 *          읽는 사람이 매번 보는 건 답이고, 나머지는 **따질 때** 보는 것이다(사용자 피드백).
 *          단 "개인 적용 금지" 한 줄은 접지 않는다 — 열어야 보이는 고지는 고지가 아니다.
 *  10 → 11: **비포함 고지**를 답 아래 펼친 채로 붙였다 (사양 §0-A.7). 조문 그대로 답한
 *          세액공제율을 사용자가 "틀렸다"고 판정한 실측이 계기다 — 널리 알려진 값은
 *          지방소득세를 포함한 수치인데, 지방세법은 우리 수집 대상이 아니다.
 *          판정은 `fact/src/exclusions.ts`, 여기서는 표시만 한다.
 */
export const RENDERER_TEMPLATE_VERSION = "factui-11";

/** §1.2 클래스별 사용자 표시 라벨. LLM 이 만들지 않는다 — 상수다. */
const CLASS_LABEL: Record<FactAnswer["answerClass"], string> = {
  REGISTRY_RESOLVED_FACT: "① 공식 팩트 — 승인된 정책 규칙에서 인출",
  UNMODELED_OFFICIAL_SOURCE: "② 원문 인용 — 팩트 결론이 아님",
};

/** 말투 토글 라벨. 사용자에게 보이는 이름이므로 상수로 고정한다. */
const MODE_LABEL: Record<AnswerMode, string> = {
  PLAIN: "쉬운 말",
  LEGAL: "법령 그대로",
};

const MODE_HINT: Record<AnswerMode, string> = {
  PLAIN: "쉬운 말로 바꾼 것은 문장과 어휘뿐입니다. 금액·요건·조문번호는 원문 그대로입니다.",
  LEGAL: "조문 용어를 그대로 쓴 답입니다. 원문에 가장 가깝습니다.",
};

const MOK_CAVEAT =
  "이 조문에는 소속 호를 특정하지 못한 「[각 목]」 항목이 있습니다. " +
  "목의 소속이 답의 의미를 바꿀 수 있으니 원문을 함께 확인하세요.";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 해시 앞자리만 보여준다 — 전체는 매니페스트에 있다. */
function shortHash(h: string): string {
  return `${h.slice(0, 8)}…`;
}

/** 줄 안에서 도는 변환 — 인용 링크와 굵게. 표 칸 안에서도 똑같이 돌아야 한다. */
function inline(s: string, turnId: string): string {
  return s
    .replace(/\[(\d+)\]/g, `<a class="ref" href="#src-${turnId}-$1">[$1]</a>`)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

/** `|---|:--:|---:|` 같은 마크다운 표 구분선인가. */
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/;

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** 구분선의 `:` 위치로 정렬을 읽는다. 표를 쓰는 이유의 절반은 **숫자 열이 맞춰지는 것**이다. */
function aligns(sep: string): string[] {
  return cells(sep).map((c) => {
    const left = c.startsWith(":");
    const right = c.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

/**
 * 답변 본문 마크업. **이스케이프 뒤에** 돌리므로 LLM 이 태그를 넣어도 실행되지 않는다.
 *  - `[n]` → 근거 카드로 가는 링크 (번호 자체는 건드리지 않는다 — 인용 검증이 이 번호를 본다)
 *  - `**굵게**` → `<strong>`, 줄머리 `*`/`-` → `•`, `## …` → 소제목
 *  - **마크다운 표 → `<table>`** — 비교형 질문("셋이 뭐가 달라?")의 답은 표가 아니면
 *    계좌별 목록이 되어 **대조가 안 된다**(실측). 축을 나란히 놓는 것이 비교의 전부다.
 * 마크다운 파서를 들이지 않는다 — 필요한 네 가지만 직접 처리한다.
 */
function markup(text: string, turnId: string): string {
  const lines = esc(text).split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; ) {
    const head = lines[i] ?? "";
    const sep = lines[i + 1] ?? "";
    const isTable = head.includes("|") && TABLE_SEP_RE.test(sep);
    if (!isTable) {
      // 굵게를 **먼저**(inline 안에서) 돌려야 `**굵게**` 의 앞 별표를 불릿으로 오인하지 않는다.
      out.push(
        inline(head, turnId)
          .replace(/^([ \t]*)[*-][ \t]+/, "$1• ")
          .replace(/^#{1,6}[ \t]+(.+)$/, '<b class="ans-h">$1</b>'),
      );
      i += 1;
      continue;
    }

    const al = aligns(sep);
    const th = cells(head)
      .map((c, k) => `<th style="text-align:${al[k] ?? "left"}">${inline(c, turnId)}</th>`)
      .join("");
    const rows: string[] = [];
    let j = i + 2;
    while (j < lines.length && (lines[j] ?? "").includes("|")) {
      const td = cells(lines[j] ?? "")
        .map((c, k) => `<td style="text-align:${al[k] ?? "left"}">${inline(c, turnId)}</td>`)
        .join("");
      rows.push(`<tr>${td}</tr>`);
      j += 1;
    }
    // 넓은 표는 **자기 안에서** 가로 스크롤한다 — 본문이 좌우로 밀리면 안 된다.
    out.push(`<div class="tbl"><table><thead><tr>${th}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`);
    i = j;
  }

  // ★ 여기서 inline 을 다시 돌리면 안 된다 — 표 칸과 본문 줄은 이미 변환됐으므로
  //   `<a …>[1]</a>` 안의 `[1]` 이 **또** 링크가 되어 앵커가 중첩된다.
  return out.join("\n");
}

function renderCitation(c: BundleItem, turnId: string, queryAsOf: string): string {
  const title = c.title === null ? "" : `<span class="src-title">(${esc(c.title)})</span>`;
  const caveat = c.hasUnattachedMok ? `<p class="caveat">⚠️ ${esc(MOK_CAVEAT)}</p>` : "";
  // ★ 시행일은 조문의 생사만 말한다. 조문 **안의** 적용기한이 지났으면 그건 따로 보여야 한다.
  const expired = expiredDeadlines(c, queryAsOf);
  const sunset =
    expired.length === 0
      ? ""
      : `<p class="caveat sunset">⛔ 이 조문에 적힌 적용기한 <b>${esc(expired.join(", "))}</b> 은 조회일 ${esc(queryAsOf)} 기준으로 지났습니다. 현행 기준인지 원문에서 확인하세요.</p>`;
  return [
    `<article class="src" id="src-${turnId}-${String(c.ref)}">`,
    `  <h4><span class="refno">[${String(c.ref)}]</span> ${esc(c.lawName)} ${esc(c.articleLabel)} ${title}</h4>`,
    `  <p class="meta">시행 ${esc(c.validFrom)} · ${esc(c.authorityType)} · 해시 <code>${esc(shortHash(c.textHash))}</code> · <code>${esc(c.sourceId)}</code> · 편입 ${esc(c.reason)}</p>`,
    caveat,
    sunset,
    `  <details><summary>조문 원문 보기</summary><pre>${esc(c.text)}</pre></details>`,
    `</article>`,
  ].join("\n");
}

/**
 * ① 공식 팩트 패널 — **LLM 이 한 글자도 손대지 않은 값.**
 *
 * ## 왜 답변 본문 위에 따로 붙나
 * 본문은 LLM 이 조문을 읽고 쓴 글이라 아무리 인용이 붙어도 §1.2 의 ② 다. 그 글 안에
 * 승인된 값을 섞어 넣으면 **어디까지가 승인된 값이고 어디부터가 LLM 문장인지 사라진다.**
 * 그래서 층을 갈라 놓는다: 위는 Registry 가 말한 것, 아래는 LLM 이 말한 것.
 *
 * ## 비어 있을 때가 더 중요하다
 * 승인 규칙이 0개면 그냥 숨기지 않고 **0개라고 말한다.** 그게 "왜 ② 만 뜨느냐"의 답이고,
 * 동시에 *사람이 승인해야 채워지는 빈칸*을 가리킨다. 숨기면 시스템이 다 한 것처럼 보인다.
 */
function renderApproved(ap: ApprovedFacts | null): string {
  if (ap === null) {
    return (
      `<div class="approved none"><p class="class-label unmodeled">① 공식 팩트 없음 — 승인된 정책 팩이 로드되지 않았습니다</p></div>`
    );
  }
  if (ap.facts.length === 0) {
    return [
      `<div class="approved none">`,
      `  <p class="class-label unmodeled">① 공식 팩트 없음 — 이 조문에 승인된 정책 규칙이 0개</p>`,
      `  <p class="dim">그래서 아래 답변은 <b>② 원문 인용</b>입니다. 사람이 원문과 대조해 규칙을 승인하면 이 자리에 값이 뜨고, 그 값은 LLM 을 거치지 않습니다.</p>`,
      `</div>`,
    ].join("\n");
  }
  const rows = ap.facts
    .map(
      (f) =>
        `<tr><td><code>${esc(f.ruleId)}</code></td>` +
        `<td style="text-align:right"><b>${esc(f.display)}</b></td>` +
        `<td>${esc(f.unit)}</td><td>${esc(f.validFrom)}</td>` +
        // 조문은 **이름 + id** 로 보여준다. id 만이면 어느 주제의 값인지 안 읽힌다.
        `<td>${f.sourceLabels.map((s) => esc(s)).join("<br>")}<br><code>${esc(f.sourceIds.join(" "))}</code></td></tr>`,
    )
    .join("");
  return [
    `<div class="approved">`,
    `  <p class="class-label resolved">① 공식 팩트 — 승인된 정책 규칙에서 인출 (${String(ap.facts.length)}건)</p>`,
    `  <p class="dim">아래 값은 <b>LLM 을 거치지 않았습니다.</b> 사람이 원문과 대조해 승인한 규칙에서 그대로 인출한 것입니다.</p>`,
    `  <div class="tbl"><table><thead><tr><th>규칙</th><th style="text-align:right">값</th><th>단위</th><th>시행</th><th>근거 조문</th></tr></thead>`,
    `  <tbody>${rows}</tbody></table></div>`,
    `  <p class="approved-meta">팩 <code>${esc(ap.policySnapshot)}</code> · 등급 <code>${esc(ap.packKind)}</code> · 해시 <code>${esc(shortHash(ap.packHash))}</code></p>`,
    `</div>`,
  ].join("\n");
}

function renderManifest(m: FactAnswerManifest): string {
  const rows: [string, string][] = [
    ["조회일 (queryAsOf)", m.queryAsOf],
    ["답변 클래스", m.answerClass],
    [
      "인출된 규칙 (resolvedRuleIds)",
      m.resolvedRuleIds.length === 0 ? "없음 — 승인된 규칙에서 인출하지 않음" : m.resolvedRuleIds.join(", "),
    ],
    ["정책 스냅샷", m.policySnapshotVersion],
    ["RAG 색인", m.ragIndexVersion ?? "—"],
    ["리졸버", m.factResolverVersion],
    ["렌더러 템플릿", m.rendererTemplateVersion],
    ["렌더러 모델", m.rendererModelVersion ?? "—"],
    ["근거 스냅샷", m.sourceSnapshotIds.join(", ")],
    ["답변 페이로드 해시", m.answerPayloadHash],
  ];
  const body = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td><code>${esc(v)}</code></td></tr>`).join("\n");
  return `<details class="manifest"><summary>매니페스트 (이 답을 재현하는 데 필요한 전부)</summary><table>${body}</table></details>`;
}

/**
 * 말투 토글. **두 버튼 다 항상 보인다** — "법령 그대로"가 있다는 사실 자체가
 * "지금 보는 건 풀어 쓴 것"이라는 고지다. 숨겨두면 쉬운 말이 원문인 줄 안다.
 */
function renderModeToggle(turnId: string, active: AnswerMode): string {
  const btn = (m: AnswerMode): string =>
    `<button type="button" class="mode-btn${m === active ? " on" : ""}" data-turn="${turnId}" data-mode="${m}"` +
    `${m === active ? " aria-pressed=\"true\"" : ""}>${esc(MODE_LABEL[m])}</button>`;
  return [
    `<div class="mode-bar">`,
    `  <div class="mode-btns">${btn("PLAIN")}${btn("LEGAL")}</div>`,
    `  <span class="mode-hint">${esc(MODE_HINT[active])}</span>`,
    `</div>`,
  ].join("\n");
}

export interface AnswerView {
  readonly answer: FactAnswer;
  readonly manifest: FactAnswerManifest;
  readonly mode: AnswerMode;
  readonly turnId: string;
  /** 후속 질문이면 실제로 검색에 쓴 문장. 같으면 null */
  readonly resolvedFrom?: { searchQuery: string; matched: readonly string[] } | null;
  /**
   * 함께 찾았지만 **이번 답에 인용되지 않은** 조문들.
   *
   * 이게 "다음에 뭘 물어야 하나"의 답이다. 지어낸 추천이 아니라 **이미 손에 든 것**이라
   * 근거가 있고 API 콜도 들지 않는다. 그리고 사용자에게 "검색은 이만큼 했는데 답에는
   * 이것만 썼다"를 보여주므로 **묶음이 과했는지도 드러난다.**
   */
  readonly alsoConsidered?: readonly BundleItem[];
  /**
   * 이번에 찾은 조문에 걸린 **승인 규칙**. `undefined` 면 패널을 아예 그리지 않는다
   * (예: 저장된 옛 턴 다시 그리기). `null` 은 "팩이 없다"로 표시된다 — 다른 뜻이다.
   */
  readonly approved?: ApprovedFacts | null;
}

export function renderAnswer(v: AnswerView): string {
  const { answer: a, manifest: m, mode, turnId } = v;
  const parts: string[] = [];

  // ② 합성 값 스탬프 — 상수를 참조한다. 직접 타이핑하면 문구가 갈라진다 (CLAUDE.md 규칙 0).
  if (m.packKind === "SYNTHETIC_DEMO") {
    parts.push(`<p class="stamp">${esc(SYNTHETIC_STAMP_TEXT)}</p>`);
  }

  // ★ 후속 질문이면 **무엇으로 검색했는지 보여준다.** 안 보여주면 답이 이상할 때
  //   사용자는 "왜 저 조문이 나왔지"를 알 방법이 없다.
  const rf = v.resolvedFrom ?? null;
  if (rf !== null) {
    parts.push(
      `<p class="resolved-from">앞 질문을 이어받아 <b>${esc(rf.searchQuery)}</b> 로 찾았습니다` +
        ` <span class="dim">(${esc(rf.matched.join(", "))})</span></p>`,
    );
  }

  // ★ 답이 맨 위다. 등급 라벨·매니페스트가 답보다 먼저 오면 **읽기 전에 지친다**(사용자 피드백).
  parts.push(renderModeToggle(turnId, mode));
  parts.push(`<div class="answer-body">${markup(a.text.trim(), turnId)}</div>`);

  // ⑥ 개인 적용 금지 — **한 줄은 접지 않고 남긴다.** 이건 고지라서 열어봐야 보이면 고지가 아니다.
  //   (§1.2 표준 문안 전문은 아래 접힌 칸 안에 토씨 그대로 들어간다.)
  if (!a.personalApplicationAllowed) {
    parts.push(`<p class="notice-strong">개인별 상황에 적용하거나 저축 계획 산출에 사용할 수 없습니다.</p>`);
  }

  // ★ 비포함 고지 — **접지 않는다.** 사양 §0-A.7 이 요구하는 표기이고, 접어 두면 고지가 아니다.
  //   실측: 조문 그대로 답한 세액공제율을 사용자가 "틀렸다"고 판정했다. 널리 알려진 값이
  //   지방소득세를 포함한 수치였기 때문이다 — 빠진 것을 말하지 않으면 답이 맞아도 틀린 것이 된다.
  //   판정 로직은 `fact/src/exclusions.ts` 에 있다. 렌더러가 교체돼도 규칙이 따라가야 한다.
  const exclusions = findExclusions(a.text);
  if (exclusions.length > 0) {
    parts.push(
      `<p class="notice"><b>이 답에 포함되지 않은 것</b><br>` +
        exclusions.map((t) => `· ${esc(t)}`).join("<br>") +
        `</p>`,
    );
  }

  // ③④ 근거 조문 — **접어서** 답변과 갈라 놓는다.
  //   펼쳐 두면 답변 바로 밑에 조문 카드가 이어져 **어디까지가 답인지 안 보인다**(사용자 피드백).
  //   대신 요약줄에 조문 **이름**을 적어, 펼치지 않고도 무엇을 근거로 삼았는지 읽히게 한다.
  //   본문의 `[n]` 을 누르면 브라우저가 이 칸을 열고 해당 카드로 내려간다(app.js).
  const srcNames = a.citations
    .map((c) => `${c.lawName} ${c.articleLabel}`)
    .filter((x, i, arr) => arr.indexOf(x) === i);
  const srcLabel =
    srcNames.length === 0
      ? "근거 조문 없음"
      : srcNames.length <= 2
        ? `근거 ${srcNames.join(" · ")}`
        : `근거 ${srcNames[0] ?? ""} 외 ${String(srcNames.length - 1)}건`;
  parts.push(
    `<details class="ev src-fold" id="srcs-${turnId}"><summary>${esc(srcLabel)}` +
      ` <span class="dim">— 원문 대조</span></summary>` +
      (a.citations.length === 0
        ? `<p class="notice">답변에서 인용된 조문이 없습니다.</p>`
        : a.citations.map((c) => renderCitation(c, turnId, m.queryAsOf)).join("\n")) +
      `</details>`,
  );

  const forged = a.citeReport.issues.filter((i) => i.kind === "UNKNOWN_REF");
  const uncited = a.citeReport.issues.filter((i) => i.kind === "UNCITED_CLAIM");

  // 등급·검증·매니페스트는 **접어서 아래로.** 매일 보는 정보가 아니라 따질 때 보는 정보다.
  //   요약줄에 등급과 건수를 적어 두면 **펼치지 않고도 무엇이 들어 있는지** 알 수 있다.
  const badge = `${CLASS_LABEL[a.answerClass].split(" — ")[0] ?? ""}`;
  const approvedCount = v.approved === undefined || v.approved === null ? null : v.approved.facts.length;
  parts.push(
    [
      `<details class="ev meta">`,
      `<summary>${esc(badge)} · 검증 ${String(forged.length + uncited.length + a.unsourcedAmounts.length)}건` +
        (approvedCount === null ? "" : ` · 승인 규칙 ${String(approvedCount)}건`) +
        ` <span class="dim">— 이 답이 어디서 왔는지</span></summary>`,
      v.approved === undefined ? "" : renderApproved(v.approved),
      `<p class="class-label ${a.answerClass === "REGISTRY_RESOLVED_FACT" ? "resolved" : "unmodeled"}">${esc(CLASS_LABEL[a.answerClass])}</p>`,
      a.notice === null ? "" : `<p class="notice">${esc(a.notice)}</p>`,
      // ★ 예시 가정값과 진짜 미확인 값을 갈라 센다. 뭉뚱그리면 "예를 들어 연봉 4,800만원이면"
      //   같은 정상 문장 때문에 경고가 매번 떠서 **아무도 안 보게 된다.**
      `<p class="verify">위조 인용 ${String(forged.length)}건 · 인용 없는 주장 ${String(uncited.length)}건 · ` +
        `미확인 금액 ${String(a.unsourcedAmounts.filter((x) => !x.assumed).length)}건` +
        (a.unsourcedAmounts.some((x) => x.assumed)
          ? ` <span class="dim">(예시 가정값 ${String(a.unsourcedAmounts.filter((x) => x.assumed).length)}건 별도)</span>`
          : "") +
        ` · §4.4 금지 문구 ${a.forbiddenPhrases.length === 0 ? "없음" : esc(a.forbiddenPhrases.join(", "))}` +
        (a.computedAmounts.length === 0 ? "" : ` · <b class="bad">계산한 금액 ${String(a.computedAmounts.length)}건</b>`) +
        `</p>`,
      renderIssues(forged, uncited, a.unsourcedAmounts, a.computedAmounts),
      renderManifest(m),
      `</details>`,
    ]
      .filter((x) => x !== "")
      .join("\n"),
  );

  // 다음 질문 — 이미 찾아 둔 조문에서만 뽑는다.
  parts.push(renderSuggestions(v.alsoConsidered ?? []));
  return parts.join("\n");
}

/** 최대 몇 개까지 제안할지. 많으면 고르는 게 일이 된다. */
const MAX_SUGGESTIONS = 4;

/**
 * "이어서 물어볼 것" 칩. **답에 쓰이지 않은 묶음 조문**을 그대로 낸다.
 *
 * 질문을 지어내지 않는 이유: 지어내면 **코퍼스에 없는 것을 묻게 만들 수 있다.**
 * 여기 뜬 것은 전부 이미 인출된 조문이라 누르면 반드시 근거가 나온다.
 * 덤으로 "검색은 이만큼 했는데 답에는 이것만 썼다"가 드러나 **묶음이 과했는지도 보인다.**
 */
function renderSuggestions(items: readonly BundleItem[]): string {
  if (items.length === 0) return "";
  const chips = items
    .slice(0, MAX_SUGGESTIONS)
    .map((i) => {
      const label = `${i.lawName} ${i.articleLabel}${i.title === null ? "" : ` (${i.title})`}`;
      const q = `${i.lawName} ${i.articleLabel}${i.title === null ? "" : ` ${i.title}`} 에 대해 알려줘`;
      return `<button type="button" class="suggest" data-ask="${esc(q)}">${esc(label)}</button>`;
    })
    .join("");
  return [
    `<div class="suggests">`,
    `  <p class="suggests-label">함께 찾았지만 이번 답에는 쓰이지 않은 조문 — 눌러서 이어 물어보세요</p>`,
    `  <div class="suggests-row">${chips}</div>`,
    `</div>`,
  ].join("\n");
}

/**
 * 근거가 안 붙은 문장을 **그대로 펼쳐 보여준다.**
 *
 * 왜: `인용 없는 주장 4건` 만 적으면 **어느 문장인지 알 수 없어 확인할 방법이 없다.**
 * 숫자는 문제가 있다는 것만 말하고, 문장은 무엇을 볼지 말한다.
 * 평가셋 실측에서 이 25건 중에는 `"연금저축계좌는 연 600만원"` 처럼 **숫자가 인용 없이 나간**
 * 것이 섞여 있었다 — 개수만 봤으면 못 찾았다.
 */
function renderIssues(
  forged: readonly CiteIssue[],
  uncited: readonly CiteIssue[],
  amounts: readonly AmountIssue[],
  computed: readonly ArithmeticIssue[] = [],
): string {
  if (forged.length === 0 && uncited.length === 0 && amounts.length === 0 && computed.length === 0) return "";
  const li = (xs: readonly CiteIssue[]): string =>
    xs.map((i) => `<li>${esc(i.sentence)}${i.sentence.length >= 80 ? "…" : ""}</li>`).join("");
  return [
    `<details class="issues">`,
    `  <summary>근거가 확인되지 않은 문장 보기 (${String(forged.length + uncited.length + computed.length)}건)</summary>`,
    // ★ 계산한 금액은 **가장 위**에 둔다. 위조 인용보다 조용하지만 같은 급의 위반이다 —
    //   재료가 다 근거 있는 값이라 다른 검사를 전부 통과하고 나온다.
    computed.length === 0
      ? ""
      : `  <p class="issues-label">⛔ 답변이 직접 계산한 금액 — 규칙 10 위반 (계산은 승인된 규칙으로만)</p><ul>` +
        computed.map((x) => `<li><b>${esc(x.expression)}</b> — ${esc(x.sentence)}…</li>`).join("") +
        `</ul>`,
    forged.length === 0 ? "" : `  <p class="issues-label">⛔ 위조 인용 — 제공하지 않은 번호</p><ul>${li(forged)}</ul>`,
    uncited.length === 0 ? "" : `  <p class="issues-label">⚠️ 인용이 없는 문장</p><ul>${li(uncited)}</ul>`,
    // ★ 금액이 인용 조문에 없다 = **형식이 아니라 값**이 확인 안 된 것. 위조 인용보다 조용하고 더 위험하다.
    amounts.filter((x) => !x.assumed).length === 0
      ? ""
      : `  <p class="issues-label">💰 인용 조문에서 확인되지 않은 금액</p><ul>` +
        amounts
          .filter((x) => !x.assumed)
          .map((x) => `<li><b>${esc(x.asWritten)}</b> — ${esc(x.sentence)}…</li>`)
          .join("") +
        `</ul>`,
    // 가정 예시는 **오류가 아니라 정상 출력**이다(규칙 10). 그래도 숨기지는 않는다 —
    // 가정으로 위장한 법정 값이 있으면 사람이 여기서 알아볼 수 있어야 한다.
    amounts.filter((x) => x.assumed).length === 0
      ? ""
      : `  <p class="issues-label dim">예시 가정값 — "예를 들어…" 로 밝힌 금액입니다 (조문 값이 아님)</p><ul class="dim">` +
        amounts
          .filter((x) => x.assumed)
          .map((x) => `<li><b>${esc(x.asWritten)}</b> — ${esc(x.sentence)}…</li>`)
          .join("") +
        `</ul>`,
    `  <p class="issues-note">이 문장들은 <b>틀렸다는 뜻이 아니라 대조할 근거가 화면에 없다는 뜻</b>입니다. 위 근거 조문 원문에서 직접 확인하세요.</p>`,
    `</details>`,
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** 사용자가 친 질문 말풍선. */
export function renderQuestion(query: string): string {
  return `<div class="turn-q"><p>${esc(query)}</p></div>`;
}

/** 질문 + 답변을 한 덩어리로. 대화 이력을 다시 그릴 때 쓴다. */
export function renderTurn(query: string, bodyHtml: string, turnId: string): string {
  return [
    `<section class="turn" id="turn-${esc(turnId)}">`,
    renderQuestion(query),
    `  <div class="turn-a" data-turn-body="${esc(turnId)}">${bodyHtml}</div>`,
    `</section>`,
  ].join("\n");
}

/** Router 가 PLAN 으로 보냈는데 **맞는 계산 시나리오가 없을 때** — 계산이 아니라 안내다. */
export function renderPlan(message: string, matched: readonly string[]): string {
  return [
    `<p class="class-label plan">PLAN 영역 — 이 질문에 맞는 계산 시나리오가 없습니다</p>`,
    // pre-wrap 이 줄바꿈을 처리하므로 <br> 를 덧붙이지 않는다 (붙이면 줄 간격이 두 배가 된다).
    `<div class="answer-body">${markup(message, "plan")}</div>`,
    `<p class="verify">걸린 신호: ${esc(matched.join(", "))}</p>`,
  ].join("\n");
}

/** 코퍼스에서 근거를 못 찾았을 때 (§4.2). */
export function renderReject(message: string, reason: string): string {
  return [
    `<p class="class-label reject">답변하지 않음</p>`,
    `<div class="answer-body">${esc(message)}</div>`,
    `<p class="verify">사유: ${esc(reason)}</p>`,
  ].join("\n");
}
