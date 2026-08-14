# 큐브(CUBE) 설계·구현 계약 통합본 v1.4 (구현 착수본)

**절세 3종 계좌(ISA · 연금저축 · IRP) 팩트 엔진 및 플래닝 엔진 — 유일 구현 사양**

| 항목 | 내용 |
|---|---|
| 문서 버전 | **v1.4 (통합·구현 착수본 — 세무상태 외생변수·비선견성·주장범위 확정)** |
| 작성일 | 2026-07-30 |
| 지위 | 본 파일이 구현의 **유일한 사양(single source of spec)**. v1.0 / v1.1 / v1.1.1 / v1.2 / v1.3 / v1.3.1은 설계 이력으로만 보존하며 구현 참조 금지 (낡은 타입·목표 정의 포함) |
| 개정 사유 (v1.3.1 → v1.3.2) | 아키텍처 리뷰가 아니라 **요구사항 변경**: (a) 목표 변수 재정의 — 은퇴 시점 자산총액 → **은퇴 후 월 세후 실질 소득**, (b) 마이데이터 연동이 팀 지시로 확정, (c) 소득 스코프 확장(종합소득 신고자 Exact-input), (d) 성향을 프로필 병렬 계산으로 처리, (e) 앱 화면 Surface Binding 추가 |
| 상태 | 아키텍처 동결 · 구현 계약 확정 · 세법 파라미터 값은 원문 대조 전 미확정 |
| 합의 경위 | 독립 설계안 2건의 6라운드 adversarial review를 사람이 판정·병합 (이력: v1.1 §11, v1.1.1 §7, 본 문서 §11) |

> **한 문장 정의**
> 단일 권위의 정책 레지스트리가 팩트와 가능한 행동을 정의하고, 결정론적 코어가 생애 현금흐름을 계산하며, 명시된 유한 전략 공간을 전수 비교해 비지배 플랜 집합을 제시하고, AI는 비권위적 입력 구조화와 승인된 범위 내 설명만 담당하는 시스템.
>
> **최종 라벨**: "지원 범위가 명시된 결정론적 엔진이며, 독립 계산 경로로 검증됨."

> **미션**
> 사람마다 다른 성향을 시스템이 점수로 뭉개 하나의 답을 대신 정해주는 것이 아니라, 각 성향이 선택할 수 있는 경로들의 **세후 결과를 완전신뢰 수준으로 계산해 나란히 제시**하고, 최종 선택은 사용자가 하게 만드는 것.
>
> 근거: 고배당·성장·밸런스 사이에는 객관적 우열이 존재하지 않는다. 존재하지 않는 정답을 계산하는 척하면 (a) 교환 계수의 근거를 댈 수 없어 완전신뢰가 깨지고, (b) 금융분야 AI 가이드라인의 보조수단 원칙에 반한다. 반면 각 경로의 세후 결과를 정확히 계산하는 일은 객관적으로 가능하다. **성향은 풀어야 할 문제가 아니라 계산을 분기시키는 입력이다.**

---

## 0-A. 제품 정의 (요구사항 v2 — v1.3에서 재정의)

### 0-A.1 사용자가 묻는 것

> "은퇴 후 월 X원이 **세후로** 손에 들어오게 하려면, 지금부터 월 얼마를, 어느 계좌에, 어떤 순서로 넣어야 하는가."

계좌 선택이 핵심 난제인 이유: 같은 월 X원이라도 그 현금흐름이 어느 계좌에서 발생하는지에 따라 세후 금액이 갈린다. 따라서 **필요 자산 규모와 계좌 배치는 순차 문제가 아니라 연립 문제다** — 배치가 필요 규모를 바꾸고, 규모가 다시 배치를 바꾼다. 고정 우선순위 규칙으로는 풀 수 없으며, 축적·수령 전략 조합을 후보로 만들어 시뮬레이터가 통째로 채점하는 §6.1 구조가 이 문제 형태를 위해 존재한다.

### 0-A.2 입출력 계약

| 구분 | 항목 | 출처 |
|---|---|---|
| **목표** | `RetirementIncomeGoal` — 은퇴 시작 나이 + **지급 종료 시점(기본: 평생 / 옵션: 특정 나이까지)** + 목표 월 세후 실질액 + 충족 규칙 + (선택) 잔여 목표액 | 사용자 입력 (§0-A.3) |
| **배경** | 보유 계좌·잔액·당해 납입액·개설일·만기일·보유상품 | 마이데이터 (§5.7) |
| | 소득 유형·총급여 또는 종합소득금액·산출세액 | 사용자 확인 입력 (마이데이터 미제공) |
| | 비상자금, 예정 지출(주택·학자금 등) | 사용자 입력 |
| **성향** | 고배당형 / 성장형 / 밸런스 (+ 위험·유동성 제약) | 룰 기반 설문 → 프로필 (§6.1.7) |
| **출력** | 성향 프로필별로: 필요 월 저축액 · 계좌 배치 시퀀스 · 수령 전략 · 세후 현금흐름 경로 · 근거 | 엔진 (선택은 사용자) |

### 0-A.3 은퇴 목표 계약 [v1.3.1 확정]

지급 종료 시점이 없으면 필요 저축액이 **수학적으로 하나로 정해지지 않는다** (60→70세 지급과 60→95세 지급은 필요 자산이 전혀 다름). 따라서 목표는 단일 금액이 아니라 계약이다.

```ts
interface RetirementIncomeGoal {
  retirementStartAge: number;

  horizon:
    // v1.4: "LIFETIME"을 제거한다. 확률적 생존 모델도 종신연금(생존위험 인수)도 없이
    // 유한 자산으로 "평생"을 계산하면 숨은 종료 연령이 존재하게 되므로 정직하지 않다.
    | { mode: "UNTIL_PLANNING_AGE"; planningEndAge: number; planningAgeSource: string }  // 기본값
    | { mode: "UNTIL_AGE"; endAge: number };
    // ANNUITIZED_LIFETIME(종신연금 결합)은 v2. 그때까지 "평생 보장" 문구 사용 금지.

  targetMonthlyRealAfterTaxIncome: KRW;   // 실질 기준

  incomeRule: "FLOOR_EVERY_MONTH" | "ANNUAL_AVERAGE";  // 기본값 FLOOR_EVERY_MONTH
  minimumLegacyReal?: KRW;                              // 종료 시 남길 실질 자산

  subject: "INDIVIDUAL";        // v1은 개인 기준. 부부·가구 합산은 범위 밖 (§0-A.7)
  scope: "CUBE_PORTFOLIO_ONLY"; // §0-A.4 — 총 생활비가 아니다

  robustness: {                 // 확률이 아니라 시나리오 집합으로 표현 (§0-A.7 참조)
    mode: "SCENARIO_SET";
    scenarioSetVersion: string;  // 보수/기준/낙관 + 은퇴 직전·직후 급락 스트레스
    requireFloorUnder: string[]; // 이 시나리오들에서도 floor를 지켜야 하는 목록
  };
}
```

`robustness`를 확률("성공률 87%")로 표현하지 않는 이유는 §0-A.7에 있다. v1은 **명시된 시나리오 집합에서의 충족 여부**로만 강건성을 말한다.

기본값은 **UNTIL_PLANNING_AGE + FLOOR_EVERY_MONTH**이며, `planningEndAge`는 사용자가 지정하거나 출처가 명시된 기본값(생명표 등, `planningAgeSource`에 기록)을 쓴다. 결과 문구는 "만 X세부터 **계획 종료 연령 만 Y세까지**"로 표기하고, "평생"이라는 표현을 쓰지 않는다. 평균 충족(ANNUAL_AVERAGE)을 기본으로 두면 "평균은 월 300만인데 어떤 해에는 200만"인 플랜이 성공으로 처리되므로, 기본은 **최저 보장(floor)** 이어야 한다.

`LIFETIME` 모드는 수명 가정 버전을 명시적으로 참조하며, 결과에 가정 카드로 노출한다.

### 0-A.4 목표의 범위 정의 — CUBE는 무엇을 만드는가 [v1.3.1 확정]

**CUBE가 계산하는 목표는 "총 은퇴 생활비"가 아니라 "CUBE가 관리하는 절세계좌·일반계좌 포트폴리오가 만들어내는 월 세후 현금흐름"이다.** 국민연금·DB 퇴직연금·임대소득 등 외부 은퇴소득은 v1 계산 범위 밖이다.

이 결정은 스코프 축소이며, 다음 두 장치로 오해를 차단한다 (장치 없이는 목표 과대설정 위험).

1. **입력 문구 계약**: 목표 입력 질문은 반드시 "CUBE 포트폴리오로 만들 월 목표 금액"으로 표기한다. "은퇴 후 필요 생활비"로 묻는 것을 금지한다 — 사용자가 총 생활비를 입력하면 외부 소득만큼 과대 저축 결과가 나온다.
2. **외부 은퇴소득은 최적화 대상이 아니지만 세무 상태에는 반드시 포함한다 [v1.4 정정 — 중대]**

   기존 설계는 "목표액에서 단순 차감만"이었다. 이는 **내부 모순**이다 — 같은 문서가 "계좌별 고정세율 모델은 틀렸다, 세후 금액은 전체 소득 상태와 연동된다"고 선언하면서 외부 연금·금융소득을 세무 상태에서 배제하면, CUBE 인출액의 과세 판정(연금소득 총액 경계, 금융소득 합산)이 체계적으로 틀린다. 공적연금 수급자가 다수인 은퇴 인구에서 이는 세금 과소평가로 직결된다.

   정정된 계약: **금액·수령 방식은 최적화하지 않는다(외생). 그러나 같은 연도 세무 상태에는 합산한다.**

```ts
interface ExternalIncomeSchedule {
  streamId: string;
  incomeType: "NATIONAL_PENSION" | "PUBLIC_PENSION" | "DB_PENSION"
            | "PRIVATE_ANNUITY" | "RENTAL" | "EARNED" | "BUSINESS" | "OTHER";
  taxCharacter: string;        // 합산 판정에 필요한 과세 성격 (규칙 ID 참조)
  grossOrNet: "GROSS" | "NET";
  startAge: number;
  endAge?: number;
  amountRule: { mode: "CONSTANT_REAL" | "CONSTANT_NOMINAL" | "SCHEDULE";
                value: KRW; schedule?: unknown };
  withholdingRule?: string;
  confidence: "VERIFIED" | "USER_CONFIRMED" | "RANGE_ESTIMATED" | "UNKNOWN";
}
```

   신뢰도별 처리(§5.7.1과 동일 원칙): VERIFIED·USER_CONFIRMED → 합산 계산. RANGE_ESTIMATED → 세금 결과를 범위로 표시. **UNKNOWN → "세금 반영 후 금액 계산 불가"로 표시하고 세전 부족분만 제시**(임의 가정으로 봉합 금지).

   v1 진입 조건: 사용자가 (a) 유의미한 외부 은퇴소득이 없음을 확인하거나 (b) 위 스케줄을 입력해야 한다. 둘 다 불가하면 세후 판정을 수행하지 않는다.

   목표액 차감은 그대로 유지한다: `엔진 목표 = targetMonthlyRealTaxAdjusted − Σ(해당 시점 유효 외부소득 세후 상당액)`.

### 0-A.5 저축 여력 계약 [v1.3.1 신규]

필요 저축액을 계산해도 **사용자가 실제로 낼 수 있는지 비교하지 않으면 어시스트가 반쪽이다.**

```ts
interface ContributionCapacity {
  currentMonthlyNetCapacity: KRW;        // 현재 월 실투자 여력 (순부담 기준)
  maximumMonthlyNetCapacity?: KRW;
  annualBonusContribution?: KRW;
  incomePath:
    | { mode: "CONSTANT_REAL" }                                  // 기본값
    | { mode: "USER_SCHEDULE"; periods: IncomePeriod[] }          // 육아·주택 등 저축 감소 구간
    | { mode: "SCENARIO"; assumptionVersion: string };
  fixedObligations: CashflowObligation[];                          // 대출 상환 등
}
```

출력은 반드시 **필요액 vs 여력 vs 부족분 + 조정 옵션**(은퇴 연기 / 목표 조정 / 보너스 납입 / 기간 조정)을 함께 제시한다.

### 0-A.6 납입액의 두 정의 [v1.3.1 신규]

"월 얼마 투자"는 두 숫자다. 하나만 보여주면 사용자가 실제 부담을 오해한다.

```ts
interface ContributionResult {
  monthlyGrossContribution: KRW;        // 계좌에 실제 입금되는 금액
  monthlyNetOutOfPocketCost: KRW;       // 세액공제 환급 반영 후 경제적 순부담
  peakGrossMonthlyOutflow: KRW;         // [v1.4] 환급 전 최대 현금유출 — 유동성 부담의 실체
  expectedAnnualTaxCredit: KRW;
  taxCreditTreatment: "REINVEST" | "USE_FOR_CONSUMPTION" | "REDUCE_NEXT_CONTRIBUTION";  // 기본 REINVEST
}
```

**납입 계약 (ContributionContract) [v1.4 신설]**: "월 N원"이 20년간 어떻게 변하는지가 정의되지 않으면 필요 저축액이 결정되지 않는다(명목 고정과 물가 연동은 총 부담이 크게 다르다).

```ts
interface ContributionContract {
  startDate: string; endDate: string;         // KST LocalDate
  paymentFrequency: "MONTHLY" | "ANNUAL";
  firstYearGrossContribution: KRW;
  escalationRule: "NOMINAL_FIXED" | "INFLATION_LINKED" | "INCOME_LINKED" | "CUSTOM_SCHEDULE";
  customSchedule?: unknown;
  refundTiming: string;                        // 환급 발생 시점 (정책 규칙 참조)
  refundUse: "REINVEST" | "REDUCE_NEXT_CONTRIBUTION" | "CONSUME";
  maximumGrossMonthlyOutflow?: KRW;            // 제약: 환급 전 현금유출 상한
  minimumLiquidityAfterContribution?: KRW;
}
```

환급금 처리 방식(재투자 / 소비 / 차기 납입 차감)은 은퇴 결과를 바꾸므로 **가정으로 명시**하고 결과 화면에 표기한다. 최적화의 목적함수는 `monthlyNetOutOfPocketCost` 최소화다(§6.1.2).

### 0-A.7 계산에 포함하지 않는 것 — 명시적 비포함 목록 [v1.3.2 신설]

**원칙: 모델링하지 않는 것은 침묵하지 않고 선언한다.** "월 X원이 손에 들어온다"는 표현은 무엇을 차감한 뒤의 금액인지가 명시되지 않으면 거짓이 된다. 아래 항목은 v1에서 계산하지 않으며, **결과 화면에 비포함 사실을 반드시 표기한다.**

| 비포함 항목 | 왜 v1에서 못 하는가 | 필수 표기 |
|---|---|---|
| **건강보험료(지역가입자 전환·피부양자 자격)** | 세법 밖 제도이고 재산·가구 구성까지 필요하며, 소득 산정 방식이 별도 규정 체계를 따른다. 추정하면 근거 없는 숫자가 판단에 섞인다 | "본 금액은 **세금만 반영**했으며 **건강보험료 등 준조세는 반영하지 않았습니다**" — 결과 카드에 상시 노출. **선택적 민감도 도구**: 사용자가 부담률을 직접 입력하면 그 가정 하의 충족률 변화를 보여준다(시스템이 비율을 추정하지 않으며 "사용자 가정" 라벨 필수) |
| 기타 준조세·복지 자격(기초연금 등) | 동일 | 동일 문구에 포함 |
| **고금리 부채 상환 vs 투자 비교** | 자금 용도 간 우선순위 판단은 투자자문 성격이 강하고 v1 스코프 밖 | 입력에 `fixedObligations`로 고금리 부채가 감지되면 "부채 상환 우선순위는 본 계산에 포함되지 않았습니다" 경고 |
| **확률적 성공률(예: "87% 달성")** | 수익률 분포 모델을 검증하지 않았다. 검증 없는 확률 표기는 정밀함을 위장한다 | 확률 대신 시나리오별 결과·부족액을 제시 |
| 부부·가구 합산 최적화 | v1은 개인 기준 | "개인 기준 계산입니다" |
| 미래 세법 개정 | PROPOSED 격리 원칙(§5.1) | "현행법 유지 가정" |
| 외부 은퇴소득의 **금액·수령전략 최적화** | 외생 변수로 취급 (과세 합산은 §0-A.4에 따라 **포함**) | "외부소득은 입력값 기준으로 세무 상태에만 반영했으며 최적화 대상이 아닙니다" |

**중요**: 이 목록은 약점 은폐의 반대다. 비포함을 선언하지 않은 시스템은 "정확한 계산"이 아니라 "범위를 숨긴 계산"이며, 이 프로젝트의 "완전신뢰" 정의(§1.2)에 정면으로 어긋난다. v2 확장 후보 우선순위는 건강보험료 > 가구 합산 > 확률 모델 순이다.

### 0-A.8 목표 변수 재정의가 낳는 필수 변경

1. **실질/명목 구분이 선택이 아니라 필수** — 25년 뒤 명목 X원은 다른 돈이다. 물가 가정이 `assumptionSet`의 필수 요소가 되고, 목표액·결과 모두 실질 기준으로 표기한다.
2. **수령 단계가 주인공으로 승격** — 제품 목표가 수령 시점에 정의되므로 연금수령한도·연령별 세율·연간 총액 경계·ISA 만기 처리 조문이 §12 원문 대조 **1순위**가 된다.
3. **모드 역전** — 모드 B(목표 역산)가 주 UX, 모드 A(배분)는 그 하위 단계 (§6.1.6).
4. **신규 메커니즘 2종** — 계좌별 배당 과세, 금융소득종합과세 경계 (§5.3.1). 배당 중심 목표에서는 엣지 케이스가 아니라 중심 규칙이다.

---

## 0. 문서 규칙

