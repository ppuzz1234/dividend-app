import { supabase, hasSupabase } from "../lib/supabase.js";

/* ============================================================
   구글 로그인 — Supabase Auth OAuth (실연동 전용, 데모 폴백 없음)

   설정:
     1) apps/web/.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
     2) Supabase 대시보드 > Authentication > Providers > Google 활성화
        (Google Cloud Console 의 OAuth 클라이언트 ID/시크릿 등록)
     3) Google Cloud Console 승인된 리디렉션 URI 에
        https://[PROJECT-REF].supabase.co/auth/v1/callback 등록
     4) Supabase > Authentication > URL Configuration 의 Redirect URLs 에
        로컬(http://localhost:5173/**)·운영 도메인 모두 등록
   ============================================================ */

/* 팝업이 차단된 경우 — 화면에서 수동 이동 링크를 제공하기 위한 에러 타입 */
export class BlockedRedirectError extends Error {
  constructor(url) {
    super("브라우저가 팝업을 막았어요. 아래 링크로 계속 진행해 주세요.");
    this.name = "BlockedRedirectError";
    this.url = url;
  }
}

/* 이 창이 구글 인증용 팝업인지 — redirectTo 에 authpopup=1 을 붙여 식별한다.
 * (App 에서 세션 확인 후 window.close() 하는 데 사용) */
export const isAuthPopup = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).has("authpopup");

/* ------------------------------------------------------------------ *
 *  방식 1) 레이어 모달 — Google Identity Services(GIS) 공식 버튼 + FedCM
 *  구글 인증 페이지는 iframe 삽입이 차단(403)되므로, 새 창(팝업) 없이
 *  페이지 안에서 끝내려면 GIS 가 유일한 방법이다. 로그인 화면이 자체 모달
 *  레이어를 띄우고 그 안에 공식 버튼을 렌더(mountGoogleButton)하면, 클릭 시
 *  (FedCM 지원 브라우저에선) 브라우저 모달로 계정 선택이 진행되고 받은
 *  ID 토큰으로 signInWithIdToken 해 Supabase 세션을 만든다.
 *
 *  설정(레이어 모달을 쓰려면):
 *    1) .env.local 에 VITE_GOOGLE_CLIENT_ID=[Google OAuth 웹 클라이언트 ID]
 *    2) Supabase > Authentication > Providers > Google 의 "Authorized Client IDs"
 *       (Client IDs 필드)에 같은 클라이언트 ID 추가
 *    3) Google Cloud Console 의 "승인된 JavaScript 원본"에 오리진 등록
 *       (http://localhost:5173 · 운영 도메인)
 *  미설정 시 자동으로 방식 2(팝업창)로 폴백한다.
 * ------------------------------------------------------------------ */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GIS_SRC = "https://accounts.google.com/gsi/client";

/* 레이어 모달 사용 가능 여부 — 로그인 화면이 팝업창 대신 모달 분기를 태울지 결정 */
export const hasGoogleLayer = hasSupabase && !!GOOGLE_CLIENT_ID;

/* GIS 스크립트 1회 로드 */
let gisLoading = null;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("구글 인증 모듈을 불러오지 못했어요."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

/* nonce 쌍 생성 — Supabase 는 id_token 안의 nonce 와 호출 시 전달한 nonce 의
 * 일치를 검증한다("Passed nonce and nonce in id_token should either both exist
 * or not" 에러의 원인). FedCM 경로는 토큰에 nonce 가 포함되므로 항상 우리가
 * 생성해 양쪽을 맞춘다: GIS 에는 SHA-256 해시를, signInWithIdToken 에는 원본을
 * 전달한다(Supabase 공식 문서의 One Tap 연동 방식). */
async function makeNoncePair() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  const hashedNonce = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [nonce, hashedNonce];
}

