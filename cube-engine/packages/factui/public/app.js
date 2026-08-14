// 브라우저 쪽은 fetch 하고 innerHTML 에 꽂는 것이 전부다.
// 값 가공·계산은 한 줄도 없다 (절대 규칙 8). 원문 접기는 <details> 가 네이티브로 해준다.
// 서버가 HTML 을 통째로 주므로 여기엔 표시 규칙도 없다 — 라벨·스탬프·고지가 갈라지지 않는다.

const form = document.getElementById("ask");
const qInput = document.getElementById("q");
const asOfInput = document.getElementById("asof");
const status = document.getElementById("status");
const thread = document.getElementById("thread");
const chips = document.getElementById("chips");
const convList = document.getElementById("conv-list");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");

let convId = null;
let busy = false;

function setStatus(text) {
  status.textContent = text;
  status.hidden = text === "";
}

function setBusy(on) {
  busy = on;
  sendBtn.hidden = on;
  stopBtn.hidden = !on;
}

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function refreshConvList() {
  const res = await fetch("/api/conversations");
  const data = await res.json();
  convList.innerHTML = "";
  for (const c of data.conversations) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = c.title;
    b.className = c.id === convId ? "on" : "";
    b.addEventListener("click", () => openConversation(c.id));
    li.appendChild(b);
    convList.appendChild(li);
  }
}

async function openConversation(id) {
  if (busy) return;
  const res = await fetch(`/api/conversation/${encodeURIComponent(id)}`);
  const data = await res.json();
  convId = data.convId ?? id;
  thread.innerHTML = data.html ?? "";
  chips.hidden = thread.children.length > 0;
  refreshConvList();
}

// 스트리밍 중에는 서버가 준 델타를 **텍스트 그대로** 쌓는다. 서식·근거·매니페스트는
// 검증이 끝난 뒤 서버가 보내는 최종 HTML 로 통째로 교체된다.
// 브라우저는 여기서도 값을 만들지 않는다 — 붙이고, 바꿔 끼울 뿐이다.
let aborter = null;

async function ask(query) {
  if (busy || query.trim() === "") return;
  setBusy(true);
  chips.hidden = true;
  qInput.value = "";
  autoGrow();

  // 질문 말풍선과 빈 답변 자리를 **즉시** 만든다. 기다림이 빈 화면이면 안 된다.
  const slot = document.createElement("section");
  slot.className = "turn streaming";
  slot.innerHTML = `<div class="turn-q"><p></p></div><div class="turn-a"><p class="stage"></p><div class="answer-body live"></div></div>`;
  slot.querySelector(".turn-q p").textContent = query;
  thread.appendChild(slot);
  slot.scrollIntoView({ behavior: "smooth", block: "start" });

  const stageEl = slot.querySelector(".stage");
  const liveEl = slot.querySelector(".answer-body.live");
  aborter = new AbortController();
  await consumeStream(
    "/api/ask/stream",
    { query, asOf: asOfInput.value, convId },
    {
      stage: stageEl,
      live: liveEl,
      replace: (html) => {
        slot.outerHTML = html;
      },
      onStart: (ev) => {
        convId = ev.convId;
      },
    },
  );

  slot.classList.remove("streaming");
  aborter = null;
  setBusy(false);
  refreshConvList();
}

/**
 * NDJSON 스트림 하나를 소비한다 — **질의와 말투 토글이 공유한다.**
 *
 * 브라우저가 하는 일: 델타를 텍스트로 쌓고, `final` 이 오면 서버가 준 HTML 로 갈아끼운다.
 * 서식·근거·매니페스트는 전부 서버가 만든다 — 여기서 만들면 라벨·고지가 두 벌이 된다.
 */
async function consumeStream(url, body, ui) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: aborter === null ? undefined : aborter.signal,
    });
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
        if (line.trim() === "") continue;
        const ev = JSON.parse(line);
        if (ev.type === "start" && ui.onStart !== undefined) ui.onStart(ev);
        else if (ev.type === "stage") ui.stage.textContent = ev.text;
        else if (ev.type === "delta") {
          ui.stage.textContent = "";
          ui.live.textContent += ev.text;
          if (nearBottom()) ui.live.scrollIntoView({ behavior: "auto", block: "end" });
        } else if (ev.type === "final") ui.replace(ev.html);
      }
    }
  } catch (e) {
    // 실패를 그럴듯한 답으로 덮지 않는다. 중간까지 흘러온 글도 남겨 둔다.
    ui.stage.textContent = e.name === "AbortError" ? "중지했습니다." : `요청 실패: ${e.message}`;
  }
}

function nearBottom() {
  return window.innerHeight + window.scrollY >= document.body.offsetHeight - 240;
}

/**
 * 입력창이 내용에 맞춰 늘어난다 (Claude/GPT 처럼).
 * 상한은 CSS `max-height` 가 잡는다 — JS 로 자르면 `no-computation.test.ts` 가 잡고,
 * 그 검사는 옳다. 여기서 숫자를 다루기 시작하면 다른 숫자도 다루게 된다.
 */