- **확정하는 것**: 아키텍처, 계층 분리, 전 컴포넌트의 타입·계약, 실행 순서, 검증 체계, v1/v2 경계, AI 역할 경계.
- **확정하지 않는 것**: 세법 파라미터의 **값**. 계산에 쓰이는 값은 본문에 존재하지 않으며 §12 체크리스트 → 원문 대조 → 검토 승인 → 정책 팩 경로로만 태어난다. `<원문 대조 후 기재>` 자리에 임시 숫자를 넣는 행위는 금지된다 (미검증 값 사용 시 런타임은 `UnverifiedPolicyError`로 실패해야 한다).
- **v1 사용자 스코프**: 신규 납입 플랜 한정 (§4.1). 번복 시 최소 이벤트 기록이 v1로 편입.
- 입법 연혁 등 계산에 쓰이지 않는 역사적 사실은 §9에 한해 각주 구분으로 기재.

---

## 1. 제품 정의

### 1.1 두 개의 요구, 하나의 진실 원천

FACT(팩트 제공)와 PLAN(개인 플랜)은 **동일한 Authoritative Policy Registry**를 진실 원천으로 공유한다. 같은 질문에 두 경로가 다른 규칙·버전으로 답하는 split-brain을 구조적으로 금지한다.

```text
                Authoritative Policy Registry (단일 권위)
                     ↙                        ↘
        Structured Fact Resolver          Deterministic Core
                ↓                                ↓
           FACT 응답                          PLAN 계산
                ↑
     Citation-locked RAG (보조)
     : 조문 원문 탐색·설명, 미모델 질의 처리(§1.2)
```

**원칙**: RAG는 팩트를 결정하지 않는다. Registry의 구조화 규칙이 팩트를 결정하고, RAG는 근거 원문을 찾아 보여주고 설명한다. FACT 응답에는 PLAN과 동일한 규칙 ID·정책 버전이 표기된다.

### 1.2 FACT 출력 2클래스

```ts
type FactAnswerClass = "REGISTRY_RESOLVED_FACT" | "UNMODELED_OFFICIAL_SOURCE";
```

| | REGISTRY_RESOLVED_FACT | UNMODELED_OFFICIAL_SOURCE |
|---|---|---|
| 조건 | Registry rule ID 존재, 조건 분기 결정 가능 | 공식 원문은 확보, 구조화 규칙 미편입 |
| 라벨 | ① 공식 팩트 | 원문 인용 (팩트 결론 아님) |
| 개인 상황 적용 | 가능 (조건 분기형 응답) | **금지** |
| PLAN 엔진 입력 | 가능 (동일 규칙 ID) | **금지** |
| 후속 | — | 검토 후 신규 rule 후보로 이관 (§2.2 트랙) |

UNMODELED 표준 문안: "관련 공식 조문은 확인됐지만, 해당 사안은 아직 큐브의 검증된 정책 규칙으로 모델링되지 않았습니다. 원문 근거와 시행일은 아래와 같으며, 개인별 계산에는 적용하지 않습니다."

### 1.3 출력 3분류와 "완전신뢰"의 적용 범위

| 분류 | 정의 |
|---|---|
| ① 공식 팩트 | 현행 법령·공식 자료에서 확인된 내용 (Registry 규칙 + 원문 인용) |
| ② 확인 입력 기반 결정론적 계산 | ① + 검증·확인된 사용자 입력만으로 재현 가능한 계산 |
| ③ 가정 기반 전망 | 명시된 가정(수익률·물가·은퇴연령·현행법 유지)하의 시뮬레이션 |

입력에 `SYSTEM_ESTIMATED` 값이 포함되면 ② 대신 "추정 입력 기반 계산"으로 라벨하고 "확정" 표현을 금지한다(§5.4 모드).

**재현성 정의**: 동일한 확인 입력, 정책 스냅샷, 계좌 spec, 전략 커버리지, 상품 데이터, 가정 세트, 엔진 빌드에서 동일 결과가 재현된다. 재현성의 단위는 RunManifest(§5.6)다. "완전신뢰" 주장은 ①·②에만 적용한다.

### 1.4 출력 이원화와 롤링 플랜

(1) 현행 시행 법령 기준 **올해의 행동 계획**(①·②)과 (2) "현행법 유지 가정" 명시된 **장기 전망**(③)으로 분리 제시. 큐브는 고정 장기 계획 발행기가 아니라 매년 갱신되는 롤링 플랜 서비스다.

---

## 2. 아키텍처

### 2.1 런타임 파이프라인 (동결)

```text
사용자 자연어
      ↓
Intent Router ── FACT ──→ Structured Fact Resolver(+RAG 보조) → FactAnswerManifest 포함 응답
      │ PLAN
      ↓
LLM Structured Parser              (비권위적 추출)
      ↓
Schema Validation                  (형식·범위)
      ↓
Semantic Validation                (소득 개념 혼용·납입액 모순·공제 모순 검출)
      ↓
사용자 확인 게이트                   ("이렇게 이해했습니다" 승인)
      ↓
Authoritative Input State + RunManifest 생성
      ↓
Scope & Compliance Gate            (범위 밖 → 거절 + 안내)
      ↓
Policy Snapshot Resolver           (조회일 기준 유효 규칙 계산 — §5.1)
      ↓
User / Account / MoneyBucket State
      ↓
┌─────────────────────────────────────┐
│        CUBE Deterministic Core       │
│  이벤트 시간순 실행 (§5.3.4 정렬 키)  │
│  Eligibility & Constraint Engine     │
│  Tax Calculator      (②)             │
│  Projection Engine   (③)             │
│  Plan Evaluator                      │
│  Optimizer (모드 A: 배분 / B: 역산)  │
└─────────────────────────────────────┘
      ↓
Coverage-bounded Pareto Set (@ strategyCoverageVersion)
      ↓
대표안 선택 (§6.1.5 규칙)
      ↓
결과 조립: RunManifest · 3분류 라벨 · input provenance · rule_trace
          · decision_trace · 가정 카드 · 미확인 항목
      ↓
Claim-whitelisted Explanation Renderer (§7)
```

### 2.2 유지보수 트랙 (법 개정 대응)

```text
1. 변경 감지 (국가법령정보센터·국세청·기획재정부)
2. 원문 스냅샷 저장 + 해시
3. AI-1이 신구조문 diff 및 정책 팩 변경 초안 작성
4. AI-2가 독립적으로 반례·누락 조건 공격 (불일치 시 자동 보류)
5. 세무·법무 검토자 승인 (Maker) → 별도 승인자 확인 (Checker)
6. 정적 스키마 검증 + 골든·경계·속성 테스트 + 기존 케이스 영향도 리포트
7. 새 정책 버전 태깅·배포 (이전 버전 영구 보존)
```

**런타임 코드 불변의 정확한 범위**: 값 변경·기존 메커니즘 조합의 신규 계좌는 런타임 코드 무변경. 새 메커니즘은 MechanismHandler 플러그인(§5.3)으로 국소 확장하며 Optimizer·기존 핸들러는 불변.

---

## 3. 핵심 설계 원칙 (동결)

| # | 원칙 |
|---|---|
| P1 | **AI 출력은 비권위적.** 검증·확인 통과 후에만 계산 입력이 되며, AI는 세율·자격·계산·채점·정책 배포를 수행하지 않고 설명은 승인된 claim 안에서만 생성 |
| P2 | **정책은 코드가 아니라 버전 데이터.** 시간 상태는 저장하지 않고 조회 시점에 계산 |
| P3 | **단일 진실 원천.** FACT·PLAN 동일 Registry, 상품 편입 판정은 단일 함수(§5.5), 과세 분류는 Registry가 결정(§5.5) |
| P4 | **계좌는 이름이 아니라 성질로 해석.** 계좌명 분기 금지, MechanismHandler로만 작동 |
| P5 | **상태는 잔액이 아니라 Money Bucket.** 세무 성격(taxCharacter)과 유입 경로(originType)를 분리 보존 |
| P6 | **출력 3분류 + provenance.** 모든 입력에 출처 태그, 모든 출력에 분류 라벨 |
| P7 | **범위 밖 = 거절.** 단, 근거 충돌은 권위 축·서열(§5.1)로 우선 판정 후 해소 불가 시에만 거절 |
| P8 | **오류가 숨을 수 없는 구조.** RunManifest, trace 전면 공개, 독립 계산 경로, Maker–Checker, 조문 연결 테스트 |

---

## 4. Contract ① — Scope & Compliance

### 4.1 v1 사용자 스코프 [결정: 신규 납입 플랜 한정]

| 구분 | v1 지원 | v1 거절 (→ 전문가 안내) |
|---|---|---|
| 소득 | **① 근로소득 단일 소득자** (총급여 기준, Exact + Estimate 모드)<br>**② 종합소득 신고자(개인사업자 등) — Exact-input 모드 한정** (신고서·홈택스의 확정 종합소득금액·산출세액 입력 필수) | 사업소득 **산출세액 추정** 요청(경비율·장부 기반) → 거절 + 세무 전문가 안내<br>현재 금융소득종합과세 대상자<br>복수 소득 정밀 상호작용 |
| 거주 | 세법상 거주자 | 비거주자·이중과세 케이스 |
| 플랜 유형 | 목표 역산(주) + 올해 배분 + 장기 전망 | 기존 계좌 정밀 진단, 퇴직금 원천 IRP, 중도해지 시나리오 |
| 계좌 상태 | 마이데이터 또는 사용자 입력 기준의 잔액·당해 납입액·개설일·만기일 | 과거 공제 이력(taxCharacter) 재구성 필요 케이스 (§5.7 미제공 항목) |
| 상품 범위 | 절세 3종 계좌 + 일반계좌 **범위 내** 최적 | 3종 계좌 밖 절세 수단(노란우산공제 등) — FACT는 UNMODELED 원문 안내, PLAN 계산 제외 |

**소득 스코프 확장 근거 (v1.3)**: 소득 유형이 로직에 닿는 지점은 ① 세액공제율 분기(총급여 vs 종합소득금액) ② ISA 서민형 자격 기준 ③ 산출세액 산정 — 세 곳뿐이다. ①②는 법 자체가 이미 두 브랜치를 규정하므로 규칙 2건 검증 추가로 끝난다. 검증 표면적이 폭발하는 것은 ③뿐이며, **Exact-input 모드(확정 신고값 입력)로 우회하면 파이프라인 나머지는 무변경**이다. 원칙 표현: "사장님의 세금을 추측하지 않는다. 신고된 확정값 위에서만 계산한다."

**기존 계좌 정밀 진단 제외 근거**: 과거 이력 복원·인출 순서 재구성 요구로 v1 검증 표면적 초과. 마이데이터를 연동해도 이 결정은 불변 — 규격이 세액공제 이력을 제공하지 않고 거래내역도 5년으로 제한되기 때문(§5.7). (기존 A4 산출물은 대체재가 아니라 UI·게이트 개념 PoC로만 재사용.)

### 4.2 거절 조건

소득 개념 불명확 / 시행법·개정안 혼재로 답이 갈림 / 편입 여부가 회사별로 확인 불가 / 권위 축·서열로 해소 불가한 공식 자료 충돌 / 필수 입력 미해소 / 미래 세법 확정 가정이 필요한 질의.

### 4.3 컴플라이언스 게이트 [출시 게이트]

**출력 계층별 규제 분류 [v1.4 신설]**: "특정 종목을 추천하지 않는다"만으로 규제 이슈가 종료되지 않는다. 금융소비자보호법상 투자성 상품 권유·자문에는 적합성 확인·설명의무가 연결될 수 있으므로, 출력을 계층으로 분리하고 **계층별로 컴플라이언스 승인 상태와 허용 채널을 따로 관리**한다.

```text
TAX_ONLY_ANALYSIS            세금 계산·비교만
ACCOUNT_ALLOCATION_GUIDANCE  계좌 간 배분 제시
ASSET_CLASS_LOCATION         자산군의 계좌 배치 제시
PRODUCT_IMPLEMENTATION       특정 상품·수량·시기
```

자본시장법 §6⑦ 투자판단 정의는 종목뿐 아니라 **종류·취득처분·방법·수량·가격·시기**를 포함한다. "자산군 수준이면 안전" 가정은 폐기. 추천 기능의 입력·출력·개인화 수준·상품 연결·실행 기능 전체를 컴플라이언스가 분류하며, 분류 완료가 출시 조건. v1 출력 상한: 계좌 우선순위, 세금 시뮬레이션, 자산군 세무 특성 비교, 복수 시나리오. 종목·수량·가격·시기 추천 및 주문 연결은 의도적 제외.

### 4.4 제품 문구 규칙

| 금지 | 사용 |
|---|---|
| "가장 최적의 절세 계획" | "v1 지원 범위에서 생성·검증된 플랜 중 선택 기준별 최상위 플랜" |
| 전망 포함 결과에 "절약됩니다" 단정 | "연 X% 수익률 가정 시 …로 전망됩니다 (가정 카드 참조)" |
| 추정 입력 결과에 "확정" | "입력하신 추정 산출세액 기준 계산입니다" |
| **"세후 월 X원" · "실수령액" · "손에 들어오는 금액"** [v1.4] | **"세금 반영 후 CUBE 인출 현금흐름"** (짧은 UI: "세금 차감 후"). 툴팁: "소득세·지방소득세를 반영한 금액입니다. 건강보험료·장기요양보험료 등 준조세는 포함되지 않습니다" |
| "평생" · "평생 보장" | "계획 종료 연령 만 N세까지" |
| "최저 보장 충족" | "지정된 스트레스 시나리오 전부에서 목표 충족" (시나리오 밖 보장을 뜻하지 않음을 병기) |

---

## 5. Contract ② — Domain Model

### 5.1 Policy Schema & Source Governance

세 축 분리. **시간 상태는 저장하지 않고 조회 시점에 계산한다.**

```yaml
policy_snapshot: KR-TAX-2026-07-29.1

rule:
  id: PENSION.TAX_CREDIT.RATE.LOW_INCOME

  lifecycle:
    status: ENACTED            # PROPOSED / ENACTED / REPEALED
  authority:
    type: STATUTE              # DECREE / RULE / ADMIN_GUIDANCE / PROVIDER_POLICY
    delegated_by: null         # 위임 근거 (시행령→법률 등)
    applies_to: TAX_TREATMENT  # TAX_TREATMENT / AVAILABILITY / ...
    conflict_group: PENSION_TAX_CREDIT
  temporal:
    promulgated_at: <공포일>
    valid_from: <시행일>
    valid_to: null
    recorded_at: <수록일>
  scope:
    jurisdiction: KR
    tax_years: [2026]

  conditions:
    branches:
      - income_type: salary_only
        total_salary_lte: <원문 대조 후 기재>
      - income_type: comprehensive
        comprehensive_income_lte: <원문 대조 후 기재>
  effect:
    value: <원문 대조 후 기재>
    unit: RATE                 # 국세 기준. 지방소득세 포함율은 파생값
    rounding:
      stage: <원문 대조 후 기재>
      mode: <원문 대조 후 기재>
      unit_krw: <원문 대조 후 기재>

  sources:                     # 배열 + 필드 바인딩
    - { source_id: LAW_x, role: PRIMARY }
    - { source_id: DECREE_x, role: IMPLEMENTING_DETAIL }
    - { source_id: GUIDE_x, role: ADMIN_INTERPRETATION }
  field_bindings:
    effect.value: [LAW_x]
    conditions: [DECREE_x]
    effect.rounding: [RULE_x]

  review:
    approved: false            # 승인 전 배포 불가
    reviewer_id: null
    reviewed_at: null
```

- 유효성(런타임): `lifecycle.status == ENACTED AND valid_from <= query_date AND (valid_to IS NULL OR query_date < valid_to)`. `PROPOSED`는 계산 사용 금지(참고 표시만), `REPEALED`는 과거 재현 전용.
- **충돌 해소**: 동일 `applies_to` + 동일 `conflict_group` 내에서만 `법률 → 시행령 → 시행규칙 → 공식 해석·행정안내 → 금융회사 정책` 서열 적용. 축이 다르면 충돌이 아니라 병렬 적용. 서열로 해소 불가 시에만 거절.
- 불변식: PRIMARY source 없이 effect 기재 불가. `review.approved == false` 규칙은 배포 제외. 버전은 덮어쓰지 않고 누적.

### 5.2 수치·직렬화 계약

**금액에 부동소수점 사용 금지.**

```ts
type IntegerString = string;   // 정본 10진 정수 문자열 (분모·단위 등 금액이 아닌 정수도 포함)
type KRW = bigint;             // 도메인 내부: 정수 원
type KRWString = IntegerString; // 경계에서의 금액 표현 (의미상 금액인 IntegerString)
                               // 선행 0 금지("001000" 불가), -0 금지(항상 "0"), + 부호 금지

// 구현 강화 허용: 위 타입들은 brand(phantom unique symbol) 로 nominal 화해도 된다.
// 구조가 동일한 ExactKRW/ExactQuantity/DecimalRate 의 상호 대입과, 검증되지 않은 생 문자열이
// 해시 경로에 유입되는 것을 컴파일 시점에 차단하기 위함이다. brand 는 런타임 필드를 만들지 않으며
// symbol key 는 Object.keys / JSON.stringify 에 열거되지 않으므로 canonical JSON·해시에 영향이 없다.

interface DecimalRate {        // 세율·비율: 유리수 보존
  numerator: bigint;
  denominator: bigint;         // 불변식: denominator > 0, gcd(|num|, den) == 1
}

interface RoundingSpec {
  stage: "PER_TRANSACTION" | "PER_YEAR" | "PER_ACCOUNT" | "FINAL_RESULT";
  mode: "FLOOR" | "CEIL" | "HALF_UP" | "TRUNCATE";
  unitKrw: bigint;             // 불변식: unitKrw > 0 (TS 계층 표기 — 정책 팩에서는 unit_krw)
}
// 음수 의미 고정: FLOOR=음의 무한대 방향, CEIL=양의 무한대 방향,
// TRUNCATE=0 방향, HALF_UP=정확히 절반이면 절대값 커지는 방향
```

