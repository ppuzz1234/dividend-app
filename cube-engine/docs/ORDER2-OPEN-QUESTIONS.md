# 순서 2 미해결 질문 — 사양 v1.4 의 모순·누락

> 규칙: 사양에서 모순·누락을 발견하면 임의 해석하지 않고 여기 적은 뒤,
> **가장 보수적인 쪽(거절하는 쪽)으로** 구현하고 진행한다.
> 각 항목은 "무엇이 비었나 / 어떻게 구현했나 / 뒤집히면 무엇을 고쳐야 하나" 순서로 적는다.

---

## Q1. `pack_kind` 가 사양 v1.4 본문에 없다 (지시와 문서 불일치)

**발견**: 작업 지시는 "pack_kind 3종이 §5.1 에 신설됐다"고 했으나, `CUBE_설계계약통합본_v1.4.md`
전체 grep 결과 `pack_kind` · `VERIFIED_LAW` · `SYNTHETIC_DEMO` · `UNVERIFIED_DRAFT` 문자열이
**0건**이다. §5.1 의 YAML 예시에도 없다. 해당 개념은 `CLAUDE.md` 절대 규칙 0 에만 존재한다.

**구현**: CLAUDE.md 규칙 0 은 "위반 = 즉시 실패 처리" 등급이므로 그대로 구현했다.
`pack_kind` 를 정책 팩의 **필수** 최상위 필드로 두고, 누락·열거 밖을 거절한다(R01·R02).
기본값을 두지 않은 이유: 기본값이 있으면 등급을 안 적은 팩이 조용히 어떤 등급으로 취급되고,
그게 `VERIFIED_LAW` 쪽으로 기울면 미검증 값이 법률로 승격된다.

**뒤집히면**: 사양 §5.1 YAML 스키마에 `pack_kind` 를 추가하고 이 항목을 닫는다.
반대로 pack_kind 개념 자체가 폐기되면 `packages/policy/src/packKind.ts` 와 R01·R02·R25~R29 를 제거한다.

---

## Q2. §5.1 "`review.approved == false` 규칙은 배포 제외" 와 CLAUDE.md 규칙 0 이 충돌한다

**발견**: §5.1 불변식은 승인되지 않은 규칙의 배포를 **조건 없이** 금지한다. 그런데 CLAUDE.md 규칙 0 은
`SYNTHETIC_DEMO` 팩이 **계산되어야 한다**고 요구한다(스탬프 부착 조건). 합성 값은 정의상 세무 검토
승인 대상이 아니므로 `approved: true` 를 받을 수 없다. 두 규칙을 문자 그대로 적용하면
`SYNTHETIC_DEMO` 팩은 존재할 수 없다.

**구현**: `approved` 불변식을 **pack_kind 별로 분기**했다.

| pack_kind | `review.approved` 요구 | 계산 | 근거 |
|---|---|---|---|
| `VERIFIED_LAW` | 전 규칙 `true` + `reviewer_id`·`reviewed_at` 필수. 하나라도 아니면 로딩 거절 | 허용, 스탬프 없음 | §5.1 불변식을 가장 엄격하게 적용 |
| `SYNTHETIC_DEMO` | `true` 를 **금지**한다 (승인 참칭 거절, R29) | 허용, **스탬프 강제** | 규칙 0 |
| `UNVERIFIED_DRAFT` | 무관 | **금지** (`UnverifiedPolicyError`) | 규칙 0 · §0 문서 규칙 |

즉 §5.1 의 "배포 제외"를 "**법률 등급 팩의 배포 제외**"로 좁혀 읽었다. `SYNTHETIC_DEMO` 는 스스로
법이 아님을 선언하므로 §5.1 이 막으려던 위험(미검증 값이 법으로 통용되는 것)이 스탬프로 차단된다.

