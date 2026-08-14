/**
 * 정책 코퍼스 원문 스냅샷 타입 — 사양 §12 수집 원칙 + §5.1 authority/temporal 축.
 *
 * 이 타입이 기록하는 것은 **"원문이 무엇이었는가"** 뿐이다.
 * 원문에서 세율·한도를 뽑아낸 결과(정책 팩의 `effect.value`)는 별개의 산출물이며
 * 사람 승인(`review.approved`)을 거쳐야 한다 — 절대 규칙 0·1.
 * 즉 여기 있는 데이터는 아무리 많아도 그 자체로는 계산에 쓸 수 없다.
 */

/**
 * 사양 §5.1 `authority.type`.
 * 국가법령정보 API 의 `법령구분명`(법률/대통령령/…)을 여기로 사상한다.
 * 충돌 해소 서열(법률 → 시행령 → 시행규칙 → 행정안내 → 금융회사 정책)의 근거값이므로
 * 모르는 구분명을 임의로 밀어넣지 않고 거절한다.
 */
export type AuthorityType =
  | "STATUTE"
  | "DECREE"
  | "RULE"
  | "ADMIN_GUIDANCE"
  | "PROVIDER_POLICY";

/** 사양 §5.1 `lifecycle.status`. */
export type LifecycleStatus = "PROPOSED" | "ENACTED" | "REPEALED";

/**
 * 조문 1개 = 정책 팩이 `sources[].source_id` 로 인용하는 최소 단위.
 * 사양 §5.1 이 "PRIMARY source 없이 effect 기재 불가"라고 못박았으므로,
 * 정책 팩을 쓰려면 먼저 여기에 해당 조문이 있어야 한다.
 */
export interface ArticleSnapshot {
  /** 정책 팩의 `sources[].source_id` 가 가리키는 값. ASCII 만 (사양 §5.2.1 네이밍 계약). */
  readonly sourceId: string;
  /** 조문번호. "91" (제91조) */
  readonly articleNo: string;
  /** 조문가지번호. "18" (제91조의18). 가지가 없으면 null */
  readonly articleSubNo: string | null;
  /** 조문제목. "개인종합자산관리계좌에 대한 과세특례" */
  readonly title: string | null;
  /**
   * 조문 원문 전문. 항·호·목을 문서 순서대로 줄바꿈으로 이어붙인다.
   * **요약·생략 금지** — 사람이 원문 대조(사양 §12)를 할 수 있어야 하고,
   * 요약 과정에서 조건절이 날아가면 grounding 이 무너진다.
   */
  readonly text: string;
  /**
   * 사양 §5.1 `temporal.valid_from`. `조문시행일자` 를 쓴다.
   * 법령 단위 시행일자가 아니라 **조문 단위** 시행일자다 — 같은 법 안에서도
   * 조문마다 시행일이 다를 수 있어서, 법령 단위로 뭉치면 조회일 기준 유효 규칙 계산(§5.1)이 틀린다.
   */
  readonly validFrom: string;
  /** `text` 의 SHA-256 (@cube/numeric `sha256Hex`). 원문 대조·위변조 검출용. */
  readonly textHash: string;
}

/** 법령 1개분 스냅샷. 파일 1개 = 이 구조 1개. */
export interface SourceSnapshot {
  /** 법령명한글. "조세특례제한법" */
  readonly lawName: string;
  /** 법령ID. 법 자체의 불변 식별자 (개정돼도 유지) */
  readonly lawId: string;
  /**
   * 법령일련번호. **개정마다 바뀐다** — 즉 이 값이 곧 "판(version)"이다.
   * `mst` + `articleNo` 가 재조회 좌표이므로, 이 스냅샷은 나중에 바이트 동일하게 재현 가능하다.
   */
  readonly mst: string;
  readonly authorityType: AuthorityType;
  readonly lifecycleStatus: LifecycleStatus;
  /** 공포일자 YYYY-MM-DD (사양 §5.1 `temporal.promulgated_at`) */
  readonly promulgatedAt: string;
  /** 법령 단위 시행일자 YYYY-MM-DD. 조문별 시행일은 `articles[].validFrom` 을 보라. */
  readonly enforcedAt: string;
  /** 수집 시각 ISO8601 (사양 §5.1 `temporal.recorded_at`) */
  readonly collectedAt: string;
  /** 재조회용 원본 URL */
  readonly sourceUrl: string;
  readonly articles: readonly ArticleSnapshot[];
}

/** 수집 대상 1건 — `targets.json` 의 원소. */
export interface CollectTarget {
  /** 검색·정확일치에 쓰는 법령명한글 */
  readonly lawName: string;
  /** `source_id` 접두사. ASCII 만 (사양 §5.2.1) */
  readonly abbrev: string;
  /** 사양 §12 체크리스트의 어느 항목 때문에 이 법이 필요한가 */
  readonly why: string;
}
