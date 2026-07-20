-- ============================================================================
--  0002_grants — Data API(PostgREST) 역할 권한 부여
--
--  프로젝트 설정에서 "Automatically expose new tables" 를 끈 경우(권장),
--  새 테이블은 anon/authenticated 역할에 GRANT 가 없어 401(permission denied)이 난다.
--  RLS 는 "행 필터", GRANT 는 "테이블 접근 허가" — 둘 다 있어야 접근이 성립한다.
--
--  원칙: 로그인 사용자(authenticated)에게만 부여하고 anon 에는 주지 않는다.
--        → 비로그인 요청은 RLS 이전에 권한 단계에서 차단된다(방어 2중화).
--        → 부여 범위도 RLS 정책과 동일하게 맞춘다(플랜/스냅샷은 update·delete 없음).
-- ============================================================================

-- 프로필 · 계좌 원장 — 조회/생성/수정 (삭제는 불가: 아카이브로 대체)
grant select, insert, update on public.profiles       to authenticated;
grant select, insert, update on public.user_accounts  to authenticated;

-- 마이데이터 스냅샷 — 불변 이력(수정·삭제 없음)
grant select, insert on public.mydata_snapshots to authenticated;

-- 납입 계획 — append-only (수정·삭제 없음, 되돌리기는 새 리비전 복제로)
grant select, insert on public.plan_revisions to authenticated;
grant select, insert on public.plan_accounts  to authenticated;
grant select, insert on public.plan_orders    to authenticated;

-- 최신 리비전 뷰 (security_invoker — 기저 테이블 RLS 그대로 적용)
grant select on public.current_plan_revision to authenticated;

-- RPC (security invoker — 호출자 권한으로 실행되므로 RLS·CHECK 가 그대로 적용)
grant execute on function public.save_plan_revision(int, int, bigint, text, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.restore_plan_revision(uuid) to authenticated;