**보수성 확인**: 이 해석은 검사를 약화시키지 않는다. `VERIFIED_LAW` 에는 §5.1 원문보다 **더 강한**
조건(서명 필수, R26)을 걸었고, `SYNTHETIC_DEMO` 에는 원문에 없는 조건(승인 참칭 금지, R29)을 추가했다.

**뒤집히면**: §5.1 에 pack_kind 별 분기를 명문화하거나, `SYNTHETIC_DEMO` 도 승인 절차를 밟는 것으로
정하면 R29 를 뒤집는다.

---

## Q3. §5.3.1 최적화 성질 — 지원 조합 집합이 열거돼 있지 않다

**발견**: v1.4 가 `MechanismOptimizationProperties` 6개 불리언을 신설하고 "지원하지 않는 성질 조합은
로딩 거절 대상"이라 했으나, **예시 하나(`nonConvex && !finiteBreakpoints`)만** 주고 지원 집합 전체를
정의하지 않았다. 6개 불리언 = 64조합인데 판정 규칙이 1개뿐이다.

**구현**: 화이트리스트가 아니라 **거절 규칙 목록**으로 두되, 사양 예시 1건에 보수적 확장 2건을 더했다.

1. `nonConvex && !finiteBreakpoints` — 사양 명시 (R44)
2. `pathDependent && !finiteBreakpoints` — 경로 의존인데 경계점이 유한하지 않으면 후보 공간을
   유한하게 만들 수 없다. §6.1.1 의 "breakpoint 조합으로 유한 후보 전수 열거"가 성립하지 않는다 (R45)
3. `!piecewiseLinear && !piecewiseMonotone && !finiteBreakpoints` — 세 구조 중 하나도 없으면
   현 Optimizer 가 기댈 성질이 남지 않는다 (R46)

**미선언은 거절이다**(R43). "선언 안 했으니 안전"으로 처리하면 검사가 무력화된다.

**뒤집히면**: 사양이 지원 조합을 명시하면 `optimizationCompatibility.ts` 의 `REJECTION_RULES` 를
그 정의로 교체한다. 확장 2건은 사양 근거가 아니라 보수적 판단이므로 코드에 그렇게 주석돼 있다.

---

## Q4. 로딩 시점에 의존성·읽기/쓰기 선언이 어디 있는지 사양이 정하지 않았다

**발견**: §5.3.3 로더 불변식은 "의존성 순환 / 동일 phase 동일 필드 동시 쓰기 / 선행 인스턴스 누락"을
로딩 거절 사유로 규정한다. 그런데 `dependsOnInstanceIds` · `reads` · `writes` · `phase` 는
`MechanismHandler`(런타임 객체)의 필드이고, 정책 팩·AccountSpec 이 싣는 `MechanismInstance` 에는
없다. **spec 파일만으로는 이 검사를 수행할 수 없다.**

**구현**: 로더가 `EngineCapabilityRegistry` 를 **입력으로 받는다**. 이는 엔진이 제공하는 정적 선언표
(`MechanismType` → `{ phase, reads, writes, dependsOnTypes, optimizationProperties }`)이며
핸들러의 `apply()` 로직과 무관하다. 로더는 이 표와 AccountSpec 의 인스턴스 목록을 대조해
순환·중복쓰기·선행 누락을 판정한다. `AccountSpec` 스키마에 필드를 추가하지 않았다
(사양 인터페이스 임의 확장 금지).

**뒤집히면**: 사양이 `MechanismInstance` 에 `dependsOnInstanceIds` 를 추가하기로 하면
`mechanismGraph.ts` 의 의존 해석을 타입 기반에서 인스턴스 기반으로 바꾼다.

---

## Q5. `StateField` 와 `PlanEventType` 이 사양에 정의돼 있지 않다

**발견**: §5.3.3 은 `reads: StateField[]` · `writes: StateField[]` 를, §5.3.2 는
`supportedEvents: PlanEventType[]` 를 쓰지만 두 타입의 **내용이 사양 어디에도 없다**.

