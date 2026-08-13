/* ------------------------------------------------------------------ *
 *  CUBE 세법 팩트 엔진 클라이언트 — 사이드카(A4-RAG)의 NDJSON 스트림 소비
 *
 *  · BASE 는 **URL 하나뿐**이다. LLM 키는 사이드카 쪽 .env 에만 있고
 *    브라우저로 내려오지 않는다 (VITE_ 변수는 번들에 그대로 노출된다).
 *  · quotes.js / strategyApi.js 와 달리 /api 프록시(:4000)를 쓰지 않는다.
 *    엔진은 별도 포트라 절대 URL 로 부른다.
 *
 *  ## 개발 서버는 켜진 채로 온다
 *  브랜치를 받아 `npm run dev` 만 하면 설정 없이 버튼이 보여야 리뷰가 된다.
 *  꺼진 채로 올리고 "환경변수를 넣으면 켜집니다" 라고 하면 리뷰어는 아무것도 못 본다.
 *
 *  ## 프로덕션 빌드는 여전히 명시 설정이 필요하다
 *  세법 엔진은 이 저장소 밖에서 도는 사이드카다. 배포본에서 기본으로 켜면
 *  **눌러도 안 되는 버튼**이 실사용자에게 남는다. 그래서 배포 빌드는 env 가 있을 때만 켠다.
 *  (`import.meta.env.DEV` 는 dev 서버에서만 true — 빌드 시 상수로 접힌다)
 * ------------------------------------------------------------------ */
const DEV_DEFAULT = "http://127.0.0.1:8787";
const CONFIGURED = (import.meta.env.VITE_CUBE_API_BASE || "").trim();
const BASE = (CONFIGURED !== "" ? CONFIGURED : import.meta.env.DEV ? DEV_DEFAULT : "").replace(/\/+$/, "");

export const cubeEnabled = BASE !== "";

/** 새 대화 — 서버가 convId 를 만든다. 실패하면 null(호출부가 기존 convId 유지). */
export async function cubeNewConversation() {
  try {
    const r = await fetch(`${BASE}/api/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error(`new ${r.status}`);
    return (await r.json()).convId ?? null;
  } catch {
    return null;
  }
}

/**
 * NDJSON 스트림 하나를 소비한다 — 질문(/api/ask/stream)과 말투 토글(/api/mode/stream)이 공유한다.
 * 갈라놓으면 한쪽만 고쳐지는 사고가 난다 (엔진 쪽 app.js 와 같은 이유).
 *
 * 이벤트: {type:"start",convId} · {type:"stage",text} · {type:"delta",text} · {type:"final",html}
 * 화면이 만드는 값은 없다 — 서버가 준 텍스트를 쌓고, final HTML 로 갈아끼울 뿐이다(절대 규칙 8).
 *
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function cubeStream(path, body, { onStart, onStage, onDelta, onFinal, signal } = {}) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || res.body === null) throw new Error(`엔진 응답 ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? ""; // 마지막 조각은 다음 청크와 이어붙인다
      for (const line of lines) {
        if (line.trim() === "") continue;
        const ev = JSON.parse(line);
        if (ev.type === "start") onStart?.(ev);
        else if (ev.type === "stage") onStage?.(ev.text);
        else if (ev.type === "delta") onDelta?.(ev.text);
        else if (ev.type === "final") onFinal?.(ev.html);
      }
    }
    return { ok: true };
  } catch (e) {
    // 실패를 그럴듯한 답으로 덮지 않는다. 중간까지 흘러온 글도 남긴다.
    if (e.name === "AbortError") return { ok: false, error: "중지했습니다." };
    // 엔진은 별도 프로세스라 안 떠 있을 수 있다. raw fetch 오류를 그대로 보이지 않고,
    // 무엇을 해야 하는지까지 말해 준다 — 리뷰어가 여기서 막히면 기능을 못 본다.
    return { ok: false, error: `세법 엔진(${BASE})에 연결되지 않았어요. 엔진을 먼저 실행하세요 — components/cube/README.md` };
  }
}
