# BUILD PLAN — CUBE 미션 1 (팩트 엔진) · Phase 1 ~ End

> **빌드 순서·완료판정(DoD)의 단일 기준.** 사양=[CUBE_설계계약통합본_v1.4.md](../CUBE_설계계약통합본_v1.4.md) · 지침=[CLAUDE.md](../CLAUDE.md) · 날짜별=[진행기록.md](진행기록.md) · 발표 서사=[만든-과정-스토리.md](만든-과정-스토리.md).
> **Phase = 미션 1 내부 진행 단위이고, 사양 §13 순서 번호는 당기지 않는다** ([CLAUDE.md](../CLAUDE.md) "번호를 당기지 마라"). 각 Phase 에 §13 매핑을 명시했다. `7F` = "순서 7 의 FACT 절반".
> 갱신: 2026-07-31. 범례: ✅됨(검증) · 🟡코드됨(검증 필요) · 🔴남음 · ⚪범위제외 · ⏸블로킹
>
> ⚠️ **Phase 1~8 은 완료됐다.** 아래 각 Phase 절은 **착수 전에 쓴 설계 문서**이고 그 안의 수치는
> 당시 예측이다. **실제 결과·수정 이력은 [PROGRESS-TRACK-ABC.md](PROGRESS-TRACK-ABC.md) 가 갖는다.**
> 설계 의도(왜 그렇게 했나)는 여기, 실측치(무엇이 나왔나)는 저기.

---

## 0. 최종 결과물 (미션 1)

사용자가 자연어로 절세 3종 계좌를 물으면 **근거 조문·규칙 ID·정책 버전이 붙은 팩트**를 답하고, **근거가 없으면 없다고 말한다.**

핵심 능력 4가지:
1. **조문 원문에 앵커된 답** — 법령명·조문번호·시행일·원문 해시가 응답에 실린다.
2. **2클래스 분리**(사양 §1.2) — 승인 규칙이 있으면 `REGISTRY_RESOLVED_FACT`(개인 적용 가능), 원문만 있으면 `UNMODELED_OFFICIAL_SOURCE`(개인 적용·PLAN 입력 **금지**).
3. **모르면 모른다** — 코퍼스에도 없으면 §4.2 거절.
4. **재현 가능** — 같은 질의·같은 스냅샷·같은 색인 → 같은 `answerPayloadHash`.

> 🔒 **불변 계약:** ① **RAG 는 팩트를 결정하지 않는다**(§1.1) — Registry 조회가 검색보다 **코드상 먼저** ② 세법 값 하드코딩 금지 ③ 계산·판정 경로 LLM 금지 ④ `review.approved==false` 는 배포 제외 ⑤ `SYNTHETIC_DEMO` 결과에 스탬프 강제.

📌 과장님 요구: *"관련법과 정부에서 제공하는 official 정보를 토대로 완전신뢰 가능한(검증이 필요없는) 팩트"*. **현재 "관련법"만 확보** — "정부 official 정보"(국세청·금감원)는 Phase 3.

---

## 현재 상태

| 순서 | 산출물 | 상태 |
|---|---|---|
| 0 | 과장님 방향 승인 (사람) | ⏸ 미통과 — 안건 7종 중 미션 1 을 막는 것 없음 |
| 1·2·3 | numeric / policy / engine | ✅ |
| **4** | **정책 코퍼스 원문 수집** | **✅ 법령 6종 + 행정규칙 4종 = 2,137조문 (Phase 3 포함)** |
| 5·6·6.5 | Tax Calculator / Optimizer / MyData | 🔴 (미션 2) |
| **7F** | **AI 층 FACT 절반** | **🟡 Phase 1~8 ✅ (검색·색인·policy) · Phase 9~End 🔴 (답변·승인·UI)** |
| 7P | AI 층 PLAN 절반 | 🔴 순서 5·6 필요 |
| 8 | 데모 패키지 | 🔴 Phase 11·End 가 FACT 절반 담당 |

---

## 실측 근거 (설계를 바꾼 숫자들)

> 전부 `packages/corpus/snapshots/*.json` 을 직접 읽어 측정. **추측으로 정한 설계는 없다.**

| # | 측정 | 결과 | 설계에 미친 영향 |
|---|---|---|---|
| M1 | 조문 길이 | 평균 1,037 · p50 559 · p90 2,643 · p99 6,641 · 최대 14,667자 | 21.8%가 1,500자 초과 → 분할 필요 |
| M2 | **「삭제」 스텁** | **372건 (20.1%)**. `title===null` 집합과 **정확히 일치**(교집합 372, 차집합 0) | **색인 제외.** 짧아서 BM25 길이 정규화가 오히려 상위로 밀어올린다. 실질 조문 **1,477** |
| M3 | 3단 분할(항→호→문자) T=1500 | 청크 **2,361** (ARTICLE·HANG 2,125 / HO 184 / CHAR 52), 한도 초과 0 | **T=1500 채택.** 90%가 조문·항 원형 유지 |
| M4 | 항만으로 분할 불가 | 단일 항이 한도 초과 95건, 그중 **줄바꿈 없는 단일 줄 3건** | 문자 폴백 필수 |
| M5 | `[각 목]` 표식 | 293 조문(15.8%) · 총 1,866회. **ISA 12 · `INCTAX_129` 20 · `INCTAX_D_40_2` 11** | 3대 조문 전부에서 caveat 상시 발화. 청킹이 표식을 항에서 떼면 오독 부활 |
| M6 | 상호참조 | 명시 `「법령명」제N조` → 코퍼스 내 **688/689 해소 = 99.9%** / bare `제N조` 추정 → **16% 오류** | 명시 인용만 그래프화, bare 기각 (80.3% 기각과 같은 논리) |
| M7 | `validFrom` | 서로 다른 값 **3개뿐**, 미래 시행 조문 **0건** | ⚠️ **시점 필터가 실코퍼스에서 0건을 거른다** → fixture 로만 검증 가능 |
| M8 | **사용자 어휘 부재** | **`ISA` 0건 · `IRP` 0건 · `서민형` 0건 · `세액공제율` 0건 · `일임형/신탁형` 0건** | ★ **어휘 브리지를 독립 Phase 로 신설**(Phase 4). 2-gram 으로도 못 고친다 — 문자열 자체가 없다 |
| M9 | 임베딩 규모 | 2,361 청크 · 1,909,745자 · 배치32 기준 **API 74콜/색인** | 무료 티어 안 (토큰 실측은 Phase 2) |

**M8 이 가장 중요하다.** 이전 계획의 손 질의 4개 중 3개(`"ISA 비과세 한도"`·`"IRP 중도인출 사유"`·`"연금 세액공제율"`)가 **코퍼스에 0-hit 인 용어**를 포함한다. 그리고 `"서민형" 0건`은 §12 1순위 파라미터의 실무 질의를 조문만으로 답할 수 없다는 증거다 → Phase 3(ADMIN_GUIDANCE)의 필요성이 수치로 확인됐다.

---

## 쓸 수 있는 API (실측) · 안티패턴

