/**
 * §12 커버리지 검증 — 수집된 스냅샷이 사양이 요구한 조문을 실제로 담고 있는가.
 *
 * 왜 테스트인가: 이 검증을 일회성 스크립트로 눈 확인만 하면, 법 개정으로 조문번호가 바뀌거나
 * 파싱이 조문 하나를 흘려도 **아무도 못 잡는다.** 정책 팩은 `source_id` 로 조문을 인용하는데,
 * 인용 대상이 사라진 것을 로딩 시점에 알 방법이 없다 (loadPolicyPack 은 팩 내부 참조만 본다).
 *
 * 이 테스트는 네트워크를 타지 않는다 — 커밋된 스냅샷 파일만 읽는다.
 * 스냅샷이 없으면 실패한다. 스냅샷은 증거물이라 레포에 있어야 한다 (`npm run collect` 로 생성).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import type { SourceSnapshot } from "../src/types.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "snapshots");

const ABBREVS = ["INCTAX", "INCTAX_D", "TAXEX", "TAXEX_D", "RETIRE", "RETIRE_D", "PENSUP", "PENSUPD", "NTSWHT", "NTSINC"] as const;

/**
 * 사양 §12 '원문 대조 체크리스트' 가 **이름을 대고** 요구한 조문.
 * 값은 그 조문이 왜 필요한지 — 실패 메시지에 그대로 실어 "무엇을 잃었는지"를 즉시 알게 한다.
 *
 * 주의: 이 목록은 §12 전체가 아니라 **조문번호가 특정된 항목**만이다.
 * "배당소득 과세" 처럼 조문번호 없이 서술된 항목은 여기서 검증할 수 없다 (Q: 어느 조문인지 사람이 확정해야 함).
 */
const REQUIRED: ReadonlyMap<string, string> = new Map([
  ["TAXEX_91_18", "ISA 과세특례 — 비과세 한도(유형별)·초과분 분리과세율·납입한도·서민형 자격"],
  ["INCTAX_59_3", "연금계좌 세액공제 — 대상 한도(단독/합산)·세액공제율 소득 분기"],
  ["INCTAX_61", "세액공제액의 산출세액 초과 시 처리"],
  ["INCTAX_129", "연금소득 연령별 원천징수율"],
  ["INCTAX_D_40_2", "연금계좌 총 납입한도 · 연금수령 요건·수령한도 산식"],
  ["INCTAX_D_40_3", "재원별 인출 순서"],
  ["INCTAX_D_118_3", "ISA 만기 → 연금 전환 특례"],
  ["RETIRE_24", "IRP 설정 및 운영 — 법률 근거 (v1.4 신규)"],
  ["RETIRE_D_17", "IRP 설정 대상 — 법적 지위별 목록 (v1.4 신규·중요: '소득 유무' 판정은 부정확)"],
  ["RETIRE_D_17_2", "IRP 부담금 납입한도"],
  ["RETIRE_D_18", "IRP 급여 수급요건 및 중도인출 (v1.4 신규)"],
  // 행정규칙 (Phase 3-a) — §12 "IRP 편입 제한(개별주 불가·위험자산 비중)"의 유일한 근거.
  // 법령·시행령에는 이 한도가 없다.
  ["PENSUP_9", "증권 및 기타 적립금 운용방법의 종류 — 편입 가능 증권"],
  ["PENSUP_11", "적립금 운용방법 — 투자위험을 낮춘 운용방법"],
  ["PENSUP_13", "투자한도 적용에 대한 특례 — 집중투자한도"],
]);

