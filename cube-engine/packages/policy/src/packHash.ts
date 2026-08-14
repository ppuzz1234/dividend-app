/**
 * 정책 팩 정본 해시 — 사양 §5.2 절차 1~4.
 *
 * @cube/numeric 의 canonicalHash 를 그대로 쓴다 (순서 1 승인 산출물, 내부 미수정).
 * numeric 이 비ASCII key 로 거절하면 그 사실 자체가 로딩 거절 사유이므로 정책 계층 code 로 감싼다 —
 * 해싱할 수 없는 팩은 RunManifest 재현성 단위가 될 수 없다 (매트릭스 R31).
 */

import { NumericContractError, canonicalHash } from "@cube/numeric";

import { PolicyContractError, reject } from "./errors.js";

export function hashPack(raw: unknown, path: string): string {
  try {
    return canonicalHash(raw);
  } catch (e) {
    if (e instanceof NumericContractError && e.code === "NON_ASCII_KEY") {
      reject(
        "NON_ASCII_KEY_IN_PACK",
        path,
        `정본 해시 불가 — key 는 ASCII [A-Za-z0-9_] 만 허용된다 (${e.message})`,
      );
    }
    if (e instanceof NumericContractError) {
      // 비안전 정수·미지원 타입 등. 팩이 해싱 불가라는 결론은 같다.
      reject("UNSAFE_INTEGER", path, `정본 해시 불가 (${e.code}): ${e.message}`);
    }
    if (e instanceof PolicyContractError) throw e;
    throw e;
  }
}