```ts
// @cube/policy
loadPolicyPack(raw: unknown): LoadedPolicyPack               // ※ 입력은 객체. YAML 파싱은 호출자 책임
createRegistry(pack: LoadedPolicyPack): PolicyRegistry
validateFactAnswerManifest(raw: unknown): FactAnswerManifest // ※ 동기·단일인자
assertLocalDate / compareLocalDate / authorityRank
PolicyContractError / UnverifiedPolicyError / reject()
SYNTHETIC_STAMP_TEXT                                          // ※ 문구 직접 타이핑 금지
// PolicyRegistry: describeRule(id) / listEffectiveRuleIds(date) / resolveEffect(id,date) / stamp()
// @cube/numeric
sha256Hex(canonical: string): string    // ※ 문자열 1개만
canonicalHash(value: unknown): string   // ※ FactAnswerManifest 는 전 key ASCII 라 안전
```

- ❌ `PolicyRule` import — index 에 export 안 됨(effect 값 유출 차단). 값은 `resolveEffect` 로만.
- ❌ `LoadedPolicyPack` 손으로 조립 후 `createRegistry` — 내부 WeakMap 조회 실패로 `SCHEMA_VIOLATION`.
- ❌ `ResultStamp` 리터럴 생성 — `unique symbol` brand. `registry.stamp()` 로만.
- ❌ `describeRule()` 로 PRIMARY 필터 — **role 이 밖으로 안 나온다** → Phase 8-1 에서 해결.
- ❌ `node:test` 의 `describe`/`it` — 레포는 `test` 만. assert 는 `import assert from "node:assert/strict"`.
- ❌ 상대 import 확장자 생략(`.js` 필수) · 배열 인덱싱 무방비(`noUncheckedIndexedAccess`).
- ❌ 새 `PolicyErrorCode` 를 매트릭스 갱신 없이 추가 — [ORDER2-REJECTION-MATRIX](ORDER2-REJECTION-MATRIX.md) 동시 갱신이 규약.

### 확정된 결정 ✅ (2026-07-31)

- **D1 임베딩** = Gemini `gemini-embedding-001` / 3072d. A1-v2 키 재사용(`LLM_API_KEY`·`EMBED_MODEL`·`EMBED_DIM`). ⚠️ **quota 공유** — 대량 색인 중 A1-v2 테스트 금지.
- **D2 벡터** = 메모리 brute-force 코사인. `// ponytail(factindex/검색): 수만 청크가 되면 ANN` 마커.
- **D3 이음매** = 정책 팩 `source_id` **==** 코퍼스 `ArticleSnapshot.sourceId`, `sourceHashes[i]` = 그 조문 `textHash`.

---

# ── Track A. 검색 (Phase 1·2·4·5·6·7) ──

## Phase 1 — 청킹 ✅ (§13: 7F-A 전반 + 순서 4 연장)

> 목표: 1,849 조문을 **인용 가능성을 잃지 않는** 2,361 청크로. **네트워크·API 키 없이 전부 돈다.**
> 신규 패키지 `packages/factindex/` (deps: `@cube/corpus`·`@cube/numeric`, 외부 의존 0). 크기: 중간.
> 왜 먼저: 청킹 규칙이 흔들리면 임베딩 74콜 × N 이 낭비되고 그건 A1-v2 와 공유하는 quota 다.

- **1-1 🔴 삭제 스텁 필터** — `title===null` **AND** `/^제\S+\s*삭제\s*<[^>]*>$/` **이중 술어**로 372건 제외. 둘이 어긋나면 실패. *유일한 textHash 중복(`INCTAX_D_103`·`TAXEX_103` = "제103조 삭제")도 여기서 사라진다.*
- **1-2 🔴 3단 분할기** (`src/chunk.ts`) — 항 → 호 → 문자, T 를 인자로. 청크에 `splitLevel`("ARTICLE"|"HANG"|"HO"|"CHAR")·`hasUnattachedMok`·`charOffset` 기록.
- **1-3 🔴 인용 그래프** (`src/citations.ts`) — **명시 `「법령명」제N조` 만.** bare `제N조` 확장 기각(M6: 16% 오류). 커버리지 308/1,849=16.7% 지만 그 안에 법↔시행령 위임 관계가 들어 있다.
- **1-4 🔴 `ragIndexVersion`** (`src/indexVersion.ts`) — `canonicalHash({model, dim, chunkRule, corpusHash})`.

**Phase 1 DoD** (`test/chunk.test.ts`·`deleted.test.ts`·`citations.test.ts`):
① **재조립 동일성** — 같은 `sourceId` 청크를 이어붙이면 원문과 한 글자도 다르지 않다 ② **조문 경계 불침범** — 청크 하나가 정확히 1개 `sourceId` ③ 한도 준수(초과 0) ④ **수치 고정** 청크 2,361 / 분포 2,125·184·52 — 바뀌면 빨개진다 ⑤ 삭제 스텁 372 고정 ⑥ 인용 dangling 정확히 1건(`TAXEX_91_28`) ⑦ **`[각 목]` 불변식** — 표식 줄은 소속 항의 첫 줄과 **같은 청크 안**. *떨어지면 `parse.ts` 가 막으려던 400↔200만원 오독이 청킹에서 부활한다.*

> **안티패턴:** 삭제 스텁 "짧으니 괜찮겠지" 색인 / 문자 폴백을 기본 전략으로 / `[각 목]` 표식을 "깨끗하게" 지우기 / bare 인용 확장.

## Phase 2 — 임베딩 색인 ✅ (§13: 7F-A 후반)

> 목표: 2,361 청크 → 3072d 단위벡터. **첫 API 접촉** — 토큰 한도·quota 미지수를 여기서 해소한다. 크기: 중간.
> 복사원: `A1-v2/app/embedding/encoder.py:19,33-53`(배치32·task_type·L2·n/total) + **`A1-v2/app/llm/client.py:64-77`(backoff)**.

- **2-1 🔴 토큰 실측** (`scripts/measure-tokens.ts`) — 최장 청크(1,500자)의 실제 토큰 수와 모델 입력 한도를 **API 로** 확인. 문서상 한도를 인용하지 않는다(확인 안 한 값). 헤더에 가설·측정대상·판정기준·결과 — `scripts/measure-mok.ts` 와 같은 규약.
- **2-2 🔴 임베딩 + L2** — 배치 32, `task_type` 문서/질의 분리(비대칭 = recall↑), `_l2()` 의 `or 1.0` zero-vector 방어 포함.
- **2-3 🔴 backoff 이식** — 2s·4s·8s, `429`/`RESOURCE_EXHAUSTED` 는 재시도 없이 즉시 raise. ⚠️ **A1-v2 임베딩 경로엔 backoff 가 없다**(300건이라 안 터졌을 뿐).
- **2-4 🔴 진행 표시 + resume** — `[n/total]` + 단계 로그(단건 질의엔 안 찍음). 중단 시 이미 임베딩된 chunkId 스킵.

**Phase 2 DoD:** ① `measure:tokens` 가 "1,500자 청크가 한도 안"을 단언 ② `manifest.json` 의 `chunkIds.length===2361`, `vectors.bin` = `2361*3072*4`B ③ **전 벡터 L2 노름 `|1-‖v‖|<1e-5`** ④ 재실행 시 동일 `ragIndexVersion` ⑤ 스크립트 헤더에 API 콜 수·총 토큰 실측 기록.

> **안티패턴:** L2 정규화 생략(`EMBED_DIM` 바뀌면 **조용히** 순위 붕괴) / 문서·질의 같은 `task_type` / backoff 없이 74콜 루프 / 단건 질의에도 진행 표시.

## Phase 4 — 어휘 브리지 + BM25 + 시점 필터 ✅ ★신설 (§13: 7F-B-1·B-4)

