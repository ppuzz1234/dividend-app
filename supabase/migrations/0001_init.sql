-- ============================================================================
--  GENIUS — Supabase 스키마 + RLS (0001_init)
--
--  구조 개요
--   · 로그인: Supabase Auth SSO(OAuth) — 스키마 불요, profiles 가 1:1 로 따라붙음
--   · user_accounts     : 확인된 계좌 원장 (수기/마이데이터, 삭제 대신 아카이브)
--   · mydata_snapshots  : 마이데이터 조회 결과의 불변 이력
--   · plan_revisions    : "납입 계획"의 개정판 헤더 — append-only.
--                         목표 생활비·월 투자금이 함께 봉인되고, 수정 = 새 리비전 추가
--   · plan_accounts     : 리비전 내 계좌별 월 납입액
--   · plan_orders       : 리비전 내 계좌별 매수 상품·주기(주/월/연)·회당 금액
--   → 히스토리는 절대 지워지지 않고(UPDATE/DELETE 정책 없음),
--     원상복구는 restore_plan_revision() 이 과거 리비전을 새 리비전으로 복제
--
--  보안 원칙
--   · 모든 테이블 RLS "기본 거부" — 정책 없는 접근은 전부 차단
--   · 모든 정책 auth.uid() 기준 본인 행만 / 자식 행은 부모 소유까지 exists 로 검증
--   · service_role 키는 서버 전용 (VITE_ 환경변수 금지)
--   · 클라이언트 입력 불신 — 불변식은 CHECK/enum/트리거로 DB 가 강제
--   · PK 는 UUID — 순번 ID 열거 차단
-- ============================================================================

-- ── enum ────────────────────────────────────────────────────────────────────
create type public.account_kind   as enum ('general', 'isa', 'pensionSavings', 'irp');
create type public.account_source as enum ('manual', 'mydata');
create type public.buy_cycle      as enum ('weekly', 'monthly', 'yearly');

-- ── 공통: updated_at 자동 갱신 ──────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── profiles — auth.users 1:1 (SSO 가입 시 트리거로 자동 생성) ──────────────
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age          int    check (age between 14 and 120),
  total_income bigint check (total_income >= 0),   -- 전년도 총소득(원)
  fin_income   bigint check (fin_income >= 0),     -- 전년도 금융소득(원)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: own read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- SSO 가입 훅 — 프로필 자동 생성 (OAuth 프로필의 이름을 가져옴)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'))
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── user_accounts — 확인된 계좌 원장 (수기 입력 or 마이데이터) ──────────────
-- 삭제 정책 없음: 계좌를 없앨 땐 archived_at 을 찍는다(과거 플랜이 참조하므로 보존)
create table public.user_accounts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  kind                  public.account_kind not null,
  source                public.account_source not null default 'manual',
  institution           text,
  balance               bigint not null default 0 check (balance >= 0),
  contributed_this_year bigint not null default 0 check (contributed_this_year >= 0),
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.user_accounts enable row level security;

create policy "accounts: own read"   on public.user_accounts for select using (auth.uid() = user_id);
create policy "accounts: own insert" on public.user_accounts for insert with check (auth.uid() = user_id);
create policy "accounts: own update" on public.user_accounts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_accounts_touch before update on public.user_accounts
  for each row execute function public.touch_updated_at();

create index user_accounts_user on public.user_accounts (user_id) where archived_at is null;

-- ── mydata_snapshots — 마이데이터 조회 결과 불변 이력 ───────────────────────
-- update/delete 정책 없음 → 감사 가능한 원본 기록
create table public.mydata_snapshots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  taken_at      timestamptz not null default now(),
  total_balance bigint not null check (total_balance >= 0),
  accounts      jsonb not null default '[]'::jsonb
  -- accounts 예: [{ "kind":"general", "institution":"한화투자증권", "balance":255000000,
  --                "contributed_this_year":0, "holdings":[{ "name":"...", "value":... }] }]
);
alter table public.mydata_snapshots enable row level security;