**정본 직렬화·해시 절차** (`confirmedInputHash`, 스냅샷 해시, trace 저장에 공통):

```text
1. bigint → 10진수 문자열
2. 객체 key를 사전순 정렬
3. UTF-8 canonical JSON 생성
4. SHA-256
```

반올림 시점·방식·단위는 코드가 아니라 정책 데이터(`effect.rounding`)로 명시한다. 독립 기준 계산기(§6.2)는 **같은 명세를 공유하되 같은 반올림 함수 구현을 import하지 않는다** — TypeScript/Python 각각 독립 구현하고 중간값까지 비교한다:

#### 5.2.1 numeric 모듈 API 계약 [v1.3.1 — 구현 착수 전 확정]

**2단계 구조**: 정확한 유리수 연산과 반올림을 분리한다. 연산 중간에 암묵적 반올림이 일어나지 않는다.

```ts
// 미반올림 정확 금액. DecimalRate와 구조는 같으나 의미(금액 vs 비율)가 달라 별도 타입으로 둔다.
interface ExactKRW { numerator: bigint; denominator: bigint }  // 불변식: denominator > 0, gcd 정규화

function fromKRW(v: KRW): ExactKRW
function multiply(a: ExactKRW, r: DecimalRate): ExactKRW
function add(a: ExactKRW, b: ExactKRW): ExactKRW
function sub(a: ExactKRW, b: ExactKRW): ExactKRW
function compare(a: ExactKRW, b: ExactKRW): -1 | 0 | 1

// 나눗셈: 금액 ÷ 금액 = 비율 (minimumIncomeCoverageRatio 등)
function ratio(a: KRW, b: KRW): DecimalRate            // b === 0n 이면 throw
function divideExact(a: ExactKRW, b: ExactKRW): DecimalRate   // b === 0 이면 throw

// 수량(좌수) — 금액도 비율도 아니므로 별도 nominal 타입
interface ExactQuantity { numerator: bigint; denominator: bigint }  // 불변식 동일
function multiplyQuantity(q: ExactQuantity, r: DecimalRate): ExactQuantity
function quantityTimesPrice(q: ExactQuantity, unitPrice: ExactKRW): ExactKRW
function compareQuantity(a: ExactQuantity, b: ExactQuantity): -1 | 0 | 1

interface RoundingRecord {          // §6.2 differential의 중간값 비교 단위
  // [v1.4 정정] 실제로 "금액"인 것은 roundedKrw 하나뿐이다.
  // rawNumerator는 분모로 나누기 전의 스케일된 정수이고, rawDenominator·unitKrw는 애초에
  // 금액이 아니다. brand로 KRWString ⊂ IntegerString이 되었으므로 이 구분이 타입에 드러난다.
  rawNumerator: IntegerString;
  rawDenominator: IntegerString;
  roundingStage: RoundingSpec["stage"];
  roundingMode: RoundingSpec["mode"];
  unitKrw: IntegerString;
  roundedKrw: KRWString;
}
function round(a: ExactKRW, spec: RoundingSpec): { value: KRW; record: RoundingRecord }
```

**`ExactKRW`의 생성 경로도 제한한다**: 공개 생성자(`exactKRW(n, d)`)를 두지 않는다. `ExactKRW`는 `fromKRW()` + 연산으로만 만들어지며, 분모가 1이 아닌 값이 필요한 테스트도 `multiply(fromKRW(n), decimalRate(1n, d))`로 구성한다. 테스트가 우회 경로를 뚫으면 그 경로는 프로덕션에서도 열린다.

**`ExactKRW → KRW`의 유일한 출구는 `round()`다.** `toKRW` 류의 변환 함수를 두지 않는다 — "암묵적 반올림 없음"을 타입 수준에서 강제하기 위함이다. 반올림이 불필요한 경우(분모 1)에도 `unitKrw = 1n` 스펙으로 `round()`를 통과시킨다. 정말로 무반올림 경로가 필요해지면 `round()`의 제약을 완화하지 말고 `toKRWExact()`(분모 ≠ 1이면 throw)를 별도로 추가한다.

`RoundingSpec.stage`는 **numeric이 해석하지 않는다.** 언제 `round`를 호출할지는 Calculator가 결정하고, numeric은 stage를 `RoundingRecord`에 태그로 실어 trace·differential에 전달한다.

**KRWString 정본 규칙** (해시 안정성 요건 — 표현이 유일해야 한다)

- 허용: `0` 또는 `-?[1-9][0-9]*`
- 금지: `+` 부호, 선행 0, `-0`, 소수점, 지수 표기, 공백, 빈 문자열, 천단위 구분자
- 위반 입력은 조용히 보정하지 말고 throw

**canonical JSON 규약** (RFC 8785/JCS 기반 + 추가 제약)

- **key는 ASCII만 허용** (`[A-Za-z0-9_]`), 코드포인트 오름차순, 중첩 객체에 재귀 적용. 비ASCII key는 throw — UTF-8 바이트 정렬(Python 기본)과 UTF-16 코드유닛 정렬(JS 기본)의 언어 간 불일치를 원천 차단한다.
- 금액은 반드시 `KRWString`. JSON number로 내보내지 않는다.
- 그 외 number 필드(나이·priority·개수 등)는 **안전 정수(`Number.isSafeInteger`)만 허용**. 소수·지수·`.0`·선행 0·`NaN`·`Infinity`·`-0` 금지. 2^53을 넘는 정수도 거부한다 — number 표현 자체가 이미 부정확하므로(입력값과 출력값이 다름) 해시에 들어가면 재현성이 조용히 깨진다. **이 제한은 TS와 Python 독립 구현이 동일하게 적용해야 한다**(한쪽만 거부하면 differential이 갈린다). 위반은 `NON_INTEGER_NUMBER`(`-0` 포함).
- **알려진 한계**: 문자열 값의 짝 없는 서로게이트(lone surrogate)는 검출하지 않는다. UTF-8 인코딩 시 U+FFFD로 치환되므로 서로 다른 두 입력이 같은 해시를 낼 여지가 원리적으로 존재한다. 실입력은 스키마 검증을 통과한 식별자·날짜·열거값뿐이라 현재 도달 불가 경로이며, 필요 시 이스케이프 단계에 서로게이트 짝 검사를 추가해 `UNSUPPORTED_VALUE_TYPE`으로 거절한다. 이 한계는 코드에 greppable 마커로 표시한다.
- `undefined` 필드는 키까지 제거. 명시적 `null`은 `null`로 보존.
- 배열 순서는 의미이므로 정렬하지 않는다.
- 토큰 간 공백 없음. 문자열 이스케이프는 `"`·`\`·제어문자(< 0x20)만 최단 형식으로. 비ASCII 문자는 이스케이프하지 않고 UTF-8 그대로 출력.
- 해시 = 위 canonical 문자열의 **UTF-8 바이트열**에 대한 SHA-256, 소문자 hex.

**입력 값 타입 규약 (전부 throw 조건 명시)**

| 입력 | 출력 | 비고 |
|---|---|---|
| `bigint` | JSON 문자열 (10진 정수) | §5.2 절차 1 |
| 정수 `number` | JSON 정수 리터럴 | 선행 0·`+`·`.0`·지수 표기 금지 |
| 비정수 `number`, `NaN`, `Infinity`, `-0` | **throw** | 정밀도·정본성 훼손 |
| `string` | JSON 문자열 (최단 이스케이프) | |
| `boolean`, `null` | 그대로 | `null`은 키 보존 |
| `undefined` (객체 값) | **키까지 제거** | |
| `undefined` (배열 원소) | **throw** | 제거하면 인덱스가 밀려 의미가 변한다 |
| `Date`, 함수, `symbol`, 클래스 인스턴스 | **throw** | 날짜는 KST `YYYY-MM-DD` 문자열로 전달 (§5.3.4) |

**오류 계약**: numeric 계층의 불변식 위반은 단일 오류 클래스 `NumericContractError`(필드 `code`)로 던진다. code 최소 집합: `KRWSTRING_FORMAT`, `DENOMINATOR_NOT_POSITIVE`, `UNIT_NOT_POSITIVE`, `DIVIDE_BY_ZERO`, `NON_ASCII_KEY`, `NON_INTEGER_NUMBER`, `UNSUPPORTED_VALUE_TYPE`, `UNDEFINED_IN_ARRAY`. (정책 값 미검증은 별개인 `UnverifiedPolicyError` — 순서 2.)

**네이밍 계약 [v1.3.2 정정]**: 규칙은 "전 계층 camelCase"가 아니라 **"레이어마다 표기법을 하나로 고정한다"**이다. key 문자열이 해시에 직접 들어가므로 같은 필드가 두 표기로 존재하는 것만이 금지된다.

| 레이어 | 표기법 | 예 |
|---|---|---|
| TS 인터페이스 및 그 직렬화 표현 | camelCase | `unitKrw`, `rawNumerator`, `roundedKrw` |
| 정책 팩 YAML (사람이 작성, 법령 대조 대상) | snake_case 유지 | `unit_krw`, `valid_from`, `field_bindings` |

직렬화기는 **ASCII `[A-Za-z0-9_]` 만 검사**하고 표기법 자체는 강제하지 않는다(언더스코어 허용이므로 정책 팩 스냅샷 해싱이 통과한다). 표기법 일관성은 각 payload의 JSON Schema가 강제한다. 즉 camelCase 강제는 TS 계층에만 적용되며, 정책 팩을 camelCase로 변환하지 않는다.

```json
{ "rawNumerator": "...", "rawDenominator": "...", "roundingStage": "PER_YEAR",
  "roundingMode": "HALF_UP", "unitKrw": "1", "roundedKrw": "..." }
```

### 5.3 계좌 모델

**5.3.1 성질 어휘 (Mechanism Vocabulary) v1** — 파라미터 값은 전부 §12 참조, 본문 미기재.

| MechanismType | 파라미터 (정책 팩에서) | 비고 |
|---|---|---|
| CONTRIBUTION_LIMIT | 연간 / 총 누적 / 계좌 간 합산 규칙 | |
| CARRYOVER | 미납입분 이월 여부·범위 | ISA |
| TAX_CREDIT | 대상액 한도(계좌별·합산), 공제율 소득 분기, 산출세액 잔여 캡 | 공제는 산출세액 차감 (§12) |
| TAX_EXEMPTION | 비과세 한도 (가입 유형 분기) | ISA |
| EXCESS_SEPARATE_TAX | 비과세 초과 수익의 분리과세 | ISA |
| TAX_DEFERRAL | 운용 중 과세 유예 | 연금저축·IRP |
| WITHDRAWAL_LOCK | 연령+가입기간 요건, 중도인출 과세 | |
| WITHDRAWAL_ORDER | 재원별 인출 순서 | 버킷과 결합 |
| PENSION_WITHDRAWAL_TAX | 연령별 원천징수율, 수령한도 산식, 한도 초과분 처리, 연간 총액 경계 + 선택적 분리과세 | 경계는 절벽이 아니라 선택지 있는 구조 |
| MATURITY | 계약기간, 만기 손익 통산 과세 | ISA 계좌 단위 통산 |
| ACCOUNT_CONVERSION | 만기 자금의 타 계좌 전환, 전환액 기반 추가 공제 특례 | 시간 의존 이벤트 |
| INSTRUMENT_GATE | 자산군 화이트리스트 + PROVIDER_POLICY 위임 | v1 자산군 레벨 |
| **DIVIDEND_DISTRIBUTION_TAX** | 계좌별 배당·분배금 과세 (일반계좌 원천징수 / ISA 비과세·초과분 분리과세 / 연금계좌 과세이연) | v1.3.1 신규. 월 배당 목표의 중심 규칙 |
| **TAXABLE_SALE_TAX** | 계획 매도 시 상품 유형별 매매 과세 (국내주식형 등 구분) | v1.3.1 신규. 총수익 인출 방식 지원 |
| **FINANCIAL_INCOME_AGGREGATION** | 금융소득종합과세 경계 및 초과 시 과세 방식 전환 | v1.3.1 신규. **현재** 대상자는 입력 거절이나, **미래 시뮬레이션의 경계 초과는 반드시 모델링** (미모델링 시 목표 달성 판정이 과대) |
| **WITHDRAWAL_PLAN** | 인출 정책별 현금흐름 생성 (분배금 / 계획 매도 / 혼합) | v1.3.1 신규 |
| **INVESTMENT_FEE** | 상품 보수·운용 비용 (연율) | v1.3.1 신규. Breakpoint 완전성에 영향 (§6.1.1) |
| **TRANSACTION_COST** | 거래·환전·재조정 비용, 매도·재매수 비용 | v1.3.1 신규 |

**일반계좌도 AccountSpec을 갖는다.** "혜택 없는 기본값"이 아니라 `DIVIDEND_DISTRIBUTION_TAX + TAXABLE_SALE_TAX + FINANCIAL_INCOME_AGGREGATION + 납입한도 없음 + 잠금 없음`이라는 성질 조합을 가진 하나의 wrapper이며, 다른 계좌와 동일하게 spec 파일로 선언한다.

**커버리지 검사**: `spec.requiredEngineCapabilities ⊆ 엔진 지원 MechanismType`. 아니면 부분 계산 없이 로딩 거절.

**최적화 성질 호환성 검사 [v1.4 신설]**: 데이터 필드 호환성만 검사하면, 새 메커니즘이 Optimizer의 암묵적 가정(구간별 선형·유한 경계점 등)을 깨뜨리면서도 로딩에 성공한다. 각 메커니즘은 자신의 최적화 성질을 선언하고, 로더가 Optimizer가 지원하는 성질 집합과 대조한다.

```ts
interface MechanismOptimizationProperties {
  piecewiseLinear: boolean;
  piecewiseMonotone: boolean;
  finiteBreakpoints: boolean;
  crossAccountInteraction: boolean;   // 계좌 간 상호작용 유발 여부
  pathDependent: boolean;
  nonConvex: boolean;
}
```

지원하지 않는 성질 조합은 로딩 거절 대상이다(예: `nonConvex && !finiteBreakpoints`인 메커니즘은 현 Optimizer가 다룰 수 없다).

**5.3.2 AccountSpec**

```ts
interface MechanismInstance {
  mechanismInstanceId: string;         // 인스턴스 단위 식별 (동일 타입 복수 등장 대비)
  mechanismType: MechanismType;
  parameterRuleIds: string[];          // 정책 팩 규칙 참조 — spec에 값 없음
  priority: number;
}

interface AccountSpec {
  // 식별자 규칙 [v1.3.2]: accountId·instrumentId·AssetClass 등 **canonical JSON의 key로 쓰이는 모든 식별자는
  // ASCII [A-Za-z0-9_] 만 허용**한다 (예: "PENSION_SAVINGS"). 한글 명칭은 displayName에만 둔다.
  // Record<AccountId, KRW> 같은 동적 key가 해시 대상이 되므로 §5.2 ASCII 규칙과 직접 연결된다.
  accountId: string;
  displayName: string;
  schemaVersion: string;
  effectiveFrom: string;
  effectiveTo?: string;

  eligibilityRuleIds: string[];
  mechanismInstances: MechanismInstance[];
  instrumentEligibilityRuleIds: string[];
  supportedEvents: PlanEventType[];
  requiredEngineCapabilities: MechanismType[];
  sourceIds: string[];
}
```

**5.3.3 MechanismHandler (최종형)**

```ts
type EvaluationPhase =
  | "ELIGIBILITY" | "CONTRIBUTION" | "TAX_BENEFIT" | "GROWTH"
  | "TRANSFER" | "WITHDRAWAL_ORDER" | "WITHDRAWAL_TAX" | "SETTLEMENT";

const PHASE_ORDER: readonly EvaluationPhase[] = [
  "ELIGIBILITY", "CONTRIBUTION", "TAX_BENEFIT", "GROWTH",
  "TRANSFER", "WITHDRAWAL_ORDER", "WITHDRAWAL_TAX", "SETTLEMENT",
];  // union 선언 순서는 실행 순서를 보장하지 않으므로 상수로 고정

interface MechanismHandler {
  mechanismInstanceId: string;
  mechanismType: MechanismType;
  phase: EvaluationPhase;

  dependsOnInstanceIds: string[];      // 타입이 아니라 인스턴스 단위 의존
  reads: StateField[];
  writes: StateField[];

  validateSpec(spec: MechanismInstance): ValidationResult;
  apply(state: Readonly<PlanningState>, event: PlanEvent): TransitionResult;
  emitBreakpoints(context: PlanningContext): MoneyBreakpoint[];
  emitPlanActions(context: PlanningContext): PlanAction[];
  explain(trace: RuleTrace): ExplanationToken[];
}
```

**로더 불변식** (위반 시 부분 실행 없이 로딩 거절): 의존성 순환 / 동일 phase 동일 필드 동시 쓰기 / 선행 인스턴스 누락 / 실행 순서 미결정(위상정렬 불가). 상태 변경은 `TransitionResult`로만 — 암묵적 공유 금지.

**5.3.4 실행 정렬 키 — 시간이 phase보다 우선**

연중 이벤트(예: 만기 전환)에서 "성장 후 전환 vs 전환 후 성장"이 갈리므로:

```text
정렬: 1. event.occurredAt → 2. event.sequence → 3. PHASE_ORDER
     → 4. instance.priority → 5. mechanismInstanceId
마지막까지 미결정이면 로딩 거절
```

```ts
interface PlanEvent {
  eventId: string;
  occurredAt: string;    // YYYY-MM-DD, Asia/Seoul 법정 날짜 (UTC 변환 금지)
  sequence: number;
  eventType: PlanEventType;
}
```

세법 시행일·계좌 이벤트는 전부 KST `LocalDate`로 저장·비교한다.

### 5.4 State Model

```ts
interface SourcedValue<T> {
  value: T;
  source: "USER_CONFIRMED" | "DOCUMENT_EXTRACTED" | "INSTITUTION_DATA" | "SYSTEM_ESTIMATED";
  verified: boolean;
  asOf: string;
}

