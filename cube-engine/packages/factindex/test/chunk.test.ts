/**
 * 청킹 불변식 + edge case. 네트워크 없이 실코퍼스 + 합성 fixture 로만 돈다.
 *
 * 이 파일이 지키는 3가지:
 *  1. 재조립 동일성 — 청크를 이어붙이면 원문과 바이트 동일
 *  2. 조문 경계 불침범 — 청크 하나 = 조문 하나
 *  3. `[각 목]` 맥락 보존 — 목을 담은 청크는 항 헤더를 contextHeader 로 갖는다
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_CHARS, MOK_CAVEAT, chunkAll, chunkArticle } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import type { LoadedArticle } from "../src/corpusLoad.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

/**
 * 실측 고정값 — 바뀌면 코퍼스나 청킹 규칙이 변한 것이고, 그러면 `ragIndexVersion` 도 바뀌어야 한다.
 * 숫자를 박아두는 이유: 청킹은 조용히 퇴화하기 쉽다(조각이 잘아지거나 문자 폴백이 늘어나는 식).
 */
const EXPECTED = {
  // 이력: 1849(법령 6종) → 1883(Phase 3-a 퇴직연금감독규정) → 2137(Phase 3-b 국세청 훈령 2종 + 금감원 세칙)
  total: 2137,
  deleted: 373, // 법령 372 + 행정규칙 1 (PENSUPD_5_3 — 제목을 남긴 채 삭제된 조문)
  live: 1764,
  chunks: 2649,
  dist: { ARTICLE: 1410, HANG: 1009, HO: 172, CHAR: 58 },
} as const;

function art(over: Partial<LoadedArticle> & { text: string }): LoadedArticle {
  return {
    sourceId: "X_1",
    articleNo: "1",
    articleSubNo: null,
    title: "테스트",
    validFrom: "2026-01-01",
    textHash: "0".repeat(64),
    lawName: "테스트법",
    authorityType: "STATUTE",
    ...over,
  };
}

// ─────────────────────────── 실코퍼스 불변식 ───────────────────────────

test("코퍼스 로딩 — 삭제 스텁 372건이 이중 술어로 정확히 걸러진다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  assert.equal(c.totalArticleCount, EXPECTED.total);
  assert.equal(c.deletedStubCount, EXPECTED.deleted);
  assert.equal(c.articles.length, EXPECTED.live);
  assert.match(c.corpusHash, /^[0-9a-f]{64}$/);
  // 삭제 스텁이 하나라도 살아남으면 BM25 길이 정규화가 그걸 상위로 밀어올린다.
  // 법령 계층에 한해 title===null 은 삭제 신호다 (행정규칙은 삭제해도 제목을 남긴다).
  const lawLayer = c.articles.filter((a) => a.authorityType === "STATUTE" || a.authorityType === "DECREE");
  assert.ok(!lawLayer.some((a) => a.title === null), "법령 계층에 title===null 조문이 남았다");
});

test("불변식 1 — 청크를 이어붙이면 원문과 바이트 동일 (전 조문)", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  for (const a of c.articles) {
    const chunks = chunkArticle(a);
    assert.equal(chunks.map((x) => x.text).join(""), a.text, `${a.sourceId}: 재조립 불일치`);
  }
});

test("불변식 1b — charOffset 이 틈·겹침 없이 연속이다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  for (const a of c.articles) {
    const chunks = chunkArticle(a);
    assert.equal(chunks[0]?.charOffset[0], 0, `${a.sourceId}: 시작 오프셋이 0 이 아니다`);
    assert.equal(
      chunks[chunks.length - 1]?.charOffset[1],
      a.text.length,
      `${a.sourceId}: 끝 오프셋이 원문 길이와 다르다`,
    );
    for (let i = 1; i < chunks.length; i++) {
      assert.equal(
        chunks[i]!.charOffset[0],
        chunks[i - 1]!.charOffset[1],
        `${a.sourceId}: 청크 ${i} 에서 오프셋이 끊겼다`,
      );
    }
  }
});

test("불변식 2 — 청크 하나는 정확히 하나의 조문에 속하고 chunkId 는 전역 유일", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const chunks = chunkAll(c.articles);
  const ids = new Set<string>();
  for (const ch of chunks) {
    assert.ok(!ids.has(ch.chunkId), `chunkId 중복: ${ch.chunkId}`);
    ids.add(ch.chunkId);
    assert.ok(ch.chunkId.startsWith(ch.sourceId), `${ch.chunkId}: sourceId 로 되돌릴 수 없다`);
  }
});