create policy "snapshots: own read"   on public.mydata_snapshots for select using (auth.uid() = user_id);
create policy "snapshots: own insert" on public.mydata_snapshots for insert with check (auth.uid() = user_id);

create index mydata_snapshots_user_taken on public.mydata_snapshots (user_id, taken_at desc);

-- ── plan_revisions — 납입 계획 개정판 헤더 (append-only) ────────────────────
-- 수시 갱신 = 새 리비전 insert. update/delete 정책이 없어 히스토리가 소실될 수 없다.
create table public.plan_revisions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  revision_no          int  not null,                        -- 트리거가 사용자별 1,2,3… 자동 부여
  monthly_goal_manwon  int  not null check (monthly_goal_manwon between 10 and 100000), -- 목표 생활비(만원)
  years                int  not null default 20 check (years between 1 and 60),
  monthly_contribution bigint not null default 0 check (monthly_contribution >= 0),     -- 총 월 투자금(원)
  note                 text,
  restored_from        uuid references public.plan_revisions (id),  -- 원상복구 출처 리비전
  created_at           timestamptz not null default now(),
  unique (user_id, revision_no)
);
alter table public.plan_revisions enable row level security;

create policy "revisions: own read"   on public.plan_revisions for select using (auth.uid() = user_id);
create policy "revisions: own insert" on public.plan_revisions for insert with check (auth.uid() = user_id);

create or replace function public.assign_revision_no()
returns trigger language plpgsql as $$
begin
  select coalesce(max(revision_no), 0) + 1 into new.revision_no
  from public.plan_revisions where user_id = new.user_id;
  return new;
end $$;
create trigger plan_revisions_no before insert on public.plan_revisions
  for each row execute function public.assign_revision_no();

create index plan_revisions_user_no on public.plan_revisions (user_id, revision_no desc);

-- 현재(최신) 리비전 뷰 — security_invoker 로 기저 테이블 RLS 그대로 적용
create view public.current_plan_revision with (security_invoker = true) as
  select distinct on (user_id) *
  from public.plan_revisions
  order by user_id, revision_no desc;

-- ── plan_accounts — 리비전 내 계좌별 월 납입액 ──────────────────────────────
create table public.plan_accounts (
  id             uuid primary key default gen_random_uuid(),
  revision_id    uuid not null references public.plan_revisions (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  account_id     uuid not null references public.user_accounts (id),
  monthly_amount bigint not null check (monthly_amount >= 0),  -- 이 계좌 월 납입액(원)
  unique (revision_id, account_id)
);
alter table public.plan_accounts enable row level security;

create policy "plan_accounts: own read" on public.plan_accounts for select using (auth.uid() = user_id);
-- insert 시 리비전·계좌가 모두 본인 소유인지까지 검증 (타인 리비전에 행 붙이기 차단)
create policy "plan_accounts: own insert" on public.plan_accounts for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.plan_revisions r where r.id = revision_id and r.user_id = auth.uid())
    and exists (select 1 from public.user_accounts a where a.id = account_id and a.user_id = auth.uid())
  );

create index plan_accounts_revision on public.plan_accounts (revision_id);

-- ── plan_orders — 리비전 내 계좌별 매수 상품·주기·회당 금액 ─────────────────
create table public.plan_orders (
  id               uuid primary key default gen_random_uuid(),
  revision_id      uuid not null references public.plan_revisions (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  account_id       uuid not null references public.user_accounts (id),
  product_code     text not null,                      -- 예: '429760'
  product_name     text not null,                      -- 예: 'PLUS 미국S&P500' (당시 명칭을 스냅샷)
  cycle            public.buy_cycle not null default 'monthly',  -- 주/월/연
  amount_per_order bigint not null check (amount_per_order > 0), -- 회당 매수금(원)
  unique (revision_id, account_id, product_code)
);
alter table public.plan_orders enable row level security;

create policy "plan_orders: own read" on public.plan_orders for select using (auth.uid() = user_id);
create policy "plan_orders: own insert" on public.plan_orders for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.plan_revisions r where r.id = revision_id and r.user_id = auth.uid())
    and exists (select 1 from public.user_accounts a where a.id = account_id and a.user_id = auth.uid())
  );

