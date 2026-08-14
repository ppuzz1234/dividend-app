/**
 * PLAN 결과 렌더 — 계산했으면 **추적 가능한 표**로, 못 했으면 **무엇이 없는지**.
 *
 * ## 왜 LLM 답변과 다르게 생겼나
 * 이 값들은 **문장이 아니라 계산 결과**다. 각 줄이 어느 승인 규칙에서 나왔는지 붙어 있고,
 * 그래서 `[n]` 인용이 아니라 **규칙 id** 를 단다. FACT 답변은 조문을 가리키고, PLAN 결과는
 * **승인된 규칙**을 가리킨다 — 사양 §1.1 의 두 층이 화면에서도 갈라져 보여야 한다.
 */

import type { PlanRun } from "@cube/plan";

import { esc } from "./render.js";

/** 승인 절차 안내 — "안 됩니다"로 끝내지 않고 **채우는 방법**을 준다. */
const HOW_TO_APPROVE =
  "이 값은 사람이 조문 원문과 대조해 승인해야 계산에 쓸 수 있습니다 (사양 §2.2). " +
  "`npm run draft -w @cube/packdraft -- <조문 id>` 로 초안을 만들고, 대조표를 본 뒤 승인합니다.";

/**
 * 되묻기 카드 — **선택지 + 직접 입력.**
 *
 * ## 왜 선택지가 적은가
 * 보기는 **승인된 규칙에서 나온 값만** 쓴다. 소득 구간 같은 기준값은 세법 값이라 UI 가
 * 지어내면 절대 규칙 1 위반이다. 그래서 보기가 없으면 **없는 채로 직접 입력**을 받는다 —
 * *보기가 없다는 것 자체가 "그 기준값이 아직 승인 안 됐다"는 정보다.*
 *
 * ## 브라우저는 계산하지 않는다
 * 입력값은 **문장으로 이어붙여** 다시 질문할 뿐이다(`"… 600만원 납입했어"`).
 * 그 문장을 다시 서버가 읽고, 계산은 서버의 코드가 한다(절대 규칙 8).
 */
function renderAsk(spec: {
  question: string;
  unit: string;
  options: readonly { label: string; phrase: string; fromRule: string }[];
  range?: { min: string; max: string; step: string; maxLabel: string } | undefined;
}): string {
  const chips = spec.options
    .map(
      (o) =>
        `<button type="button" class="suggest ask-opt" data-append="${esc(o.phrase)}" title="근거 규칙 ${esc(o.fromRule)}">` +
        `${esc(o.label)}</button>`,
    )
    .join("");
  return [
    `<div class="ask">`,
    `  <p class="ask-q">${esc(spec.question)}</p>`,
    spec.options.length === 0
      ? `  <p class="ask-note">고를 수 있는 보기가 없습니다 — 이 항목의 기준값이 아직 승인되지 않아서입니다. 직접 적어 주세요.</p>`
      : `  <div class="suggests-row">${chips}</div>`,
    // 슬라이더는 **범위를 승인 규칙에서 받은 경우에만** 그린다. 없으면 직접 입력만.
    spec.range === undefined
      ? ""
      : [
          `  <div class="ask-slider">`,
          `    <input type="range" class="ask-range" min="${esc(spec.range.min)}" max="${esc(spec.range.max)}" step="${esc(spec.range.step)}" value="${esc(spec.range.min)}">`,
          `    <div class="ask-range-meta"><span class="ask-range-val">0${esc(spec.unit)}</span>`,
          `      <span class="dim">0 ~ ${esc(spec.range.maxLabel)} (한도) — 넘는 금액은 아래에 직접 적어 주세요</span></div>`,
          `  </div>`,
        ].join("\n"),
    `  <div class="ask-form">`,
    `    <input type="text" class="ask-input" inputmode="numeric" placeholder="직접 입력">`,
    `    <span class="ask-unit">${esc(spec.unit)}</span>`,
    `    <button type="button" class="ask-go">적용</button>`,
    `  </div>`,
    `</div>`,
  ].join("\n");
}

/**
 * 조문 답변 **아래에 덧붙일** 계산 제안.
 *
 * ## 왜 FACT 답을 가로채지 않고 덧붙이나
 * `"나 얼마까지 넣을 수 있어?"` 는 Router 가 FACT 로 보낸다(개인 지시어가 약해서). 그 판정이
 * 틀린 것도 아니다 — **조문 설명이 정답인 질문**이기도 하다. 그렇다고 계산을 못 하게 두면
 * 사용자가 원한 것을 못 준다. 그래서 **둘 다 준다**: 조문으로 설명하고, 아래에서 되묻는다.
 *
 * Router 의 판정을 넓히는 대신 이렇게 푼 이유: 마커를 넓히면 `"납입한도가 얼마인가"` 같은
 * 순수 제도 질의까지 PLAN 으로 걷혀 조문 설명을 잃는다(앞서 실제로 그런 오탐을 만들었다).
 * **막는 쪽을 넓히지 말고, 주는 쪽을 넓힌다.**
 */