**구현**: 순서 2 에 필요한 최소 닫힌 열거를 `packages/policy/src/vocabulary.ts` 에 두고,
열거 밖 값을 거절한다(R40). 열거 내용 자체는 잠정이며 `TODO(순서3)` 마커를 달았다 —
순서 3 에서 정렬 키·상태 모델을 구현할 때 확정된다. **열린 문자열로 두지 않은 이유**: 열어두면
오타난 필드명이 동시 쓰기 검사(R49)를 조용히 통과한다.

**뒤집히면**: 사양이 두 열거를 정의하면 `vocabulary.ts` 를 그 정의로 교체하고 TODO 를 제거한다.

---

## Q6. `effect.value` 의 표현 타입이 정해져 있지 않다

**발견**: §5.1 YAML 은 `value: <원문 대조 후 기재>` 로만 두고 타입을 말하지 않는다. §5.2 는 금액에
부동소수점을 금지하고 세율을 `DecimalRate`(유리수)로 규정하지만, **정책 팩 YAML 에서 그 값을 어떻게
적는지**는 규정하지 않았다.

**구현**: 두 형태만 허용한다.
- `unit: RATE` → `{ numerator: <IntegerString>, denominator: <IntegerString> }` (denominator > 0)
- `unit: KRW` → IntegerString

JSON number(정수 포함)는 **전부 거절**한다(R18). 정수 number 를 허용하면 YAML 파서가
`1_0000_0000` 같은 값을 float 로 읽는 경로가 열리고, 2^53 경계에서 조용히 깨진다.

**뒤집히면**: 사양이 표현을 정하면 `policyValue.ts` 의 파서를 교체한다.

---

## Q7. RunManifest 에 합성 스탬프 필드가 없다

**발견**: CLAUDE.md 규칙 0 은 합성 값 결과의 **모든 출력**에 스탬프를 요구하는데, §5.6 `RunManifest`
정의에 해당 필드가 없다.

**구현**: `RunManifest` 에 `packKind` 와 선택 필드 `syntheticStamp` 를 추가하고,
`packKind === "SYNTHETIC_DEMO"` 일 때 `syntheticStamp` 를 **필수**로 검증한다(R56).
사양 인터페이스에 필드를 더하는 것이 원칙적으로는 금지지만, §5.7 이 이미
"**RunManifest 추가 필드**: `mydataSpecVersion` …" 로 확장 선례를 만들어 두었으므로 같은 방식을 따랐다.

또한 계산 결과는 전부 `StampedResult<T> = { value: T; stamp: ResultStamp }` 봉투로만 나간다.
봉투는 brand 되어 있어 외부에서 만들 수 없고, 만드는 함수는 Registry 내부에 하나뿐이다 —
"스탬프 없는 반환 경로가 존재하지 않음"을 타입 수준에서 강제하기 위함이다(R28).

**뒤집히면**: §5.6 에 스탬프 필드가 정식 추가되면 이 항목을 닫는다.

---

## Q8. §5.3.4 정렬 키를 로딩 시점에 전부 검사할 수 없다

**발견**: 정렬 키는 `event.occurredAt → event.sequence → PHASE_ORDER → instance.priority →
mechanismInstanceId` 인데, 앞의 두 키는 **이벤트**에서 온다. 로딩 시점에는 이벤트가 없다.

**구현**: 로더는 정적 꼬리 3키(`PHASE_ORDER → priority → mechanismInstanceId`)가 계좌 내에서
전순서를 이루는지만 검사한다(R50). `mechanismInstanceId` 가 유일하면(R36) 항상 결정되므로
R50 은 사실상 R36 의 다른 표현이지만, 사양이 별도 조항으로 규정했으므로 별도 검사·별도 테스트로 뒀다.
이벤트 키를 포함한 전체 정렬 결정론은 `TODO(순서3)`.

**뒤집히면**: 없음. 순서 3 에서 이벤트 축이 추가되면 검사가 확장될 뿐이다.

---

## Q9. §5.1 충돌 해소에서 "동률"의 정의가 없다