interface UserProfile {
  birthDate: SourcedValue<string>;
  taxResident: SourcedValue<boolean>;
  incomeType: SourcedValue<"SALARY_ONLY" | "COMPREHENSIVE_EXACT">;   // §4.1 스코프
  // SALARY_ONLY        → totalSalary 필수 (Exact/Estimate 모드 모두 가능)
  // COMPREHENSIVE_EXACT → comprehensiveIncome + calculatedTax 확정값 필수 (Exact-input 한정)
  comprehensiveIncome?: SourcedValue<KRW>;          // COMPREHENSIVE_EXACT일 때 필수
  totalSalary: SourcedValue<KRW>;
  calculatedTax: SourcedValue<KRW>;                 // 산출세액 (캡 계산용)
  otherCreditsApplied: SourcedValue<KRW>;
  ytdContributions: SourcedValue<Record<AccountId, KRW>>;
  retirementTargetAge: SourcedValue<number>;
  emergencyFundRequired: SourcedValue<KRW>;
  plannedOutflows: SourcedValue<{ at: string; amount: KRW; purpose: string }[]>;
  preferences: UserPreference;                      // §6.1.5 — 서열·제약 형태만
}
```

**계산 모드**: 핵심 입력이 `USER_CONFIRMED`/`DOCUMENT_EXTRACTED`(검증됨) → ② 라벨. `SYSTEM_ESTIMATED` 포함(총급여로 산출세액 추정 등) → "추정 입력 기반 계산" 라벨 + 범위 표시, "확정" 금지.

**MoneyBucket** — 세무 성격과 유입 경로 분리. 전환은 정책이 명시적으로 변환하는 부분만 성격을 바꾸고 나머지 provenance는 보존:

```ts
type TaxCharacter =
  | "NON_CREDITED_CONTRIBUTION" | "CREDITED_CONTRIBUTION"
  | "DEFERRED_RETIREMENT"       // v1 유입 없음 — 스코프 밖
  | "INVESTMENT_EARNINGS";

type OriginType =
  | "DIRECT_CONTRIBUTION" | "ISA_MATURITY_TRANSFER"
  | "PENSION_TRANSFER" | "INVESTMENT_RETURN";

interface MoneyBucket {
  bucketId: string;
  taxCharacter: TaxCharacter;   // 인출 과세 결정
  originType: OriginType;       // 경로 추적·특례 판정(전환 공제 등)
  originAccountId?: string;
  amount: KRW;
  contributedTaxYear?: number;
  originPolicyVersion: string;
  asOf: string;

  // [v1.4] 세무 성격은 불변 태그가 아니다 — 전이 이력을 보존한다.
  // 예: 특정 연도에 공제받지 못한 납입액의 성격이 이후 절차·이벤트로 변경될 수 있으며,
  //     확인 절차 완료 시점부터 과세 취급이 달라지는 구조가 존재한다(§12 확인 대상).
  originalTaxCharacter: TaxCharacter;
  taxCharacterEvents: {
    at: string;                    // KST LocalDate
    eventType: "DEDUCTION_CONVERSION" | "TAX_BASIS_VERIFICATION" | "ACCOUNT_TRANSFER";
    fromCharacter: TaxCharacter;
    toCharacter: TaxCharacter;
    amount: KRW;
    sourceRuleIds: string[];
    evidenceRef?: string;          // 제출 서류 참조
  }[];
}
// v1: 스냅샷 집계 / v2: AccountEvent 원장
```

### 5.5 상품 모델 — 고유 사실과 세무 결론의 분리

InstrumentMaster는 상품의 **고유 사실만** 보유한다. 편입 가능 계좌 목록·최종 과세 분류를 저장하지 않는다 (이중 진실 원천 금지):

**TaxableAccountLedger — 일반계좌 원장 [v1.3.2 신설]**

연금계좌는 `taxCharacter` 버킷으로 충분하지만, 일반계좌의 계획 매도(TOTAL_RETURN_WITHDRAWAL) 과세를 계산하려면 **취득원가와 실현 시점**이 필요하다. 잔액 하나로는 매매차익을 산출할 수 없다.

```ts
interface TaxableLot {                 // 취득 단위(lot) 원장
  lotId: string;
  instrumentId: string;
  acquiredAt: string;                  // KST LocalDate
  quantity: ExactQuantity;             // 좌수 — DecimalRate(비율) 아님 (§5.2.1)
  costBasis: KRW;                      // 취득원가 합계
  realizedAt?: string;                 // 실현 시점 (미실현이면 undefined)
  realizedProceeds?: KRW;
}

interface TaxableAccountLedger {
  accountId: AccountId;
  lots: TaxableLot[];
  realizationPolicy: "FIFO" | "AVERAGE_COST";   // 정책 팩에서 주입 — 세법이 정하는 파라미터
  // 손익통산 가능 범위·이월 여부도 정책 팩 규칙으로 참조
}
```

`realizationPolicy`와 손익통산 규칙은 코드가 아니라 정책 팩에서 온다(§12 대조 항목). 배당·이자·매매차익은 소득 종류가 다르므로 `DIVIDEND_DISTRIBUTION_TAX`와 `TAXABLE_SALE_TAX`가 각각 처리하고, 합산 판정은 `FINANCIAL_INCOME_AGGREGATION`이 담당한다.

```ts
interface InstrumentMasterV1 {
  instrumentId: string;
  legalWrapper: "domestic_etf" | "foreign_listed_etf" | "fund" | "individual_stock" | "deposit";
  listingCountry: ISO3166CountryCode;
  structuralClassification: InstrumentStructure;   // 구조적 사실 (과세 결론 아님)
  sourceIds: string[];
}
```

판정은 항상 단일 함수 경로:

```ts
instrumentEligibility(instrument, accountSpec, providerPolicy, asOf): EligibilityResult
resolveTaxTreatment(instrumentFacts, policySnapshot, asOf): TaxTreatmentResult
// 세법이 바뀌어도 상품 마스터의 과거 사실은 수정하지 않는다
```

**유동성 상태 모델 [v1.4 신설]**: 잠금자산 비중 하나로는 부족하다. 법령이 특정 사유의 중도인출을 허용하는 구조이므로, 같은 잔액도 예정 지출의 **종류**에 따라 가용성이 달라진다.

```ts
interface LiquidityState {
  normallyWithdrawableAmount: KRW;
  conditionallyWithdrawableAmount: KRW;
  withdrawalConditions: { conditionRuleId: string; evidenceRequired: boolean }[];
  expectedProcessingDelayDays?: number;
}
```

예정 지출을 유동성 제약과 매칭할 때 지출 목적이 허용 사유에 해당하는지 판정하고, 해당하지 않으면 그 잔액을 가용으로 계산하지 않는다.

**배분 3계층 구분** (v1 주 기능 선언):

```text
Account Allocation        : 저축액을 계좌·현금에 어떻게 배분          ← v1 (계산·제시)
Asset-class Location      : 자산군(주식형·채권형·고배당형·현금성)을
                            어느 계좌에 위치시킬 것인가                ← v1 (계산) / 제시는 아래 주석
Specific Instrument Sel.  : 특정 ETF 티커·수량·시점 선택               ← 컴플라이언스 게이트 뒤
```

**Asset-class Location을 v1 계산 범위에 두는 이유**: 자산군별 과세가 계좌별로 다르므로(예: 특정 자산군은 특정 계좌에 편입 불가, 배당 성격에 따라 계좌별 세후 결과가 역전) **자산군의 계좌 위치는 절세 계산과 분리 불가능하다.** 이를 v2로 미루면 "어느 계좌에 어떤 유형을 넣어야 하는가"라는 제품 질문에 답할 수 없다.

**계산과 표시의 분리**: 엔진은 자산군 위치를 계산하고 세후 결과를 산출한다. 그 결과를 고객에게 **개인화된 권유 형태로 표시**할 수 있는지는 컴플라이언스 분류 대상이며(§4.3), 엔진 스코프가 아니다. 사전 승인된 모델 포트폴리오를 사용자가 선택하는 방식은 v1에서 가능하고, 시스템이 사용자별 자산배분을 새로 설계하는 방식은 분류 필요.

### 5.6 Calculator Contract / RunManifest / FactAnswerManifest

Calculator 함수 (전부 결정론, `policyVersion` 입력, `rule_trace` 반환):

```text
eligibility(user, accountSpec, asOf)
contributionRoom(user, accountState, asOf)          [②/추정]
taxCredit(user, contributions, asOf)                [②/추정, 산출세액 캡]
withdrawalTax(bucketState, withdrawal, asOf)        [②/추정, 성격·순서·수령한도]
transfer(sourceState, targetSpec, event, asOf)      [②/추정, 성격 보존 + 특례]
projection(state, plan, assumptions, horizon)       [③]
```

배분 검증: `contributionRoom(...) >= 납입·이동 금액` (한도>0 검사 금지).

```ts
interface RunManifest {
  runId: string;
  queryAsOf: string;
  taxYear: number;
  confirmedInputHash: string;          // §5.2 정본 해시

  policySnapshotVersion: string;
  accountSpecVersion: string;
  mechanismSchemaVersion: string;
  instrumentDataVersion: string;
  providerRuleVersion?: string;

  strategyCoverageVersion: string;
  strategyTemplateVersion: string;
  optimizerVersion: string;
  engineBuildVersion: string;
  assumptionSetVersion?: string;       // ③ 산출 시 필수 (InvestmentPolicySnapshot 포함)

  parserModelVersion?: string;
  parserPromptVersion?: string;
  rendererTemplateVersion?: string;
  rendererPromptVersion?: string;
  rendererModelVersion?: string;

  createdAt: string;
}

interface FactAnswerManifest {
  queryAsOf: string;
  confirmedInputHash?: string;
  policySnapshotVersion: string;
  factResolverVersion: string;
  answerClass: FactAnswerClass;
  resolvedRuleIds: string[];           // REGISTRY_RESOLVED_FACT면 필수, UNMODELED면 []
  sourceSnapshotIds: string[];
  sourceHashes: string[];
  ragIndexVersion?: string;
  rendererTemplateVersion: string;
  rendererModelVersion?: string;
  answerPayloadHash: string;
}
```

### 5.7 MyData Ingestion Adapter [v1.3 신규 — 팀 지시 확정]

금융보안원 마이데이터 표준 API(정보제공 API 규격)로 수신한 payload를 `SourcedValue<INSTITUTION_DATA>`로 매핑한다. **LLM 파서를 경유하지 않는다** — 구조화 JSON이 직접 도착하므로 P1(AI 비권위) 원칙이 오히려 강화된다.

**제공되는 것 → 엔진 매핑**

| 표준 API 필드 | 엔진 매핑 | 효과 |
|---|---|---|
| IRP 기본정보: `employee_amt`(가입자부담금, 규격상 "ISA 만기자금 포함") / `employer_amt`(사용자부담금) | MoneyBucket `originType` 소재 | 자기부담·회사부담 구분 → 세액공제 대상 판정 입력 정확화 |
| IRP: `issue_date`(개설일), `first_deposit_date`(연금계좌 가입일) | AccountState | WITHDRAWAL_LOCK "가입 5년" 요건·수령연차 산정이 기관 데이터 기반 |
| IRP/DC 거래내역 (`trans_type` 입금·지급) | `ytdContributions` | 당해 납입액 → `SYSTEM_ESTIMATED` → `INSTITUTION_DATA` 승격 → contributionRoom·taxCredit이 ② 라벨 획득 |
| 수신계좌 기본정보: `exp_date`(만기일), `monthly_paid_in_amt` | PlanEvent (MATURITY·전환 트리거) | §5.3.4 시간 정렬이 실제 날짜로 작동 |
| IRP/DC 추가정보: 개별운용상품 목록, `prod_type`(원리금 보장/비보장), `eval_amt`, `inv_principal` | InstrumentMaster 매칭, 잠금·위험자산 비중 | 편입 게이트·제약 계산 입력 |
| 수신계좌: `balance_amt`, `withdrawable_amt` | 유동성 constraint | 비상자금 확인 입력 |

**제공되지 않는 것 (설계 제약으로 확정)**

| 미제공 항목 | 귀결 |
|---|---|
| **세액공제 이력(taxCharacter)** — 금액·날짜는 오지만 세무 성격은 국세청 영역 | 단일 보수 가정이 아니라 **신뢰도 4단계**로 처리 (아래 §5.7.1) |
| 소득 유형·종합소득금액·산출세액 | 사용자 확인 입력 필수 (Exact/Estimate 모드 분기) |
| 성향·목표·예정 지출 | 대화·설문 레이어 필수 |
| 5년 초과 과거 거래내역 (규격: 신용정보법 시행령 §28의3④에 따른 제공 범위 제한) | 오래된 계좌의 과거 이력 재구성 불가 |

#### 5.7.1 taxCharacter 신뢰도 모드 [v1.3.1 — 기존 계좌 보유자 처리]

기존 연금계좌 보유자가 다수이므로 "제외"는 답이 아니다. 잔액의 세무 성격을 **확신 수준별로 다르게 처리**하고, 결과의 정밀도 표기를 그에 맞춘다.

```ts
type TaxCharacterConfidence = "VERIFIED" | "USER_CONFIRMED" | "RANGE_ESTIMATED" | "UNKNOWN";
```

| 모드 | 조건 | 계산·표기 |
|---|---|---|
| VERIFIED | 공식 자료(연말정산·납입확인서 등)로 성격 확인 | 수령세 단일 금액 계산, ② 라벨 |
| USER_CONFIRMED | 사용자가 과거 공제 여부를 명시 확인 | 단일 계산 + 입력 provenance 표기 |
| RANGE_ESTIMATED | 이력 불완전 (5년 초과 구간 등) | **보수/낙관 두 시나리오 병행** — 보수: 공제받은 원금 비중 높게 / 낙관: 공제 안 받은 원금 비중 높게 → 은퇴 후 월 세후소득을 **범위로 표시** |
| UNKNOWN | 추정 근거 부족 | 기존 잔액은 **세전 자산 전망에만** 포함, 수령세 "계산 불가" 명시. 목표 충족 판정에서 제외하거나 보수 가정 하한만 사용 |

원칙: 모르는 것을 하나의 숫자로 봉합하지 않는다. 범위로 보여주는 것이 단일 보수값보다 정직하고, 사용자가 자료를 제출하면 정밀도가 올라가는 경로(UNKNOWN → VERIFIED)를 UI로 제공한다.

**불완전성 처리**: 규격의 `is_consent`가 보여주듯 전송요구는 자산 단위 선택이므로, 연동하지 않은 기관·계좌는 도착하지 않는다. 기관 데이터는 "정확하지만 완전하지 않을 수 있다"를 전제로 하며, 확인 게이트에 **"빠진 계좌가 없는지" 확인 단계를 필수 포함**한다.

**v1 구현 범위**: 어댑터·매핑·검증은 실제로 구현하고, 데이터는 **표준 규격 필드명 그대로의 합성 fixture**로 주입한다. 실연동은 신용정보법상 허가·컴플라이언스 승인 뒤(출시 게이트). 실명·실계좌·실소득 미사용 원칙(§8 v1)은 유지된다. 금융보안원 마이데이터 테스트베드가 실데이터 없이 규격 적합성을 검증하는 공식 경로로 존재한다.

**RunManifest 추가 필드**: `mydataSpecVersion`, `mydataRetrievedAt`, `mydataConsentScope`(연동된 기관·자산 범위) — 동일 결과 재현의 일부.

### 5.8 Surface Binding [v1.3 신규 — 앱 화면 ↔ 엔진 계약]

앱 화면(가입 → 마이데이터 연동 → 성향 설문 → 계좌·전략 → 종목 → 금액 → 결과)의 각 요소는 엔진 출력 필드를 **읽기만** 한다.

| 화면 요소 | 엔진 출력 | 라벨 |
|---|---|---|
| 마이데이터 연동 완료(기관·계좌·종목 수, 총자산) | Adapter 요약 (§5.7) | INSTITUTION_DATA 배지 |
| 성향 설문 결과 | PreferenceProfile (§6.1.7) | — |
| 계좌별 "남은 여력 = 한도 − 당해 납입액", 합산 한도 선반영 | `contributionRoom` / `taxCredit` (핸들러 의존성 순서 §5.3.3~5.3.4가 이 "선반영 순서"의 구현체) | ② 또는 추정 |
| 1차 진단 우선순위 | **모드 A/B 출력의 뷰** — 우선순위를 UI 상수로 박는 것 금지 | ② |
| "예상 절세효과" 금액 | 시뮬레이터 세후 차액 (전환 시 매도·재매수 과세 이벤트 차감 후 **순효과**) | ② 또는 ③ |
| 2차 종목 진단 / 종목 추천·수익률·금액 슬라이더 | **컴플라이언스 분류 전 = 미출시 표면** (§4.3) | "컨셉 — 규제 분류 전" 명시 |
| 시뮬레이션 차트 | `projection` + 가정 카드 | ③ 전망 |

**금지 사항 (UI 레이어)**

1. 화면·컴포넌트에 세법 값(한도·세율·공제율) 하드코딩 — 전부 정책 팩 바인딩. 모든 결과 화면에 `정책 버전 · 시행일 · 가정 카드` 스탬프 필수.
2. UI에서 산식 계산 — 여력·절세액·필요 저축액은 엔진 출력만 표시.
3. 소득 확인 전 단일 절세액 숫자 제시 — 확인 전에는 범위 + 추정 배지.
4. 편입 불가 조합 표시 — `instrumentEligibility()` 통과하지 않은 조합은 추천 후보에 등장 불가.

**초기 목업 검토에서 발견된 오류 (수정 대상, 발표 소재로도 활용)**

| 발견 | 성격 | 조치 |
|---|---|---|
| 미국 직상장 ETF(QQQ·SCHD)를 ISA로 이동 추천 | **실행 불가능한 추천** — ISA는 국내 상장 상품만 편입 가능(조문 확인은 §12 경로) | `instrumentEligibility()` 게이트가 차단. 동일 지수 국내상장 ETF는 PROXY 시나리오로 별도 제시 |
| "옮기면 절세 N원" — 매도·재매수 과세 이벤트 누락 | 세후 효과 과대 표기 | 전환을 sell+rebuy 이벤트로 모델링, 순효과만 표기 |
| 계좌 적합성 점수(70/75/90) | 숨은 가중치 — "왜 70점?"에 근거 제시 불가 | 점수 열 삭제, **편입 가능 여부(게이트) + 세후 원화 효과(시뮬레이터)** 로 대체 |

동일 설계 세션 내에서 종목이 교체되자 규칙 위반(ISA 편입 불가)이 소리 없이 유입된 사례는, 사람 검토만으로는 이 오류가 잡히지 않고 결정론 게이트가 필요하다는 실증이다.

---

## 6. Contract ③ — Optimizer & Verification

### 6.1 Optimizer

**6.1.1 모드 A — 올해 배분 (Coverage-bounded 전수 비교)**

```text
1. 각 MechanismHandler가 경계점(breakpoint) 방출 — **법적 경계만으로는 불충분**
   : (법적) 0원, 세액공제 잔여한도, 계좌별·합산 납입한도, 이월한도, 만기 전환 가능액
   : (경제적) 비용 함수 경계(고정비·보수), 계좌 간 한계 세후가치 교차점,
     비율 제약(잠금비중·위험자산) 교차점, **목표 월소득을 처음 충족하는 지점**
   : (구조) 유동성 최소보유액, 총 저축여력, HOLD_CASH