/**
 * 앱 안 레이어 모달에 공식 "Google로 계속하기" 버튼을 렌더.
 * 버튼 클릭 시 FedCM 지원 브라우저에선 새 창 없이 브라우저 모달로 계정 선택이
 * 진행되고(미지원 브라우저는 GIS 가 스스로 팝업으로 폴백), 받은 ID 토큰으로
 * Supabase 세션을 만든 뒤 프로필을 resolve 한다.
 * 사용자가 모달을 닫아 인증을 끝내지 않으면 promise 는 settle 되지 않는다 —
 * 호출측(레이어 모달)이 언마운트 시 결과를 무시하면 된다.
 * @param {HTMLElement} container 버튼을 그릴 요소
 * @returns {Promise<object>} 로그인 프로필
 */
export async function mountGoogleButton(container) {
  await loadGis();
  const [nonce, hashedNonce] = await makeNoncePair();
  return new Promise((resolve, reject) => {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      nonce: hashedNonce, // id_token 에는 이 해시가 실려 온다
      callback: async (res) => {
        if (!res?.credential) return reject(new Error("구글 인증이 취소됐어요."));
        try {
          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: "google",
            token: res.credential,
            nonce, // 원본 nonce — Supabase 가 해시해 토큰 값과 대조한다
          });
          if (error) throw new Error(error.message || "구글 로그인에 실패했습니다.");
          resolve(toProfile(data?.user));
        } catch (e) {
          reject(e);
        }
      },
      use_fedcm_for_prompt: true,
      use_fedcm_for_button: true, // 버튼 플로우도 팝업창 대신 브라우저 모달(FedCM)로
    });
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "pill",
      logo_alignment: "left",
      width: 268,
    });
  });
}

/* 로그인(팝업창 방식) — 레이어 모달을 쓸 수 없을 때(hasGoogleLayer=false)의 폴백.
 * 완료 시 프로필을 resolve 하고, 세션은 onAuthChange 로도 전파된다. */
export async function loginWithGoogle() {
  if (!hasSupabase) {
    throw new Error("로그인 설정이 완료되지 않았어요. 관리자에게 문의해 주세요.");
  }
  return loginWithGooglePopup();
}

/* ------------------------------------------------------------------ *
 *  방식 2) 팝업창 폴백 — Supabase OAuth URL 을 중앙 팝업창으로 연다.
 *  팝업이 우리 오리진(?authpopup=1)으로 복귀하면 그 안의 supabase-js 가
 *  세션을 저장하고, 본창에는 BroadcastChannel/스토리지로 SIGNED_IN 이 전파된다.
 * ------------------------------------------------------------------ */
async function loginWithGooglePopup() {
  /* skipBrowserRedirect 로 인증 URL 만 받아 팝업으로 연다 */
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/?authpopup=1",
      skipBrowserRedirect: true,
      // prompt=select_account — 이미 구글에 로그인돼 있어도 계정 선택 화면을 항상 띄운다
      // (여러 계정을 쓰는 사용자가 원하는 계정을 고를 수 있도록)
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw new Error(error.message || "구글 로그인에 실패했습니다.");
  if (!data?.url) throw new Error("인증 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.");

  // 팝업창 — 화면 중앙 정렬. (팝업은 최상위 창이라 iframe/폰 시뮬레이터 안에서도
  // 구글의 프레임 차단(403) 없이 인증이 진행된다)
  const W = 480;
  const H = 680;
  const left = Math.max(0, (window.screenX ?? 0) + ((window.outerWidth ?? W) - W) / 2);
  const top = Math.max(0, (window.screenY ?? 0) + ((window.outerHeight ?? H) - H) / 2);
  let popup = null;
  try {
    popup = window.open(
      data.url,
      "pluscube_google_auth",
      `popup=yes,width=${W},height=${H},left=${left},top=${top}`
    );
  } catch {
    popup = null;
  }
  if (!popup) throw new BlockedRedirectError(data.url); // 팝업 차단 → 수동 링크 제공

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, arg) => {
      if (settled) return;
      settled = true;
      sub?.subscription?.unsubscribe();
      clearInterval(watch);
      clearTimeout(deadline);
      try {
        if (!popup.closed) popup.close();
      } catch {
        /* COOP 등으로 접근이 막혀도 무시 — 팝업은 스스로 닫는다(App의 isAuthPopup 처리) */
      }
      fn(arg);
    };

    // 팝업에서 세션 저장 → 같은 오리진의 이 창에도 SIGNED_IN 이 통지된다
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) finish(resolve, toProfile(session.user));
    });

    // 사용자가 팝업을 그냥 닫은 경우 — 통지 지연에 대비해 잠깐 기다렸다 세션을 재확인
    const watch = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(watch);
      setTimeout(async () => {
        const { data: s } = await supabase.auth.getSession();
        if (s?.session?.user) finish(resolve, toProfile(s.session.user));
        else finish(reject, new Error("로그인이 완료되지 않았어요. 다시 시도해 주세요."));
      }, 700);
    }, 400);

    // 안전장치 — 5분 넘게 열려 있으면 타임아웃 처리
    const deadline = setTimeout(
      () => finish(reject, new Error("로그인 시간이 초과됐어요. 다시 시도해 주세요.")),
      5 * 60 * 1000
    );
  });
}

