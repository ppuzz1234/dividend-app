/**
 * Phase 4 — 토크나이저 · BM25 · 별칭 사전 · 시점 필터. 네트워크 없음.
 *
 * 이 파일의 존재 이유는 **A1 의 실패를 반복하지 않는 것**이다:
 *  - A1: 공백 split + FTS5 → `"강나영은"` ≠ `"강나영"` → BM25 절반이 조용히 0점
 *  - A1: 평가셋이 조사 없는 이름이라 그 버그를 끝까지 가렸다
 * 그래서 여기서는 **조사 붙은 질의**를 1급 시민으로 테스트한다.
 */

import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildBm25, scoreBm25 } from "../src/bm25.js";
import { chunkAll } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import { expandQuery, loadAliases } from "../src/expandQuery.js";
import { assertLocalDate, effectiveStats, filterEffective } from "../src/temporal.js";
import { tokenSet, tokenize } from "../src/tokenize.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");
const ALIASES = join(PKG_ROOT, "vocab", "aliases.json");

/**
 * 질의 → 목표 조문의 순위(1-base, 없으면 Infinity).
 * **sourceId 로 중복을 제거한다** — 한 조문이 여러 청크로 쪼개져 있어 청크 순위를 그대로 세면
 * 같은 조문이 여러 번 등장해 순위가 실제보다 나빠 보인다.
 */
function rankOfSource(
  idx: ReturnType<typeof buildBm25>,
  chunks: readonly { sourceId: string }[],
  query: string,
  target: string,
): number {
  const seen = new Set<string>();
  let rank = 0;
  for (const [i] of [...scoreBm25(idx, query)].sort((a, b) => b[1] - a[1])) {
    const sid = chunks[i]!.sourceId;
    if (seen.has(sid)) continue;
    seen.add(sid);
    rank += 1;
    if (sid === target) return rank;
  }
  return Number.POSITIVE_INFINITY;
}

// ─────────────────────────── 토크나이저 ───────────────────────────

test("★ 조사가 붙어도 매칭된다 — A1 이 끝내 못 고친 그 버그", () => {
  const withJosa = tokenSet("개인종합자산관리계좌는");
  const bare = tokenSet("개인종합자산관리계좌");
  for (const t of bare) {
    assert.ok(withJosa.has(t), `조사 붙은 질의가 "${t}" 를 잃었다`);
  }
});

test("조사 변형 여러 개 — 은/는/이/가/을/를/의/에서", () => {
  const bare = tokenSet("연금계좌");
  for (const josa of ["은", "는", "이", "가", "을", "를", "의", "에서", "에게", "으로"]) {
    const withJosa = tokenSet(`연금계좌${josa}`);
    for (const t of bare) assert.ok(withJosa.has(t), `"연금계좌${josa}" 가 "${t}" 를 잃었다`);
  }
});

test("복합명사 부분 일치 — 긴 법령 용어의 일부로도 걸린다", () => {
  const full = tokenSet("개인종합자산관리계좌");
  const part = tokenSet("자산관리");
  for (const t of part) assert.ok(full.has(t), `부분어 "${t}" 가 전체어에 없다`);
});

test("영숫자는 통째로 한 토큰 (약어를 쪼개지 않는다)", () => {
  assert.deepEqual(tokenize("ISA 계좌"), ["isa", "계좌"]);
  assert.deepEqual(tokenize("IRP"), ["irp"]);
  assert.deepEqual(tokenize("2026년"), ["2026", "년"]);
});

test("한글 2-gram — 경계값", () => {
  assert.deepEqual(tokenize("가"), ["가"]); // 1글자는 그대로
  assert.deepEqual(tokenize("가나"), ["가나"]);
  assert.deepEqual(tokenize("가나다"), ["가나", "나다"]);
});

test("빈 입력·구두점만·공백만", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("   \n\t "), []);
  assert.deepEqual(tokenize("···,.!?「」()"), []);
});

test("구두점은 경계로 작동한다 (붙은 단어를 잇지 않는다)", () => {
  // "계좌·연금" 이 "좌연" 같은 유령 토큰을 만들면 안 된다.
  assert.ok(!tokenize("계좌ㆍ연금").includes("좌연"));
  assert.ok(!tokenize("계좌·연금").includes("좌연"));
});