> 목표: **사용자 어휘를 법령 어휘로 번역**하고, 어휘 검색이 조사·복합명사에 무너지지 않게. 크기: 중간.
> 왜 이 Phase 가 생겼나: **M8** — `ISA`·`IRP`·`서민형` 이 코퍼스에 **0건**. 2-gram 을 넣어도 문자열이 없으면 BM25 는 원리적으로 0점이다. **브리지가 BM25 보다 먼저 확정돼야** BM25 성능 측정이 의미를 갖는다.

- **4-1 🔴 글자 2-gram 토크나이저** — ⚠️ **A1 최대 실패 반복 금지.** A1 은 공백 split + FTS5 기본 토크나이저라 `"강나영은"` ≠ `"강나영"` 으로 **BM25 절반이 조용히 0점**이었고 끝까지 안 고쳤다. **평가셋이 조사 없는 이름이라 버그를 가렸다.**
- **4-2 🔴 BM25** (`src/bm25.ts`) — 역색인 직접 구현. SQLite/FTS5 안 쓴다(의존성 0 + 토크나이저 통제).
- **4-3 🔴 `vocab/aliases.json`** ★사람 승인 데이터 — 각 항목에 `term`·`expandsTo`·**`corpusHits`(실측)**·`approved`·`reviewer`·`reviewedAt`. `approved:false` 는 확장에 안 쓴다(정책 팩과 같은 규율). 예: `ISA→개인종합자산관리계좌(8)`, `IRP→개인형퇴직연금(29)`, `연금저축→연금계좌(37)`, `서민형→[] (0, approved:false, note:"조문에 대응어 없음 → Phase 3 또는 UNMODELED")`.
- **4-4 🔴 결정론적 확장** (`src/expandQuery.ts`) — **LLM 금지.** 같은 질의가 매번 다른 후보를 부르면 `answerPayloadHash` 재현성(§1.3)이 깨진다.
- **4-5 🔴 시점 필터** (`src/temporal.ts`) — ⚠️ **M7: 실코퍼스에서 0건을 거른다.** **미래 `validFrom` 합성 fixture 로만 검증**하고, 이 vacuity 를 테스트 헤더에 명시. *실데이터로 재면 항상 통과하는 공허한 테스트가 된다 — A1 이 버그를 가린 그 구조.*

**Phase 4 DoD:** ① 조사 붙은 질의 매칭 — `"개인종합자산관리계좌는"` 의 2-gram 이 `"개인종합자산관리계좌"` 를 포함 ② `aliases.json` 의 모든 `expandsTo` 가 코퍼스에 실재하고 `corpusHits` 가 실측과 일치(틀리면 실패) ③ 시점 필터를 fixture 로 검증 + vacuity 명시 ④ **브리지 on/off 대조** — `"ISA 비과세 한도"` → on 이면 `TAXEX_91_18` top-10, **off 면 못 찾는 것도 함께 단언**.

> **사람 게이트:** `aliases.json` 승인. "ISA=개인종합자산관리계좌"는 명백해 보이지만 **질의를 어느 조문으로 번역할지의 결정**이고 틀리면 엉뚱한 조문이 근거가 된다.

## Phase 5 — 하이브리드 융합 ✅ ★첫 데모 (§13: 7F-B-2·B-3·B-5)

> 목표: 어휘+의미를 합쳐 **CLI 로 질문하면 조문이 나오는** 첫 동작물. 크기: 작음~중간.
> 복사원: `A1-v2/app/retrieval/search.py:69-102`.

- **5-1 🔴 벡터 검색** — 메모리 brute-force 코사인(단위벡터라 내적=코사인).
- **5-2 🔴 융합** — 후보 집합 내부 min-max 후 가중합. **부호 반전 2곳**(BM25 음수일수록 좋음 / 벡터 distance 작을수록 좋음), 한쪽 전용 후보는 0.0, `hi==lo`면 전부 1.0(후보 1개 division-by-zero 방어).
- **5-3 🔴 CLI** (`scripts/ask.ts`) — `node dist/scripts/ask.js "IRP 중도인출 사유"`.
- **5-4 🔴 육안 확인** — rerank **없이** 질의를 던지고 top-10 을 `docs/RETRIEVAL-NOTES.md` 에 **원문 그대로 붙여넣는다.** *없을 때 얼마나 나쁜지를 봐야 Phase 7 을 왜 넣는지 안다.*

**Phase 5 DoD:** ① 융합 수학 단위 테스트(후보 1개·한쪽 전용·부호 반전) ② §12 지명 조문 11개에 대해 제목을 질의로 넣으면 자기 자신이 top-10 ③ `RETIRE-NOTES.md` 에 top-10 원문 기록.

> **안티패턴:** 0.5/0.5 를 "검증된 값"이라 부르기(**한 번도 스윕된 적 없다**) / **여기서 가중치 튜닝**(평가셋 없는 튜닝은 4개 질의 overfit) / ANN 도입 / 육안 확인을 "잘 나오는 것 같다"로 기록.

## Phase 6 — 평가셋 + CI 게이트 ✅ ★순서 앞당김 (§13: 7F-E-1·E-2)

> 목표: **"좋아졌다"를 주장할 수 있는 자**를 먼저 만든다. 크기: 중간.
> **왜 rerank 앞으로 당기나:** 이전 계획의 7F-C-3 DoD 가 *"C 켠 것과 끈 것을 같은 질의 세트로 비교"* 인데 **그 질의 세트가 7F-E 에 있었다.** 순서가 뒤집혀 있었다. 그리고 A1 의 실패 구조 자체가 "평가셋을 나중에, 쉬운 형태로 만들어 버그를 가린 것"이다.

- **6-1 🔴 4버킷 평가셋** (`eval/queries.json`, `authority: "ORACLE"`) — **exact**(조문번호 직접) · **semantic**(자연어 개념) · **형태소**(조사 붙은 질의) · ★**out-of-corpus**(`"ISA 서민형 판정 시 총급여 기준 시점"`·`"노란우산공제 한도"` — 상위 결과가 없거나 무관해야 정상). 각 ≥8문항, out-of-corpus ≥5, 총 ≥30.
- **6-2 🔴 정답은 손으로 쓴다** — 검색 결과를 복사해 정답으로 만들지 않는다. *"그 순간 버그가 사양으로 승격된다"*(CLAUDE.md 정답지 규약).
- **6-3 🔴 CI 게이트** (`scripts/check-retrieval.ts`) — 버킷별 hit@1/hit@5 + **실패 케이스 질의 원문과 실제 top-3 출력** + exit code. 헤더에 API 콜 수 명시.
- **6-4 🔴 가중치 3점 스윕(선택)** — 0.3/0.7·0.5/0.5·0.7/0.3. 최선 채택하되 **"3점 스윕이지 최적화가 아니다"** 라고 적는다.

**Phase 6 DoD:** `docs/RETRIEVAL-EVAL.md` 에 **버킷별로 따로** 수치 기록. *전체 평균 하나만 적는 건 A1 이 한 실수다.*

> **안티패턴:** exact 버킷만으로 hit@1 100% 얻고 만족(**A1 이 정확히 그랬다**) / out-of-corpus 버킷을 "정답 없어 못 잰다"고 빼기(미션 1 의 절반이 "모르면 모른다"인데 그 능력이 측정 안 된다) / 평가셋을 검색 결과에 맞춰 수정.
> **사람 게이트:** 정답 sourceId 확정 + ORACLE 서명.

