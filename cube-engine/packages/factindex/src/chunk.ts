/**
 * 조문 → 청크 3단 분할 (항 → 호 → 문자).
 *
 * ## 불변식 (테스트가 강제한다)
 * 1. **재조립 동일성** — 같은 조문의 청크를 순서대로 `text` 이어붙이면 원문과 바이트 동일.
 * 2. **조문 경계 불침범** — 청크 하나는 정확히 하나의 `sourceId` 에 속한다.
 * 3. **`[각 목]` 맥락 보존** — 목 줄을 담은 청크는 `contextHeader` 에 그 항의 헤더 줄을 갖는다.
 *
 * ## 왜 3단인가 (실측)
 * - 조문 1,477개 중 T=1500 초과 **403개** → 분할 필요.
 * - 항 경계만으로는 **닫히지 않는다**: 단일 항이 한도를 넘는 경우 **89건**.
 * - 그 89건 중 **호 줄조차 없는 단일 줄 3건** → 문자 폴백이 최후 수단으로 필요.
 *
 * ## 왜 목을 담은 항을 그냥 안 쪼개지 않았나
 * 한도 초과 항 89건 중 **63건이 목을 포함**한다. 안 쪼개면 그 63건이 임베딩 한도를 넘는다.
 * 그래서 원문 슬라이스(`text`)는 쪼개되 항 헤더를 `contextHeader` 로 실어, 임베딩·표시·인용에서
 * 목이 항 맥락 없이 홀로 서는 일이 없게 했다. 원문 보존과 오독 방지를 둘 다 취한 것.
 */

import { sha256Hex } from "@cube/numeric";

import type { LoadedArticle } from "./corpusLoad.js";
import type { Chunk, SplitLevel } from "./types.js";

/** 항 마커 ①~⑳ (U+2460~U+2473). 줄 맨 앞에 올 때만 항 경계로 본다. */
const HANG_RE = /^[①-⑳]/;
/** 호 마커 `1.` `12.` `1의2.` — 뒤에 공백이 와야 한다(연도 "2024.12.31" 오인 방지). */
const HO_RE = /^\d+(?:의\d+)?\.\s/;
/** 소속 호 미상 목 표식. `@cube/corpus` 의 `UNATTACHED_MOK` 과 같은 문자열이어야 한다. */
const MOK_PREFIX = "[각 목] ";

/** `contextHeader` 에 실을 항 헤더 줄의 최대 길이. 넘으면 잘라 붙인다. */
const HANG_HEADER_CAP = 200;

/**
 * 목을 담은 청크에 붙이는 소속 미상 고지.
 *
 * 왜 필요한가 — 실측 사례 `INCTAX_12`(비과세소득, 항 없음):
 * ```
 *   2. 사업소득 중 다음 각 목의 …      ← 각 목 언급
 *   3. 근로소득과 퇴직소득 중 다음 각 목의 …
 *   4. 연금소득 중 다음 각 목의 …
 *   5. 기타소득 중 다음 각 목의 …
 *   [각 목] 가. 논ㆍ밭을 …            ← 2·3·4·5 중 어디 소속인지 원문 구조상 확정 불가
 * ```
 * 조문 전체를 보면 "호 4개가 각 목을 말한다"는 모호함이 보이지만, **조각만 보면 바로 앞 호에
 * 속한 것처럼 읽힌다.** 청킹이 모호함을 거짓 확신으로 바꾸는 것이다.
 * 항 헤더를 붙이는 것만으로는 이 경우(항이 아예 없음)를 못 막으므로 고지를 별도로 단다.
 *
 * ponytail(factindex/목맥락): 후보 호 목록("각 목"을 말하는 호들)까지 실으면 더 친절하지만,
 * 후보가 많은 조문에서 헤더가 길어진다. 소속을 **주장하지 않는다**는 목적은 이 고지로 충족된다.
 * 업그레이드 경로 = 조항호목 단위 API 가 부모 참조를 주면 표식·고지 모두 제거.
 */
export const MOK_CAVEAT = "[주의] 아래 「[각 목]」 항목은 원문 구조상 어느 호에 속하는지 확정할 수 없다.";

export const DEFAULT_MAX_CHARS = 1500;
export const CHUNK_ALGORITHM = "hang>ho>char/v1";