test("한글↔영숫자 전환도 경계다", () => {
  assert.deepEqual(tokenize("ISA계좌"), ["isa", "계좌"]);
});

// ─────────────────────────── BM25 ───────────────────────────

test("BM25 — 빈 코퍼스·빈 질의에서 터지지 않는다", () => {
  const empty = buildBm25([]);
  assert.equal(empty.docCount, 0);
  assert.equal(scoreBm25(empty, "무엇이든").size, 0);
  const one = buildBm25(["문서"]);
  assert.equal(scoreBm25(one, "").size, 0);
});

test("BM25 — 매칭 문서만 점수를 받는다", () => {
  const idx = buildBm25(["연금계좌 세액공제", "주택 임대소득", "연금계좌 인출순서"]);
  const s = scoreBm25(idx, "연금계좌");
  assert.deepEqual([...s.keys()].sort(), [0, 2]);
});

test("BM25 — 후보 집합으로 채점 범위를 제한할 수 있다 (시점 필터 연동)", () => {
  const idx = buildBm25(["연금계좌 A", "연금계좌 B", "연금계좌 C"]);
  const s = scoreBm25(idx, "연금계좌", new Set([1]));
  assert.deepEqual([...s.keys()], [1]);
});

test("BM25 — 모든 문서에 나오는 흔한 term 은 감점하지 않는다 (IDF 바닥 0)", () => {
  // 음수 IDF 를 허용하면 "흔한 단어가 있으면 감점"이 되어 검색 의도와 어긋난다.
  const idx = buildBm25(["가나 특별", "가나 보통", "가나 일반"]);
  for (const v of scoreBm25(idx, "가나").values()) assert.ok(v >= 0);
});

test("BM25 — 질의 내 중복 토큰이 점수를 부풀리지 않는다", () => {
  const idx = buildBm25(["연금계좌 세액공제", "주택 임대"]);
  const once = scoreBm25(idx, "연금계좌");
  const twice = scoreBm25(idx, "연금계좌 연금계좌 연금계좌");
  assert.equal(once.get(0), twice.get(0));
});

test("BM25 — 실코퍼스에서 조사 붙은 질의가 조사 없는 질의와 같은 문서를 찾는다", () => {
  const chunks = chunkAll(loadCorpus(SNAPSHOT_DIR).articles);
  const idx = buildBm25(chunks.map((c) => `${c.contextHeader}\n${c.text}`));
  const top = (q: string): string[] =>
    [...scoreBm25(idx, q)]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([i]) => chunks[i]!.sourceId);

  const bare = top("개인종합자산관리계좌");
  const josa = top("개인종합자산관리계좌는");
  assert.ok(bare.includes("TAXEX_91_18"), `조사 없는 질의가 ISA 조문을 못 찾았다: ${bare}`);
  assert.ok(josa.includes("TAXEX_91_18"), `조사 붙은 질의가 ISA 조문을 못 찾았다: ${josa}`);
  console.log(`  [bm25] "개인종합자산관리계좌" top5 = ${bare.join(", ")}`);
});

// ─────────────────────────── 별칭 사전 ───────────────────────────

test("★ 별칭의 expandsTo 가 코퍼스에 실재하고 corpusHits 가 실측과 일치한다", () => {
  const table = loadAliases(ALIASES);
  const articles = loadCorpus(SNAPSHOT_DIR).articles;
  for (const a of table.aliases) {
    for (const target of a.expandsTo) {
      const hits = articles.filter((x) => x.text.includes(target)).length;
      assert.ok(hits > 0, `별칭 "${a.term}" → "${target}" 이 코퍼스에 없다 — 확장해도 무의미하다`);
      assert.equal(
        hits,
        a.corpusHits,
        `별칭 "${a.term}" 의 corpusHits(${a.corpusHits})가 실측(${hits})과 다르다`,
      );
    }
    if (a.expandsTo.length === 0) {
      assert.equal(a.corpusHits, 0, `${a.term}: 확장 대상이 없는데 corpusHits 가 0 이 아니다`);
    }
  }
});