test("불변식 3 — [각 목] 을 담은 청크는 소속 미상 고지를 갖는다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const chunks = chunkAll(c.articles);
  const mokChunks = chunks.filter((ch) => ch.hasUnattachedMok);
  assert.ok(mokChunks.length > 0, "목 청크가 하나도 없다 — 표식이 사라졌는지 확인하라");

  for (const ch of mokChunks) {
    // 조각만 보면 바로 앞 호에 속한 것처럼 읽힌다(실측 사례 INCTAX_12: 호 4개가 '각 목'을 말한다).
    // 고지가 없으면 청킹이 원문의 모호함을 거짓 확신으로 바꾼다.
    assert.ok(
      ch.contextHeader.includes(MOK_CAVEAT),
      `${ch.chunkId}: 목을 담았는데 소속 미상 고지가 없다`,
    );
  }
  console.log(`  [mok] 목 청크 ${mokChunks.length} / 전체 ${chunks.length}`);
});

test("불변식 3b — 쪼개진 항의 목 청크는 항 헤더까지 함께 갖는다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  for (const ch of chunkAll(c.articles)) {
    if (!ch.hasUnattachedMok || ch.splitLevel === "ARTICLE") continue;
    // 항이 있는 조문에서 쪼개졌다면 항 헤더가 text 나 contextHeader 어딘가에 있어야 한다.
    const article = c.articles.find((a) => a.sourceId === ch.sourceId);
    assert.ok(article);
    if (!/^[①-⑳]/m.test(article.text)) continue; // 항이 없는 조문(INCTAX_12 류)은 조문 라벨이 곧 맥락
    assert.ok(
      /^[①-⑳]/m.test(ch.text) || /\n[①-⑳]/.test(ch.contextHeader),
      `${ch.chunkId}: 항이 있는 조문인데 목이 항 맥락 없이 떠 있다`,
    );
  }
});