export function renderPlanOffer(run: PlanRun): string {
  if (run.outcome.kind !== "NEEDS_INPUT") return "";
  return [
    `<div class="plan-offer">`,
    `  <p class="plan-offer-label">숫자로 확인해 드릴까요 — <b>${esc(run.outcome.scenario.title)}</b></p>`,
    ...run.outcome.asks.map((a) => renderAsk(a.spec)),
    `</div>`,
  ].join("\n");
}

export function renderPlanResult(run: PlanRun): string {
  const o = run.outcome;
  const parts: string[] = [`<p class="class-label plan-calc">③ 계산 결과 — 승인된 규칙으로 산출</p>`];

  // 무엇을 읽었는지 먼저 보여준다. 잘못 읽었으면 여기서 바로 드러나야 한다.
  const read = [
    run.situation.grossSalary === undefined ? "" : `총급여 <b>${esc(run.situation.grossSalary.asWritten)}</b>`,
    run.situation.comprehensiveIncome === undefined
      ? ""
      : `종합소득 <b>${esc(run.situation.comprehensiveIncome.asWritten)}</b>`,
    run.situation.contribution === undefined ? "" : `납입액 <b>${esc(run.situation.contribution.asWritten)}</b>`,
    run.situation.age === undefined ? "" : `나이 <b>${esc(run.situation.age.asWritten)}</b>`,
  ].filter((x) => x !== "");
  if (read.length > 0) {
    parts.push(`<p class="plan-read">읽은 값: ${read.join(" · ")} <span class="dim">— 다르면 다시 적어 주세요</span></p>`);
  }

  if (o.kind === "NO_SCENARIO") {
    return [
      `<p class="class-label plan">PLAN 영역 — 계산할 시나리오가 없습니다</p>`,
      `<div class="answer-body">이 질문에 맞는 계산 시나리오가 아직 없습니다. 지금 계산할 수 있는 것은 다음뿐입니다:</div>`,
      `<ul class="plan-gap"><li>연금계좌 연간 납입한도 초과 여부</li></ul>`,
      `<p class="notice">${esc(HOW_TO_APPROVE)}</p>`,
    ].join("\n");
  }

  if (o.kind === "NEEDS_INPUT") {
    // "값을 적어서 다시 물어보세요"로 끝내지 않는다 — **되묻고 채워서 계산한다.**
    parts.push(`<div class="answer-body"><b>${esc(o.scenario.title)}</b> 을 계산하려면 몇 가지만 더 알려주세요.</div>`);
    for (const a of o.asks) parts.push(renderAsk(a.spec));
    // 되물을 문구가 준비 안 된 항목은 이름만이라도 말한다 — 무엇이 없는지 아는 것이 먼저다.
    if (o.asks.length === 0) {
      parts.push(`<ul class="plan-gap">${o.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`);
    }
    return parts.join("\n");
  }

  if (o.kind === "NEEDS_RULE") {
    parts.push(
      `<div class="answer-body"><b>${esc(o.scenario.title)}</b> 은 아직 계산할 수 없습니다 — <b>승인된 정책 규칙이 없습니다.</b></div>`,
      `<ul class="plan-gap">${o.missingRules.map((r) => `<li><code>${esc(r)}</code></li>`).join("")}</ul>`,
      `<p class="notice">${esc(HOW_TO_APPROVE)}</p>`,
      `<p class="notice-strong">승인되지 않은 값을 추정해서 계산하지 않습니다. 그게 이 시스템의 전제입니다.</p>`,
    );
    return parts.join("\n");
  }

  // COMPUTED
  parts.push(`<p class="plan-headline">${esc(o.result.headline)}</p>`);
  parts.push(
    `<div class="tbl"><table><thead><tr><th>항목</th><th style="text-align:right">값</th><th>근거 규칙</th></tr></thead><tbody>` +
      o.result.steps
        .map(
          (s) =>
            `<tr><td>${esc(s.label)}</td><td style="text-align:right"><b>${esc(s.value)}</b></td>` +
            `<td>${s.fromRule === undefined ? '<span class="dim">입력값</span>' : `<code>${esc(s.fromRule)}</code>`}</td></tr>`,
        )
        .join("") +
      `</tbody></table></div>`,
  );

  // ★ 더 잘 맞았지만 못 한 것을 **반드시** 말한다 — 안 그러면 묻지 않은 답을 준 게 된다.
  if (o.skippedForMissingRules.length > 0) {
    parts.push(
      `<p class="plan-skipped">⛔ 요청하신 것 중 <b>아직 계산할 수 없는 것</b>이 있습니다:</p>`,
      `<ul class="plan-gap">` +
        o.skippedForMissingRules
          .map((s) => `<li><b>${esc(s.scenario.title)}</b> — 미승인 규칙 ${s.missingRules.map((r) => `<code>${esc(r)}</code>`).join(", ")}</li>`)
          .join("") +
        `</ul>`,
      `<p class="notice">${esc(HOW_TO_APPROVE)}</p>`,
    );
  }
  return parts.join("\n");
}
