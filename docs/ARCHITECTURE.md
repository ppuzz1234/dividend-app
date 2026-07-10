# 배당 눈덩이 — 비즈니스 로직 아키텍처

> 2026-07 설계. 7단계 비즈니스 로직을 담는 repo 구조와 마이그레이션 경로.

## 1. 비즈니스 파이프라인

앱의 본질은 아래 7단계 파이프라인이다. 각 단계는 **순수 함수(입력 → 출력)** 로 정의하고,
화면(React)은 단계의 입출력을 표시·수집만 한다.

| # | 단계 | 입력 | 출력 | 모듈 |
|---|------|------|------|------|
| 1 | 고객 정보·성향 파악 | 서베이 응답 | `RiskProfile` (성향·목표·기간) | `core/profile` |
| 2 | 투자 여력 판단 | 소득·지출·보유현금 | `Capacity` (연/월 불입 가능액) | `core/capacity` |
| 3 | 절세 최적화 분석 | RiskProfile + Capacity + 보유계좌 | `TaxPlan` (계좌별 잔여한도·예상환급) | `core/taxopt` |
| 4 | 보유계좌 리밸런싱 | 보유상품 스냅샷 + 편입가능표 | `RebalanceProposal` (상품별 이동 제안) | `core/rebalance` |
| 5 | 잔여 절세방안 배분 | TaxPlan + Capacity | `AllocationPlan` (계좌×금액×상품유형) | `core/plan` |
| 6 | 시뮬레이션 (갭 표현) | As-Is 운용 vs To-Be 제안 | `GapReport` (미래 수익·세금 격차) | `core/simulate` |
| 7 | 매수 프로세스 | AllocationPlan + 종목 선택 | `OrderPlan` → 실제 주문(KIS) | `core/order` + `apps/api` |

데이터 흐름: `1 → 2 → 3 → (4 ∥ 5) → 6 → 7`
(4와 5는 3의 결과를 공유하는 병렬 단계 — 4는 기존 자산의 재배치, 5는 신규 불입금의 배분)

## 2. 목표 repo 구조

```
devidend-app/
├─ apps/
│  ├─ web/                        # React UI — 화면·플로우·상태만 (도메인 로직 없음)
│  │  └─ src/
│  │     ├─ screens/              # 파이프라인 단계별 화면
│  │     │  ├─ Survey.jsx         #   1. 성향 서베이
│  │     │  ├─ Mydata.jsx         #   보유계좌 연동 (기존)
│  │     │  ├─ Capacity.jsx       #   2. 불입 여력 입력
│  │     │  ├─ Accounts.jsx       #   3. 계좌 분석 (기존 확장)
│  │     │  ├─ Rebalance.jsx      #   4. 보유상품 계좌 조정
│  │     │  ├─ Plan.jsx           #   5. 올해 투자 방향
│  │     │  ├─ Picker.jsx         #   6. 종목 선택 (기존)
│  │     │  ├─ Result.jsx         #   6. 갭 시뮬레이션 (기존 확장)
│  │     │  └─ Order.jsx          #   7. 매수 진행
│  │     ├─ components/           # UI 컴포넌트 (기존)
│  │     ├─ hooks/                # useQuotes 등 (기존)
│  │     └─ lib/flow.js           # 화면 순서·스텝퍼 (기존)
│  │
│  └─ api/                        # Express — 외부 연동 전담
│     └─ src/
│        ├─ kis/                  # 한투 시세·인증 (기존)
│        └─ orders/               # 7. 주문 접수·체결 프록시 (신규, KIS 주문 API)
│
├─ packages/
│  └─ core/                       # ★ 도메인 엔진 — 순수 JS, React/Express 무관
│     ├─ package.json             # name: "@devidend/core"
│     └─ src/
│        ├─ knowledge/            # 지식 베이스 (정적 데이터 — 로직의 근거)
│        │  ├─ accountProfiles.js #   계좌 4종 프로파일 (세제·제약·장단점·fitFor)
│        │  ├─ productEligibility.js # 계좌×상품 편입가능 매트릭스
│        │  ├─ accounts.js        #   엔진용 세제 상수 (한도·세율)
│        │  ├─ stocks.js          #   종목·카테고리
│        │  └─ reference/         #   출처별 원천자료 수집 (승격 전 단계)
│        │
│        ├─ profile/              # 1. 성향
│        │  ├─ survey.js          #   문항·선택지 정의 (데이터)
│        │  └─ riskProfile.js     #   응답 → 성향 스코어 → fitFor 태그 매칭
│        │
│        ├─ holdings/             # 보유 현황 모델 (2·3·4의 공통 입력)
│        │  └─ snapshot.js        #   mydata → {계좌별 잔고·보유상품·납입이력} 정규화
│        │
│        ├─ capacity/             # 2. 여력
│        │  └─ capacity.js        #   소득·지출 → 연/월 불입 가능액
│        │
│        ├─ taxopt/               # 3. 절세 최적화
│        │  ├─ headroom.js        #   계좌별 잔여 한도·공제 여력 (기존 accountStatus)
│        │  └─ optimizer.js       #   CONTRIBUTION_PRIORITY 워터폴 (기존 allocate)
│        │
│        ├─ rebalance/            # 4. 리밸런싱
│        │  └─ rebalance.js       #   보유상품 × productEligibility → 이동 제안·사유
│        │
│        ├─ plan/                 # 5. 배분 제안
│        │  ├─ strategy.js        #   STRATEGY_PLAYBOOK (기존 — 차별화 자산)
│        │  └─ assetLocation.js   #   계좌별 적합 상품유형 (기존)
│        │
│        ├─ simulate/             # 6. 시뮬레이션
│        │  ├─ simulate.js        #   복리·배당 성장 엔진 (기존)
│        │  └─ gap.js             #   ★ As-Is(일반계좌/현행유지) vs To-Be(제안) 세후 갭
│        │
│        ├─ order/                # 7. 주문 도메인
│        │  └─ orderPlan.js       #   AllocationPlan+종목 → 주문 리스트 (체결은 apps/api)
│        │
│        └─ pipeline.js           # 단계 조립: 이전 단계 출력 → 다음 단계 입력 계약
│
├─ docs/
│  └─ ARCHITECTURE.md             # 이 문서
├─ netlify.toml
└─ package.json                   # workspaces: apps/*, packages/*
```

