# CUBE 세법 팩트 엔진 (미션 1)

ISA·연금저축·IRP 질문에 **법령 원문을 인용해서** 답하는 엔진입니다.
답이 그럴듯한지가 아니라 **어느 조문에서 왔는지**가 기준입니다.

```
질문 → 조문 검색 → 근거 확보 → 답변 작성 → 인용 검증 → 화면
                                              ↓ 통과 못 하면
                                          답하지 않는다
```

## 실행

Node 20 이상이 필요합니다.

```bash
npm install
cp .env.example .env      # LLM_API_KEY 를 채운다
npm run build

npm run build:index -w @cube/factindex   # 조문 스냅샷 → 벡터 색인 (수 분, 1회)
npm run serve -w @cube/factui            # http://127.0.0.1:8787
```

색인(`packages/factindex/index/`)은 저장소에 없습니다. 조문 스냅샷에서 **결정론적으로
재생성**되기 때문입니다 — 같은 스냅샷이면 같은 색인이 나오는 것을 콜드 재빌드로 확인했고
(`docs/MISSION2-SEAM.md` §4), 그래서 32MB 파생물을 커밋하지 않습니다. 조문 스냅샷은
반대로 **증거물**이라 커밋합니다.

`.env` 는 커밋되지 않습니다. 키는 각자 채웁니다.

## 무엇이 어디에 있나

| | |
|---|---|
| `packages/corpus` | 국가법령정보 원문 수집 · 스냅샷 |
| `packages/factindex` | 임베딩 색인 · 검색 |
| `packages/fact` | 인용 답변 · 라우터 · 인용 검증 · 커버리지 · 비포함 고지 |
| `packages/factui` | 웹 화면 · HTTP 서버 |
| `packages/packdraft` | 조문 → 정책 규칙 초안 + **사람 승인 게이트** |
| `packages/plan` | 승인된 규칙으로만 하는 계산 |
| `packages/numeric` | 금액(bigint) · 비율(유리수) · 정규 직렬화 |
| `packages/policy` | 스키마 · 로더 · Registry · 승인된 정책 팩 |

`CUBE_설계계약통합본_v1.4.md` 가 **유일한 사양**입니다. 코드가 사양과 다르면 사양이 맞습니다.

## 설계에서 물러서지 않은 것들

**세법 값은 코드에 없습니다.** 세율·한도·경계값은 전부 정책 팩에서 오고, 팩에는 원문 출처와
사람의 승인 서명이 있어야 합니다. 값을 모르면 지어내지 않고 `UnverifiedPolicyError` 로
멈춥니다. 주석이나 테스트 기본값에 숫자를 적는 것도 금지입니다 — 그렇게 새어 들어온
"임시값"이 나중에 진짜 값 행세를 합니다.

**계산 경로에 LLM 이 없습니다.** LLM 은 조문을 읽어 설명하는 자리에만 있고, 금액을 만드는
자리에는 없습니다. 답변이 몰래 계산을 하면 `findComputedAmounts` 가 잡아냅니다 — 실측으로
`2,000만원의 10% = 200만원` 을 잡았고, 그 답은 위조 인용 0건에 근거 앵커 100% 였습니다.
형식 검사만으로는 안 걸리는 종류입니다.

**개인 상황 질문은 엔진에 들어가기 전에 걸러집니다** (`fact/src/router.ts`). "연봉 6천인데
얼마 넣어야 돼?" 를 조문 엔진에 넣으면 LLM 이 개인에게 맞춘 답을 쓰려고 합니다. 프롬프트로
막는 건 사후 방어라, 질문이 도달하지 않게 합니다.

**빠진 것을 말합니다** (`fact/src/exclusions.ts`). 세액공제율을 조문 그대로 답했더니
"틀렸다"는 지적을 받은 적이 있습니다. 널리 알려진 수치가 지방소득세를 포함한 값이었고,
지방세법은 이 엔진의 수집 대상이 아니었습니다. 값이 맞아도 빠진 것을 말하지 않으면 틀린
답으로 읽힙니다.

**답이 어디서 왔는지 재현할 수 있습니다.** 매니페스트에 모델·effort·프롬프트 버전·렌더러
버전·색인 해시·정책 스냅샷이 들어갑니다. effort 까지 적는 이유는, 같은 모델 같은 프롬프트라도
effort 가 다르면 다른 답이 나오기 때문입니다.

## 검증

```bash
npm test                                   # 전체
npm run check:retrieval -w @cube/factindex # 검색 정확도 (hit@1 / hit@5)
npm run check:answers   -w @cube/fact      # 답변 품질 — LLM 호출, 비용 발생
npm run check:approved  -w @cube/plan      # 승인된 규칙으로만 계산되는지
```

## 더 읽을 것

| | |
|---|---|
| `A4-RAG_PROJECT_MASTER_SUMMARY.md` | 전체 서사 — 무엇을 왜 이렇게 만들었나 |
| `docs/BUILD-PLAN.md` | 단계별 계획과 완료 기준 |
| `docs/진행기록.md` | 날짜별 작업 기록 |
| `docs/MISSION1-CLOSEOUT.md` | 알려진 한계 |
| `docs/MISSION2-SEAM.md` | 미션 2(계산 엔진)와 합칠 지점 |
| `docs/ANSWER-QUALITY-*.md` | 모델·effort 조합별 실측 리포트 |
| `docs/ORDER2-REJECTION-MATRIX.md` | 정책 팩 거절 조건 |

## 프런트

과장님 앱(PLUS Cube)에 얹은 코파일럿 UI 는 별도입니다 — `dividend-app` 저장소의
`apps/web/src/components/cube/`. 이 엔진은 그쪽에서 사이드카로 호출합니다.
로컬 개발 서버(`localhost`·`127.0.0.1`)는 기본으로 허용하고, 다른 출처는
`CUBE_CORS_ORIGIN` 에 적어야 합니다.