function loadAll(): Map<string, { article: SourceSnapshot["articles"][number]; lawName: string }> {
  const index = new Map<string, { article: SourceSnapshot["articles"][number]; lawName: string }>();
  for (const abbrev of ABBREVS) {
    const path = join(SNAPSHOT_DIR, `${abbrev}.json`);
    let snapshot: SourceSnapshot;
    try {
      snapshot = JSON.parse(readFileSync(path, "utf8")) as SourceSnapshot;
    } catch (e) {
      throw new Error(
        `스냅샷 ${abbrev}.json 을 읽을 수 없다 (${(e as Error).message}) — ` +
          `\`npm run collect -w @cube/corpus\` 로 수집했는지 확인하라`,
      );
    }
    for (const article of snapshot.articles) {
      const prev = index.get(article.sourceId);
      if (prev) {
        // source_id 는 정책 팩이 조문을 지목하는 전역 주소다. 법령이 달라도 겹치면 인용이 모호해진다.
        throw new Error(
          `source_id 가 법령 간에 충돌한다: ${article.sourceId} — ` +
            `"${prev.lawName}" 과 "${snapshot.lawName}" 양쪽에 존재. targets.json 의 abbrev 를 구분하라`,
        );
      }
      index.set(article.sourceId, { article, lawName: snapshot.lawName });
    }
  }
  return index;
}

test("§12 가 이름을 댄 조문이 코퍼스에 실재한다", () => {
  const index = loadAll();
  const missing: string[] = [];
  for (const [sourceId, why] of REQUIRED) {
    if (!index.has(sourceId)) missing.push(`  ${sourceId} — ${why}`);
  }
  assert.equal(
    missing.length,
    0,
    `사양 §12 가 요구한 조문 ${missing.length}건이 코퍼스에 없다:\n${missing.join("\n")}\n` +
      `법 개정으로 조문번호가 바뀌었거나 파싱이 흘렸을 수 있다. 원문을 확인하고 REQUIRED 를 갱신하라.`,
  );
});

test("필수 조문의 원문이 비어 있지 않다", () => {
  const index = loadAll();
  for (const [sourceId, why] of REQUIRED) {
    const hit = index.get(sourceId);
    assert.ok(hit, `${sourceId} 없음`);
    // 조문 하나가 한 줄짜리로 쪼그라들면 파싱이 계층을 흘린 것이다. 100자는 "설마 이것보단 길겠지" 하한.
    assert.ok(
      hit.article.text.length >= 100,
      `${sourceId} 원문이 ${hit.article.text.length}자뿐이다 (${why}) — 파싱이 계층을 흘렸는지 확인하라`,
    );
  }
});

test("모든 조문이 인용 가능한 형태다 — 해시·시행일·본문", () => {
  const index = loadAll();
  assert.ok(index.size > 1000, `조문이 ${index.size}개뿐이다 — 수집이 중간에 끊겼는지 확인하라`);

  for (const [sourceId, { article }] of index) {
    // ASCII 만: 정책 팩의 canonical JSON key 규약(사양 §5.2.1)과 같은 제약을 id 에도 건다.
    assert.match(sourceId, /^[A-Za-z0-9_]+$/, `${sourceId}: source_id 에 ASCII 밖 문자`);
    // FactAnswerManifest.sourceHashes 가 소문자 hex64 를 강제한다(대문자도 거절) — 여기서 미리 맞춘다.
    assert.match(article.textHash, /^[0-9a-f]{64}$/, `${sourceId}: textHash 형식 위반`);
    assert.match(article.validFrom, /^\d{4}-\d{2}-\d{2}$/, `${sourceId}: validFrom 이 LocalDate 가 아님`);
    assert.ok(article.text.trim().length > 0, `${sourceId}: 원문이 비었다`);
  }
});

test("소속 호 미상인 목은 표식을 달고 있다", () => {
  const index = loadAll();
  const isa = index.get("TAXEX_91_18");
  assert.ok(isa, "TAXEX_91_18 없음");

  // 표식이 사라지면 '가·나·다'가 바로 앞 호에 속한 것처럼 읽힌다.
  // ISA 비과세 한도에서 이게 벌어지면 400만원(서민형)과 200만원이 뒤집힌다.
  assert.match(isa.article.text, /\[각 목\] /, "TAXEX_91_18 에 [각 목] 표식이 없다");
  assert.ok(
    !/200만원\n가\./.test(isa.article.text),
    "목이 마지막 호 바로 뒤에 표식 없이 붙었다 — 서민형 기준이 뒤집혀 읽힌다",
  );
});
