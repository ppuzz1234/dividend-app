/**
 * FactAnswer → FactAnswerManifest (사양 §5.6 · §1.3 재현성 단위).
 *
 * 매니페스트는 "이 답이 어떤 재료로 나왔는가"의 전부다. 나중에 같은 매니페스트로
 * 같은 답을 재현할 수 없으면 §1.3 이 깨진다. 그래서 **버전 4종을 전부 싣는다**:
 * 정책 스냅샷 · 리졸버 · RAG 색인 · 렌더러 템플릿(+모델).
 *
 * ## `policySnapshotVersion` 의 기본값이 `NO_APPROVED_PACK` 인 이유
 * 승인 팩이 없는 상태에 그럴듯한 버전 문자열을 적으면 **"검증된 정책이 있었던 것처럼" 보인다.**
 * 없으면 없다고 적는 게 §1.1 이다. 호출부가 팩을 실제로 들고 있으면 그 스냅샷 ID 를 넘긴다
 * (`factui/server.ts` 의 `policyFields()`) — 그래야 같은 팩으로 같은 ① 패널이 재현된다(§1.3).
 */

import { validateFactAnswerManifest } from "@cube/policy";
import type { FactAnswerManifest, PackKind } from "@cube/policy";
import { SYNTHETIC_STAMP_TEXT } from "@cube/policy";

import type { FactAnswer } from "./resolve.js";

/**
 * 이 리졸버 구현의 버전. `resolve.ts`/`verifyCite.ts`/`coverage.ts` 의 **판정 로직**이 바뀌면 올린다.
 *   1 → 2: `looksLikeClaim` 이 콜론으로 끝나는 목록 도입부를 주장에서 제외.
 *          같은 답에 대해 `인용 없는 주장` 건수가 달라지므로 판정 버전이다.
 *   2 → 3: 마크다운 제목(`## …`)도 주장에서 제외. 콜론 도입부와 같은 이유 — 구조 표시다.
 *   5 → 6: 답변 금액을 인용 조문과 대조(`unsourcedAmounts`). 형식 검사를 다 통과하고
 *          **값만 틀린 답**을 실측으로 잡은 뒤 추가했다.
 *   4 → 5: "확인되지 않는다" 류를 주장에서 제외 — 규칙 5 가 **인용을 달지 말라고 하는데**
 *          검사기는 위반으로 셌다(실측 10건). 검사기가 규칙과 어긋나면 옳은 행동을 벌한다.
 *   3 → 4: 목록 항목은 줄 전체를 한 단위로 본다. 항목 가운데 마침표에서 쪼개져
 *          앞쪽이 무인용으로 잡히던 분리기 부작용(실측).
 *   6 → 7: **분리기 부작용 두 건을 줄 단위 판정으로 옮겼다.** ① 표 구분선·헤더행
 *          (`| 구분 | 비과세 한도 |` — 축 이름은 확인할 사실이 아니다) ② 번호 붙은 제목
 *          (`## 1. 비과세 한도금액` 이 `1.` 뒤에서 갈라져 `##` 를 잃었다). 데이터 행은 그대로 검사.
 *          더불어 `확정되지 않`·`특정하지 못` 을 "인용을 요구하지 않는" 식구에 넣었다(규칙 5).
 *   7 → 8: 오탐 세 건을 **구조 판정으로** 옮겼다. ① 하위 목록을 거느린 줄은 도입부다
 *          (콜론이 줄 끝이 아니라 중간에 있어 기존 규칙에 안 걸렸다) ② 규칙 0 이 시키는
 *          "이 밖에 … 규정도 있어요" 는 주장이 아니라 안내다 ③ 금액은 `예를 들어` 가정값과
 *          진짜 미확인 값을 갈라 센다 — 뭉뚱그리면 경고가 매번 떠서 아무도 안 본다.
 */
export const FACT_RESOLVER_VERSION = "fact-resolver-9";

/** 승인된 정책 팩이 하나도 없는 상태의 정직한 표기. 값을 지어내지 않는다. */
export const NO_APPROVED_PACK = "NO_APPROVED_PACK";

export interface ManifestInputs {
  readonly queryAsOf: string;
  readonly ragIndexVersion: string;
  readonly rendererTemplateVersion: string;
  readonly rendererModelVersion: string;
  readonly policySnapshotVersion?: string;
  /** 승인 팩에서 값을 인출한 경우에만. UNMODELED 에 붙이면 거절한다 (아래 참조). */
  readonly packKind?: PackKind;
}

export function buildFactManifest(a: FactAnswer, i: ManifestInputs): FactAnswerManifest {
  // ★ UNMODELED 는 팩을 한 번도 열지 않은 경로다. 거기에 packKind 를 붙이면
  //   `answerPayloadHash` 에 안 들어간 필드가 매니페스트에만 실리고,
  //   그러면 **스탬프만 갈아끼운 위조가 해시 검증을 통과한다** (types.ts §5.6 확장 주석).
  if (i.packKind !== undefined && a.answerClass === "UNMODELED_OFFICIAL_SOURCE") {
    throw new Error(
      "UNMODELED_OFFICIAL_SOURCE 에는 packKind 를 붙일 수 없다 — 팩을 인출하지 않은 답이다",
    );
  }

  const m: FactAnswerManifest = {
    queryAsOf: i.queryAsOf,
    policySnapshotVersion: i.policySnapshotVersion ?? NO_APPROVED_PACK,
    factResolverVersion: FACT_RESOLVER_VERSION,
    answerClass: a.answerClass,
    resolvedRuleIds: a.resolvedRuleIds,
    sourceSnapshotIds: a.citations.map((c) => c.sourceId),
    sourceHashes: a.citations.map((c) => c.textHash),
    ragIndexVersion: i.ragIndexVersion,
    rendererTemplateVersion: i.rendererTemplateVersion,
    rendererModelVersion: i.rendererModelVersion,
    answerPayloadHash: a.answerPayloadHash,
    ...(i.packKind === undefined
      ? {}
      : { packKind: i.packKind, ...(i.packKind === "SYNTHETIC_DEMO" ? { syntheticStamp: SYNTHETIC_STAMP_TEXT } : {}) }),
  };

  // 우리가 만든 매니페스트도 로더를 통과해야 한다 — 스키마를 만든 쪽이 스스로 면제받으면 안 된다.
  return validateFactAnswerManifest(m);
}