**발견**: "동일 `applies_to` + 동일 `conflict_group` 내에서만 서열 적용 … 서열로 해소 불가 시에만 거절"
이라 했으나, 같은 `authority.type` 의 두 규칙이 같은 날짜에 동시 유효할 때 무엇으로 더 판정하는지
(공포일? 수록일? 시행일?) 정하지 않았다.

**구현**: **추가 tie-break 없이 거절**한다(R24). `promulgated_at` 이 늦은 쪽을 택하는 규칙은
그럴듯하지만 사양 근거가 없고, 근거 없는 판정을 자동화하는 것이 이 시스템이 막으려는 실패다.

**뒤집히면**: 사양이 2차 tie-break 를 정하면 `conflictResolution.ts` 에 추가한다.
그 전까지 거절이 옳다 — 사람이 팩을 고치는 게 정답인 상황이다.

---

## Q11. §5.1 의 `field_bindings` 키가 §5.2.1 의 canonical key 규칙을 위반한다 (사양 내부 모순)

**발견**: §5.1 정책 팩 예시는 이렇게 적혀 있다.

```yaml
field_bindings:
  effect.value: [LAW_x]
  effect.rounding: [RULE_x]
```

그런데 §5.2.1 canonical JSON 규약은 **key 를 `[A-Za-z0-9_]` 로 제한**하고 위반 시 throw 를 요구한다.
점(`.`)은 이 문자 집합에 없다. 그리고 §5.2 는 "**스냅샷 해시**"가 같은 정본 절차를 쓴다고 규정한다.
따라서 **사양이 예시로 제시한 정책 팩은 사양이 규정한 방식으로 해시할 수 없다.** 해시할 수 없으면
RunManifest 의 `policySnapshotVersion` 재현성(§1.3)이 성립하지 않는다.

이것은 표기 취향 문제가 아니라 두 절이 서로를 무효화하는 모순이다.

**구현**: 보수적으로 **거절**한다(R31b). `loadPolicyPack` 이 스키마 검증보다 먼저 전체 key 를 훑어
`[A-Za-z0-9_]` 밖이면 `NON_ASCII_KEY_IN_PACK` 으로 던진다. 결과적으로 **사양 §5.1 의 예시 팩은
이 로더를 통과하지 못한다.** 테스트 fixture 는 `effect_value` · `effect_rounding` 언더스코어 표기를 쓴다.

거절 쪽을 택한 이유: 통과시키려면 canonical key 규칙을 넓혀야 하는데, 그 규칙은 TS/Python 정렬
불일치를 원천 차단하려고 좁게 잡은 것이다(§5.2.1). 해시 규칙을 데이터 편의로 넓히는 것이
데이터 표기를 바꾸는 것보다 훨씬 위험하다.

**뒤집히면** 둘 중 하나로 닫는다.
1. §5.1 예시를 `effect_value` 형태로 고친다 (권장 — 규칙 변경 없음)
2. `field_bindings` 를 `[{ field: "effect.value", source_ids: [...] }]` 배열로 바꾼다 —
   점이 key 가 아니라 **값**이 되므로 canonical 규칙과 충돌하지 않는다

---

## Q10. `SYNTHETIC_DEMO` 스탬프 문구가 사양이 아니라 지침에만 있다

**발견**: 스탬프 문구 "합성 세법 값 · 실제 세법이 아님"은 CLAUDE.md 규칙 0 의 표현이며 사양 §4.4
제품 문구 규칙에는 없다.

**구현**: CLAUDE.md 문구를 상수로 두고(`SYNTHETIC_STAMP_TEXT`), 테스트가 그 상수의 존재와
부착을 검증한다. 문구 자체를 테스트에 하드코딩하지 않고 상수를 참조해, 문구가 바뀌어도
"부착된다"는 계약은 유지되게 했다.

**뒤집히면**: §4.4 에 정식 문구가 들어오면 상수를 교체한다.
