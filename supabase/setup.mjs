/* migrations/*.sql 을 DATABASE_URL 대상 Postgres 에 순서대로 적용한다.
   (hpr 의 backend/db/setup.js 와 같은 방식 — psql CLI 없이 pg 드라이버로 직접 실행)

   ※ 이 스크립트는 "로컬 개발자 머신에서 한 번 돌리는 도구"다.
      런타임 앱은 supabase-js(HTTP) 로만 DB 에 접근하므로, 여기서 쓰는 pg 직결은
      배포 환경(Cloudflare/Netlify)과 아무 관계가 없다.

   사용법:
     1) Supabase 대시보드 > Connect > "Direct connection string" 복사
     2) 프로젝트 루트에 .env 생성 후  DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
     3) npm run db:setup
*/
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL 이 설정되지 않았습니다. 프로젝트 루트 .env 에 추가하세요.");
  console.error("  Supabase 대시보드 > Connect > Direct connection string 을 복사해 사용합니다.");
  process.exit(1);
}

const dir = path.join(__dirname, "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error("적용할 마이그레이션이 없습니다:", dir);
  process.exit(1);
}

/* Supabase 등 원격 Postgres 는 SSL 필수(자체 CA 라 인증서 검증은 생략). 로컬 docker 는 SSL 미사용. */
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL);
const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(path.join(dir, f), "utf8");
    await client.query(sql);
    console.log(`  ✓ ${f}`);
  }
  console.log(`마이그레이션 ${files.length}개 적용 완료.`);
} catch (err) {
  const detail = err.errors?.map((e) => e.message).join(", ") || err.message || String(err);
  console.error("스키마 적용 실패:", detail);
  if (err.position) console.error("  위치(문자):", err.position);
  process.exitCode = 1;
} finally {
  await client.end();
}