/** 줄과 그 줄의 원문 내 시작 오프셋. 오프셋을 들고 다녀야 재조립이 정확해진다. */
interface Line {
  readonly text: string;
  readonly start: number;
  /** 줄바꿈 문자를 포함한 끝 위치 (다음 줄의 start 와 같다) */
  readonly end: number;
}

function toLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf("\n", start);
    if (nl === -1) {
      lines.push({ text: text.slice(start), start, end: text.length });
      break;
    }
    lines.push({ text: text.slice(start, nl), start, end: nl + 1 });
    start = nl + 1;
  }
  return lines;
}

/** 조문 표기: `제91조의18(제목)` — 제목이 없으면 괄호 없이. */
function articleLabel(a: LoadedArticle): string {
  const no = a.articleSubNo === null ? `제${a.articleNo}조` : `제${a.articleNo}조의${a.articleSubNo}`;
  return a.title === null ? no : `${no}(${a.title})`;
}

function cap(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/** 연속된 줄 묶음을 [start, end) 로 환산 */
function span(lines: readonly Line[]): [number, number] {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) throw new Error("빈 줄 묶음은 span 을 가질 수 없다");
  return [first.start, last.end];
}

/**
 * 조문 하나를 청크로 나눈다.
 *
 * @param maxChars 청크 최대 문자 수. 이 값이 바뀌면 `ragIndexVersion` 이 바뀌어야 한다.
 */
export function chunkArticle(
  article: LoadedArticle,
  maxChars: number = DEFAULT_MAX_CHARS,
): Chunk[] {
  if (!Number.isInteger(maxChars) || maxChars <= 0) {
    throw new Error(`maxChars 는 양의 정수여야 한다: ${maxChars}`);
  }
  const text = article.text;
  if (text.length === 0) {
    throw new Error(`${article.sourceId}: 원문이 비었다 — 코퍼스 단계에서 걸렸어야 한다`);
  }

  const base = `${article.lawName} ${articleLabel(article)}`;
  const emitted: {
    readonly range: [number, number];
    readonly level: SplitLevel;
    readonly hangHeader: string | null;
  }[] = [];

  if (text.length <= maxChars) {
    emitted.push({ range: [0, text.length], level: "ARTICLE", hangHeader: null });
  } else {
    // 인접 블록을 한도까지 greedy 로 묶는다. 항 하나당 청크 하나로 쪼개면 조각이 잘아져
    // 임베딩 콜이 불어나고(quota 는 A1-v2 와 공유) 맥락도 얇아진다. 인접 블록은 원문상 연속이라
    // 병합해도 charOffset 연속성이 유지된다.
    let pending: { range: [number, number]; level: SplitLevel } | null = null;
    const flush = (): void => {
      if (pending !== null) emitted.push({ ...pending, hangHeader: null });
      pending = null;
    };
    const pack = (range: [number, number], level: SplitLevel): void => {
      if (pending !== null && range[1] - pending.range[0] <= maxChars) {
        // 병합된 조각은 항 헤더가 text 안에 들어 있으므로 hangHeader 가 필요 없다.
        pending = { range: [pending.range[0], range[1]], level: pending.level === "ARTICLE" ? level : pending.level };
        return;
      }
      flush();
      pending = { range, level };
    };

    for (const block of splitByHang(toLines(text))) {
      const blockRange = span(block.lines);
      if (blockRange[1] - blockRange[0] <= maxChars) {
        pack(blockRange, block.isHang ? "HANG" : "ARTICLE");
        continue;
      }
      // 항 하나가 한도를 넘는다 → 호 경계로 2차 분할. 호 그룹도 같은 방식으로 묶는다.
      // 항 헤더 줄은 첫 조각에 남고, 뒤 조각들은 contextHeader 로 헤더를 받는다.
      flush();
      const header = block.isHang && block.lines[0] ? cap(block.lines[0].text, HANG_HEADER_CAP) : null;
      let hoPending: [number, number] | null = null;
      let hoIsFirst = true;
      const flushHo = (): void => {
        if (hoPending !== null) {
          emitted.push({
            range: hoPending,
            level: block.isHang ? "HO" : "ARTICLE",
            hangHeader: hoIsFirst ? null : header,
          });
          hoIsFirst = false;
        }
        hoPending = null;
      };

      for (const sub of splitByHo(block.lines)) {
        const subRange = span(sub);
        if (subRange[1] - subRange[0] > maxChars) {
          // 줄바꿈조차 없는 긴 줄 → 문자 경계로 최후 분할.
          flushHo();
          for (const piece of splitByChar(subRange, text, maxChars)) {
            emitted.push({ range: piece, level: "CHAR", hangHeader: hoIsFirst ? null : header });
            hoIsFirst = false;
          }
          continue;
        }
        if (hoPending !== null && subRange[1] - hoPending[0] <= maxChars) {
          hoPending = [hoPending[0], subRange[1]];
        } else {
          flushHo();
          hoPending = subRange;
        }
      }
      flushHo();
    }
    flush();
  }

  return emitted.map((e, i) => {
    const slice = text.slice(e.range[0], e.range[1]);
    const hasMok = slice.includes(MOK_PREFIX);
    const parts = [base];
    if (e.hangHeader !== null) parts.push(e.hangHeader);
    // 목을 담은 조각은 소속을 주장하지 않는다는 고지를 반드시 달고 다닌다.
    if (hasMok) parts.push(MOK_CAVEAT);
    const contextHeader = parts.join("\n");
    return {
      chunkId: emitted.length === 1 ? article.sourceId : `${article.sourceId}#${i + 1}`,
      sourceId: article.sourceId,
      lawName: article.lawName,
      authorityType: article.authorityType,
      articleNo: article.articleNo,
      articleSubNo: article.articleSubNo,
      title: article.title,
      text: slice,
      contextHeader,
      validFrom: article.validFrom,
      articleTextHash: article.textHash,
      chunkHash: sha256Hex(slice),
      splitLevel: e.level,
      hasUnattachedMok: hasMok,
      charOffset: e.range,
    } satisfies Chunk;
  });
}