## Phase 7 — LLM rerank + ablation ✅ (§13: 7F-C)

> 목표: 재정렬로 정밀도를 올리고 **올랐다는 것을 수치로 증명.** 크기: 작음.
> 복사원: `A1-v2/app/retrieval/reranker.py:17-49`.

- **7-1 🔴 배치 1콜 채점** — 후보 전체를 한 번에 0~1 채점(후보당 1콜 아님), 인덱스 번호 참조, 원문 앞 300자 cap + 개행 제거.
- **7-2 🔴 graceful degrade** — 파싱 실패 → fused 순서 유지. 부분 실패 → `smap.get(i, fused[i])` 로 메움(**둘 다 0~1 스케일이라 순위가 안 깨진다**). 마크다운 펜스 `/\{.*\}/s` + clamp + 필드 누락 스킵.
- **7-3 🔴 ablation** — 버킷별 `hit@1 (off) → hit@1 (on)` 을 `docs/RETRIEVAL-EVAL.md` 에 표로. **개선이 없거나 음수면 rerank 를 넣지 않기로 결정하고 그 사실을 기록한다** — 이것도 유효한 결과다. *A1/A1-v2 는 이 측정을 한 번도 하지 않았다.*

**Phase 7 DoD:** 스텁 주입 테스트(전체 실패→fused 완전 동일 / 부분 채점→나머지 fused / 범위 밖 점수 clamp / 펜스 파싱) + ablation 표.

> ⚠️ **rerank 점수를 임계값으로 쓰지 마라.** A1 감사: bge sigmoid 가 무관 질의에도 ~0.50 → score gate 가 **13건 중 0건 발화 = dead**. **순위에만** 쓰고, 거부는 Phase 9 의 Registry·코퍼스 유무로 판정한다.

---

# ── Track B. Registry (Phase 8) · Track C. 데이터 (Phase 3) ──

> 두 트랙은 Track A 와 **동시 착수 가능**하다. Phase 9 만 셋 다를 기다린다.

## Phase 3 — 코퍼스 II: 행정규칙 + ADMIN_GUIDANCE ✅ 【병렬】 (§13: 순서 4 잔여)

> 목표: **"정부 official 정보"** 를 붙여 과장님 요구의 나머지 절반을 채운다. 크기: 중간~큼.
> 근거: **M8** — `서민형` 0건. 「ISA 서민형 판정 시 총급여 기준 시점」은 조문만으론 **답이 불가능**하다. 이게 없으면 미션 1 은 "법전 검색기"이지 팩트 엔진이 아니다.

- **3-a 🔴 (쉬움·자동) 퇴직연금감독규정** — 같은 법제처 API 의 `target=admrul`. `lawApi.ts` 재사용. §12 "IRP 편입 제한(개별주 불가·위험자산 비중)"의 **유일한 근거**. `authorityType: RULE`.
- **3-b 🔴 (어려움·반자동) 국세청 예규·안내** — `txsi.hometax.go.kr` 는 API 범위 밖. **자동 스크래핑을 지어내지 말고**, 수기 확보 + 출처 URL·수집시각·해시를 사람이 기입하는 ingest 경로. `authorityType: ADMIN_GUIDANCE`.
- **3-c ⚪ 금감원 통합연금포털** — 3-b 와 같은 경로, 우선순위 낮음. `$pending` 유지 + 공백 명시.
- **3-d 🔴 `docs/CORPUS-COVERAGE.md`** — 확보/미확보/왜 미확보 표. 사양 §0-A.7("비포함을 조용히 빼지 마라")의 코퍼스 적용.

**Phase 3 DoD:** ① `PENSUP.json` 커밋 ② 새 스냅샷도 기존 형식 불변식 통과(coverage.test.ts 확장) ③ `authorityType` 정확 태깅 — *틀리면 사양 §5.1 서열에서 상위법이 하위 안내에 밀린다* ④ `"서민형"` 또는 준하는 판정 기준 문구가 새 스냅샷에 있는지 **측정하고 수치를 기록**(없으면 없다고).

> **합류 시점:** **Phase 4 시작 전.** 평가셋(Phase 6) 이후 코퍼스가 커지면 정답 sourceId 재확정 + `ragIndexVersion` 변경으로 이전 수치가 무효가 된다. 늦어지면 Phase 9 이후 재색인 + 평가셋 갱신으로 붙인다(비용: 재측정 1회).
> **사람 게이트 2건:** ① 어느 국세청 자료를 official 로 인정할 것인가(예규·질의회신·안내·보도자료는 권위가 다르다) ② 스크래핑 가부(이용약관).
> **리스크 완화:** 3-a 만 필수 경로. 3-b 는 "N건이라도"로 하한. 0건이어도 진행 가능하며 그때 못 답하는 질의를 `CORPUS-COVERAGE.md` 가 정직하게 말한다.

## Phase 8 — `@cube/policy` 구멍 메우기 ✅ 【병렬, Phase 1 과 동시 착수 가능】 (§13: 순서 2 확장)

> 목표: FACT 응답이 **PRIMARY 출처만 인용**할 수 있게 하고, **스탬프가 앉을 자리**를 만든다. 크기: 작음~중간.
> Phase 9 의 **전제**. 먼저 끝내두면 Resolver 가 막히지 않는다.

- **8-1 🔴 `role` 노출** — `registry.ts:93` 이 `sourceIds: rule.sources.map(s=>s.source_id)` 로 role 을 버린다. `RuleMetadata` 에 `sources: {source_id, role}[]` **추가**(기존 `sourceIds` 는 호환 유지). *role 은 effect 값이 아니므로 스탬프 없이 나가도 안전 — `RuleMetadata` 설계 의도 위반 아님.* 새 error code 불필요.
- **8-2 🔴 스탬프 자리** — `FactAnswerManifest` 에 `packKind`/`syntheticStamp` 가 없다(`RunManifest` 엔 있다). **두 겹 권고:** (a) 응답 봉투에 `registry.stamp()` 탑재(brand 라 위조 불가) (b) **매니페스트도 `RunManifest` 와 같은 방식으로 확장** — 사양 §1.3 이 **재현성 단위를 매니페스트로** 정의했으므로, 봉투에만 있으면 **보관된 매니페스트만 봐선 합성 여부를 알 수 없다.** 검증은 `manifest.ts:52-59` 의 `SYNTHETIC_STAMP_REQUIRED` 분기를 복제(**기존 code 라 union 추가 불필요**). ⚠️ **`answerPayloadHash` 가 스탬프를 덮어야 한다** — 밖이면 스탬프만 갈아끼운 위조가 통과한다.
- **8-3 🔴 이음매 검사** — `loadPolicyPack` 은 팩 내부 참조만 본다. **`@cube/policy` 가 `@cube/corpus` 를 의존하면 안 되므로**(계층 역전) **주입 방식**: `loadPolicyPack(raw, opts?: {knownSourceIds?: ReadonlySet<string>})`. 미지정 시 현행 동작. 새 code `SOURCE_SNAPSHOT_NOT_FOUND` → **`errors.ts` union + 매트릭스 동시 갱신**.

**Phase 8 DoD:** ① `SYNTHETIC_DEMO` + 스탬프 없는 매니페스트 → `SYNTHETIC_STAMP_REQUIRED` 거절 ② `describeRule().sources` 로 PRIMARY 필터 가능 ③ 없는 `source_id` + `knownSourceIds` → `SOURCE_SNAPSHOT_NOT_FOUND` ④ `matrix-coverage.test.ts` 통과 — **새 code 를 매트릭스에 안 적으면 여기서 빨개진다.**