test("한도 준수 + 분할 레벨 분포 고정", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const chunks = chunkAll(c.articles);
  for (const ch of chunks) {
    assert.ok(
      ch.text.length <= DEFAULT_MAX_CHARS,
      `${ch.chunkId}: ${ch.text.length}자 > 한도 ${DEFAULT_MAX_CHARS}`,
    );
  }
  const dist = chunks.reduce<Record<string, number>>((acc, ch) => {
    acc[ch.splitLevel] = (acc[ch.splitLevel] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  [chunk] 총 ${chunks.length} / 분포 ${JSON.stringify(dist)}`);
  assert.equal(chunks.length, EXPECTED.chunks, "청크 총수가 변했다 — 청킹 규칙 또는 코퍼스 변경");
  assert.deepEqual(dist, { ...EXPECTED.dist }, "분할 레벨 분포가 변했다");
  // 문자 폴백이 늘면 인용 단위가 조문에서 문자로 퇴화한다 — 조용히 나빠지는 대표적 방향.
  assert.ok(
    (dist["CHAR"] ?? 0) < chunks.length * 0.05,
    `문자 폴백이 ${dist["CHAR"]}/${chunks.length} 로 5% 를 넘는다`,
  );
});

// ─────────────────────────── 경계값 ───────────────────────────

test("경계값 — 길이가 한도와 정확히 같으면 자르지 않는다", () => {
  const chunks = chunkArticle(art({ text: "가".repeat(100) }), 100);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.splitLevel, "ARTICLE");
  assert.equal(chunks[0]?.chunkId, "X_1", "안 쪼개면 chunkId 는 sourceId 그대로여야 한다");
});

test("경계값 — 한도+1 이면 자른다", () => {
  const chunks = chunkArticle(art({ text: "가".repeat(101) }), 100);
  assert.ok(chunks.length >= 2);
  assert.equal(chunks.map((c) => c.text).join(""), "가".repeat(101));
});

test("경계값 — 최소 길이 조문(1자)", () => {
  const chunks = chunkArticle(art({ text: "가" }), 100);
  assert.equal(chunks.length, 1);
});

test("경계값 — maxChars 가 0·음수·소수면 거절한다", () => {
  for (const bad of [0, -1, 1.5, Number.NaN]) {
    assert.throws(() => chunkArticle(art({ text: "가나다" }), bad), /maxChars/);
  }
});

test("경계값 — 빈 원문은 거절한다", () => {
  assert.throws(() => chunkArticle(art({ text: "" })), /원문이 비었다/);
});

test("경계값 — 항 헤더 줄 자체가 한도를 넘으면 문자 분할로 떨어진다", () => {
  const long = `① ${"가".repeat(300)}`;
  const chunks = chunkArticle(art({ text: `제1조(제목)\n${long}` }), 100);
  assert.ok(chunks.some((c) => c.splitLevel === "CHAR"));
  assert.equal(chunks.map((c) => c.text).join(""), `제1조(제목)\n${long}`);
});

// ─────────────────────────── null / 빈 컬렉션 ───────────────────────────

test("null — title·articleSubNo 가 null 이어도 라벨이 만들어진다", () => {
  const chunks = chunkArticle(art({ text: "본문", title: null, articleSubNo: null }));
  assert.equal(chunks[0]?.contextHeader, "테스트법 제1조");
});

test("null — 가지번호가 있으면 조문 표기에 반영된다", () => {
  const chunks = chunkArticle(art({ text: "본문", articleNo: "91", articleSubNo: "18", title: "특례" }));
  assert.equal(chunks[0]?.contextHeader, "테스트법 제91조의18(특례)");
});

test("빈 컬렉션 — 조문이 없으면 청크도 없다", () => {
  assert.deepEqual(chunkAll([]), []);
});

// ─────────────────────────── malformed ───────────────────────────

test("malformed — 항 마커가 없는 긴 조문도 잘린다 (실코퍼스에 6건 존재)", () => {
  const text = Array.from({ length: 40 }, (_, i) => `${i + 1}. 항목 ${"가".repeat(30)}`).join("\n");
  const chunks = chunkArticle(art({ text }), 200);
  assert.ok(chunks.length > 1);
  assert.equal(chunks.map((c) => c.text).join(""), text);
  for (const ch of chunks) assert.ok(ch.text.length <= 200);
});

test("malformed — 연도 표기(2024.12.31)를 호 마커로 오인하지 않는다", () => {
  // HO_RE 는 마커 뒤 공백을 요구한다. "2024.12.31" 은 점 뒤가 숫자라 매칭되면 안 된다.
  const text = "제1조(목적)\n① 본문 <개정 2024.12.31>\n1. 첫 호\n2. 둘째 호";
  const chunks = chunkArticle(art({ text }), 20);
  assert.equal(chunks.map((c) => c.text).join(""), text);
  // 개정 표기 줄이 독립 청크로 떨어져 나가지 않았는지 — 항 블록에 남아야 한다
  assert.ok(chunks.some((c) => c.text.includes("<개정 2024.12.31>")));
});

test("malformed — '1의2.' 형 호 마커도 경계로 인식한다", () => {
  const text = "① 본문\n1. 첫 호\n1의2. 끼워넣은 호\n2. 둘째 호";
  const chunks = chunkArticle(art({ text }), 12);
  assert.equal(chunks.map((c) => c.text).join(""), text);
});

test("malformed — 줄바꿈 없는 초장문(단일 줄)도 문자 분할로 닫힌다", () => {
  const text = "가".repeat(5000);
  const chunks = chunkArticle(art({ text }), 700);
  assert.equal(chunks.map((c) => c.text).join(""), text);
  for (const ch of chunks) assert.ok(ch.text.length <= 700);
  assert.ok(chunks.every((c) => c.splitLevel === "CHAR"));
});

test("malformed — CRLF 가 섞여도 재조립이 깨지지 않는다", () => {
  const text = "제1조(목적)\r\n① 본문\r\n1. 호";
  const chunks = chunkArticle(art({ text }), 10);
  assert.equal(chunks.map((c) => c.text).join(""), text);
});

// ─────────────────────────── 대규모 ───────────────────────────

test("대규모 — 전 코퍼스 청킹이 5초 안에 끝난다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const t0 = process.hrtime.bigint();
  const chunks = chunkAll(c.articles);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`  [perf] ${c.articles.length}조문 → ${chunks.length}청크, ${ms.toFixed(0)}ms`);
  assert.ok(ms < 5000, `청킹이 ${ms.toFixed(0)}ms 걸렸다`);
});

test("대규모 — 실코퍼스 최장 조문도 한도 안에 들어간다", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const longest = c.articles.reduce((m, a) => (a.text.length > m.text.length ? a : m));
  const chunks = chunkArticle(longest);
  console.log(`  [max] ${longest.sourceId} ${longest.text.length}자 → ${chunks.length}청크`);
  for (const ch of chunks) assert.ok(ch.text.length <= DEFAULT_MAX_CHARS);
  assert.equal(chunks.map((x) => x.text).join(""), longest.text);
});

// ─────────────────────────── 결정성 ───────────────────────────

test("결정성 — 두 번 돌려도 같은 결과 (chunkHash 포함)", () => {
  const c = loadCorpus(SNAPSHOT_DIR);
  const a = c.articles.find((x) => x.sourceId === "TAXEX_91_18");
  assert.ok(a);
  assert.deepEqual(chunkArticle(a), chunkArticle(a));
});

test("결정성 — corpusHash 는 두 번 로드해도 같다", () => {
  assert.equal(loadCorpus(SNAPSHOT_DIR).corpusHash, loadCorpus(SNAPSHOT_DIR).corpusHash);
});

// ─────────────────────────── 외부 의존성 실패 ───────────────────────────

test("외부 의존성 — 스냅샷 디렉터리가 없으면 조치 가능한 메시지로 실패한다", () => {
  assert.throws(() => loadCorpus(join(PKG_ROOT, "없는디렉터리")), /npm run collect/);
});
