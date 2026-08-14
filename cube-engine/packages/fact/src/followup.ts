/**
 * 후속 질문 해소 — `"예시를 줘"` 를 **검색 가능한 질문**으로 바꾼다.
 *
 * ## 왜 필요한가
 * 멀티턴에서 사용자는 앞 질문을 다시 쓰지 않는다. `"예시를 줘"` 를 그대로 검색에 넣으면
 * 코퍼스에서 아무 관련 없는 조문이 올라온다 — 그리고 **그 조문으로 답이 생성된다.**
 * 근거가 엉뚱해지는 것이지 답이 없어지는 게 아니라서, 조용히 틀린다.
 *
 * ## 어떻게 푸나 (A1 의 `_rewrite_query` 와 같은 규율)
 * 후속 표현("예시", "더 자세히", "그럼")을 **지우고** 남은 알맹이를 직전 질문에 덧붙인다.
 *   `"ISA 비과세 한도와 서민형 요건"` + `"예시를 줘"`     → 검색어는 앞 질문 그대로
 *   `"ISA 비과세 한도"`             + `"그럼 서민형은?"`   → `"ISA 비과세 한도 서민형"`
 * 즉 **후속어는 버리고 새 내용어만 합친다.** 후속어를 남기면 그게 검색을 오염시킨다.
 *
 * ## LLM 을 안 쓰는 이유
 * 사양 §1.3 재현성 — 같은 대화는 같은 조문을 물어와야 한다. 그리고 여기서 틀리면
 * 사용자는 답이 이상하다는 것만 알고 **왜인지는 모른다**(검색어가 안 보이므로).
 * 그래서 `resolved` 를 응답에 실어 **무엇으로 검색했는지 화면에 드러낸다.**
 *
 * ponytail: 규칙 기반이라 목록 밖 표현("이거 좀 풀어봐")은 후속으로 못 잡고 새 질문으로 간다.
 * 상한은 그때 검색이 헛돈다는 것이고, 업그레이드는 표현을 목록에 추가하는 것이다.
 */

import { normalizeQuery } from "./normalize.js";

/** 그 자체로는 검색어가 될 수 없는, 앞 대화를 가리키는 표현들. */
const FOLLOWUP_MARKERS = [
  "예시", "예를 들", "사례", "케이스",
  "더 자세", "자세히", "구체적으로", "더 알려", "더 설명", "풀어서", "풀어봐", "쉽게", "간단히", "요약",
  "그럼", "그러면", "그건", "그거", "그것", "이건", "이거", "저거", "위에서", "방금", "아까", "앞에서",
  "다시", "정리해", "표로", "왜", "어떤 뜻", "무슨 뜻", "차이", "비교", "말고",
  // 구어체·말버릇. 사용자는 다듬어 말하지 않는다 — 목록이 그걸 따라가야 한다.
  // ⚠️ **혼자서 주제가 될 수 있는 낱말은 넣지 않는다.** `그리고`·`더`·`또`·`좀` 은
  //    새 질문에도 흔해서("ISA 랑 연금저축 그리고 IRP 차이") 앞 질문을 끌어와 검색을 오염시킨다.
  //    후속어는 **그 자체로는 검색어가 될 수 없는 것**만 자격이 있다.
  "글면", "글고", "근데", "그런데", "암튼", "아무튼", "그건 그렇고",
  "하나 더", "추가로", "반대로", "그 반대",
] as const;

/**
 * **어느 제도·법령 이야기인지**를 새로 지정하는 말들.
 *
 * 이게 있으면 "무엇에 대한 질문인가"가 이미 정해진 것이므로 앞 질문을 끌어올 이유가 없다.
 * 반대로 `한도`·`중도해지` 같은 **행위·개념**은 넣지 않는다 — 그건 "어느 계좌의 중도해지냐"가
 * 여전히 앞 맥락에 달려 있기 때문이다. 여기 담는 것은 **주어**이지 술어가 아니다.
 */