> **안티패턴:** `RuleMetadata` 에 `effect` 흘리기 / policy 가 corpus 를 dependencies 에 추가 / 사양 §5.6 필드 **개명·삭제**(추가만 하고 "확장" 주석).
> **사람 게이트:** 8-2 는 사양 인터페이스 확장 → `docs/ORDER7-OPEN-QUESTIONS.md` 기록 후 확인.

---

# ── 합류 (Phase 9·10·11·End) ──

## Phase 9 — 인용 기반 답변 (Citation-locked Answer) 🔴 (§13: 7F-D + 7F-E-3)

> 목표: **조문을 통째로 읽고 조건까지 정리해서, 문장마다 조문 인용을 달아 답한다.**
> 신규 패키지 `packages/fact/`. 크기: 큼.
>
> **⚠️ 이 Phase 는 2026-07-31 대화로 설계가 바뀌었다.** 이전 계획은 "승인된 규칙이 없으면
> 원문만 던지고 끝"이었는데, 그건 **선을 잘못 그은 것**이었다. 경위는 아래 "설계 정정" 참조.

### 설계 정정 — 사양을 과하게 좁게 읽었다

이전 계획은 "LLM 이 조문을 읽고 400만원이라고 말하는 것"을 금지된 것으로 취급했다. 다시 읽으니:

- §7 이 금지하는 것은 "AI 가 세율·한도 값을 **결정**한다" 이고, §1.1 의 "결정"은
  **"이것이 공식 팩트다"라고 확정하는 권한**을 말한다 (그 권한은 Registry 에 있다).
- §1.2 의 UNMODELED 행은 **"개인 상황 적용 금지 · PLAN 엔진 입력 금지"** 라고만 한다.
  **"숫자 언급 금지"라고는 쓰여 있지 않다.**

그래서 선은 여기다:

| | 예시 | 판정 |
|---|---|---|
| 인용·종합 | "조특법 §91의18 ②에 따르면 400만원 또는 200만원이고, 400만원 조건은 …[원문]" | ✅ |
| 개인 적용 | "**당신은** 400만원 한도입니다" | ❌ §1.2 |
| 계산 투입 | 400만원을 Tax Calculator 입력으로 | ❌ 절대 규칙 1·3 |

**결과: 미션 1 의 답변은 LLM 이 조문을 읽고 정리해도 된다. 승인이 진짜 필요한 것은 미션 2 가
계산에 쓸 값뿐이다.** 이것이 Phase 10 의 승인 부담을 크게 줄인다.

### 오늘의 400↔200 사고를 다시 해석한다

`[각 목]` 오독은 **LLM 이 못 읽어서가 아니라 파싱이 원문 구조를 망가뜨려서** 벌어졌다.
표식을 제대로 단 지금 조문을 통째로 주면 LLM 은 400 인지 200 인지 구분한다.
→ 교훈은 "LLM 에게 읽히지 마라"가 아니라 **"원문을 온전하게 줘라"** 였다.

### 3단 신뢰도 층

| 층 | 근거 | 답변 형태 | 개인 계산 |
|---|---|---|---|
| **확정 팩트** `REGISTRY_RESOLVED_FACT` | 승인된 규칙 | "400만원입니다" + 규칙 ID·승인자·시행일 | 가능 |
| **조문 종합** `UNMODELED_OFFICIAL_SOURCE` ← **이번에 실질화** | 관련 조문 묶음 전체 | 조건까지 정리 + 문장별 인용 + 원문 병기 | **금지** |
| 거절 | 코퍼스에도 없음 | §4.2 거절 문구 | — |

한 답변 안에 **두 층이 섞일 수 있다**(hybrid) — 한도는 승인됨(확정), 조건은 미승인(종합).
라벨을 문장 단위로 붙인다.

### 분기 설계 — 순서가 곧 설계다

```
1. registry.listEffectiveRuleIds(queryAsOf)          조회일 유효 규칙
2. 질의에 해당하는 rule 탐색                          ← RAG 를 거치지 않는다
3. 있으면 → REGISTRY_RESOLVED_FACT (resolvedRuleIds 필수)
4. 없으면 → 조문 묶음을 조립해 UNMODELED_OFFICIAL_SOURCE (resolvedRuleIds = [])
5. 코퍼스에도 없으면 → §4.2 거절
```
**2단계가 4단계보다 코드상 먼저 오고, `resolveRegistry()` 시그니처가 검색 결과 타입을 받지 않는다.**
RAG 가 rule 선택에 영향을 주는 경로가 타입 레벨로 존재하지 않아야 한다(§1.1).

### 만들 것

```
packages/fact/src/bundle.ts     ★ 조문 묶음 조립 — 검색 top-N + 인용 폐포 + 위임 사슬
packages/fact/src/answer.ts     ★ 인용 강제 프롬프트 → LLM → 문장별 [n]
packages/fact/src/verifyCite.ts ★ 인용 검증 — [n] 이 실제 제공 조문인지
packages/fact/src/coverage.ts   ★ 조건 누락 검사
packages/fact/src/resolve.ts    분기 (위 5단계)
packages/fact/src/manifest.ts   FactAnswerManifest 조립
packages/fact/src/reject.ts     §4.2 거절
packages/fact/test/*.test.ts
```

- **9-1 🔴 조문 묶음 조립** (`bundle.ts`) — 검색 결과만 주지 않고 **관련 조문을 다 모은다**:
  ① 검색 top-N ② 그 조문들이 **명시 인용**하는 조문(Phase 1 인용 그래프 579 엣지)
  ③ **위임 사슬** — 같은 사안의 법률↔시행령↔고시↔훈령(Phase 3 의 `authorityType` 서열).
  *"숫자가 나왔다고 멈추지 않는다" — 조건·예외가 다른 조문에 있으면 그것까지 읽어야 답이 온전하다.*
- **9-2 🔴 인용 강제 답변** (`answer.ts`) — 문장마다 `[n]` 을 달게 하고 근거 없는 문장을 금지.
  Perplexity 형식이되 출처가 **웹페이지가 아니라 조문**이라 해시로 고정된다. A1 의 grounding 프롬프트 재사용.
- **9-3 🔴 인용 검증** (`verifyCite.ts`) — 응답의 모든 `[n]` 이 **실제로 제공한 조문 목록 안**인지 확인.
  밖이면 그 문장을 표시하거나 거절. *Perplexity 의 알려진 결함(없는 출처를 지어내거나 인용은 붙었는데
  그 출처에 그 내용이 없는 것)을 구조적으로 막는다. 우리는 컨텍스트가 닫힌 집합이라 검증이 가능하다.*
  A1 의 `_name_in_text`("답변에 언급된 작가만 출처로")와 같은 아이디어.
- **9-4 🔴 조건 누락 검사** (`coverage.ts`) — ⚠️ **숫자 오류보다 위험한 실패.**
  "400만원입니다"라고 하면서 농어민 조건을 빼먹으면 해당자가 자기가 대상인지 모른다.
  숫자는 맞다/틀리다가 명확하지만 **조건 3개 중 2개만 말한 것은 조용히 지나간다.**
  → 평가셋에 조건 커버리지 항목 신설(ISA 면 `총급여 5천만원`·`종합소득 3천8백만원`·`농어민` 전부 등장하는지).
