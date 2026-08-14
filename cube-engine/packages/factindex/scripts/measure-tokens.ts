/**
 * 청크 한도 실측 — `maxChars=1500` 이 임베딩 모델 입력 한도 안에 드는가.
 *
 *   npm run measure:tokens -w @cube/factindex
 *
 * ## 왜 이 스크립트가 레포에 있는가
 * `DEFAULT_MAX_CHARS = 1500` 은 **조각 수 시뮬레이션**으로 고른 값이지 토큰 한도로 고른 값이 아니다.
 * 문서상 한도를 인용해 "괜찮겠지" 하면 그건 확인 안 한 값이고, 색인을 다 만든 뒤 터진다.
 * `@cube/corpus` 의 `measure-mok.ts` 와 같은 규약 — **결론이 아니라 측정 절차를 산출물로 남긴다.**
 *
 * ## API 콜 비용
 * countTokens 3콜 + 임베딩 1콜(1건) = **총 4콜.** ⚠️ 키를 A1-v2 와 공유하므로 quota 도 공유한다.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_MAX_CHARS, chunkAll } from "../src/chunk.js";
import { loadCorpus } from "../src/corpusLoad.js";
import { countTokens, embedTexts, resolveEmbedConfig } from "../src/embed.js";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SNAPSHOT_DIR = join(PKG_ROOT, "..", "corpus", "snapshots");

async function main(): Promise<void> {
  const config = resolveEmbedConfig();
  console.log(`[측정] 모델 ${config.model} · 차원 ${config.dim} · 청크 한도 ${DEFAULT_MAX_CHARS}자`);
  console.log("[측정] API 콜 4회 예정 (countTokens 3 + embed 1)\n");

  const corpus = loadCorpus(SNAPSHOT_DIR);
  const chunks = chunkAll(corpus.articles);

  // 임베딩에 실제로 들어가는 문자열 = contextHeader + 본문. 본문만 재면 과소평가된다.
  const inputs = chunks.map((c) => `${c.contextHeader}\n${c.text.trim()}`);
  const lengths = inputs.map((s) => s.length);
  const maxLen = Math.max(...lengths);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const longestIdx = lengths.indexOf(maxLen);

  console.log(`청크 ${chunks.length}개 · 임베딩 입력 평균 ${avgLen.toFixed(0)}자 · 최대 ${maxLen}자`);
  console.log(`최장 청크: ${chunks[longestIdx]?.chunkId}\n`);

  const samples: { label: string; text: string }[] = [
    { label: "최장 청크", text: inputs[longestIdx]! },
    { label: "평균 길이 청크", text: inputs[lengths.findIndex((l) => l >= avgLen)]! },
    { label: "한도 가정 최악(1500자 한글)", text: "가".repeat(DEFAULT_MAX_CHARS) },
  ];

  let worstRatio = 0;
  for (const s of samples) {
    const tokens = await countTokens(s.text, config);
    const ratio = tokens / s.text.length;
    worstRatio = Math.max(worstRatio, ratio);
    console.log(`  ${s.label.padEnd(24)} ${String(s.text.length).padStart(5)}자 → ${String(tokens).padStart(5)} 토큰 (${ratio.toFixed(2)} 토큰/자)`);
  }

  console.log(`\n최악 비율 ${worstRatio.toFixed(2)} 토큰/자 → 한도 ${DEFAULT_MAX_CHARS}자 ≈ ${Math.ceil(DEFAULT_MAX_CHARS * worstRatio)} 토큰`);

  // 실제로 최장 청크가 임베딩되는지 확인 — 한도 초과면 여기서 API 가 거절한다.
  console.log("\n[검증] 최장 청크를 실제로 임베딩해본다…");
  const [vec] = await embedTexts([inputs[longestIdx]!], { config, task: "RETRIEVAL_DOCUMENT" });
  if (!vec) throw new Error("임베딩 결과가 비었다");
  const norm = Math.sqrt(vec.reduce((a, x) => a + x * x, 0));
  console.log(`  ✓ 차원 ${vec.length} · L2 노름 ${norm.toFixed(6)}`);

  const totalChars = lengths.reduce((a, b) => a + b, 0);
  console.log(
    `\n[전체 색인 예상] 청크 ${chunks.length} · 입력 ${totalChars.toLocaleString()}자 ` +
      `≈ ${Math.ceil(totalChars * worstRatio).toLocaleString()} 토큰 · API ${Math.ceil(chunks.length / 32)}콜`,
  );
  console.log(
    `\n판정: 최장 청크가 임베딩에 성공했으므로 maxChars=${DEFAULT_MAX_CHARS} 는 한도 안이다.\n` +
      `      실패했다면 DEFAULT_MAX_CHARS 를 낮추고 chunk.test.ts 의 고정 수치를 전부 갱신해야 한다.`,
  );
}

await main();
