import { createClient } from "@supabase/supabase-js";

/* Supabase 클라이언트 — supabase-js(HTTP/PostgREST) + RLS 방식.
 *  · anon key 는 공개되어도 안전한 키 — RLS 정책이 허용한 범위(본인 행)만 접근 가능.
 *    (service_role 키는 서버 전용이며 절대 VITE_ 변수로 넣지 않는다)
 *  · 환경변수 미설정 시 null — 화면은 기존 로컬(목업) 흐름으로 폴백한다. */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;
export const hasSupabase = !!supabase;