const TOPIC_ANCHORS = [
  "ISA", "IRP", "DC형", "DB형", "일반계좌",
  "연금저축", "연금계좌", "퇴직연금", "국민연금",
  "개인종합자산관리계좌", "개인형퇴직연금", "확정기여", "확정급여",
  "소득세법", "조세특례제한법", "근로자퇴직급여",
] as const;

/** 후속어를 지우고 남은 알맹이에서 걸러낼 조각들 (조사·군더더기). */
const FILLER_RE = /(?:을|를|은|는|이|가|도|만|좀|해|해줘|해 줘|줘|주세요|알려줘|알려 줘|말해줘|보여줘|해봐|해 봐|입니까|인가요|인가|나요|어요|요|\?|！|!|\.|,)+$/;

export interface FollowUpResult {
  /** 후속 질문으로 판정했는가 */
  readonly isFollowUp: boolean;
  /** 검색에 쓸 질문. 후속이면 직전 질문 + 새 내용어 */
  readonly searchQuery: string;
  /** 어떤 표현 때문에 후속으로 봤는가 — 화면에 드러내 사용자가 오판을 알아채게 한다 */
  readonly matched: readonly string[];
}

/** 후속어를 걷어낸 뒤 남은 '새 내용어'. 없으면 빈 문자열. */
function residual(query: string, matched: readonly string[]): string {
  let s = query;
  for (const m of matched) s = s.split(m).join(" ");
  return s
    .split(/\s+/)
    .map((w) => w.replace(FILLER_RE, "").trim())
    // 1글자는 조사 잔해일 가능성이 높아 버린다. 제도명은 최소 2글자다(ISA·IRP·주택).
    .filter((w) => w.length >= 2)
    .join(" ")
    .trim();
}

/**
 * @param query           이번에 사용자가 친 질문
 * @param previousQuery   직전 **검색에 쓴** 질문 (없으면 null → 무조건 새 질문)
 */

export function resolveFollowUp(query: string, previousQuery: string | null): FollowUpResult {
  const q = normalizeQuery(query);
  if (previousQuery === null || previousQuery.trim() === "") {
    return { isFollowUp: false, searchQuery: q, matched: [] };
  }

  const matched = FOLLOWUP_MARKERS.filter((m) => q.includes(m));

  // 후속어가 없어도 **너무 짧으면** 단독 검색어로 쓸 수 없다 ("서민형은?" 처럼).
  // 그런 경우도 앞 질문에 붙여야 검색이 산다.
  const tooShortToStandAlone = q.replace(/\s/g, "").length <= 8;

  // ★ **주제를 새로 말했으면 새 질문이다.** 후속어가 섞여 있어도 그렇다.
  //   `"ISA랑 연금저축 그리고 IRP 차이가 뭔가요"` 는 `차이` 때문에 후속으로 잡혔었는데(실측),
  //   그러면 앞 질문이 딸려와 검색이 망가진다. 반대로 `"글면 IRP는?"` 은 제도명이 있어도
  //   **짧아서** 단독 검색이 안 되므로 이어받는 게 맞다 — 그래서 길이 조건을 함께 본다.
  if (!tooShortToStandAlone && TOPIC_ANCHORS.some((t) => q.includes(t))) {
    return { isFollowUp: false, searchQuery: q, matched: [] };
  }

  if (matched.length === 0 && !tooShortToStandAlone) {
    return { isFollowUp: false, searchQuery: q, matched: [] };
  }

  const extra = matched.length === 0 ? q.trim() : residual(q, matched);
  const searchQuery = extra === "" ? previousQuery.trim() : `${previousQuery.trim()} ${extra}`;
  return {
    isFollowUp: true,
    searchQuery,
    matched: matched.length > 0 ? matched : ["(질문이 짧아 단독으로 검색할 수 없음)"],
  };
}