const toProfile = (user) =>
  user && {
    provider: "google",
    userId: user.id,
    email: user.email,
    name: user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email,
    avatar: user.user_metadata?.avatar_url,
  };

/* OAuth 리다이렉트 복귀 여부 — 구글에서 돌아오면 URL 에 토큰(또는 code)이 붙어 있다.
 * 이 경우 스플래시를 건너뛰고 곧바로 본 화면으로 보내야 흐름이 끊기지 않는다. */
export const isReturningFromOAuth = () =>
  typeof window !== "undefined" &&
  (window.location.hash.includes("access_token") || window.location.search.includes("code="));

/* 복귀 시 진단 — 로그인이 유지되지 않을 때 원인을 콘솔에 한눈에 보여준다.
 * 개발 모드(npm run dev)에서만 동작하며, 배포 빌드에는 출력되지 않는다. */
export async function logAuthDiagnostics() {
  if (typeof window === "undefined" || !import.meta.env.DEV) return;
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const err = q.get("error") || h.get("error");
  const desc = q.get("error_description") || h.get("error_description");

  const rows = {
    "복귀 URL": window.location.origin + window.location.pathname,
    "code (PKCE)": q.get("code") ? "있음" : "없음",
    "access_token (implicit)": h.get("access_token") ? "있음" : "없음",
    "오류": err ? `${err} — ${decodeURIComponent(desc || "")}` : "없음",
    "PKCE verifier(localStorage)": Object.keys(localStorage).some((k) => k.includes("code-verifier")) ? "있음" : "없음",
  };
  if (hasSupabase) {
    const { data } = await supabase.auth.getSession();
    rows["세션"] = data?.session ? `✅ ${data.session.user.email}` : "❌ 없음";
  }
  console.group("%c[PLUS CUBE] 구글 로그인 진단", "color:#FFCF24;font-weight:bold");
  Object.entries(rows).forEach(([k, v]) => console.log(`${k}:`, v));
  if (err) console.warn("→ Supabase Authentication > URL Configuration 의 Redirect URLs 를 확인하세요.");
  console.groupEnd();
}

/* 세션 변화 구독 — 앱 진입 시 1회 등록.
 * getSession() 을 즉시 호출하면 supabase-js 가 아직 URL 해시를 파싱하기 전이라
 * null 이 나올 수 있다(→ 로그인 화면으로 되돌아가는 원인). onAuthStateChange 는
 * 초기 세션 복원과 로그인 완료를 모두 통지하므로 타이밍 문제가 없다.
 * @param {(profile|null) => void} cb
 * @returns {() => void} 구독 해제 */
export function onAuthChange(cb) {
  if (!hasSupabase) {
    cb(null);
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(toProfile(session?.user) ?? null);
    // 복귀 URL 의 토큰 해시는 세션 저장 후 정리 (새로고침·공유 시 노출 방지)
    if (session && typeof window !== "undefined" && window.location.hash.includes("access_token")) {
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
    }
  });
  return () => data?.subscription?.unsubscribe();
}

/* 세션 1회 조회 (구독이 필요 없는 곳에서만 사용) */
export async function restoreSession() {
  if (!hasSupabase) return null;
  const { data } = await supabase.auth.getSession();
  return toProfile(data?.session?.user) ?? null;
}

export async function logout() {
  if (hasSupabase) await supabase.auth.signOut();
}
