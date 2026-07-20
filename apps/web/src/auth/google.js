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

/* 리다이렉트가 차단된 경우 — 화면에서 수동 이동 링크를 제공하기 위한 에러 타입 */
export class BlockedRedirectError extends Error {
  constructor(url) {
    super("브라우저가 이동을 막았어요. 아래 링크로 계속 진행해 주세요.");
    this.name = "BlockedRedirectError";
    this.url = url;
  }
}

/* 로그인 — 구글 동의화면으로 이동한다(이 함수는 정상 흐름에서 반환되지 않음).
 * 복귀 후 세션은 onAuthChange 가 감지한다. */
export async function loginWithGoogle() {
  if (!hasSupabase) {
    throw new Error("로그인 설정이 완료되지 않았어요. 관리자에게 문의해 주세요.");
  }

  /* skipBrowserRedirect 로 인증 URL 만 받아 우리가 직접 이동시킨다.
   * (supabase-js 내부 리다이렉트는 확장프로그램·브라우저 정책에 막혀
   *  아무 일도 일어나지 않는 경우가 있어, 명시적 이동이 더 확실하다) */
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      skipBrowserRedirect: true,
      // prompt=select_account — 이미 구글에 로그인돼 있어도 계정 선택 화면을 항상 띄운다
      // (여러 계정을 쓰는 사용자가 원하는 계정을 고를 수 있도록)
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw new Error(error.message || "구글 로그인에 실패했습니다.");
  if (!data?.url) throw new Error("인증 주소를 받지 못했습니다. 잠시 후 다시 시도해 주세요.");

  window.location.assign(data.url);
  // 이동이 시작되므로 이 Promise 는 완료되지 않는다. 다만 이동이 차단된 경우를 대비해
  // 3초 뒤에도 페이지가 그대로면 수동 이동용 링크를 띄우도록 에러를 던진다.
  return new Promise((_, reject) => {
    setTimeout(() => reject(new BlockedRedirectError(data.url)), 3000);
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