/** 항 마커 기준으로 줄을 묶는다. 첫 항 이전(조문 헤더 등)은 `isHang:false` 묶음이 된다. */
function splitByHang(lines: readonly Line[]): { lines: Line[]; isHang: boolean }[] {
  const blocks: { lines: Line[]; isHang: boolean }[] = [];
  let current: Line[] = [];
  let currentIsHang = false;

  for (const line of lines) {
    if (HANG_RE.test(line.text)) {
      if (current.length > 0) blocks.push({ lines: current, isHang: currentIsHang });
      current = [line];
      currentIsHang = true;
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push({ lines: current, isHang: currentIsHang });
  return blocks;
}

/**
 * 호 마커 기준 2차 분할. 항 헤더 줄은 첫 조각에 붙는다.
 *
 * 목(`[각 목]`) 줄은 호 뒤에 오므로 마지막 조각에 몰린다. 그 조각은 항 헤더를
 * `contextHeader` 로 받으므로 맥락을 잃지 않는다 (파일 헤더의 불변식 3).
 */
function splitByHo(lines: readonly Line[]): Line[][] {
  const groups: Line[][] = [];
  let current: Line[] = [];

  for (const line of lines) {
    if (HO_RE.test(line.text) && current.length > 0) {
      groups.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * 문자 경계 최후 분할. 실측상 조문 1,477개 중 이 경로를 타는 건 소수(줄바꿈 없는 긴 줄)다.
 * 가능하면 공백에서 끊어 단어 중간을 피하되, 공백이 없으면 그냥 자른다 — 자르지 못하는 것보다 낫다.
 */
function splitByChar(
  range: readonly [number, number],
  text: string,
  maxChars: number,
): [number, number][] {
  const pieces: [number, number][] = [];
  let cursor = range[0];
  while (cursor < range[1]) {
    let end = Math.min(cursor + maxChars, range[1]);
    if (end < range[1]) {
      // 뒤에서부터 공백을 찾되, 조각이 절반 미만으로 쪼그라들면 포기하고 그냥 자른다.
      // `end - 1` 부터 찾는 이유: `end` 위치의 공백을 잡으면 `ws + 1` 이 한도를 1 넘긴다.
      const floor = cursor + Math.floor(maxChars / 2);
      const ws = text.lastIndexOf(" ", end - 1);
      if (ws > floor) end = ws + 1;
    }
    pieces.push([cursor, end]);
    cursor = end;
  }
  return pieces;
}

/** 코퍼스 전체를 청크로. 조문 순서를 보존한다. */
export function chunkAll(
  articles: readonly LoadedArticle[],
  maxChars: number = DEFAULT_MAX_CHARS,
): Chunk[] {
  return articles.flatMap((a) => chunkArticle(a, maxChars));
}