- **9-5 🔴 원문 병기 필수** — 정리한 문장 옆에 항상 조문 원문(접기)을 붙인다. LLM 이 오독해도
  사람이 즉시 대조할 수 있어야 한다. `hasUnattachedMok` 청크면 소속 미상 고지도 함께.
- **9-6 🔴 §4.4 금지 문구 가드** — `"평생"`·`"세후"`·`"실수령액"`·`"가장 최적의"` 를 평가셋 전 질의로 grep.
- **9-7 🔴 이음매·안티패턴 테스트** — 정책 팩 `source_id` 가 코퍼스 실재(Phase 8-3 활용) +
  레포 grep(`PolicyRule` import 0 / 손으로 만든 stamp 0 / `.js` 없는 import 0).

**Phase 9 DoD:** ① 승인 0건 상태에서 `"ISA 비과세 한도 얼마야?"` 에 **조건 3개가 모두 담긴 답 + 문장별 인용 + 원문**이 나온다 ② 모든 `[n]` 이 제공 조문 안(위조 인용 0건) ③ `UNMODELED` 응답에 개인 적용·계산 투입 경로가 **타입 레벨로 없다** ④ 전 응답이 `validateFactAnswerManifest` 통과 ⑤ 금지 문구 0건 ⑥ out-of-corpus 질의 → 거절.

> **안티패턴:** 검색 점수로 클래스 결정(§1.1 위반) / `UNMODELED` 답을 개인에게 적용 / 원문 병기 생략 /
> LLM 이 인용 원문을 **요약**해서 싣기(원문은 원문 그대로) / 조건 누락을 "길이 제한" 이유로 정당화.

## Phase 10 — 계산값 승인 게이트 🟡 도구 완성 · 사람 승인 대기 (§13: 순서 4 후속 + §2.2 트랙 3~7)

> 목표: **미션 2 가 계산에 쓸 값**을 사람 승인으로 확정한다. 크기: 중간(이전 계획보다 축소).
>
> **⚠️ 범위가 바뀌었다.** 이전 계획은 §12 의 25개 파라미터를 전건 승인하는 것이었다.
> Phase 9 재설계로 **미션 1 의 답변은 승인 없이도 조문 종합으로 나가므로**,
> 승인이 필요한 것은 **계산기에 실제로 입력되는 값**으로 좁혀진다.

### 승인 부담을 줄이는 세 장치

- **10-1 🔴 이중 AI 교차검증으로 정독 범위 축소** (사양 §2.2 4단계) — AI-1(Gemini) 초안,
  AI-2(Claude) 독립 반례 공격. **일치하면 사람은 확인만, 불일치한 것만 정독.**
  두 AI 의 답을 평균 내지 않는다(§7) — 불일치 = 자동 보류.
- **10-2 🔴 ★ 골든 케이스 역검증** — 파라미터를 하나씩 승인하는 대신 **국세청 공표 계산 사례**로 역산한다.
  ```
  국세청 예시: 연봉 5,500만원 · 연금계좌 600만원 납입 → 세액공제 99만원
      ↓ 우리 엔진이 99만원을 내면
  그 계산에 쓰인 파라미터 전체(공제율·한도·소득분기)가 한 번에 검증된다
  ```
  **개별 승인 25건 → 골든 케이스 3~5건.** 값 하나하나보다 **조합해서 정답이 나오는지**가 더 강한 검증이다.
  사양 §13 "사람만 할 수 있는 작업"에 이미 *"국세청 공식 계산 사례 골든 정답지 3~5건"* 이 있다.
  ⚠️ 사례를 **찾아오는 것은 사람 몫** — API 로 안 나온다.
- **10-3 🔴 위험 기반 선별** — 계산에 직접 들어가는 값(세율·한도·소득분기)만 승인 대상.
  설명·맥락용 항목은 Phase 9 의 조문 종합으로 충분하다.

### 절차 (사양 §2.2 3~7단계)

```
3. AI-1 초안        → pack_kind: UNVERIFIED_DRAFT, 미확정값은 PLACEHOLDER
4. AI-2 공격        → 불일치 시 자동 보류(HOLD)
5. 사람 Maker       → 대조표를 보고 YAML 직접 편집 + 서명 / Checker → git diff 확인
6. 정적 검증        → loadPolicyPack 이 곧 검증기다
7. 태깅             → policy_snapshot: KR-TAX-2026-MM-DD.1
```

- **10-4 🔴 승인을 "버튼"으로 만들지 않는다** — `--approve` 한 번이면 사람이 원문을 안 본다.
  `review.ts` 는 **대조표만 출력**하고 승인은 YAML 직접 편집. **절차를 불편하게 만드는 게 목적이다.**
- **10-5 🔴 검증기를 새로 짜지 않는다** — `loadPolicyPack` 이 이미 `VERIFIED_PACK_HAS_UNAPPROVED_RULE` /
  `VERIFIED_PACK_MISSING_REVIEW_SIGNATURE` / `PLACEHOLDER_IN_VERIFIED_PACK` 를 강제한다.
- **10-6 🔴 착수 순서** — 짧고 `[각 목]` 없는 것부터: `RETIRE_D_17_2`(194자) → `INCTAX_61` →
  `INCTAX_59_3` → **`TAXEX_91_18`(ISA, 3,740자, `[각 목]` 12개) 마지막.**

**Phase 10 DoD:** ①✅ 초안 팩을 `resolveEffect` 하면 반드시 `UnverifiedPolicyError` ②✅ 초안 팩이 로더를 통과(승격 CLI 실측) ③🔴 골든 케이스 — **국세청 공식 계산 사례 확보 대기(사람)** ④🔴 REGISTRY 경로 SYNTHETIC→VERIFIED 교체 — 승인 규칙 0건이라 미착수 ⑤🔴 `docs/PARAMETER-APPROVAL.md` — 첫 승인 시 작성.

> **2026-07-31 실측 — `rounding` 은 초안에서 아예 뺐다.**
> 처음엔 `rounding: {stage: "<원문 대조 후 기재>", ...}` 로 채웠는데, `stage`·`mode` 가 enum 이라
> **스키마 검증이 먼저 터져 `ROUNDING_ENUM_INVALID` 로 보고됐다.** 원인이 "미확정 값"인데
> 로더는 "enum 위반"이라고 말한 것 — 원인 지목이 어긋나면 사람이 엉뚱한 데를 고친다.
> 매트릭스 R15 는 "일부만 존재하면 거절"이므로 **전부 없는 것은 유효**하다. 사람이 원문을 보고
> 채워 넣는 절차를 YAML 헤더 4-1 단계로 명시했다. (스키마·로더는 건드리지 않았다 → 매트릭스 변경 없음)

> **사람 게이트:** 이 Phase 전체. 자동화할 수 없고 하면 안 된다.
> **리스크 완화:** Phase 9 가 승인 0건에서도 쓸 만한 답을 내므로, Phase 10 이 늦어져도 미션 1 은 동작한다.
> **1건만 승인돼도** `REGISTRY_RESOLVED_FACT` 경로가 실데이터로 켜진다.


## Phase 11 — Intent Router(FACT 분기) + UI ✅ 완료 (2026-07-31) ★발표용 (§13: 순서 7 Router + 순서 8 선행)

> 목표: 브라우저에서 자연어로 물으면 근거·라벨·스탬프가 붙은 답이 나온다. 신규 `packages/factui/`. 크기: 중간.

