import { useCallback, useEffect, useRef, useState } from "react";
import { Scale, X, Plus, ArrowUp, Square } from "lucide-react";
import { cubeEnabled, cubeNewConversation, cubeStream } from "../../lib/cubeApi.js";
import { CubeThread } from "./CubeThread.jsx";
import styles from "./CubeCopilot.module.css";

/* ------------------------------------------------------------------ *
 *  CUBE 세법 팩트 — 떠 있는 버튼을 누르면 들어가는 코파일럿 패널
 *
 *  · 엔진은 사이드카다. VITE_CUBE_API_BASE 가 비면 **버튼 자체를 렌더하지 않는다**
 *    → 배포본은 기존 앱과 완전히 같은 화면이 된다.
 *  · createPortal(document.body) 를 쓰지 않는다. PhoneShell 의 .scaled 가
 *    transform: scale() 이라 position:fixed 의 기준 상자를 만들어 버려서,
 *    body 로 포탈하면 ?frame=1 데모에서 버튼이 베젤 밖으로 튀어나온다.
 *    → 셸의 자식으로 들어가고, framed 일 때만 absolute 로 눕는다.
 * ------------------------------------------------------------------ */

// 로그인 전 화면에서는 숨긴다 (사용자 결정: "로그인 이후 전 화면").
const HIDDEN_STEPS = new Set(["splash", "intro", "login", "authWait"]);

const STARTERS = [
  "ISA 비과세 한도가 얼마야?",
  "연금저축 세액공제율 알려줘",
  "IRP 중도해지하면 어떻게 돼?",
];

export function CubeCopilot({ step, framed = false }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const convId = useRef(null);
  const seq = useRef(0);
  const aborter = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const ask = useCallback(async (query) => {
    const text = query.trim();
    if (busy || text === "") return;
    setBusy(true);
    setQ("");

    const id = ++seq.current;
    setTurns((prev) => [...prev, { id, q: text, stage: "", live: "", html: null, done: false }]);
    const patch = (fields) =>
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));

    aborter.current = new AbortController();
    const r = await cubeStream(
      "/api/ask/stream",
      { query: text, convId: convId.current },
      {
        signal: aborter.current.signal,
        onStart: (ev) => { convId.current = ev.convId; },
        onStage: (t) => patch({ stage: t }),
        onDelta: (t) =>
          setTurns((prev) =>
            prev.map((x) => (x.id === id ? { ...x, stage: "", live: x.live + t } : x)),
          ),
        onFinal: (html) => patch({ html }),
      },
    );
    // 실패해도 중간까지 흘러온 글은 남긴다 — 빈 화면으로 덮지 않는다.
    if (!r.ok) patch({ stage: r.error, done: true });
    aborter.current = null;
    setBusy(false);
  }, [busy]);

  const reset = async () => {
    if (busy) return;
    convId.current = await cubeNewConversation();
    setTurns([]);
    setQ("");
    inputRef.current?.focus();
  };

  // 새 글자가 흐르면 따라 내려간다. 위로 올려 읽는 중이면 방해하지 않는다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 260) el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  if (!cubeEnabled || HIDDEN_STEPS.has(step)) return null;

  const pos = framed ? styles.framed : styles.floating;

  return (
    <div className={`${styles.root} ${pos}`}>
      {open && (
        <>
          <div className={styles.scrim} onClick={() => setOpen(false)} />
          <section className={styles.panel} role="dialog" aria-label="CUBE 세법 팩트">
            <header className={styles.head}>
              <span className={styles.mark}><Scale size={15} /></span>
              <div className={styles.headText}>
                <b>세법 팩트</b>
                <span>ISA · 연금저축 · IRP — 법령 원문 인용</span>
              </div>
              <button type="button" className={styles.iconBtn} onClick={reset} aria-label="새 대화">
                <Plus size={17} />
              </button>
              <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="닫기">
                <X size={17} />
              </button>
            </header>

            <div className={styles.scroll} ref={scrollRef}>
              {turns.length === 0 && (
                <div className={styles.empty}>
                  <p className={styles.emptyLead}>
                    세법은 <b>조문 원문</b>으로만 답합니다. 근거가 없으면 답하지 않습니다.
                  </p>
                  <ul className={styles.chips}>
                    {STARTERS.map((s) => (
                      <li key={s}>
                        <button type="button" onClick={() => ask(s)}>{s}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* convId 는 값이 아니라 ref 로 넘긴다 — 렌더 시점에 읽으면 스트림이
                  방금 받은 convId 를 놓친다(말투 토글이 엉뚱한 대화로 간다). */}
              <CubeThread turns={turns} busy={busy} convIdRef={convId} onAsk={ask} onBusy={setBusy} />
            </div>

            <form
              className={styles.composer}
              onSubmit={(e) => { e.preventDefault(); ask(q); }}
            >
              <textarea
                ref={inputRef}
                className={styles.input}
                rows={1}
                value={q}
                placeholder="세법에 대해 물어보세요"
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(q);
                  }
                }}
              />
              {busy ? (
                <button
                  type="button"
                  className={styles.stop}
                  onClick={() => aborter.current?.abort()}
                  aria-label="중지"
                >
                  <Square size={15} />
                </button>
              ) : (
                <button type="submit" className={styles.send} aria-label="보내기" disabled={q.trim() === ""}>
                  <ArrowUp size={17} />
                </button>
              )}
            </form>
          </section>
        </>
      )}

      <button
        type="button"
        className={styles.fab}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="세법 팩트 열기"
      >
        {open ? <X size={20} /> : <Scale size={20} />}
      </button>
    </div>
  );
}
