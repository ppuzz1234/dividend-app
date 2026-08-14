/**
 * 질의 입력 정리 — **사용자는 다듬어 치지 않는다.**
 *
 * `"ISA   한도???"` · `"연금저축~~ ㅋㅋ"` · 붙여넣기로 딸려온 보이지 않는 문자.
 * 검색·후속판정 **전에** 한 번만 돌린다.
 *
 * ## 무엇을 안 하나
 * **의미는 건드리지 않는다.** 오타 교정·동의어 치환은 여기서 하지 않는다 —
 * 그건 `expandQuery` 의 승인된 별칭 사전이 할 일이고(§1.3 재현성), 여기서 몰래 하면
 * "왜 다른 조문이 나왔지"를 추적할 수 없게 된다. 여기서 지우는 것은 **잡음뿐**이다.
 */

/** 붙여넣기로 딸려오는 폭 없는 문자들 (ZWSP·ZWNJ·BOM). */
const INVISIBLE = /[​‌‍﻿]/g;
/** 같은 문장부호 반복: `한도???` → `한도?` */
const REPEATED_PUNCT = /([?!~.])\1+/g;
/** 웃음·울음 자모. 검색 토큰으로는 잡음이다. */
const LAUGHTER = /[ㅋㅎㅠㅜ]{2,}/g;

export function normalizeQuery(raw: string): string {
  return raw
    .replace(INVISIBLE, "")
    .replace(REPEATED_PUNCT, "$1")
    .replace(LAUGHTER, " ")
    .replace(/\s+/g, " ")
    .trim();
}