2. breakpoint 조합으로 유한 후보 전수 열거 (+ 전략 템플릿 삽입)
3. 시간 이벤트 적용 (§5.3.4 정렬)
4. 전 후보를 동일 가정·동일 투자정책으로 생애 시뮬레이션
5. 지배 제거 → Coverage-bounded Pareto Set (@ strategyCoverageVersion)
```

**후보 완전성 검증 (v1 필수)**: 비용·보수가 개입하면 우열이 바뀌는 지점이 법정 한도가 아닐 수 있으므로, "경계점만 보면 된다"는 명제는 조건부다. 따라서 **Optimizer 전용 독립 참조 탐색기**를 별도로 구현한다.

```text
프로덕션 Candidate Enumerator
   ↕ differential (랜덤 합성 케이스 수천 건)
축소형 Brute-force Reference Solver
   : 작은 금액 단위(예: 10만원)로 전 구간 완전 탐색, 소규모 문제 전용
```

두 결과가 불일치하면 **후보 생성기가 경계점을 누락한 것**이다. Tax Calculator 독립 검증(§6.2)과 별개로 Optimizer에도 참조 구현이 필요하다.

- **HOLD_CASH 항상 포함** → "저축 증가 → 최적 결과 비악화"의 구조적 보장.
- **숨은 시스템 가중치 금지.** 어떤 이름("균형" 포함)으로도 시스템이 교환 비율을 정하지 않는다.

**6.1.2 목적·제약 타입 (v1: 목적 2축)**

```ts
interface ObjectiveVector {
  // v1.3.1: 주 목적은 "월 순부담 최소화", 목표 월소득 충족은 제약(constraint)이다
  requiredMonthlyNetContribution: KRW;    // 최소화 대상 (§0-A.6 순부담 정의)

  // 충족 판정 — 평균이 아니라 최저 보장
  minimumIncomeCoverageRatio: DecimalRate; // 가장 부족한 기간의 **사용 가능 실질현금** ÷ 목표액
  // [v1.4] 분자는 입금액이 아니라 미래 납세의무를 준비한 뒤 실제로 쓸 수 있는 금액이다:
  //   spendableCash[t] = cashReceived[t] − withholding[t] − incrementalTaxReserve[t]
  // 원천징수만 차감하고 신고·납부 시점의 추가 세액을 무시하면, 은퇴 기간 중에는 목표를
  // 충족한 것처럼 보이다가 납부 시점에 현금흐름이 무너진다.
  totalRealIncomeShortfall: KRW;
  periodsWithShortfall: number;

  // 2차 비교축
  terminalRealWealth: KRW;                 // 목표 종료 시 잔여 실질자산
  liquiditySurplusMin: KRW;                // §6.1.3 maximin
}

interface PlanningConstraints {
  minimumEmergencyFund: KRW;
  requiredOutflows: { at: string; minimumAvailableAmount: KRW }[];
  maximumLockedAssetRatio?: DecimalRate;
}
```

**가정: 세법 한도의 실질가치 [v1.3.2 신설]**

세법의 금액 한도(공제 대상 한도, 비과세 한도, 연금소득 총액 경계 등)는 **명목 금액이며 물가에 자동 연동되지 않는다.** 목표·결과를 실질가치로 표현하는 모델에서 한도를 명목 고정으로 두면, 미래 사용자는 현재보다 쉽게 고율 과세 구간에 진입하게 되고 수령 단계 세금이 **과소평가**된다.

이는 세법 사실이 아니라 **가정**이므로 `assumptionSet`의 필수 항목으로 두고 결과에 노출한다.

```ts
interface LimitIndexationAssumption {
  mode: "NOMINAL_FROZEN" | "INDEXED_TO_INFLATION" | "PARTIAL";  // 기본값 NOMINAL_FROZEN
  partialRate?: DecimalRate;      // PARTIAL일 때 연동 비율
  assumptionVersion: string;
}
```

기본값을 `NOMINAL_FROZEN`으로 두는 이유: 현행법을 그대로 미래에 적용하는 것이 가장 보수적이며(세금 과대추정 = 안전 방향), 한도 인상을 가정하는 것은 미래 입법을 예측하는 행위이기 때문이다. 다만 이 가정이 결과를 보수적으로 편향시킨다는 사실을 결과 화면에 명시한다.

**주 최적화 형태 (모드 B)**

```text
최소화: requiredMonthlyNetContribution      (사용자 월 순부담)
제약:  ① 은퇴 전 비상자금·예정 지출 충족
       ② 법정 한도·편입 제약 충족
       ③ 은퇴 시작부터 목표 종료까지 **매 기간** 세후 실질 현금흐름 ≥ 목표액
          (minimumIncomeCoverageRatio ≥ 100%.
           incomeRule = ANNUAL_AVERAGE를 선택한 경우에만 연평균으로 판정)
       ④ 사용자 잠금·위험·잔여자산(legacy) 제약 충족
2차 비교: terminalRealWealth ↑ · liquiditySurplusMin ↑ · 스트레스 시나리오 부족액 ↓
```

`minimumIncomeCoverageRatio < 100%`인 플랜은 **목표 충족으로 표시하지 않는다.** 목표 미달 시 "달성 가능 최대치 + 조정 옵션(은퇴 연기 / 목표액 조정 / 지급 기간 조정 / 보너스 납입 / 저축 증액)"을 반환한다.

투자 보수·거래비용은 목적축이 아니라 **시뮬레이터의 비용 항목**으로 반영한다(INVESTMENT_FEE·TRANSACTION_COST). 관리 복잡도는 v1 목적축 제외 (v2 확장).

**6.1.3 유동성의 정의 (maximin, 퇴화 방지)**

단순 "유동성 최대"는 HOLD_CASH 100%로 퇴화하므로 대표안 정의는 ε-constraint + maximin:

```text
maximize   min over d ( liquidAssetsImmediatelyBeforeOutflow[d] − requiredOutflow[d] )
subject to realAfterTaxWealthAtTarget >= 사용자 최소 목표자산
```

- 날짜별 금액을 합산·가중평균하지 않으므로 숨은 교환 계수 없음.
- 정의 고정: `liquidAssets` = 예정 지출 **실행 직전** 즉시 사용 가능 자산. `lockedAssetRatio` = 잠금자산 / 총 금융자산, 적용 시점 = 모든 연말 + 모든 예정 지출 직전.
- 사용자 지정 오버라이드:

```ts
interface LiquidityPreference {
  mode: "MAX_MIN_SURPLUS" | "USER_DATE_PRIORITY";
  datePriority?: string[];    // USER_DATE_PRIORITY 시 lexicographic
}
```

- 최소 목표자산 미입력 시 유동성 대표안은 "최소 목표 미설정 — 전체 Pareto Set 열람"으로 대체 (HOLD_CASH 100%를 대표안으로 제시 금지).

**6.1.4 계좌 비교의 공정성 — 투자정책 고정 + 비교 등급 분리**

> **[v1.4 정정]** 순수 계좌효과 모드에서는 모든 후보에 **동일한 세전 총수익 경로**와 동일한 거래 정책을 적용한다.

"동일 기대수익·동일 위험"만 맞추는 것은 불충분하다. 세금과 인출은 경로 의존적이므로 기대수익과 변동성이 같아도 "초반 상승 후 하락"과 "초반 하락 후 상승"의 결과가 다르다. 따라서 고정 대상은 다음 네 가지다.

```text
동일한 세전 총수익 경로 (연도별 수익률 수열까지 동일)
동일한 현금흐름 시점
동일한 리밸런싱 규칙
동일한 매매 발생 조건
```

```ts
interface InvestmentPolicySnapshot {
  assetClassWeights: Record<AssetClass, DecimalRate>;
  returnAssumptionSetVersion: string;
  riskAssumptionSetVersion: string;
}

type ComparabilityClass = "EXACT_POLICY_MATCH" | "PROXY_POLICY_MATCH" | "NOT_COMPARABLE";

interface PortfolioFeasibilityResult {
  comparabilityClass: ComparabilityClass;
  targetPolicy: InvestmentPolicySnapshot;
  feasiblePolicy?: InvestmentPolicySnapshot;
  deviationReasons: string[];
}
```

**비교 2모드와 효과 분해 [v1.3.2 신설]**

동일 투자정책 고정은 세제 효과를 분리하기 위해 필수지만, 그것만 제시하면 계좌별 세제 특성에 맞는 자산 배치(Asset-class Location) 이득을 제거해버린다. 따라서 두 모드를 **각각 계산해 효과를 분해**한다.

| 모드 | 고정하는 것 | 답하는 질문 |
|---|---|---|
| 모드 1 — 순수 계좌효과 | 동일 자산군 구성·동일 기대수익·동일 위험 | "세제 wrapper만 바꿨을 때의 개선분은 얼마인가" |
| 모드 2 — 실행형 | 전체 위험 수준만 동일. 계좌별 편입 가능 상품·보수 반영, 세제 특성에 따른 자산군 배치 허용 | "실제로 실행 가능한 최선은 얼마인가" |

출력은 반드시 분해해서 보여준다: `세제 구조에서 발생한 개선분` + `자산군 배치에서 추가로 발생한 개선분`. 이렇게 하지 않으면 절세 효과와 투자전략 효과가 한 숫자에 섞여 무엇이 큐브의 기여인지 설명할 수 없다.

판정 규칙 — **표시가 아니라 비교 세트 자체를 분리한다**:

```text
EXACT_POLICY_MATCH → 순수 세제 wrapper 비교·기본 계좌 순위에 포함
PROXY_POLICY_MATCH → 가장 가까운 대체 구성으로 별도 시나리오 표시 (순위와 혼합 금지)
NOT_COMPARABLE     → 해당 투자정책 기준 비교에서 제외
```

**6.1.4-b 최적성 주장의 범위 [v1.4 신설]**

"최소 필요 예산"은 현재 알고리즘으로 전역 증명되지 않는다. 절대적 최소를 주장하려면 후보의 목적값뿐 아니라 **그보다 좋은 해가 없음을 보이는 하한 인증서**가 필요하다. 따라서 주장 수준을 필드로 명시한다.

```ts
interface OptimizationClaim {
  searchDomain: string;                  // 지원 계좌·메커니즘 집합
  strategyCoverageVersion: string;
  scenarioSetVersion: string;
  contributionPolicyClass: string;
  withdrawalPolicyClass: string;
  tolerance: KRW;                        // 이분탐색 허용오차
  optimalityStatus: "CATALOG_OPTIMAL"    // 지원 카탈로그 내 최선 (v1 기본)
                  | "BOUNDED_OPTIMAL"    // 하한과의 격차가 허용오차 이내 증명
                  | "GLOBALLY_CERTIFIED"; // 지원 문제 클래스에서 전역최적 증명
}
```

문구 규칙 (§4.4 확장):

| 금지 | 사용 |
|---|---|
| "목표를 달성하는 최소 월 저축액" | "현재 지원하는 계좌·전략·시나리오 범위에서 목표를 달성한 **가장 낮은** 월 저축 부담" |
| "완전한 Pareto Set" | "명시된 전략 커버리지에서 탐색했으며 소규모 독립 완전탐색 테스트를 통과함" |
| "평생 세금 반영 후 월 X원" | "계획 종료 연령까지 세금 반영 후 월 X원" |

**6.1.5 대표안 선택 규칙**

1. 목적별 극단 대표 — "세후가치 최대 플랜" (argmax, 판단 개입 없음)
2. 유동성 대표 — §6.1.3 maximin ε-constraint 정의
3. 사용자 서열 대표 — 사용자가 선택한 lexicographic 우선순위 (숫자 계수 입력 금지)
4. 전체 열람 — Coverage-bounded Pareto Set 공개

**기본안(default plan) 제시 규칙 [v1.3.2]**: "가치판단을 대신하지 않는다"와 "아무 안내도 하지 않는다"는 다르다. 임의 점수표 없이도 **투명한 사전순위(lexicographic) 규칙**으로 기본안 하나를 고를 수 있고, 규칙 자체를 화면에 공개한다.

```text
1순위: 법정·생활 제약 충족 (비상자금·예정 지출·편입 제약)
2순위: 지정한 시나리오 집합에서 floor 충족 (minimumIncomeCoverageRatio ≥ 100%)
3순위: 월 순부담(requiredMonthlyNetContribution) 최소
4순위: 최저 잉여 유동성 최대
5순위: 전략 복잡도 최소 (계좌 수·이벤트 수)
```

표기 예: "비상자금 12개월과 스트레스 시나리오 floor를 먼저 만족시킨 뒤, 그 안에서 월 부담이 가장 작은 안을 기본안으로 선택했습니다." — 이는 "안정 1점 = 월 30만원" 같은 환산과 근본적으로 다르다(순위는 공개되고 교환 계수가 없다).

**금지**: 또래 비교·사회적 증거형 유도("유사 연령·소득대의 70%가 이 안을 선택했습니다")는 사용하지 않는다. 근거 데이터가 없고, 숨은 가중치를 마케팅 문구로 옮긴 것에 불과하다.

Hard constraint는 후보 필터링으로 선적용. 최종 선택은 사용자.

**6.1.6 모드 B — 목표 역산 [v1.3: 주 UX]**

사용자의 1차 질문이 "월 X원 받으려면 얼마를 저축해야 하나"이므로, 모드 B가 기본 진입점이고 모드 A(올해 배분 전수 비교)는 그 내부 단계로 호출된다.

```ts
interface ReverseGoalRequest {
  currentAge: number;
  retirementAge: number;
  targetMonthlyRealAfterTaxIncome: KRW;   // 실질 기준 — 명목 환산은 엔진이 물가 가정으로 수행
  incomeSource: "DIVIDEND" | "PLANNED_WITHDRAWAL" | "MIXED";   // 성향 프로필에서 결정 (§6.1.7)
  preferenceProfileId: string;
  constraints: PlanningConstraint[];
}
```

산출 절차:

```text
1. 목표 월 실질소득 → 물가 가정으로 은퇴 시점 명목 월소득 환산
2. 수령 전략(배당 / 계획 매도 / 혼합)과 계좌 배치 조합을 후보로 생성
3. 각 후보에 대해: 시뮬레이터로 수령 단계 세후 현금흐름 계산
   (DIVIDEND_TAX, PENSION_WITHDRAWAL_TAX, 수령한도, 총액 경계·선택적 분리과세,
    FINANCIAL_INCOME_AGGREGATE 초과 여부까지 반영)
4. 목표 월소득을 세후로 충족하는 최소 필요 월 저축액을 이분탐색으로 역산
   (단조성은 HOLD_CASH 포함으로 구조 보장 — 아래 계약)
5. 후보 간 지배 제거 → Coverage-bounded Pareto Set
```

**단조성의 정확한 근거 [v1.3.2 재정식화]**

기존 서술은 "현금 보유 옵션이 있으므로 결과가 나빠지지 않는다"였다. 더 정확한 근거는 **예산 제약을 등식이 아니라 부등식으로 두는 것**이다.

```text
총 납입액 ≤ 월 저축 가능액        (등식이 아님 — slack 허용)
⇒ 예산 B에서 실행 가능한 전략 집합 ⊆ 예산 B+Δ에서 실행 가능한 전략 집합
⇒ 최적값(집합 위의 max)은 예산에 대해 비감소
```

이 형태가 우월한 이유: 현금 보유 자체는 실질가치 하락·계좌 비용 등 고유 비용을 가질 수 있어 "현금이라 안 나빠진다"는 논증은 반례 여지가 있다. 반면 **"추가 예산을 쓰지 않는 기존 전략이 여전히 선택 가능하다"**는 집합 포함 관계만으로 성립한다.

**`HOLD_CASH`의 정확한 정의 [v1.4 정정 — 중대]**: `HOLD_CASH`는 **CUBE 계좌 어디에도 납입하지 않은 미납입 자본(uncalled capital)**이며, 시뮬레이션 대상 자산이 아니다. 일반계좌 현금성 자산으로 보유하는 것과 구별해야 한다 — 후자로 모델링하면 그 잔액에서 이자소득이 발생하고, 누적되면 **금융소득 합산 경계를 넘기는 트리거**가 되어 다른 계좌 수익의 과세까지 바꿀 수 있다. 즉 예산을 늘렸는데 slack이 세금 절벽을 유발해 세후 결과가 감소하는 **실제 비단조 구간**이 생긴다.

따라서 slack은 이자도 세금도 발생시키지 않는 중립 버킷으로 처리하고, 금융소득 합산 로직에서 완전히 격리한다. 사용자가 그 돈을 실제로 예금에 두겠다고 선택하면 그것은 `HOLD_CASH`가 아니라 **일반계좌 납입**이며 정상적으로 과세 대상이 된다(별도 후보).

**세금 절벽과 단조성의 관계**: 과세 절벽(연금소득 총액 경계, 금융소득종합과세 경계 등)은 (a) 목적함수를 **비평활**하게 만들고 (b) *고정된 전략 하나*의 결과를 비단조로 만들 수 있다. 그러나 위 집합 포함 관계에서 **최적값의 단조성은 유지된다** — 절벽을 넘어 손해가 되는 선택은 slack으로 회피 가능하기 때문이다. 따라서 이분탐색은 "고정 전략의 결과"가 아니라 **"각 예산에서의 최적값"** 위에서만 수행해야 한다.

**후보 상속 불변식 (CandidateInheritanceInvariant) [v1.4 신설]**: 추상 전략 집합이 중첩된다고 해서 후보 생성기가 만든 **유한** 후보 집합도 자동으로 중첩되지는 않는다. 예산별로 경계점을 재생성하면서 작은 예산의 조합이 사라지면, 추상 문제는 단조인데 구현 결과가 비단조가 된다.

```text
불변식:  GeneratedCandidates(B) ⊆ GeneratedCandidates(B + Δ)
         (작은 예산에서 생성·평가된 모든 후보는 큰 예산에서도
          미사용 예산(slack)을 가진 동일 전략으로 재현 가능해야 한다)
