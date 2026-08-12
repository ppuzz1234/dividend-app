import { useEffect, useRef } from "react";
import { CubeLoader } from "../ui/CubeLoader.jsx";
import { cubeStream } from "../../lib/cubeApi.js";
import styles from "./CubeThread.module.css";

/* ------------------------------------------------------------------ *
 *  대화 스레드 — 엔진이 만든 HTML 을 그대로 꽂는다.
 *
 *  엔진은 JSON 이 아니라 **렌더된 HTML** 을 준다(fact/src/render.ts).
 *  React 로 다시 그리면 렌더러가 두 벌이 되고, 클래스 라벨·합성값 스탬프·
 *  고지 문구가 두 곳에서 갈라진다. 그래서 마크업은 건드리지 않고
 *  CubeThread.module.css 가 호스트 토큰으로 **다시 칠하기만** 한다.
 *
 *  HTML 은 우리 서버가 render.ts 의 esc() 로 이스케이프해 만든다 —
 *  사용자 입력이 그대로 흘러들어오지 않는다.
 * ------------------------------------------------------------------ */

/** 이 턴의 원래 질문 — 되묻기가 "원 질문 + 답" 으로 다시 물을 때 쓴다. */
function questionOf(el) {
  const turn = el.closest(".turn");
  return turn === null ? "" : (turn.querySelector(".turn-q p")?.textContent ?? "");
}

/**
 * 답이 나오기까지 실제로 밟는 세 단계. 지어낸 단계가 아니라 엔진이 보내는
 * stage 이벤트 그대로다 — "관련 조문을 찾는 중…" → "조문 N개를 읽는 중…" → 델타 시작.
 * 이걸 보여주는 이유: 이 답이 LLM 한 방이 아니라 **검색 → 대조 → 작성**을 거친다는
 * 사실이 화면에 드러나야, 인용 [n] 이 장식이 아니라는 게 설명된다.
 *
 * 단계 판정이 어긋나도 손해가 없다 — 바로 아래에 엔진이 보낸 원문(stage)이 늘 그대로 찍힌다.
 */
const PHASES = ["조문 검색", "근거 확보", "답변 작성"];

function StageRail({ phase }) {
  return (
    <ol className={styles.rail} aria-hidden="true">
      {PHASES.map((label, i) => (
        <li key={label} className={i < phase ? styles.done : i === phase ? styles.now : styles.todo}>
          <i className={styles.dot} />
          {label}
        </li>
      ))}
    </ol>
  );
}

export function CubeThread({ turns, busy, convIdRef, onAsk, onBusy }) {
  const rootRef = useRef(null);

  // 답변 안의 버튼들은 스트리밍이 끝난 뒤에 생기므로 루트에 위임한다.
  // 여기서 하는 일은 전부 **문자열을 잇고 서버에 보내는 것**뿐이다 — 계산하지 않는다(절대 규칙 8).
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;

    const onClick = async (e) => {
      // 본문의 [n] → 근거 칸을 펼치고 그 조문으로 내려간다.
      const ref = e.target.closest("a.ref");
      if (ref !== null) {
        const card = root.querySelector(ref.getAttribute("href"));
        if (card === null) return;
        e.preventDefault();
        for (let el = card.parentElement; el !== null; el = el.parentElement) {
          if (el.tagName === "DETAILS") el.open = true;
        }
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("flash");
        setTimeout(() => card.classList.remove("flash"), 1200);
        return;
      }
      if (busy) return;

      // 제안 칩 — 지어낸 질문이 아니라 이미 찾아 둔 조문이라 누르면 반드시 근거가 나온다.
      const chip = e.target.closest(".suggest");
      if (chip !== null) return onAsk(chip.dataset.ask);

      const opt = e.target.closest(".ask-opt");
      if (opt !== null) return onAsk(`${questionOf(opt)} ${opt.dataset.append}`);

      const go = e.target.closest(".ask-go");
      if (go !== null) {
        const box = go.closest(".ask");
        // 직접 입력이 있으면 그것을, 없으면 슬라이더 값을 쓴다. 둘 다 옮기기만 한다.
        const typed = box.querySelector(".ask-input").value.trim();
        const slider = box.querySelector(".ask-range");
        const raw = typed !== "" ? typed : (slider === null ? "" : slider.value);
        if (raw === "" || raw === "0") return;
        return onAsk(`${questionOf(go)} ${raw}${box.querySelector(".ask-unit").textContent} 납입했어`);
      }

      // 말투 토글 — 질의와 **같은 스트림 소비기**를 쓴다.
      const btn = e.target.closest(".mode-btn");
      if (btn === null || btn.classList.contains("on")) return;
      const box = root.querySelector(`[data-turn-body="${btn.dataset.turn}"]`);
      if (box === null) return;

      onBusy(true);
      box.innerHTML = `<p class="stage">다른 말투로 다시 쓰는 중…</p><div class="answer-body live"></div>`;
      const stage = box.querySelector(".stage");
      const live = box.querySelector(".answer-body.live");
      const r = await cubeStream(
        "/api/mode/stream",
        { convId: convIdRef.current, turnId: btn.dataset.turn, mode: btn.dataset.mode },
        {
          onStage: (t) => { stage.textContent = t; },
          onDelta: (t) => { stage.textContent = ""; live.textContent += t; },
          // 이미 그려진 턴 안을 직접 갈아끼운다 — 엔진의 app.js 와 같은 방식이다.
          // React 는 dangerouslySetInnerHTML 안쪽을 관리하지 않으므로 충돌하지 않는다.
          onFinal: (html) => { box.innerHTML = html; },
        },
      );
      if (!r.ok) stage.textContent = r.error;
      onBusy(false);
    };

    // 슬라이더를 움직이면 옆 숫자가 따라간다. 값을 옮기기만 한다.
    const onInput = (e) => {
      if (!e.target.classList.contains("ask-range")) return;
      const box = e.target.closest(".ask");
      box.querySelector(".ask-range-val").textContent =
        `${e.target.value}${box.querySelector(".ask-unit").textContent}`;
      box.querySelector(".ask-input").value = "";
    };

    // Enter 로도 적용되게 — 폼처럼 동작해야 손이 안 멈춘다.
    const onKeyDown = (e) => {
      if (e.key !== "Enter" || !e.target.classList.contains("ask-input") || e.isComposing) return;
      e.preventDefault();
      e.target.closest(".ask").querySelector(".ask-go").click();
    };

    root.addEventListener("click", onClick);
    root.addEventListener("input", onInput);
    root.addEventListener("keydown", onKeyDown);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("keydown", onKeyDown);
    };
  }, [busy, convIdRef, onAsk, onBusy]);

  return (
    <div className={styles.thread} ref={rootRef}>
      {turns.map((t) =>
        t.html === null ? (
          // 스트리밍 중 — 기다림이 빈 화면이면 안 되므로 질문 말풍선을 즉시 세운다.
          <section className="turn streaming" key={t.id}>
            <div className="turn-q"><p>{t.q}</p></div>
            <div className="turn-a">
              {t.live === "" && !t.done && (
                <div className={styles.searching}>
                  {/* 이 앱의 브랜드 로더를 그대로 쓴다 — 조문을 뒤지는 동안이 가장 긴 구간이다 */}
                  <CubeLoader size={62} bare />
                  <StageRail phase={t.phase} />
                </div>
              )}
              <p className="stage">{t.stage}</p>
              <div className={t.done ? "answer-body" : "answer-body live"}>{t.live}</div>
            </div>
          </section>
        ) : (
          <div key={t.id} dangerouslySetInnerHTML={{ __html: t.html }} />
        ),
      )}
    </div>
  );
}
