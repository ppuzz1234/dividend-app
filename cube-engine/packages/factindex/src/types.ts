/**
 * 색인 단위 타입 — 조문을 검색 가능한 조각으로 나눈 결과.
 *
 * 설계의 핵심은 **`text` 와 `contextHeader` 의 분리**다.
 *  - `text`      : 조문 원문의 **정확한 연속 슬라이스**. 같은 조문의 청크를 순서대로 이어붙이면
 *                  원문과 한 글자도 다르지 않다. 인용·원문 대조의 대상이다.
 *  - `contextHeader` : 임베딩·표시용 맥락. 원문이 아니므로 재조립에 쓰지 않는다.
 *
 * 왜 나눴나: 긴 조문을 항 아래로 쪼개면 `[각 목]` 줄이 소속 항의 헤더에서 떨어진다.
 * 실측상 한도 초과 항 89개 중 **63개가 목을 포함**해 "쪼개지 않는다"는 선택지가 없었다.
 * 원문 슬라이스는 그대로 두고 맥락만 별도로 실어, **재조립 보장과 오독 방지를 동시에** 만족시킨다.
 * (`[각 목]` 이 왜 위험한지는 `@cube/corpus` 의 `parse.ts` KNOWN-LIMITATION 참조 —
 *  표식이 맥락에서 떨어지면 ISA 비과세 한도 400만원↔200만원이 뒤집혀 읽힌다.)
 */

import type { AuthorityType } from "@cube/corpus";

/** 어느 계층에서 잘렸는가. 분포를 테스트로 고정해 청킹 규칙의 퇴화를 감지한다. */
export type SplitLevel =
  /** 조문 전체가 한 청크 (자르지 않음) */
  | "ARTICLE"
  /** 항(①②③) 경계 */
  | "HANG"
  /** 호(1. 2. 3.) 경계 — 항 하나가 한도를 넘을 때 */
  | "HO"
  /** 문자 경계 — 줄바꿈조차 없는 긴 줄의 최후 수단 */
  | "CHAR";

export interface Chunk {
  /** `TAXEX_91_18` 또는 `TAXEX_91_18#2`. 조문이 안 쪼개지면 `sourceId` 와 같다. */
  readonly chunkId: string;
  /** 이 청크가 속한 조문. **항상 정확히 하나** — 청크는 조문 경계를 넘지 않는다. */
  readonly sourceId: string;

  readonly lawName: string;
  readonly authorityType: AuthorityType;
  readonly articleNo: string;
  readonly articleSubNo: string | null;
  readonly title: string | null;

  /** 원문의 정확한 연속 슬라이스. `article.text.slice(...charOffset)` 과 동일하다. */
  readonly text: string;
  /**
   * 임베딩·표시에 앞에 붙일 맥락. 원문이 아니다.
   * 항상 「법령명 조문표기(제목)」을 담고, 청크가 항 중간이면 그 항의 헤더 줄도 담는다.
   */
  readonly contextHeader: string;

  /** 조문 단위 시행일 (사양 §5.1 temporal.valid_from) */
  readonly validFrom: string;
  /** **조문 전체**의 해시 — 인용 근거는 조각이 아니라 조문이다. */
  readonly articleTextHash: string;
  /** 이 조각의 해시 — 색인 무결성 검증용 */
  readonly chunkHash: string;

  readonly splitLevel: SplitLevel;
  /** 이 청크에 소속 호 미상인 목 줄이 들어 있는가 → 응답에 caveat 필요 */
  readonly hasUnattachedMok: boolean;
  /** `article.text` 기준 [start, end). 같은 조문 청크들은 **틈·겹침 없이 연속**이다. */
  readonly charOffset: readonly [number, number];
}

/** 색인 산출물의 정체성. `FactAnswerManifest.ragIndexVersion` 이 이것을 참조한다. */
export interface IndexManifest {
  readonly ragIndexVersion: string;
  readonly embedModel: string;
  readonly embedDim: number;
  /** 청킹 규칙의 지문 — 규칙이 바뀌면 버전이 바뀌어야 한다 */
  readonly chunkRule: { readonly maxChars: number; readonly algorithm: string };
  /** 코퍼스 지문 — 조문 원문이 바뀌면 색인도 무효다 */
  readonly corpusHash: string;
  readonly chunkIds: readonly string[];
  readonly builtAt: string;
}