function autoGrow() {
  qInput.style.height = "auto";
  qInput.style.height = `${qInput.scrollHeight}px`;
}

// 제안 칩 — 답변 안에 나중에 생기므로 위임. 지어낸 질문이 아니라
// **이미 찾아 둔 조문**이라 누르면 반드시 근거가 나온다.
thread.addEventListener("click", (e) => {
  const chip = e.target.closest(".suggest");
  if (chip === null || busy) return;
  ask(chip.dataset.ask);
});

// 되묻기 — 보기를 누르거나 직접 입력하면 **원래 질문 뒤에 문장을 이어붙여** 다시 묻는다.
// 브라우저는 계산하지 않는다. 문자열을 잇고 서버에 보낼 뿐이다(절대 규칙 8).
function lastQuestionText(el) {
  const turn = el.closest(".turn");
  return turn === null ? "" : (turn.querySelector(".turn-q p")?.textContent ?? "");
}

thread.addEventListener("click", (e) => {
  const opt = e.target.closest(".ask-opt");
  if (opt !== null && !busy) {
    ask(`${lastQuestionText(opt)} ${opt.dataset.append}`);
    return;
  }
  const go = e.target.closest(".ask-go");
  if (go === null || busy) return;
  const box = go.closest(".ask");
  // 직접 입력이 있으면 그것을, 없으면 슬라이더 값을 쓴다. **둘 다 숫자를 문자열로 옮길 뿐**이다.
  const typed = box.querySelector(".ask-input").value.trim();
  const slider = box.querySelector(".ask-range");
  const raw = typed !== "" ? typed : (slider === null ? "" : slider.value);
  if (raw === "" || raw === "0") return;
  const unit = box.querySelector(".ask-unit").textContent;
  ask(`${lastQuestionText(go)} ${raw}${unit} 납입했어`);
});

// 슬라이더를 움직이면 옆 숫자가 따라간다. 값을 **옮기기만** 한다 — 계산하지 않는다.
thread.addEventListener("input", (e) => {
  if (!e.target.classList.contains("ask-range")) return;
  const box = e.target.closest(".ask");
  box.querySelector(".ask-range-val").textContent = `${e.target.value}${box.querySelector(".ask-unit").textContent}`;
  box.querySelector(".ask-input").value = "";
});

// Enter 로도 적용되게 — 폼처럼 동작해야 손이 안 멈춘다.
thread.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !e.target.classList.contains("ask-input") || e.isComposing) return;
  e.preventDefault();
  e.target.closest(".ask").querySelector(".ask-go").click();
});

// 말투 토글 — 답변 안의 버튼은 나중에 생기므로 thread 에 위임한다.
// 질의와 **같은 스트림 소비기**를 쓴다. 갈라놓으면 한쪽만 고쳐지는 사고가 난다.
thread.addEventListener("click", async (e) => {
  const btn = e.target.closest(".mode-btn");
  if (btn === null || busy) return;
  if (btn.classList.contains("on")) return;
  const turnId = btn.dataset.turn;
  const box = thread.querySelector(`[data-turn-body="${turnId}"]`);
  if (box === null) return;

  setBusy(true);
  box.innerHTML = `<p class="stage">다른 말투로 다시 쓰는 중…</p><div class="answer-body live"></div>`;
  await consumeStream("/api/mode/stream", { convId, turnId, mode: btn.dataset.mode }, {
    stage: box.querySelector(".stage"),
    live: box.querySelector(".answer-body.live"),
    replace: (html) => {
      box.innerHTML = html;
    },
  });
  setBusy(false);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  ask(qInput.value);
});

// Enter 로 보내고 Shift+Enter 로 줄바꿈 — 채팅창의 표준 동작.
qInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    ask(qInput.value);
  }
});
qInput.addEventListener("input", autoGrow);

stopBtn.addEventListener("click", () => {
  if (aborter !== null) aborter.abort();
});

for (const b of chips.querySelectorAll("button")) {
  b.addEventListener("click", () => ask(b.dataset.q));
}

document.getElementById("new-chat").addEventListener("click", async () => {
  if (busy) return;
  const data = await post("/api/new", {});
  convId = data.convId;
  thread.innerHTML = "";
  chips.hidden = false;
  qInput.value = "";
  qInput.focus();
  refreshConvList();
});

refreshConvList();

// 본문의 [n] 을 누르면 **근거 칸을 열고** 그 조문으로 내려간다.
// 근거를 접어 두면(답변과 구별되게) 링크가 죽은 것처럼 보이는데, 링크가 스스로 여는 게 맞다.
thread.addEventListener("click", (e) => {
  const ref = e.target.closest("a.ref");
  if (ref === null) return;
  const card = document.querySelector(ref.getAttribute("href"));
  if (card === null) return;
  e.preventDefault();
  for (let el = card.parentElement; el !== null; el = el.parentElement) {
    if (el.tagName === "DETAILS") el.open = true;
  }
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 1200);
});