test("★ 미승인 별칭은 확장에 쓰이지 않고, 건너뛴 사실이 드러난다", () => {
  // ★ **fixture 로 잰다.** 예전에는 실제 사전 파일을 읽고 "ISA 가 확장되지 않는다"를 단언했는데,
  //   그건 **로직이 아니라 그 시점의 데이터 상태**를 잰 것이었다. 2026-08-03 에 사람이 9건을
  //   승인하자 곧바로 깨졌다 — 시스템은 의도대로 동작했는데 테스트가 빨개진 것이다.
  //   *승인이 들어오면 깨지는 테스트는 승인을 벌한다.*
  const table = {
    version: "t",
    aliases: [
      { term: "ISA", expandsTo: ["개인종합자산관리계좌"], corpusHits: 8, approved: false, reviewer: null, reviewedAt: null },
    ],
  };
  const r = expandQuery("ISA 비과세 한도", table);
  assert.equal(r.expanded, "ISA 비과세 한도", "미승인 별칭이 적용됐다");
  assert.ok(r.skippedUnapproved.includes("ISA"), "건너뛴 사실이 보고되지 않았다");
  assert.equal(r.applied.length, 0);
});

test("실제 사전은 승인 여부와 무관하게 형식이 유효하다", () => {
  // 실제 파일에 대해서는 **형식만** 검사한다. 승인 상태는 사람의 결정이라 테스트가 강제할 것이 아니다.
  const table = loadAliases(ALIASES);
  for (const a of table.aliases) {
    if (!a.approved) continue;
    assert.ok(typeof a.reviewer === "string" && a.reviewer !== "", `${a.term}: 승인됐는데 reviewer 가 없다`);
    assert.match(a.reviewedAt ?? "", /^\d{4}-\d{2}-\d{2}$/, `${a.term}: 승인일이 LocalDate 가 아니다`);
  }
});

test("승인된 별칭은 원 질의를 지우지 않고 덧붙인다", () => {
  const table = {
    version: "t",
    aliases: [
      { term: "ISA", expandsTo: ["개인종합자산관리계좌"], corpusHits: 8, approved: true, reviewer: "r", reviewedAt: "2026-07-31" },
    ],
  };
  const r = expandQuery("ISA 비과세 한도", table);
  assert.ok(r.expanded.includes("ISA"), "원 질의가 사라졌다 — 사전이 틀리면 복구 불가");
  assert.ok(r.expanded.includes("개인종합자산관리계좌"));
  assert.deepEqual(r.applied, [{ term: "ISA", expandsTo: ["개인종합자산관리계좌"] }]);
});

test("★ 약어 단독 질의는 별칭 없이는 결과가 0건이다 (실측)", () => {
  const chunks = chunkAll(loadCorpus(SNAPSHOT_DIR).articles);
  const idx = buildBm25(chunks.map((c) => `${c.contextHeader}\n${c.text}`));

  // 'ISA'·'IRP' 는 코퍼스 전수 검색에서 0건이다. 2-gram 을 넣어도 문자열이 없으면 BM25 는
  // 원리적으로 0점 — 토크나이저로 고칠 수 있는 문제가 아니라는 것이 별칭 사전의 존재 이유다.
  assert.equal(scoreBm25(idx, "ISA").size, 0, "'ISA' 가 코퍼스에 생겼다 — 전제를 갱신하라");
  assert.equal(scoreBm25(idx, "IRP").size, 0, "'IRP' 가 코퍼스에 생겼다 — 전제를 갱신하라");

  const approved = {
    version: "t",
    aliases: [
      { term: "ISA", expandsTo: ["개인종합자산관리계좌"], corpusHits: 8, approved: true, reviewer: "r", reviewedAt: "2026-07-31" },
    ],
  };
  const expanded = expandQuery("ISA", approved).expanded;
  const rank = rankOfSource(idx, chunks, expanded, "TAXEX_91_18");
  // 1위 고정을 요구하지 않는 이유: 이건 **BM25 단독** 순위다(하이브리드·권위 서열을 안 거친다).
  // 코퍼스에 국세청 훈령이 합류하면서 "개인종합자산관리계좌 가입요건 확인"(NTSWHT_59)이
  // 제목 겹침으로 1위가 됐다 — BM25 관점에선 정당하다. 사양 §5.1 서열 보정은
  // foldToArticles 가 하고, 최종 순위는 check:retrieval 이 잰다.
  assert.ok(rank <= 3, `확장 후에도 ISA 조문이 top-3 밖이다 (rank=${rank})`);
});