- **11-1 ✅ Router** — **LLM 없이** 결정론적 규칙 우선(개인 수치·명령형이면 PLAN 후보). **미션 1 범위에서 PLAN 은 전부 "아직 미구현" 안내로 하강** — 판별을 틀려도 손해가 작다. 판별 기준은 `ORDER7-OPEN-QUESTIONS.md` 에 적고 확인.
- **11-2 ✅ 서버·UI** — `node:http` + 정적 파일. **React/Vite 금지**(레포 의존성 정책 파괴). 레이아웃만 `reference/_archive/code.html` 참고 — **값·로직은 가져오지 않는다**(CLAUDE.md 명시).
- **11-3 ✅ 표시 6요소** — ① 클래스 라벨(`① 공식 팩트` / `원문 인용(팩트 결론 아님)`) ② **스탬프**(SYNTHETIC 이면 눈에 띄게) ③ 근거 조문(법령명·조문번호·제목·시행일·해시 앞 8자·원문 전문 접기) ④ `[각 목]` caveat ⑤ 매니페스트 뷰(`resolvedRuleIds`·`policySnapshotVersion`·`ragIndexVersion`·`factResolverVersion`) ⑥ UNMODELED 시 개인 적용 금지 고지.

**Phase 11 DoD — 전부 통과:**
- ①✅ 실질의 `"IRP 연간 납입한도가 얼마인가"` 로 **6요소 전부 렌더**(브라우저 실행 실측). 답에 1천800만원·ISA 전환금액·주택차액 3갈래가 조건까지 실림. 위조 인용 0건.
- ②✅ Router 고정 케이스 22건 (`packages/fact/test/router.test.ts`). PLAN 판정은 **안내만** — 안내문에 3자리 이상 수치가 없음을 테스트로 고정. 실측: PLAN 질의는 **검색·LLM 을 아예 타지 않아 API 콜 0회.**
- ③✅ `packages/factui/test/no-computation.test.ts` — src·scripts·public 전체 grep. **탐지기 자체를 검증하는 테스트**(미끼를 심어 잡히는지)와 **오탐 회귀 테스트**를 같이 둠.
- ④✅ `packKind: "SYNTHETIC_DEMO"` 일 때 `SYNTHETIC_STAMP_TEXT` **상수를 참조한 문자열이 HTML 에 존재**함을 단언. 비합성일 때 안 붙는 것도 함께 단언(남발하면 경고가 무뎌진다).

**산출물:** `packages/factui/` (21 테스트) · `packages/fact/src/router.ts`·`manifest.ts` (fact 49 테스트) · [ORDER7-OPEN-QUESTIONS.md](ORDER7-OPEN-QUESTIONS.md)
**실행:** `npm run serve -w @cube/factui` → http://127.0.0.1:8787

## Phase End — 통합·회귀·한계표·미션 2 이음매 🟡 (E-1~E-5 완료 · 사람 게이트 잔여)

> 목표: 미션 1 을 닫고 **미션 2 가 이어받을 지점을 명시적으로 남긴다.** 크기: 중간.
>
> **2026-08-07 — E-1~E-5 전부 완료.** 남은 것은 코드가 아니라 **사람 승인**이다
> (평가셋 `ORACLE` 서명 · 답변 사실 확인 · 정책 팩 승인 확대). 상세는 [MISSION1-CLOSEOUT.md](MISSION1-CLOSEOUT.md) §8.
>
> 🔴 **그리고 합치기 전 반드시 풀어야 할 것 하나** — A4-Logic 이 `.draft.yaml` 4개를
> `pack_kind: VERIFIED_LAW` 로 로드하고 있어 **두 미션의 값 집합이 다르다**(사양 §1.1 split-brain).
> 상세·확인 절차는 [MISSION2-SEAM.md](MISSION2-SEAM.md) §2.

- **E-1 ✅ 전체 회귀** — `npm test` **508 통과 / 0 실패** (corpus 17 · fact 121 · factindex 109 · factui 62 · numeric 44 · packdraft 28 · plan 19 · policy 108) + `check:retrieval` **exit 0** (hit@1 22/26 · hit@5 25/26 · 회귀 없음). *(engine 은 2026-08-07 분리로 A4-Logic 소관.)*
- **E-2 ✅ 콜드 스타트 재현** — 색인 삭제 → 재빌드(2,649 청크 · 128초) → `ragIndexVersion` **동일**(`6df09cafb2fa…`) · `vectors.bin` **SHA-256 바이트까지 동일** · hit@k **동일**. 색인이 결정론적임이 확인됐다.
- **E-3 ✅ [`docs/MISSION1-CLOSEOUT.md`](MISSION1-CLOSEOUT.md)** ★한계표 — 승인 규칙 N건 / 코퍼스 커버리지(법령 6종 1,477 실질 조문 · ADMIN_GUIDANCE N건 · 공백) / **시점 필터는 0건을 거른다(fixture 검증만)** / **인용 확장은 명시 한정, 엣지 보유 조문 16.7%** / **`[각 목]` 소속 미상 293 조문** / 융합 가중치는 N점 스윕이지 최적화 아님.
- **E-4 ✅ [`docs/MISSION2-SEAM.md`](MISSION2-SEAM.md)** — 동일 Registry 공유(§1.1 split-brain 금지) / `resolvedRuleIds` == PLAN 의 `sourceRuleIds` 같은 id 공간 / 매니페스트 공통 필드 / **7P 는 진짜로 순서 5·6 이 필요**(§7 Renderer 가 `MechanismHandler.explain()` 의존) / `fact/src/render.ts` 를 한 파일로 격리해 둔 이유 = 공용 렌더러 교체 지점.
- **E-5 ✅ 오인용 정정** (2026-08-07 확인 — `진행기록.md`·`변경사항-2026-07-31.md` 모두 정정된 문구를 쓰고 있고, 소스 주석의 "규칙 7"은 전부 **답변 프롬프트의 규칙 7**이라 오인용이 아니다) — 여러 문서의 "CLAUDE.md 규칙 7(진행 표시)"는 **오인용**이다. A4/CLAUDE.md 규칙 7 은 "독립 기준 계산기(Python)는 프로덕션 코드를 import하지 않는다"이고, 진행 표시 규칙은 **상위 폴더 `MyWork/CLAUDE.md` 규칙 7**이다.

> **안티패턴:** **"미션 1 완료"라고 쓰기** — 승인 규칙 N건·코퍼스 공백 M건이 남았으면 완료가 아니라 **"이 범위에서 동작"** 이다 / 한계표 빼고 성능 수치만 발표(**A1 의 "hit@1 100%" 패턴**).

---

## 의존 그래프

```
                [완료] 순서 1·2·3·4 ✅
                            │
   ┌────────────────────────┼────────────────────────┐
   │ Track A (검색)          │ Track B (Registry)      │ Track C (데이터)
   ▼                        ▼                         ▼
 Phase 1 청킹           Phase 8 policy 보강        Phase 3 코퍼스 II
 (네트워크 0)            (role·스탬프·이음매)        (admrul + ADMIN_GUIDANCE)
   │                        │                         │
   ▼                        │                         │
 Phase 2 임베딩 ◀───────────────────── 재색인 ─────────┘  (합류: Phase 4 이전)
   │  (첫 API·토큰 실측)     │
   ▼                        │
 Phase 4 어휘 브리지+BM25+시점   ← 사람: aliases.json 승인
   │                        │
   ▼                        │
 Phase 5 하이브리드 ★첫 CLI 데모
   │                        │
   ▼                        │
 Phase 6 평가셋+CI 게이트    │   ← 사람: 정답 ORACLE 서명
   │                        │
   ▼                        │
 Phase 7 rerank+ablation    │
   └──────────┬─────────────┘
              ▼
        Phase 9 Fact Resolver (SYNTHETIC 으로 배선 검증)
              ▼
        Phase 10 파라미터 추출 게이트 ★사람 승인 (크리티컬 패스)
              ▼
        Phase 11 Router + UI ★발표
              ▼
        Phase End 통합·한계표·미션2 이음매
```

