import { useCallback, useEffect, useRef, useState } from "react";
import { Scale, X, Plus, ArrowUp, Square } from "lucide-react";
import { cubeConfigured, cubeNewConversation, cubeStream } from "../../lib/cubeApi.js";
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

/*
 * KNOWN-LIMITATION(화면 값 주입): 화면이 아는 소득·나이를 질문 뒤에 붙여 보내면
 * "ISA 한도는 400 또는 200" 이 "당신은 200" 까지 좁혀진다. 실제로 동작도 했다.
 * 그런데 **그건 안전장치를 우회한 것**이었다 — fact/src/router.ts 가 개인 수치를
 * FACT 엔진에서 걷어내는 이유가 사양 §1.2(개인 적용 금지)와 절대 규칙 3(계산 경로
 * LLM 금지)이고, 라우터 주석에 그 사고(세액공제를 LLM 이 90만원으로 계산해 버림)가
 * 실측으로 남아 있다. 우리 시도가 통과한 건 조사("총급여는", "40세야")가 정규식을
 * 빗겨간 덕이지 허용된 경로여서가 아니다.
 * → 올바른 경로는 PLAN(승인된 규칙으로 계산, rule id 추적) 쪽이다. 그건 미션 2 소관이라
 *   여기서 임의로 뚫지 않는다. 화면 값은 보내지 않는다.
 */

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
    if (busy || text === "" || !cubeConfigured) return;
    setBusy(true);
    setQ("");

    const id = ++seq.current;
    setTurns((prev) => [...prev, { id, q: text, stage: "", live: "", phase: 0, html: null, done: false }]);
    const patch = (fields) =>
      setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...fields } : t)));

    aborter.current = new AbortController();
    const r = await cubeStream(
      "/api/ask/stream",
      { query: text, convId: convId.current },
      {
        signal: aborter.current.signal,
        onStart: (ev) => { convId.current = ev.convId; },
        // 단계는 뒤로 가지 않는다 — 답변 뒤에 오는 "다시 쓰는 중" 이 레일을 되돌리면 안 된다.
        onStage: (t) =>
          setTurns((prev) =>
            prev.map((x) =>
              x.id === id ? { ...x, stage: t, phase: Math.max(x.phase, t.includes("읽는") ? 1 : 0) } : x,
            ),
          ),
        onDelta: (t) =>
          setTurns((prev) =>
            prev.map((x) => (x.id === id ? { ...x, stage: "", phase: 2, live: x.live + t } : x)),
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

  if (HIDDEN_STEPS.has(step)) return null;

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
              {/* 주소를 모르면 숨기지 말고 왜 못 쓰는지 말한다. 실패할 요청을 던지지도 않는다. */}
              {!cubeConfigured ? (
                <div className={styles.empty}>
                  <p className={styles.emptyLead}>
                    <b>세법 엔진이 연결되어 있지 않습니다.</b>
                  </p>
                  <p className={styles.emptyNote}>
                    이 기능은 법령 원문을 들고 있는 별도 엔진이 있어야 답할 수 있습니다.
                    엔진 소스는 이 저장소의 <code>cube-engine/</code> 에 있습니다.
                  </p>
                  <p className={styles.emptyNote}>
                    로컬에서는 저장소 루트에서 <code>npm run dev:cube</code> 로 함께 띄웁니다.
                    다른 곳에 띄운 엔진을 쓰려면 <code>VITE_CUBE_API_BASE</code> 에 그 주소를 넣으세요.
                    준비 과정은 <code>cube-engine/README.md</code> 에 있습니다.
                  </p>
                </div>
              ) : (
                <>
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
                  <CubeThread turns={turns} busy={busy} convIdRef={convId} onAsk={ask} onBusy={setBusy} />
                </>
              )}
            </div>

            {/* 엔진이 없으면 입력창도 내린다 — 쳐 봐야 갈 데가 없는 칸은 없느니만 못하다 */}
            {cubeConfigured && (
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
            )}
          </section>
        </>
      )}

      <button
        type="button"
        className={`${styles.fab} ${busy && !open ? styles.fabBusy : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "세법 팩트 닫기" : "세법 팩트 열기"}
      >
        {open ? <X size={20} /> : <Scale size={20} />}
      </button>
    </div>
  );
}
