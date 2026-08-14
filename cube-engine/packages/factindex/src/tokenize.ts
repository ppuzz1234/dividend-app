/**
 * 한국어 글자 2-gram 토크나이저.
 *
 * ## 왜 형태소 분석기도 FTS5 도 안 쓰나
 * A1(Artist DB)이 공백 split + SQLite FTS5 기본 토크나이저를 썼다가 겪은 실패:
 * `"강나영은"` 이 색인된 `"강나영"` 과 불일치해 **BM25 절반이 조용히 0점**이었다.
 * 감사에서 발견됐지만 끝까지 고치지 않았고, **평가셋이 조사 없는 이름이라 버그를 가렸다.**
 *
 * 글자 2-gram 은 조사를 원리적으로 흡수한다 — `"강나영은"` 의 bigram 집합이
 * `"강나영"` 의 bigram 집합을 **포함**하기 때문이다. 법령 용어는 복합명사가 길어
 * (`개인종합자산관리계좌`) 2-gram 이 특히 잘 맞는다. 형태소 분석기는 사전 의존성과
 * 신조어 문제를 새로 들여오는데, 이 코퍼스 규모에서는 값을 못 한다.
 *
 * ## ASCII 는 통째로
 * `ISA`·`IRP` 같은 약어는 2-gram 으로 쪼개면(`IS`,`SA`) 오히려 잡음이 된다.
 * 영숫자 연속은 한 토큰으로 유지한다. (약어→법령어 번역은 `expandQuery` 의 일이다.)
 */

/** 한글 음절·한자·가나. 이 범위는 2-gram 으로 쪼갠다. */
const CJK_RE = /[ㄱ-ㆎ가-힣一-鿿぀-ヿ]/;
/** 영숫자. 통째로 한 토큰. */
const ALNUM_RE = /[A-Za-z0-9]/;

/**
 * 문자열 → 토큰 배열 (중복 포함 — BM25 의 term frequency 에 쓰인다).
 *
 * - 한글/한자 연속: 2-gram. 길이 1이면 그 글자 자체.
 * - 영숫자 연속: 소문자화해서 통째로.
 * - 그 밖(구두점·공백·기호): 경계로만 쓰고 버린다.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let run = "";
  let runIsCjk = false;

  const flush = (): void => {
    if (run === "") return;
    if (runIsCjk) {
      if (run.length === 1) tokens.push(run);
      else for (let i = 0; i + 1 < run.length; i++) tokens.push(run.slice(i, i + 2));
    } else {
      tokens.push(run.toLowerCase());
    }
    run = "";
  };

  for (const ch of text) {
    const isCjk = CJK_RE.test(ch);
    const isAlnum = ALNUM_RE.test(ch);
    if (!isCjk && !isAlnum) {
      flush();
      continue;
    }
    if (run !== "" && isCjk !== runIsCjk) flush();
    runIsCjk = isCjk;
    run += ch;
  }
  flush();
  return tokens;
}

/** 중복 제거 토큰 집합. 질의 확장·포함관계 검사에 쓴다. */
export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}