**직렬 필수:** 1→2(청크 없으면 임베딩 대상 없음) · 4→5(브리지 없이 BM25 측정 무의미, M8) · 2→5(벡터 없이 융합 불가) · 6→7(ablation 기준 없음) · 8→9(PRIMARY·스탬프·이음매가 Resolver 전제) · 9→10(승인해도 쓸 곳 없음) · 9→11.
**병렬 가능:** Track A·B·C 동시 착수. **Phase 10 의 AI 초안(3~4단계)은 Phase 9 전에 시작 가능** — 초안은 계산에 못 들어가므로 안전하다. 사람 승인만 Phase 9 이후로 두면 된다.
**크리티컬 패스:** `1→2→4→5→6→9→10→End`. Phase 10 의 사람 승인이 유일한 자동화 불가 병목.

## "동작하는 데모"가 처음 나오는 지점

| 단계 | 보여줄 수 있는 것 | 발표 가치 |
|---|---|---|
| 지금 | JSON 파일 열기 | 없음 |
| **Phase 5 (CLI)** ★최초 | `ask "IRP 중도인출 사유"` → 조문 top-10 | 중. 아직 팩트가 아니라 검색 결과 |
| Phase 6 | 버킷별 hit@1/hit@5 수치표 | 높음. A1 이 못 한 것 |
| **Phase 9 (CLI)** | 근거·라벨·매니페스트가 붙은 FACT 응답 + "모르면 모른다" 실동작 | **매우 높음.** §1.1 을 시연으로 보여주는 지점 |
| Phase 10 | `REGISTRY_RESOLVED_FACT` 실데이터 1건 | **최고.** AI 초안→사람 승인→규칙 전체 궤적 |
| Phase 11 (UI) | 브라우저·스탬프·trace 뷰 | 발표 필수 |

> **발표가 임박하면:** `5 → 6 → 9 → 11 → 10` 순. Phase 9 의 `UNMODELED` + 스탬프 시연만으로 설계 핵심(§1.1·§1.2)은 전부 보여진다. 단 `MISSION1-CLOSEOUT.md` 에 "승인 규칙 0건"을 정직하게 적어야 한다.

---

## 순서 배치 근거 — 왜 순서 5·6 을 건너뛰는가

**사양 §13 에 "순서 7 이 5·6 에 의존한다"는 명시가 없다.** 표에 의존/선행 컬럼 자체가 없고, `의존|선행|전제|블로킹` grep 결과 §13 범위 히트는 순서 0(방향 승인 게이트)과 taxCharacter 정책 전제 둘뿐이다. 반대로 **병렬 허용은 명시**돼 있다(순서 4 "코드와 병렬 진행 가능, 즉시 착수").

FACT 경로가 실제로 필요로 하는 건 **Registry(순서 2 ✅) + 코퍼스(순서 4 ✅)** 뿐이다. Tax Calculator·Optimizer 는 PLAN 의 부품이다. **7P 는 진짜로 5·6 이 필요**하다 — §7 Renderer 계약이 `MechanismHandler.explain()` 에 의존하기 때문. 7F 는 아니다.

**리스크 3건:** ① Registry 가 비어 실데이터 검증 불가 → SYNTHETIC 배선 검증 + 스탬프 강제, Phase 10 이 해소 ② FACT 응답 형태가 나중의 PLAN 과 어긋날 수 있음 → §7 `ExplanationPayload` 형태를 미리 따르고 렌더러를 한 파일로 격리 ③ Intent Router 정의가 사양에 없음 → FACT 분기만 구현, PLAN 은 "미구현"으로 하강.

---

## Open Questions

| # | 질문 | 상태 | Phase |
|---|---|---|---|
| Q2' | `FactAnswerManifest` 에 `packKind`/`syntheticStamp` 를 **사양 확장**으로 추가할 것인가, 봉투 스탬프만인가 | 권고: **둘 다.** 사양 인터페이스 확장이라 사람 확인 필요 | 8 |
| Q3' | `RuleMetadata` 에 `sources[{source_id, role}]` 추가 승인 | 권고: 추가(effect 값 아니므로 안전). 코드 3줄 | 8 |
| Q4 | Intent Router 의 FACT/PLAN 판별 기준 (사양 미정의) | 권고: 결정론적 규칙 + PLAN 은 "미구현" 하강 | 11 |
| **Q6** | **`aliases.json` 승인 주체** — `ISA→개인종합자산관리계좌` 는 "질의를 어느 조문으로 번역할지"의 결정이다. 세무 검토자 승인 대상인가, 개발자 판단인가 | 미결 | 4 |
| **Q7** | **어느 국세청 자료를 official 로 인정하나** (예규·질의회신·안내·보도자료는 권위가 다름) + **스크래핑 가부** | 미결 | 3 |
| **Q8** | **최초 승인 파라미터 범위** — §12 표는 25행. 미션 1 에서 몇 건? | 권고: 4~6건, 짧고 `[각 목]` 없는 것부터 | 10 |
| **Q9** | **Checker 는 누구인가** — 사양 §2.2 는 "세무·법무 검토자". 팀 내 2인 리뷰로 충분한가 | 미결 | 10 |
| **Q11** | **시점 필터 vacuity** — fixture 검증으로 충분한가, 시행예정 법령판을 별도 수집해 실데이터를 만들 것인가 | 미결 | 4 |

*Q1(D3 확정)·Q5(순서 0 미통과여도 진행 가능)·Q10(규칙 7 오인용, E-5 에서 정정)은 해소됨.*

---

## 지금 위치 & 권장 순서

```
Phase 1~8 ✅  (코퍼스 2,137조문 · 청크 2,649 · 검색 hit@1 85% · 테스트 332개 통과)
        ↓
   Phase 9 인용 기반 답변  ←── 지금 여기
     · 조문 묶음 조립(인용 폐포 + 위임 사슬)
     · 문장별 [n] 인용 + 원문 병기
     · 인용 검증 · 조건 누락 검사
        ↓
   Phase 11 UI  →  Phase 10 계산값 승인(사람)  →  End
```

**Phase 9 를 먼저 하는 이유:** 승인 0건 상태에서도 동작하고, 끝나면 처음으로 "답변"이 나온다.
그 결과를 보고 나서 승인 범위를 정하는 편이 낫다.

**발표가 급하면** 9 → 11 → 10. Phase 9 의 조문 종합 답변만으로도 시연이 된다.
단 `MISSION1-CLOSEOUT.md` 에 "승인 규칙 0건"을 정직하게 적어야 한다.

**사람이 병렬로 할 것:** ① 별칭 사전 승인(10분) ② 행정규칙 `authorityType` 확정(30분)
③ 평가셋 정답 검토(1~2시간) ④ 국세청 공식 계산 사례 3건 확보(Phase 10 골든 케이스용)