test("★ 약어에 맥락이 붙으면 다른 용어가 캐리하지만 별칭이 순위를 올린다 (실측)", () => {
  const chunks = chunkAll(loadCorpus(SNAPSHOT_DIR).articles);
  const idx = buildBm25(chunks.map((c) => `${c.contextHeader}\n${c.text}`));
  const approved = {
    version: "t",
    aliases: [
      { term: "IRP", expandsTo: ["개인형퇴직연금"], corpusHits: 29, approved: true, reviewer: "r", reviewedAt: "2026-07-31" },
    ],
  };
  // "중도인출"·"사유" 가 코퍼스에 있어 확장 없이도 찾히지만 1위는 아니다.
  const before = rankOfSource(idx, chunks, "IRP 중도인출 사유", "RETIRE_D_18");
  const after = rankOfSource(idx, chunks, expandQuery("IRP 중도인출 사유", approved).expanded, "RETIRE_D_18");
  console.log(`  [alias] "IRP 중도인출 사유" → RETIRE_D_18 rank ${before} → ${after}`);
  assert.ok(before > 1, "확장 전에 이미 1위다 — 이 케이스의 전제를 갱신하라");
  assert.ok(after < before, `별칭이 순위를 개선하지 못했다 (${before} → ${after})`);
});

test("별칭 사전 — malformed 는 거절한다", () => {
  assert.throws(() => loadAliases(join(PKG_ROOT, "없음.json")), /읽을 수 없다/);
});

test("별칭 — 대소문자 무관하게 매칭한다", () => {
  const table = {
    version: "t",
    aliases: [{ term: "ISA", expandsTo: ["개인종합자산관리계좌"], corpusHits: 8, approved: true, reviewer: "r", reviewedAt: "d" }],
  };
  assert.ok(expandQuery("isa 한도", table).expanded.includes("개인종합자산관리계좌"));
});

// ─────────────────────────── 시점 필터 ───────────────────────────

test("★ 시점 필터는 합성 fixture 로만 검증 가능하다 (실코퍼스는 미래 조문 0건)", () => {
  const chunks = chunkAll(loadCorpus(SNAPSHOT_DIR).articles);
  const stats = effectiveStats(chunks, "2026-07-31");
  console.log(
    `  [temporal] 실코퍼스: ${stats.kept} 유지 / ${stats.filtered} 제외 · 서로 다른 validFrom ${stats.distinctValidFrom}개`,
  );
  // 이 단언이 곧 vacuity 의 증거다. 실데이터로 필터를 테스트하면 아무것도 검증하지 못한다.
  assert.equal(stats.filtered, 0, "실코퍼스에 미래 조문이 생겼다 — 이 테스트의 전제를 갱신하라");
});

test("시점 필터 — 미래 시행 조문은 제외된다 (합성 fixture)", () => {
  const items = [
    { validFrom: "2025-01-01", id: "과거" },
    { validFrom: "2026-07-31", id: "당일" },
    { validFrom: "2026-08-01", id: "미래" },
    { validFrom: "2030-01-01", id: "먼미래" },
  ];
  assert.deepEqual(
    filterEffective(items, "2026-07-31").map((i) => i.id),
    ["과거", "당일"],
    "시행일 당일은 유효해야 하고 다음날부터는 아니다",
  );
});

test("시점 필터 — 경계값: 시행일 == 조회일", () => {
  assert.equal(filterEffective([{ validFrom: "2026-07-31" }], "2026-07-31").length, 1);
  assert.equal(filterEffective([{ validFrom: "2026-08-01" }], "2026-07-31").length, 0);
});

test("시점 필터 — 빈 입력", () => {
  assert.deepEqual(filterEffective([], "2026-07-31"), []);
});

test("시점 필터 — malformed 날짜는 거절한다 (UTC 변환 여지를 없앤다)", () => {
  assert.throws(() => filterEffective([], "2026-7-31"), /queryAsOf/);
  assert.throws(() => filterEffective([], "2026-07-31T00:00:00Z"), /queryAsOf/);
  assert.throws(() => filterEffective([{ validFrom: "20260731" }], "2026-07-31"), /validFrom/);
  assert.throws(() => assertLocalDate("", "x"), /x/);
});