```

이것은 사후 assert가 아니라 **후보 생성기 인터페이스의 계약**이며, 속성 테스트 필수 항목이다. 이분탐색은 인접 예산의 이전 최적 후보를 반드시 후보 집합에 포함한다(warm start).

**잔여 리스크**: 후보 열거가 Coverage-bounded 근사이므로, 근사 오차가 최적값의 단조성을 수치적으로 깨뜨릴 수 있다. 따라서 assert와 폴백을 유지한다.

```ts
assert(budgetConstraintIsInequality);              // 등식 예산 금지
assert(actionSpace.includes("HOLD_CASH"));          // slack 구현체
assert(optimalValue(profile, budget + delta) >= optimalValue(profile, budget));
if (objectiveContract.monotonicityGuaranteed) return binarySearchRequiredSavings();
return boundedGridSearch();   // 절벽 근처·근사 오차 감지 시 폴백
```

역산 결과의 표현도 "월 정확히 100만원"이 아니라 **"설정한 금액 단위와 허용오차 안에서 목표를 달성하는 최소 예산"**으로 한다.

출력은 프로필별 병렬 제시(§6.1.7)이며, 단일 "정답" 저축액을 제시하지 않는다.

**6.1.7 성향 프로필 병렬 계산 [v1.3 신규]**

성향은 점수·가중치로 환산하지 않는다. 룰 기반 설문 결과를 **프로필(투자정책 + 수령 방식 + 제약)** 로 사상하고, 각 프로필로 §6.1.1~6.1.6을 **독립 병렬 실행**한 뒤 결과를 나란히 제시한다.

```ts
interface UserPlanningProfile {
  // v1.3.1: 서로 다른 질문을 하나로 묶지 않는다 — 축을 분리
  riskCapacity: "LOW" | "MEDIUM" | "HIGH";                 // 손실 감당 능력
  investmentStyle: "INCOME_TILT" | "TOTAL_RETURN" | "BALANCED";   // 자산 성향
  withdrawalPolicy: "DISTRIBUTIONS_ONLY" | "TOTAL_RETURN_WITHDRAWAL" | "MIXED";  // 인출 방식

  investmentPolicy: InvestmentPolicySnapshot;   // 자산군 비중 — 종목 아님
  liquidityConstraint: PlanningConstraints;
  legacyGoal?: KRW;
  lexicographicOrder?: string[];
}
```

축을 분리하는 이유: "위험을 얼마나 감당하는가"와 "배당 자산을 선호하는가"와 "은퇴 후 배당만 쓸 것인가"는 **서로 다른 질문**이다. 성장형 투자자도 은퇴 후 분배금을 일부 쓸 수 있고, 고배당 선호자도 계획 매도를 섞을 수 있다.

**조합 폭발 방지**: 3×3×3 = 27조합을 전부 계산해 제시하지 않는다. v1은 (a) 설문 결과로 결정된 사용자 조합 1개 + (b) 사전 정의된 대표 조합 2~3개만 병렬 계산해 비교 제시한다. 대표 조합 목록은 `StrategyCoverageManifest`에 명시한다.

| 대표 조합(예시 명명) | riskCapacity | investmentStyle | withdrawalPolicy |
|---|---|---|---|
| 분배금 중심 | MEDIUM | INCOME_TILT | DISTRIBUTIONS_ONLY |
| 총수익 인출 | MEDIUM | TOTAL_RETURN | TOTAL_RETURN_WITHDRAWAL |
| 혼합 | MEDIUM | BALANCED | MIXED |

| 프로필 | 사용자 표현 | 투자정책 | 수령 방식 |
|---|---|---|---|
| HIGH_DIVIDEND | "고배당, 원금 손실 조금은 감수" | 고배당 자산군 비중↑ | DIVIDEND |
| GROWTH | "저배당이라도 원금 성장" | 성장 자산군 비중↑ | PLANNED_WITHDRAWAL (계획 매도) |
| BALANCED | "밸런스" | 혼합 | MIXED |

규칙:
- **프로필 간 순위를 매기지 않는다.** 시스템은 각 줄의 숫자를 계산하고, 줄 사이의 선택은 사용자 몫.
- 프로필 내부 비교(같은 프로필의 계좌 배치 후보 간)는 §6.1.4 투자정책 고정 + ComparabilityClass 규칙을 따른다.
- 프로필의 투자정책은 **자산군 레벨까지가 계산 영역**이다. 구체 종목 지정은 컴플라이언스 게이트(§4.3) 뒤이며, 성향 입력이 들어와도 이 선은 이동하지 않는다.
- 배당형/인출형은 별개 제품 선택지가 아니라 본 프로필 축의 일부로 흡수한다.

**6.1.8 다년 축 / CoverageManifest / v2**

- 다년 조합은 조합 폭발로 v1 전수 대상 아님 → 제한 Strategy DSL 템플릿 + 매년 재실행 롤링 플랜.
- 데이터/코드 3계층: 값·성질 → Typed Schema / 단순 시간 이벤트 → 제한 DSL / 복잡 탐색 → 버전 관리 코드.

**전략 템플릿은 시간표가 아니라 조건부 정책이다 [v1.3.2]**: 20여 년 뒤의 행동을 무조건으로 고정하면 그 시점의 세법·소득·유동성 상태를 반영하지 못한다. 따라서 guard 조건을 필수로 둔다.

```yaml
strategy:
  id: isa_to_pension_at_maturity
  trigger: { event: isa_maturity }
  guards:                                   # 전부 참일 때만 실행
    - conversion_benefit_rule_active: true  # 그 시점 정책 팩에 전환 특례가 유효한가
    - has_usable_tax_credit_room: true      # 산출세액·공제 여력이 남아 있는가
    - liquidity_floor_satisfied: true       # 비상자금·예정 지출이 확보돼 있는가
    - pension_concentration_below_cap: true # 잠금자산 비중 상한 이내인가
  action: { type: transfer, target: pension_account }
  else:   { type: hold_in_place }
```

출력은 "몇 년에 무엇을 한다"가 아니라 **"어떤 조건이 만족되면 무엇을 한다"**가 된다. 롤링 플랜(§1.4)과 결합해 매년 guard를 재평가한다.

**비선견성(non-anticipativity) 제약 [v1.4 신설 — 중대]**: 시뮬레이터가 시나리오별 미래 경로 전체를 보고 각 시나리오마다 다른 행동을 고르면 **사후 최적화**가 되어 실제로 실행할 수 없는 결과가 나온다. (예: 두 시나리오가 65세까지 동일하고 66세부터 갈린다면, 65세 시점에 어느 쪽인지 알 수 없으므로 65세 행동은 같아야 한다.)

```text
필수 규칙: 같은 시점까지 동일한 정보가 관측된 시나리오들은
          그 시점에 동일한 행동을 선택해야 한다.

구현 제한(v1): guard는 **결정 시점까지 관측된 상태만** 참조할 수 있다.
              미래 수익률·미래 세법·시나리오 식별자 참조 금지.