create index plan_orders_revision on public.plan_orders (revision_id);

-- ── RPC: 플랜 저장 (헤더 + 계좌 배분 + 매수 규칙을 한 트랜잭션으로) ─────────
-- security invoker → 호출자 권한으로 실행되어 위 RLS·CHECK 가 전부 그대로 적용됨
create or replace function public.save_plan_revision(
  p_goal_manwon int,
  p_years       int,
  p_monthly     bigint,
  p_note        text default null,
  p_accounts    jsonb default '[]'::jsonb,  -- [{ "account_id": uuid, "monthly_amount": 원 }]
  p_orders      jsonb default '[]'::jsonb,  -- [{ "account_id", "product_code", "product_name", "cycle", "amount_per_order" }]
  p_restored_from uuid default null
) returns uuid
language plpgsql security invoker as $$
declare
  v_id uuid;
begin
  insert into public.plan_revisions (user_id, monthly_goal_manwon, years, monthly_contribution, note, restored_from)
  values (auth.uid(), p_goal_manwon, p_years, p_monthly, p_note, p_restored_from)
  returning id into v_id;

  insert into public.plan_accounts (revision_id, user_id, account_id, monthly_amount)
  select v_id, auth.uid(), x.account_id, x.monthly_amount
  from jsonb_to_recordset(p_accounts) as x(account_id uuid, monthly_amount bigint);

  insert into public.plan_orders (revision_id, user_id, account_id, product_code, product_name, cycle, amount_per_order)
  select v_id, auth.uid(), x.account_id, x.product_code, x.product_name, x.cycle::public.buy_cycle, x.amount_per_order
  from jsonb_to_recordset(p_orders) as x(account_id uuid, product_code text, product_name text, cycle text, amount_per_order bigint);

  return v_id;
end $$;

-- ── RPC: 원상복구 — 과거 리비전을 "새 리비전"으로 복제 (이력은 그대로 유지) ─
create or replace function public.restore_plan_revision(p_revision_id uuid)
returns uuid
language plpgsql security invoker as $$
declare
  v_new uuid;
begin
  if not exists (select 1 from public.plan_revisions where id = p_revision_id and user_id = auth.uid()) then
    raise exception 'revision not found';
  end if;

  insert into public.plan_revisions (user_id, monthly_goal_manwon, years, monthly_contribution, note, restored_from)
  select user_id, monthly_goal_manwon, years, monthly_contribution, note, id
  from public.plan_revisions where id = p_revision_id
  returning id into v_new;

  insert into public.plan_accounts (revision_id, user_id, account_id, monthly_amount)
  select v_new, user_id, account_id, monthly_amount
  from public.plan_accounts where revision_id = p_revision_id;

  insert into public.plan_orders (revision_id, user_id, account_id, product_code, product_name, cycle, amount_per_order)
  select v_new, user_id, account_id, product_code, product_name, cycle, amount_per_order
  from public.plan_orders where revision_id = p_revision_id;

  return v_new;
end $$;

-- ============================================================================
--  운영 체크리스트 (마이그레이션 밖 설정)
--   □ Auth > Providers: 사용할 SSO(Google/Kakao 등) 활성화 + 리다이렉트 URL 등록
--   □ 신규 테이블 생성 시 "enable row level security" 관례화 — 잊으면 전체 공개
--   □ service_role 키는 서버 환경변수에만 (프론트 번들·VITE_ 접두사 금지)
--   □ (Pro) 유출 비밀번호 차단·MFA·Auth rate limit 검토
-- ============================================================================