### 설계 원칙

1. **core는 순수 JS** — `import react`·`import express` 금지. 모든 모듈이
   `(입력 객체) → 출력 객체` 함수라서 Node로 바로 단위 테스트 가능하고,
   web과 api가 동일 로직을 공유한다 (예: 주문 검증을 프론트·백 양쪽에서).
2. **knowledge = 데이터, 나머지 = 로직.** 세율·한도처럼 매년 바뀌는 값은
   knowledge에만 존재하고 로직은 값을 하드코딩하지 않는다.
   원천자료(`reference/`) → 검토 → `knowledge/*` 승격 흐름 유지.
3. **단계 간 계약은 pipeline.js 한 곳에 명시** — 어떤 단계가 어떤 필드를
   만들고 소비하는지 JSDoc typedef로 고정한다. 화면 순서(flow.js)와
   도메인 순서(pipeline.js)를 분리해, UI 재배치가 로직에 영향 없게 한다.
4. **6단계 갭 시뮬레이션이 세일즈 포인트** — `gap.js`는 동일 시뮬레이션
   엔진을 두 시나리오(현행 유지/제안안)로 돌려 `{수익 갭, 세금 갭, 환급 누계}`를
   산출한다. 시나리오 정의만 다르고 엔진은 공유.
5. **7단계 실주문은 api에만** — core/order는 "무엇을 살지" 계획까지,
   인증·잔고확인·체결은 `apps/api/src/orders/`가 KIS로 수행. 키·토큰이
   프론트에 노출되지 않는 경계이기도 하다.

## 3. 기존 파일 → 새 위치 매핑

| 현재 (apps/web/src) | 이동 후 (packages/core/src) | 비고 |
|---|---|---|
| `data/accounts.js` | `knowledge/accounts.js` | 그대로 |
| `data/accountProfiles.js` | `knowledge/accountProfiles.js` | 그대로 |
| `data/productEligibility.js` | `knowledge/productEligibility.js` | 그대로 |
| `data/stocks.js` | `knowledge/stocks.js` | 그대로 |
| `data/reference/*` | `knowledge/reference/*` | 수집 플로우 유지 |
| `data/accountStatus.js` | `taxopt/headroom.js` + `holdings/snapshot.js` | 여력 계산과 mydata 목데이터 분리 |
| `lib/allocate.js` | `taxopt/optimizer.js` | STRATEGIES 레지스트리 유지 |
| `lib/strategy.js` | `plan/strategy.js` | 플레이북 버전 관리 유지 |
| `lib/assetLocation.js` | `plan/assetLocation.js` | 그대로 |
| `lib/simulate.js` | `simulate/simulate.js` | 그대로 |
| `lib/format.js`, `lib/cx.js` | web에 잔류 | 표시용 유틸 — 도메인 아님 |
| `lib/quotes.js`, `hooks/*` | web에 잔류 | I/O·UI 훅 |

## 4. 마이그레이션 순서 (기능 개발과 병행)

- **Phase 1 — core 패키지 신설 + 기존 로직 이사** ✅ 완료 (2026-07-10)
  `packages/core` 생성, 루트 workspaces에 `packages/*` 추가, 위 매핑대로 이동,
  web은 `@devidend/core`로 import 교체. 동작 변화 없음(순수 이동)이라
  기존 시뮬레이터로 회귀 확인.
- **Phase 2 — 신규 단계 모듈 추가**
  `profile/survey` → `capacity` → `rebalance` → `simulate/gap` 순서로,
  각 모듈을 core에 먼저 만들고(테스트 포함) 화면을 붙인다.
  flow.js STEPS 확장: `survey → mydata → capacity → accounts → rebalance → plan → picker → …`
- **Phase 3 — 주문 경로**
  `core/order` + `apps/api/src/orders` (KIS 주문 API, 모의투자 계좌부터).

## 5. 한도·세율 개정 대응

knowledge의 모든 파일은 `effectiveYear`/`version`을 갖는다. 연말 세법 개정 시
knowledge만 갱신하고 로직은 불변 — 개정 이력은 git + `reference/` 원천자료로 추적.