속성 테스트:  identicalObservedHistory(s1, s2, t) ⇒ identicalAction(s1, s2, t)
```

```ts
interface PolicyDecision {
  decisionDate: string;              // KST LocalDate
  observableState: StateField[];     // 이 시점에 관측 가능한 필드 화이트리스트
  permittedSignals: string[];        // guard가 참조 허용된 신호
  action: PlanAction;
}
```

**CommittedPlan vs AdaptivePolicy 분리**: 최초 결과가 "미래 재최적화를 전제로 목표 달성"을 주장하면 책임 범위가 모호해진다. 출력을 두 층으로 나눈다 — `CommittedPlan`(현재 법과 현재 정보로 **지금 실행할 행동**)과 `AdaptivePolicy`(미래 관측 상태별 재평가 규칙). 결과 문구는 "현재 가정과 지원 시나리오 아래에서, 매년 재평가 정책을 이행할 경우 목표 충족 경로가 존재합니다"이며, "지금 이 금액만 넣으면 평생 보장" 형태의 표현을 금지한다.

```ts
interface StrategyCoverageManifest {
  supportedUserScope: UserScope;
  supportedAccounts: AccountId[];
  supportedEvents: PlanEventType[];
  allocationBreakpoints: BreakpointRule[];
  supportedStrategyFamilies: StrategyFamily[];
  explicitlyUnsupportedStrategies: string[];
}
```

- v2: 동일 Optimizer Contract 아래 연 단위 상태 DP/Solver, `StateTransitionTrace` 저장. 감사 가능성은 알고리즘이 아니라 상태·전이 기록의 명시성이 결정.

### 6.2 Verification

| 계층 | 내용 |
|---|---|
| 원문 대조 | 모든 정책 값은 원문 대조 + 검토 승인 후 기재 (§5.1 불변식) |
| 골든 테스트 | 국세청 공식 안내·연말정산 사례를 정답지로. 각 테스트에 `sourceRuleIds` + `policyVersion` |
| 경계값 테스트 | 소득·한도·나이·시행일 경계 ±1원 / ±1일 / ±1세 |
| **알고리즘 검증 데모** [v1.4] | 세법 값 정확성과 **분리하여** 엔진의 수학적 정확성만 증명하는 실행 가능 산출물. `SYNTHETIC_DEMO` 팩으로 6종 시연 — ① 단조성(예산↑ → 최적값 비악화) ② **후보 완전성**(독립 brute-force 탐색기와 옵티마이저 결과 일치) ③ 재현성(동일 입력·버전 → 동일 해시) ④ 불변식(한도 초과 0건·편입 불가 추천 0건·정렬 결정론) ⑤ 거절(미승인 값 → 실패, 자격 미달 → 근거와 함께 배제) ⑥ 경계(±1원 전환). **이 6종은 세법 값과 무관하게 성립**하므로 조문 확보 전에도 검증 가능하다. 출력은 UI가 아니라 CLI 리포트로 충분하다 |
| 필수 시나리오 케이스 [v1.3.2] | ① 산출세액 0원(공제 여력 없음) 사용자 ② 운용 손실 발생 계좌 ③ 연금수령한도 초과 인출 ④ 연금수령연차 11년 전후 ⑤ ISA 만기 전환 연도 ⑥ 목표 달성 불가 케이스(조정 옵션 반환 확인) ⑦ 절벽 경계 직전·직후(연금소득 총액 경계, 금융소득 합산 경계) ⑧ taxCharacter UNKNOWN 계좌 보유자 |
| 속성 테스트 | 단조성(HOLD_CASH), 편입 불가 상품 미추천, 동일 RunManifest 재현성, 한도 초과 배분 부재, 버킷 성격 보존, 정렬 결정론 |
| 독립 기준 계산기 | v1: Tax Calculator에 한해 Python(또는 스프레드시트) **독립 구현** — 같은 명세, 반올림 구현 import 금지, 중간값(§5.2 JSON)까지 CI differential 비교. v2: 생애 시뮬레이터 이중 구현 |
| **골든 벡터의 권위 조건** [v1.4] | 벡터 작성자와 구현 작성자가 같으면 그 대조는 **"두 산출물이 서로 일관됨"까지만** 증명한다 — 사양 해석이 틀렸으면 양쪽이 똑같이 틀린다. 따라서 (1) spec-derived 벡터는 **사람 검토자의 서명(reviewedBy·reviewedAt)을 받아야 ORACLE 자격을 얻는다**(정책 값 Maker–Checker의 테스트 정답지 확장). (2) 표준 함수의 출력(해시 등)은 자기 구현 출력을 적지 말고 **외부 공표 벡터(KAT)**를 인용한다 — 자기 출력을 정답지로 적으면 권위 위장이다. (3) 진짜 독립성은 다른 언어·다른 작성자가 같은 사양에서 같은 값을 낼 때(순서 5) 성립하며, 그전까지 "골든 벡터가 있으니 검증됐다"고 말하지 않는다 |
| **공유 골든 벡터** [v1.4] | 두 구현이 대조할 벡터를 언어 중립 JSON으로 보관한다. 두 종류를 엄격히 구분한다 — **(A) 사양 유도 벡터**: 사람이 사양을 읽고 손으로 기대값을 적은 경계 테이블(반올림 4모드 × 부호 × 정확히 절반 × 단위 배수 등). **이것만이 정답지다.** **(B) 발산 탐지 벡터**: 한 구현이 생성한 대량 랜덤 입출력. 정답지가 아니라 두 구현의 불일치를 찾는 도구이며, 불일치 시 어느 쪽이 맞는지는 (A)와 사양 원문으로 판정한다. (B)를 정답지로 쓰면 먼저 만든 구현의 버그가 사양으로 승격된다 |
| Maker–Checker | 정책 팩 변경은 작성자·승인자 분리. 세법 정오의 최종 책임은 회사 세무·법무 전문가; 시스템의 역할은 조문 단위 노출로 그 검증을 쉽게 만드는 것 |
| 배포 테스트 | 새 정책 버전 배포 전 전체 스위트 + 기존 케이스 영향도 리포트 |

---

## 7. AI 역할 경계

| AI가 한다 | AI가 하지 않는다 |
|---|---|
| 자연어 → 구조화 입력 추출 (비권위적) | 세율·한도 값 결정·추측 |
| 필수 입력 누락 탐지·되묻기 | 계좌 자격·편입 판정 |
| 승인 claim 기반 설명 렌더링 | 세금 계산, 플랜 채점, 순위 결정 |
| 공식 조문 검색·인용 보조 (Registry 종속) | 규칙 우회, 관행의 사실화 |
| 법 개정 diff·정책 팩 변경 초안 | 정책 자동 배포 |
| 유지보수 트랙 반례 공격 | 종목·수량·가격·시기 선정 |

**Renderer 계약**: "엔진 JSON 밖 숫자 금지"를 넘어 **"엔진이 승인한 claim 밖의 사실 주장 금지"**:

```ts
interface ExplanationPayload {
  allowedClaims: {
    claimId: string;
    textTemplate: string;                   // MechanismHandler.explain()이 소재 공급
    sourceRuleIds: string[];
    valueBindings: Record<string, string>;  // KRWString 등 경계 표현
  }[];
  prohibitedTopics: string[];
}
```

LLM 실패·위반 시 deterministic template fallback. AI 교차검증의 위치는 런타임이 아니라 검증 파이프라인(§2.2)이며, 두 AI의 답을 평균 내지 않는다.

---

## 8. Contract ④ — Non-functional & Model Governance

**v1 (데모 즉시 적용)**: 실명·실계좌·실소득 미사용(합성 프로필) / LLM 전달 텍스트 PII 최소화 명문화 / RunManifest에 모델·프롬프트 버전 기록 / 정책 변경 이력·승인자 로그 / deterministic fallback.

**출시 요건 (v2 목록 확정)**: 개인·금융정보 저장·전송 범위, 암호화, 보존·삭제 기간 / RBAC / 감사 로그 전면화 / 오류·이상 결과 모니터링 / 결과 정정·철회 프로토콜 / 외부 LLM 전송 보안 심의 (마이데이터·신용정보 연동은 별도 규제 검토 전 제외).

---

## 9. 법 개정 대응 3층위

| 층위 | 빈도 | 예시 (연혁†) | 대응 비용 |
|---|---|---|---|
| 값 변경 | 거의 매년 (7~8월 개정안 → 12월 통과 → 1월 시행) | 연금계좌 공제 한도 상향 (2023) | 정책 팩 값 수정 + 테스트. 코드 무변경 |
| 새 계좌 | 몇 년 주기 | ISA 신설(2016), 중개형 ISA(2021) | AccountSpec 1개 추가 + 커버리지 검사. 코드 무변경 |
| 새 메커니즘 | 드묾 | 소득공제→세액공제 전환(2014), 정부 매칭형 | MechanismHandler 1개 (플러그인·로더 불변식 통과). Optimizer·기존 핸들러 무변경 |

† 연도·사건은 입법 연혁이라는 역사적 사실이며 계산 파라미터가 아니다. 계산 값의 검증 대상은 §12.

---

## 10. 스코프 삼분류

| v1 지금 구현 | v2 설계 명시 | 의도적 제외 |
|---|---|---|
| 단일 Registry + Fact Resolver(2클래스) + RAG 보조 | 생애 시뮬레이터 독립 이중 구현 | 종목·수량·가격·시기 추천 (컴플라이언스 게이트 뒤) |
| 수치·직렬화 계약 (bigint, canonical hash) | 연 단위 DP/Solver (동일 Contract) | 주문 실행·계좌 연동 |
| AccountSpec + MechanismInstance + 정렬 키 + 로더 불변식 | AccountEvent 원장 + provenance | 세무 신고 대행 성격 기능 |
| MoneyBucket (성격×경로) 스냅샷 | 회사별 InstrumentMaster DB | 미래 세법 예측 |
| Breakpoint 전수(법적+경제적) + Coverage-bounded Pareto + 참조 탐색기 검증 | 5목적 Pareto 전면화 | 마이데이터 **실연동** (허가·컴플라이언스 = 출시 게이트) |
| MyData Adapter + 합성 fixture (표준 규격 필드명) | 실연동 전환 (소스 교체) | 특정 ETF 티커·수량·시점 추천 |
| Asset-class Location 계산 | 외부 은퇴소득 과세 모델링·연동 | 사업소득 산출세액 추정 엔진 |
| taxCharacter 신뢰도 4모드 (범위 표기) | 확률 기반 성공률 표기 | 총 은퇴 생활비 설계 (외부소득 통합) |
| ComparabilityClass 비교 세트 분리 + 투자정책 고정 | 다년 혼합 전략 자동 탐색 | |
| 모드 B (프로필 명시 + HOLD_CASH 단조성) | 기존 계좌 정밀 진단 | |
| 출력 3분류 + Exact/Estimate + SourcedValue | Replay Verifier 상시화 | |
| RunManifest / FactAnswerManifest + trace | Contract ④ 출시 요건 | |
| Claim-whitelisted Renderer + fallback | | |
| 골든·경계·속성 + Tax Calculator 독립 검증 | | |
| 수익률 3시나리오 + **은퇴 직전·직후 급락 스트레스** + 민감도 플래그 | 확률 모델 기반 성공률 | "성공 확률 N%" 표기 (모델 미검증) |
| 비용 모델링(보수·거래·환전·재조정) | | |
| 은퇴 생활비 현금버퍼(6~12개월) 인출 후보 | | |

---

## 11. 판정 기록

라운드 1~4: v1.1 §11 / 라운드 5: v1.1.1 §7 (설계 이력 문서 참조 — 구현 참조 금지, 판정 이력 열람 전용).

**라운드 6 (v1.2 반영분)**

| # | 쟁점 | 판정 | 반영 위치 |
|---|---|---|---|
| 6-1 | 문서 분산으로 인한 상충 타입 잔존 | **채택** — 단일 통합본 생성, 구버전 구현 참조 금지 | 본 문서 전체 |
| 6-2 | bigint 직렬화·해시 정규화 부재 | **채택** | §5.2 (KRWString, canonical hash, 반올림 음수 의미, 독립 구현·중간값 비교) |
| 6-3 | 타입 단위 의존·phase 순서 미보장·시간 순서 | **채택** | §5.3.2~5.3.4 (mechanismInstanceId, PHASE_ORDER, 정렬 키, KST LocalDate) |
| 6-4 | 다중 시점 유동성 목적 미정의 | **채택** (주석: maximin도 집계 방식의 선택이나 교환 계수 없는 유일 선택지로 기본값 채택, 사용자 오버라이드 허용) | §6.1.3 |
| 6-5 | PROXY 비교 오염·과세 결론 저장 | **채택** | §6.1.4 (비교 세트 분리), §5.5 (structuralClassification + resolveTaxTreatment) |
| 6-6 | FactAnswerManifest·field_bindings 보강 | **채택** | §5.6, §5.1 |

라운드 6으로 **아키텍처 리뷰를 종료**했다. 아키텍처 이슈는 코드+테스트로 해결한다.

**라운드 7 — 요구사항 변경 (v1.3 반영분).** 아키텍처 리뷰 재개가 아니라 팀 지시·제품 정의 확정에 따른 정식 개정이다.

| # | 항목 | 판정 | 반영 위치 |
|---|---|---|---|
| 7-1 | **목표 변수 오정의** — 설계 F가 brief의 "얼마 동안 얼마를"을 자산총액 프레임으로 읽었으나, 실제 목표는 **은퇴 후 월 세후 소득** | **사용자 정정 채택 (F 오류 인정)** | §0-A, §6.1.2, §6.1.6 |
| 7-2 | 마이데이터 연동 = 팀 지시 확정 | **"의도적 제외" → v1 어댑터+합성 fixture / 실연동은 출시 게이트** | §5.7, §10 |
| 7-3 | **소득 스코프 — 개인사업자 배제 부당** | **사용자 챌린지 승.** 폭발 지점은 산출세액 추정뿐이며 Exact-input으로 우회 가능. 종합소득 신고자 v1 편입 | §4.1 |
| 7-4 | 성향 처리 | 프로필 병렬 계산으로 확정. **배당형/인출형 이분법을 성향 축으로 흡수** (별개 제품 선택지 아님) | §6.1.7 |
| 7-5 | 앱 목업 오류 3건 (ISA 편입 불가 종목 추천, 전환 과세 이벤트 누락, 적합성 점수) | **전부 수정 대상** — 결정론 게이트 필요성의 실증 사례로 발표 활용 | §5.8 |
| 7-6 | 미션 문장 정밀화 | "각자의 정답을 정해준다" → "경로별 세후 결과를 계산해 제시하고 선택은 사용자" | 문서 서두 미션 |
| 7-7 | 배당 목표에서 금융소득종합과세 취급 | 현재 대상자는 입력 거절 유지, **미래 시뮬레이션의 경계 초과는 모델링 필수** | §5.3.1 |

---

**라운드 8 — 은퇴목표 계약 확정 (v1.3.1 반영분).** 외부 리뷰가 제기한 P0 10건에 대한 판정.

| # | 지적 | 판정 | 반영 |
|---|---|---|---|
| 8-1 | 지급 종료 시점 부재 → 필요 저축액이 유일하게 결정되지 않음 | **채택.** 기본 LIFETIME + UNTIL_AGE 옵션, incomeRule 기본 FLOOR_EVERY_MONTH | §0-A.3 |
| 8-2 | 국민연금·DB 등 기존 은퇴소득 미차감 | **스코프 확정(사용자 결정): CUBE는 포트폴리오가 만드는 월 현금흐름만 계산.** 단 오해 차단 2장치 필수 — 입력 문구 계약 + 선택적 단순 차감 필드 | §0-A.4 |
| 8-3 | 저축 여력 경로 부재 (필요액만 계산하고 가능액과 비교 안 함) | **채택** | §0-A.5 |
| 8-4 | "월 얼마 투자"의 세전 납입 vs 실질 부담 미구분 | **채택.** 목적함수를 순부담 최소화로 정의 | §0-A.6, §6.1.2 |
| 8-5 | 기존 계좌 taxCharacter 불확실성 | **채택 (설계 F의 단일 보수 가정보다 우수).** 신뢰도 4모드 + 범위 표기 | §5.7.1 |
| 8-6 | 성질 어휘 표에 선언한 메커니즘 누락, 일반계좌 spec 부재 | **채택.** 6종 추가 + 일반계좌도 AccountSpec 보유 명시. **v1.3 편집이 조용히 미적용된 문서 버그였음** | §5.3.1 |
| 8-7 | 목적함수가 제품 목표와 불일치 (평균 충족 허용 위험) | **채택.** minimumIncomeCoverageRatio 도입, 평균 충족은 명시 선택 시에만 | §6.1.2 |
| 8-8 | "경계점만 보면 된다"는 명제가 조건부 (비용·교차점) | **채택 — 설계 F의 설명 오류 인정.** 경제적 경계점 추가 + **Optimizer 독립 참조 탐색기** 신설 | §6.1.1 |
| 8-9 | 성향 프로필이 서로 다른 축을 혼합 | **채택.** 위험·스타일·인출정책 3축 분리 + 조합 폭발 방지(대표 조합 제한) | §6.1.7 |
| 8-10 | Asset Location v2 유보가 제품 정의와 충돌 | **부분 채택.** 자산군 수준 위치는 절세 계산과 분리 불가 → v1 계산 편입. 다만 **고객 제시 가능 여부는 컴플라이언스 분류 대상**이며 엔진 스코프가 아님 | §5.5 |
| 8-11 | 문서 일관성 (incomeType, 마이데이터 스코프 표, 버전 오기) | **전부 수정.** 원인: v1.3 편집 스크립트의 일부 replace가 앵커 불일치로 미적용 → **적용 검증 절차 도입** | 전역 |

---

**라운드 9 — 외부 3자 리뷰 흡수 (v1.3.2 반영분).** 독립 모델 3개(설계 S 계열 포함)의 기능 설명 비평에 대한 판정.

| # | 지적 | 판정 | 반영 |
|---|---|---|---|
| 9-1 | **건강보험료·준조세 누락** — "세후 월 X원"이 건보료를 반영하지 않으면 거짓 (3개 모델 공통) | **채택 — 본 라운드 최중요.** 단 모델링이 아니라 **명시적 비포함 선언 + 결과 상시 표기**로 처리(재산·가구 정보와 세법 밖 규정 필요). v2 확장 1순위로 등재 | §0-A.7 |
| 9-2 | 단조성 근거가 "현금 보유"에 의존 | **교정 채택 (설계 F 논증 개선).** 예산 제약을 부등식으로 두어 **실행가능집합의 포함관계**로 증명. 절벽은 비평활·고정전략 비단조를 만들지만 **최적값의 단조성은 유지** | §6.1.6 |
| 9-3 | 세법 한도가 명목 고정이라 실질가치가 감소 → 미래 세금 과소평가 | **채택 (신규 발견).** `LimitIndexationAssumption` 신설, 기본값 NOMINAL_FROZEN + 결과 노출 | §6.1.2 |
| 9-4 | 일반계좌를 단일 세금 통으로 보면 계획 매도 과세 계산 불가 | **채택.** `TaxableAccountLedger`(취득원가·실현 시점·실현정책) 신설 | §5.5 |
| 9-5 | 동일 투자정책 강제가 Asset Location 이득을 제거 | **채택.** 비교 2모드(순수 계좌효과 / 실행형) + **효과 분해 출력** | §6.1.4 |
| 9-6 | 확정 시간표는 미래 상태를 반영 못 함 | **채택.** 전략 템플릿에 guard 조건 필수 → 조건부 정책 | §6.1.8 |
| 9-7 | 파레토만 주면 선택 마비 | **부분 채택.** 투명한 사전순위 규칙으로 **기본안 1개 제시**(규칙 공개). **또래 비교·사회적 증거형 유도는 명시 금지** — 근거 데이터 없는 숨은 가중치의 변형 | §6.1.5 |
| 9-8 | 확률적 성공률 제시 요구 | **기각(v1).** 수익률 분포 모델 미검증 상태의 확률 표기는 정밀함의 위장. 시나리오 집합 기반 강건성(`robustness.SCENARIO_SET`)으로 대체 | §0-A.3, §0-A.7 |
| 9-9 | 목표 계약에 개인/부부 기준 부재 | **채택.** `subject: "INDIVIDUAL"` 명시, 가구 합산은 비포함 | §0-A.3, §0-A.7 |
| 9-10 | 고금리 부채 상환 우선순위 미반영 | **부분 채택.** 자금 용도 간 우선순위 판단은 v1 스코프 밖 → **비포함 선언 + 감지 시 경고** | §0-A.7 |
| 9-11 | 사업소득 전면 거절이 과도 → 시나리오 계산 허용 제안 | **보류(순서 0 안건).** 한계세율 가정 3종 제시는 검증 없는 세금 추정에 가까움. Exact-input 확장(§4.1)으로 이미 상당 부분 해소됨 | — |
| 9-12 | 검증 체계가 설명에 없음 | **오독 정정.** §6.2에 이미 존재. 다만 지적된 시나리오 케이스 8종은 유효하므로 편입 | §6.2 |
| 9-13 | "20% 즉시 수익"·"5% 세율"·"수령한도 때문에 못 뺀다" 등 | **설명 오류 인정 (사양은 정상).** 산출세액 캡·환급 재투자 가정·연금외수령 과세 성격 변경은 사양에 이미 반영돼 있으며, 대외 설명 문구를 사양 기준으로 교체 | 설명 자료 |

---

**라운드 10 — 리뷰용 로직 문서에 대한 3자 검토 (v1.4 반영분).** 지적 20여 건 중 판정 요지.

| # | 지적 | 판정 | 반영 |
|---|---|---|---|
| 10-1 | **외부 은퇴소득을 단순 차감만 하면 CUBE 인출세도 정확히 계산 못 함 (내부 모순)** | **채택 — 본 라운드 최중요, 설계 F의 모순 인정.** 최적화 대상 제외는 유지하되 **세무 상태 외생 변수로 포함.** UNKNOWN이면 세후 계산 불가 표시 | §0-A.4 |
| 10-2 | **`HOLD_CASH`를 계좌 내 현금으로 두면 이자→금융소득 합산 트리거→실제 비단조** | **채택 — 반례 성립.** slack을 **미납입 자본(시스템 외부 중립 버킷)**으로 재정의하고 합산 로직에서 격리 | §6.1.6 |
| 10-3 | **`LIFETIME`은 계산 가능한 목표가 아니다** (확률 모델·종신연금 없이 유한 자산으로 평생 = 숨은 종료 연령) | **채택.** `UNTIL_PLANNING_AGE` + `planningEndAge` + 출처. "평생" 문구 금지 | §0-A.3 |
| 10-4 | **비선견성(non-anticipativity) 제약 부재** — 시나리오별로 다른 행동을 고르면 사후 최적화 | **채택 — 놓친 표준 제약.** guard는 관측된 상태만 참조. 속성 테스트 추가. CommittedPlan / AdaptivePolicy 분리 | §6.1.8 |
| 10-5 | 추상 집합 중첩이 **유한 후보 집합의 중첩을 보장하지 않는다** | **채택.** `CandidateInheritanceInvariant`를 생성기 인터페이스 계약으로 승격 + warm start | §6.1.6 |
| 10-6 | **납입 계약 미정의** (명목 고정/물가연동/소득연동, 기간, 환급 시차) | **채택.** `ContributionContract` 신설 + 출력 3분리(입금액·경제적 순부담·최대 현금유출) | §0-A.6 |
| 10-7 | **세금준비금 누락** — 원천징수만 빼면 신고·납부 시점에 현금흐름 붕괴 | **채택.** coverage ratio 분자를 `spendableCash`로 재정의 | §6.1.2 |
| 10-8 | **taxCharacter는 불변 태그가 아니다** (전환 특례·확인 절차로 전이) | **구조 채택 + 사실은 확인 대상.** `taxCharacterEvents[]` 이력 추가, 특례 존재 여부는 §12로 | §5.4, §12 |
| 10-9 | **IRP 자격을 "소득 유무"로 판정하면 부정확** — 법적 지위별 대상 목록 | **채택.** 소득자료는 공제 효과 판정용이며 자격의 유일 원천 아님. §12 확인 항목 신설 | §12 |
| 10-10 | 최적성 주장이 여러 절에 흩어져 있고 전역 최적처럼 읽힘 | **채택.** `OptimizationClaim.optimalityStatus`(v1 = CATALOG_OPTIMAL) + 문구 규칙 | §6.1.4-b, §4.4 |
| 10-11 | "동일 기대수익" 고정은 불충분 — 경로 의존성 | **채택.** 순수 모드는 **동일 세전 총수익 경로 + 동일 거래 정책** 고정 | §6.1.4 |
| 10-12 | 메커니즘의 **최적화 성질** 호환성 미검사 | **채택.** `MechanismOptimizationProperties` 선언 + 로더 대조 | §5.3.1 |
| 10-13 | IRP 유동성은 단순 잠금 비중이 아니다 (중도인출 허용 사유) | **채택.** `LiquidityState` 신설 + §12 확인 항목 | §5.5, §12 |
| 10-14 | 규제는 UI 문구 문제가 아니다 — 출력 계층별 분류 필요 | **채택.** 4계층 분리 + 계층별 승인 상태 관리 | §4.3 |
| 10-15 | "세후"·"실수령액" 용어가 오해 유발 | **채택.** "세금 반영 후 CUBE 인출 현금흐름"으로 통일 + 툴팁 의무 | §4.4 |
| 10-16 | 복수 연금계좌의 합산 판정 규칙 확인 필요 | **채택(확인 항목).** 골든 테스트에 복수 계좌·합산 경계 케이스 추가 | §12, §6.2 |
| 10-17 | 수령 전략을 과세 구간 순서로 채우는 waterfilling 핸들러 도입 | **부분 채택.** 지원 인출 정책 문법의 **한 규칙**으로 편입(세금 경계까지 저율 구간 우선 인출). 단 **다년 상호작용 때문에 구간 그리디는 최적이 아니므로** 유일 규칙이나 최적 보장으로 쓰지 않는다 | §6.1.8 |
| 10-18 | 건보료를 월소득의 일정 비율로 곱해 스트레스 테스트 | **부분 채택 / 조건부.** 우리가 비율을 **추정하지 않는다**(가구·재산 의존, 잘못된 정밀성). **사용자가 비율을 입력하는 민감도 도구**로만 제공하고 "사용자 가정"으로 라벨 | §0-A.7 |
| 10-19 | 캐싱·계층 탐색을 v1 필수로 | **보류.** 실측 전 선제 최적화 금지. 안전한 항목(전체 키 캐싱, warm start, 안전한 지배 제거)만 v1 허용, 전이 커널 메모이제이션은 실측 후 | §10 미해결 |
| 10-20 | 스코프를 사용자 관점 포함 기준으로 재서술 + 탈락 사유 집계 | **채택(문구).** "대부분의 사용자 지원" 류 표현 금지, 온보딩 탈락 사유 익명 집계로 확장 우선순위 결정 | §4.1 |

---

## 12. 원문 대조 체크리스트 (Step 1 코퍼스)

| 파라미터 | 참조 조문 (확인 대상) | 상태 |
|---|---|---|
| ISA 비과세 한도(유형별), 초과분 분리과세율 | 조세특례제한법 §91의18 + 시행령 | 원문 대조 필요 |
| ISA 납입한도(연·총), 이월, 계약기간, 만기 손익 통산 | 조세특례제한법 §91의18 + 시행령 | 원문 대조 필요 |
| ISA 서민형 자격 소득 기준 (소득 개념 포함) | 조세특례제한법 시행령 | 원문 대조 필요 |
| 연금계좌 세액공제 대상 한도 (단독/합산) | 소득세법 §59의3 | 원문 대조 필요 |
| 세액공제율 소득 분기 (국세율·지방세 포함율 구분) | 소득세법 §59의3 | 원문 대조 필요 |
| 세액공제액의 산출세액 초과 시 처리 | 소득세법 §61 | 원문 대조 필요 |
| ISA 만기→연금 전환 특례 (비율·상한·기한) | 소득세법 §59의3③ + 시행령 §118의3 | 원문 대조 필요 |
| 연금계좌 총 납입한도 | 소득세법 시행령 §40의2 | 원문 대조 필요 |
| 연금수령 요건·수령한도 산식 | 소득세법 시행령 §40의2 | 원문 대조 필요 |
| 재원별 인출 순서 | 소득세법 시행령 §40의3 계열 | 원문 대조 필요 |
| 연금소득 연령별 원천징수율, 총액 경계·선택적 분리과세율 | 소득세법 §129 등 + 국세청 안내 | 원문 대조 필요 |
| 중도해지·연금외수령 과세율 | 소득세법 관련 조항 | 원문 대조 필요 |
| 세액 단수 처리·절사 규정 (계산 단계별) | 국고금 단수 처리 관련 법령 + 각 세법 해당 조항 | 원문 대조 필요 |
| **배당·분배금 과세 (일반계좌 원천징수율, ISA 비과세·초과분 처리)** | 소득세법 배당소득 관련 조항 + 조특법 §91의18 | **v1.3 신규 — 1순위** |
| **금융소득종합과세 기준·경계 및 초과 시 과세 방식** | 소득세법 관련 조항 | **v1.3 신규 — 1순위** |
| **계획 매도 인출 시 과세 (국내주식형·기타 상품 구분)** | 소득세법 관련 조항 + 조특법 | **v1.3 신규** |
| 종합소득 브랜치: 세액공제율 종합소득금액 기준 | 소득세법 §59의3 (종합소득 분기) | **v1.3 신규 (소득 스코프 확장)** |
| ISA 서민형 자격의 종합소득 기준 | 조세특례제한법 시행령 | **v1.3 신규 (소득 스코프 확장)** |
| 마이데이터 표준 API 정보제공 규격 (은행·금투·보험 IRP/DC/수신계좌) | 금융보안원 마이데이터 규격 (규격 버전·시행일 기록) | **v1.3 신규 — 필드 매핑 검증용** |
| 일반계좌 매매차익 과세 (상품 유형별 구분) | 소득세법·조특법 관련 조항 | **v1.3.1 신규 (TAXABLE_SALE_TAX)** |
| **수명 가정 (LIFETIME 모드 기준 생명표)** | 통계청 생명표 등 공표 자료 — 세법 아님, `assumptionSet`으로 버전 관리 | **v1.3.1 신규 — 팀 확정 필요** |
| 일반계좌 실현손익 인식 방식(FIFO·평균) 및 손익통산·이월 규칙 | 소득세법·조특법 관련 조항 | **v1.3.2 신규 (TaxableAccountLedger)** |
| 한도의 물가연동 여부 (명목 고정이 사실인지 확인) | 각 근거 법령의 한도 규정 | **v1.3.2 신규 — 가정 설정 근거** |
| 건강보험료 소득 산정에서 공적·사적연금 취급 | 국민건강보험 관련 규정 | **v2 참조용 (v1 비포함 — §0-A.7)** |
| IRP 편입 제한 (개별주 불가, 위험자산 비중 등) | 근로자퇴직급여보장법 + 퇴직연금감독규정 | 원문 대조 필요 (STATUTE/RULE/PROVIDER_POLICY 구분) |
| **IRP 설정 자격 — 법적 지위별 대상 목록** (퇴직급여 수령자·퇴직연금 가입자·자영업자·근로자 유형·직역연금 대상 등) | 근로자퇴직급여보장법 및 시행령 | **v1.4 신규 — 중요.** "소득 유무"로 판정하는 것은 부정확할 가능성이 높다. 소득자료는 세액공제 효과 판정용이며 개설 자격의 유일한 원천이 아니다 |
| **IRP 중도인출 허용 사유** (주택·의료비·회생 등) 및 증빙 요건 | 근로자퇴직급여보장법 시행령 | **v1.4 신규.** 유동성을 단일 "잠금 비중"으로 모델링하면 부정확 — 예정 지출의 종류에 따라 같은 잔액의 가용성이 달라짐 |
| **미공제 납입액의 후년도 전환 특례** 및 과세제외금액 확인 절차의 효력 발생 시점 | 소득세법 시행령 (연금계좌 관련) | **v1.4 신규 — 중요.** 존재 여부와 요건을 원문으로 확인. 사실이면 taxCharacter가 이벤트로 전이됨(§5.4) |
| **연금소득의 계좌 간 합산 판정** (복수 연금계좌 보유 시 총액 경계 적용 방식) | 소득세법 연금소득 관련 조항 | **v1.4 신규.** 계좌별이 아니라 합산 기준으로 판정되는 부분이 있는지 확인 |
| 투자자문업 정의·등록 요건 | 자본시장법 §6⑦, §18 | 컴플라이언스 참조 |
| 금융분야 AI 가이드라인 (2026.6.22) | 금융위 본문 | 원칙 준수 확인 |

수집 원칙: 국가법령정보센터 원문 + 시행일 스냅샷 + 해시. 국세청·금융위 자료는 ADMIN_GUIDANCE 태깅. PROPOSED는 격리 보관.

---

## 13. 구현 순서

| 순서 | 산출물 | 완료 기준 |
|---|---|---|
| 0 | **과장님 공유 패키지** (본 문서 + 2페이지 요약본 + 아래 안건 5종) | 방향 승인 — **본 구현의 선행 게이트** |
| 1 | `numeric` 모듈: KRW/DecimalRate/RoundingSpec + canonical serialization·hash | 단위 테스트 + 직렬화 왕복 테스트 |
| 2 | Policy / AccountSpec / RunManifest JSON Schema + 로더(커버리지·불변식 검사) | 스키마 검증 + 불량 spec 거절 테스트 |
| 3 | MechanismInstance + phase/event ordering (정렬 키 구현) | 정렬 결정론 속성 테스트 |
| 4 | 정책 코퍼스 원문 수집 (§12) — **코드와 병렬 진행 가능, 즉시 착수** | 스냅샷 + 3축 태깅 완료 |
| 5 | Tax Calculator (TS) ∥ 독립 기준 계산기 (Python) 병렬 구현 — **수령부(PENSION_WITHDRAWAL_TAX·DIVIDEND_TAX·FINANCIAL_INCOME_AGGREGATE) 우선** | 골든·경계 differential 통과 |
| 6 | Optimizer: **모드 B 역산(주)** + breakpoint 전수 + Coverage-bounded Pareto + 성향 프로필 병렬 | 속성 테스트(단조성·퇴화 방지·목표 미달 처리) 통과 |
| 6.5 | MyData Adapter + 합성 fixture (페르소나 3종) | 필드 매핑 검증, `is_consent` 누락 시나리오 테스트 |
| 7 | AI 층: Router + Parser + Validation + 확인 게이트(누락 계좌 확인 포함) + Claim Renderer | E2E 시나리오 통과 |
| 8 | 데모 패키지: 3분류 UI + trace 뷰 + "이 시스템은 어떻게 늙는가"(§9) | 8/14 발표 |

**순서 0 결정 안건 (과장님 확인 필요)**

| # | 안건 | 왜 사람이 결정해야 하는가 |
|---|---|---|
| 1 | **배포 맥락** — 사내 도구 수준인가, 고객 대상 서비스의 기반 설계인가 | 검증 수준·Contract ④ 출시 요건 범위가 여기서 결정됨 |
| 2 | **소득 스코프 재정의 승인** — 종합소득 신고자 Exact-input 편입, 3종 계좌 밖 수단(노란우산 등) 경계 | 커버리지 주장 범위 = 제품 약속 |
| 3 | **종목 추천 화면의 컴플라이언스 분류** (앱 목업 첨부) — 특정 종목·수익률 표기의 투자자문·광고 규정 해당 여부 | 코드 문제가 아니라 출시 조건. 데모는 (a) "규제 분류 전" 라벨 + 합성 데이터 시연 / (b) 편입 게이트·원화 효과까지 축소한 안전판 중 선택 |
| 4 | **taxCharacter 공백 처리 정책** — 마이데이터가 세액공제 이력을 제공하지 않는 상황에서 수령 시뮬레이션 전제: (a) 사용자에게 질의 (b) 전액 공제받은 것으로 보수적 가정(세금 과대추정 = 안전 방향) (c) 범위 제시. **권고: b + 범위 표기** | 결과 숫자의 성격을 바꾸는 정책 판단 |
| 5 | **성향 축 3분리 + 대표 조합 목록 승인** (위험·스타일·인출정책) | 제시할 조합 수 = 화면·검증 비용 |
| 6 | **목표 범위 확정** — "CUBE 포트폴리오 월 현금흐름"으로 한정하고 입력 문구를 그에 맞춤(§0-A.4). 총 생활비 설계로 갈 경우 외부소득 과세 모델링이 필요하며 v1 범위 초과 | 사용자 오해 시 과대 저축 결과 → 제품 신뢰 문제 |
| 7 | **수명 가정 출처 승인** (LIFETIME 모드) | 세법 값이 아니라 모델 가정 — 출처 있는 값 필요 |

**사람만 할 수 있는 작업 (병렬 진행)**: §12 원문 스냅샷 확보(수령부·배당 과세 1순위) / 국세청 공식 계산 사례 골든 정답지 3~5건 / 가정 세트(수익률 보수·기준·낙관 + 물가) 출처 있는 값으로 팀 확정 / 대표 페르소나 3종 확정(합성 fixture 기준) / 손계산 대조 Case A~E.

A4 기존 산출물: UI·입력 폼·테스트 러너 구조·대표 케이스 재사용, 점수 함수·고정 세율표·고정 수익 가정은 교체 대상이며 프론트 프로토타입 겸 게이트 개념 PoC로 보존.

---

## 부록 B. 설계 의도 (Design Rationale) — 각 부품이 왜 존재하는가

본 부록은 구현자·검토자가 "왜 이렇게 복잡한가"를 이해하고, **선의의 단순화로 설계를 파괴하지 않도록** 하기 위한 근거 기록이다. 파라미터 값은 포함하지 않는다.

### B.1 문제의 성질

**(a) 한계가치는 연속이 아니라 계단이다.** *(단, 경계는 법적 한도만이 아니다 — B.4 참조)* 세제 혜택은 금액에 비례하지 않고 특정 경계(공제 대상 한도, 납입 한도, 비과세 여력)에서 꺾인다. 경계 안의 1원과 밖의 1원은 가치가 다르고, 경계를 넘는 순간 다른 계좌의 1원이 더 커진다. 따라서 "어느 계좌가 최적"은 고정값이 아니라 **이미 납입한 금액의 함수**이며, 최적해는 단일 계좌 몰빵이 아니라 혼합 배분이 된다. → `emitBreakpoints()`, 후보 열거

**(b) 넣는 시점의 계산만으로는 답이 안 나온다.** 연금계좌는 납입 시 공제, 수령 시 과세라는 **시점 간 거래**다. 지금의 이득과 수십 년 뒤 비용을 비교해야 하며, 그 사이 성장·전환·수령 한도·연령별 세율이 개입한다. → `Simulator`(생애 전 기간 실행)

**(c) 시간 순서가 답을 바꾼다.** ISA 만기 후 연금계좌 전환처럼 시점에 따라 혜택이 생기는 전략이 존재한다. 정적 금액 배분표로는 이 전략을 **표현할 공간 자체가 없다.** 답의 형식은 금액표가 아니라 시간표여야 한다. → `PlanEvent`, 정렬 키(§5.3.4), 전략 템플릿

**(d) 필요 자산 규모와 계좌 배치는 연립이다.** 수령 계좌에 따라 세후 금액이 달라 필요 규모가 바뀌고, 수령 한도 때문에 배치가 다시 제약된다. 순차 계산(규모 확정 → 배치 결정)으로 풀리지 않는다. → 후보 전수 비교 + 모드 B 역산의 결합

**(e) 돈은 균질하지 않다.** 연금계좌 잔액은 공제받은 원금·공제받지 않은 원금·운용수익이 섞여 있고, 각각의 수령 과세와 인출 순서가 다르다. 단일 `balance`로는 수령 계산이 원리적으로 틀린다. → `MoneyBucket`(taxCharacter × originType)

### B.2 기각된 대안과 이유 (되돌리지 말 것)

| 대안 | 왜 기각했는가 |
|---|---|
| 고정 우선순위 규칙 ("연금저축 → IRP → ISA") | 결론을 코드에 박는 방식. 새 계좌가 어디 끼는지 사람이 매번 판단해야 하고, B.1(a)의 계단 구조를 반영하지 못함 |
| 증분 탐욕 알고리즘 단독 | 초기 설계였으나 철회. 수령 단계 과세·계좌 간 상호작용으로 분리 가능성과 오목성이 깨져 최적성이 성립하지 않으며, B.1(c) 시간 전략을 **생성하지 못함** |
| 적합성 점수(70/75/90 등) | 점수의 근거를 제시할 수 없음(숨은 가중치). 대체 지표는 편입 가능 여부(게이트) + 세후 원화 효과(시뮬레이터 출력) |
| 목적함수에 유동성·위험 페널티 계수 | "유동성 1단위 = 세후 X원" 계수는 공식 근거가 존재할 수 없음. 시스템이 정하면 사용자 선호를 가장한 내부 판단이 됨 |
| "균형형" 대표안 | 균형이라는 이름 자체가 교환 비율 판단. 목적별 극단 + 사용자 서열 + 전체 열람으로 대체 |
| 성향을 단일 점수로 환산 | 고배당·성장 사이에 객관적 우열이 없음. 프로필 병렬 실행으로 대체 |
| 계좌별로 다른 수익률 가정 사용 | 세제 비교가 수익률 비교로 오염됨. 투자정책 고정 + ComparabilityClass |
| 은퇴 시점 자산총액을 목표 변수로 사용 | 사용자의 실제 목표는 월 세후 실질 소득. 자산총액은 중간값 |

### B.3 성능 최적화 시 절대 훼손 금지 항목

| 항목 | 제거·단축 시 무엇이 깨지는가 |
|---|---|
| 액션 공간의 `HOLD_CASH` | "저축 증가 → 결과 비악화"의 구조적 보장이 사라져 모드 B 이분탐색의 전제가 무효. 제거하려면 `boundedGridSearch()` 폴백 필수 |
| 후보 전수 열거 → 탐욕 치환 | B.1(a)(c)를 놓침. 성능 문제는 breakpoint 수 축소가 아니라 v2의 DP/Solver로 해결하며, 동일 Optimizer Contract를 유지해야 함 |
| MoneyBucket → 단일 balance 병합 | 수령 단계 과세 계산이 원리적으로 오류 (B.1(e)) |
| 이벤트 정렬 키 축소 | 같은 해 내 순서(성장 후 전환 vs 전환 후 성장)가 비결정적이 되어 재현성 상실 |
| 프로필 병렬 → 단일 대표 프로필 | 성향 축이 사라져 시스템이 대신 선택하는 구조가 됨 |
| `rule_trace` / RunManifest 생략 | 감사 가능성 상실. 오류가 숨을 수 있는 구조가 됨 |

### B.4 정정 기록 — "경계점 사이는 볼 필요 없다"는 명제 [v1.3.1]

초기 설명에서 "꺾임과 꺾임 사이에서는 특별히 유리할 이유가 없으므로 경계점만 보면 된다"고 기술했으나, 이는 **조건부로만 참이다.** 계좌별 고정비·상품 보수·거래비용·비율 제약이 개입하면 두 계좌의 한계 세후가치가 교차하는 지점이 법정 한도와 일치하지 않는다.

정정된 명제:

> **법적·경제적 결과가 바뀌는 모든 경계점을 후보로 생성하고, 그 범위 안의 후보를 전수 비교한다. 후보 공간의 완전성은 독립 참조 탐색기(brute-force)로 검증한다.**

구현 귀결: `emitBreakpoints()`는 법적 경계 외에 비용 함수 경계·한계가치 교차점·비율 제약 교차점·목표 충족 경계를 방출해야 하며, Optimizer에도 Tax Calculator와 별개의 독립 참조 구현이 필요하다(§6.1.1).

### B.5 세 줄 요약

1. 정책이 데이터라서 늙지 않는다 — 개정은 값 수정, 새 계좌는 spec 추가, 새 제도는 핸들러 1개.
2. 심판이 하나라서 비교가 공정하다 — 모든 후보가 같은 시뮬레이터·같은 가정·같은 투자정책을 통과한다.
3. 판단 경로에 AI가 없어서 전수 검증이 가능하다 — 결정론이기에 골든·경계·속성 테스트와 독립 계산기 대조가 성립한다.

---

## 부록 A. 설계 이력 및 사용 도구

독립 설계안 2건(설계 F: Claude Fable 5, Anthropic / 설계 S: GPT SOL Pro, OpenAI)을 6라운드 adversarial review시키고 사람이 각 쟁점을 판정·병합했다. 본 프로세스는 §7의 AI 교차검증 파이프라인을 설계 단계에 선적용한 것이며, 최종 판단과 책임은 사람(작성자 및 검토자)에게 있다.

---

*본 문서는 v1.3.2로 설계·구현 계약을 통합 확정하며, 모든 세법 파라미터 값(반올림 사양 포함)은 원문 대조 및 세무·법무 검토 승인 전까지 미확정이다.*