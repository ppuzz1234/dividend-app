import { KIS } from "./config.js";

/* ------------------------------------------------------------------ *
 *  access_token 매니저
 *  · POST /oauth2/tokenP 로 발급 (유효 24h) → 메모리 캐시
 *  · 만료 60초 전 갱신
 *  · WebSocket용 approval_key 는 추후 실시간 중계 단계에서 추가
 * ------------------------------------------------------------------ */
let cache = null; // { token, exp }
let inflight = null;

export async function getAccessToken() {
  if (!KIS.hasKeys) throw new Error("KIS_APP_KEY/SECRET 미설정");
  if (cache && cache.exp > Date.now() + 60_000) return cache.token;
  if (inflight) return inflight; // 동시 요청 합치기

  inflight = (async () => {
    const res = await fetch(`${KIS.base.rest}/oauth2/tokenP`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        appkey: KIS.appKey,
        appsecret: KIS.appSecret,
      }),
    });
    if (!res.ok) throw new Error(`token 발급 실패 ${res.status}`);
    const j = await res.json();
    const ttl = (Number(j.expires_in) || 86400) * 1000;
    cache = { token: j.access_token, exp: Date.now() + ttl };
    return cache.token;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
