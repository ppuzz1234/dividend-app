# Supabase 연동 — 설정 가이드

`supabase-js(HTTP/PostgREST) + RLS` 방식. 서버리스/Workers 런타임과 무관하게 동작하며,
DB 접근 권한은 백엔드 코드가 아니라 **RLS 정책**이 판정한다.

## 1) 프로젝트 생성 · 스키마 적용

1. https://supabase.com 에서 프로젝트 생성 (리전: Northeast Asia (Seoul) 권장)
2. Dashboard > **Connect** > **Direct connection string** 복사 →
   프로젝트 루트에 `.env` 생성 (gitignore 됨):
   ```
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
3. 마이그레이션 적용 — `migrations/*.sql` 을 순서대로 실행한다:
   ```
   npm run db:setup
   ```
   > 이 스크립트(`setup.mjs`)는 로컬에서 한 번 돌리는 개발 도구다. 런타임 앱은
   > supabase-js(HTTP)로만 접근하므로, 여기서 쓰는 `pg` 직결은 배포 환경과 무관하다.
   >
   > 대안: Dashboard > **SQL Editor** 에 [`migrations/0001_init.sql`](migrations/0001_init.sql) 전체를 붙여넣고 실행해도 된다.
4. Dashboard > **Advisors > Security** 에서 경고 0건 확인 (RLS 누락 테이블이 있으면 여기 뜬다)

## 2) 구글 SSO 설정

**Google Cloud Console** (https://console.cloud.google.com)

1. `API 및 서비스 > OAuth 동의 화면` 구성 (외부 / 앱 이름 GENIUS)
2. `사용자 인증 정보 > OAuth 클라이언트 ID 만들기` → 유형 **웹 애플리케이션**
3. **승인된 리디렉션 URI** 에 아래를 등록 (Supabase 콜백 주소)
   ```
   https://[PROJECT-REF].supabase.co/auth/v1/callback
   ```
4. 발급된 **클라이언트 ID / 시크릿** 복사

**Supabase Dashboard**

5. `Authentication > Providers > Google` 활성화 → 위 ID/시크릿 입력 후 저장
6. `Authentication > URL Configuration`
   - Site URL: `http://localhost:5173` (운영은 실제 도메인)
   - Redirect URLs: 로컬·운영 도메인 모두 추가

## 3) 프론트 환경변수

`apps/web/.env.local` 생성 ([.env.example](../apps/web/.env.example) 참고):

```
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=[ANON-KEY]
```

- `anon key` 는 공개되어도 안전 — RLS 가 본인 행만 허용한다.
- `service_role` 키는 **절대 VITE_ 변수로 넣지 않는다** (번들에 박혀 유출됨). 서버 전용.
- 미설정 상태에서도 앱은 동작한다 — 로그인 버튼에 `데모` 배지가 붙고 기존 목업 흐름을 탄다.

## 4) 코드 위치

| 파일 | 역할 |
|---|---|
| [`apps/web/src/lib/supabase.js`](../apps/web/src/lib/supabase.js) | 클라이언트 (미설정 시 `null`) |
| [`apps/web/src/auth/google.js`](../apps/web/src/auth/google.js) | 구글 로그인 · 세션 복원 · 로그아웃 |
| [`apps/web/src/lib/planRepo.js`](../apps/web/src/lib/planRepo.js) | 프로필 · 계좌 · 스냅샷 · 플랜 리비전 CRUD |

## 5) 데이터 모델 요약

납입 계획은 **append-only 리비전** — 수정할 때마다 새 리비전이 쌓이고 과거 내역은 지워지지 않는다
(플랜 테이블에는 UPDATE/DELETE 정책 자체가 없어 DB 가 불변을 강제).

```
profiles ─ 1:1 ─ auth.users
user_accounts        확인된 계좌 원장 (manual|mydata, 삭제 대신 archived_at)
mydata_snapshots     마이데이터 조회 이력 (불변)
plan_revisions       계획 헤더 (목표 생활비·기간·월 투자금, revision_no 자동 채번)
 ├ plan_accounts     계좌별 월 납입액
 └ plan_orders       계좌별 매수 상품·주기(weekly|monthly|yearly)·회당 금액
```

- 저장: `save_plan_revision()` RPC — 헤더+배분+매수규칙을 한 트랜잭션으로
- 복구: `restore_plan_revision()` RPC — 과거 리비전을 **새 리비전으로 복제** (이력 유지)
- 조회: `current_plan_revision` 뷰 (최신 리비전)
