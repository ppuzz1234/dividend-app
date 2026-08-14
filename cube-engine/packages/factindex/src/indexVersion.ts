/**
 * 색인 정체성 — `FactAnswerManifest.ragIndexVersion` 이 참조한다.
 *
 * 재현성 정의(사양 §1.3)가 "동일 스냅샷·동일 빌드에서 동일 결과"이므로,
 * **답을 바꿀 수 있는 모든 입력**이 버전에 들어가야 한다:
 *   임베딩 모델 · 차원 · 청킹 규칙 · 코퍼스 원문.
 * 하나라도 빠지면 "같은 버전인데 다른 답"이 가능해지고 감사가 무의미해진다.
 *
 * `canonicalHash` 를 쓰는 이유: key 순서·표기 흔들림에 영향받지 않는 정본 해시가 필요한데,
 * 여기 들어가는 key 는 전부 ASCII 라 `@cube/numeric` 의 ASCII 제약에 걸리지 않는다.
 */

import { canonicalHash } from "@cube/numeric";

import { CHUNK_ALGORITHM } from "./chunk.js";

export interface IndexVersionInput {
  readonly embedModel: string;
  readonly embedDim: number;
  readonly maxChars: number;
  readonly corpusHash: string;
}

export function computeRagIndexVersion(input: IndexVersionInput): string {
  if (input.embedModel.trim() === "") throw new Error("embedModel 이 비었다");
  if (!Number.isInteger(input.embedDim) || input.embedDim <= 0) {
    throw new Error(`embedDim 이 양의 정수가 아니다: ${input.embedDim}`);
  }
  if (!Number.isInteger(input.maxChars) || input.maxChars <= 0) {
    throw new Error(`maxChars 가 양의 정수가 아니다: ${input.maxChars}`);
  }
  if (!/^[0-9a-f]{64}$/.test(input.corpusHash)) {
    throw new Error(`corpusHash 가 소문자 hex64 가 아니다: ${input.corpusHash}`);
  }

  return canonicalHash({
    embedModel: input.embedModel,
    embedDim: input.embedDim,
    chunkAlgorithm: CHUNK_ALGORITHM,
    chunkMaxChars: input.maxChars,
    corpusHash: input.corpusHash,
  });
}
