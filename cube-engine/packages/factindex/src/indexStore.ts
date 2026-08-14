/**
 * 색인 산출물의 저장·로딩.
 *
 * ## 무엇을 저장하고 무엇을 저장하지 않나
 * - **저장함**: 벡터(`vectors.bin`, Float32 평면) + `manifest.json`(버전·청크 id 순서)
 * - **저장 안 함**: 청크 텍스트. `loadCorpus + chunkAll` 이 **결정론적**이라 언제든 재생성된다.
 *   중복 저장하면 두 벌이 어긋날 수 있고, 어긋난 쪽이 정답인지 알 방법이 없다.
 *
 * 로딩 시 재생성한 `chunkIds` 가 매니페스트와 다르면 **거절한다** — 벡터와 청크의 짝이
 * 어긋난 채로 검색하면 엉뚱한 조문이 근거로 나가고, 그건 조용히 틀린다.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { IndexManifest } from "./types.js";

export interface LoadedIndex {
  readonly manifest: IndexManifest;
  /** `chunkIds[i]` 의 벡터는 `vectors.subarray(i*dim, (i+1)*dim)` */
  readonly vectors: Float32Array;
}

export function writeVectors(path: string, vectors: Float32Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  // 임시 파일에 쓰고 rename — 중간에 죽어도 반쯤 쓰인 색인이 남지 않는다.
  writeFileSync(tmp, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  renameSync(tmp, path);
}

export function writeManifest(path: string, manifest: IndexManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function loadIndex(manifestPath: string, vectorsPath: string): LoadedIndex {
  let manifest: IndexManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as IndexManifest;
  } catch (e) {
    throw new Error(
      `색인 매니페스트를 읽을 수 없다 (${(e as Error).message}) — ` +
        `\`npm run build:index -w @cube/factindex\` 를 먼저 돌려라`,
    );
  }
  const buf = readFileSync(vectorsPath);
  const expectedBytes = manifest.chunkIds.length * manifest.embedDim * 4;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `벡터 파일 크기가 맞지 않는다: ${buf.byteLength}B (기대 ${expectedBytes}B = ` +
        `${manifest.chunkIds.length}청크 × ${manifest.embedDim}차원 × 4B) — 색인이 손상됐다`,
    );
  }
  const vectors = new Float32Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  return { manifest, vectors };
}

/**
 * 청크와 벡터의 짝이 맞는지 검사. **로딩할 때마다 부른다.**
 * 청킹 규칙이나 코퍼스가 바뀌면 `chunkIds` 가 달라지는데, 그대로 검색하면
 * i 번째 벡터가 다른 조문을 가리키게 된다 — 근거가 조용히 틀리는 최악의 실패다.
 */
export function assertIndexMatchesChunks(
  manifest: IndexManifest,
  chunkIds: readonly string[],
): void {
  if (manifest.chunkIds.length !== chunkIds.length) {
    throw new Error(
      `색인의 청크 수(${manifest.chunkIds.length})와 현재 청킹 결과(${chunkIds.length})가 다르다 — ` +
        `코퍼스나 청킹 규칙이 바뀌었다. 재색인하라`,
    );
  }
  for (let i = 0; i < chunkIds.length; i++) {
    if (manifest.chunkIds[i] !== chunkIds[i]) {
      throw new Error(
        `색인 순서가 어긋난다: [${i}] 색인=${manifest.chunkIds[i]} / 현재=${chunkIds[i]} — 재색인하라`,
      );
    }
  }
}
