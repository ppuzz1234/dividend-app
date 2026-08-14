# 순서 2 거절 매트릭스 — 로딩 단계에서 부분 실행 없이 거절해야 하는 모든 조건

> 사양: `CUBE_설계계약통합본_v1.4.md` · 지침: `CLAUDE.md`
> 이 문서는 순서 2의 **설계 문서**다. 코드보다 먼저 쓰였고, 구현과 테스트는 이 표를 따른다.
>
> **원칙 (사양 §5.3.1 · §5.3.3 · CLAUDE.md 규칙 5)**: 불변식 위반 시 부분 계산이 아니라
> 명시적 로딩 거절이다. 로더는 불량 spec 을 **보정하지 않는다** — 거절만 한다.
> 거절 테스트가 실패하면 검사를 약화시키는 게 아니라 fixture 나 테스트 기대를 고친다.
>
> 표와 테스트의 1:1 대응은 사람 눈이 아니라 `matrix-coverage.test.ts` 가 기계적으로 검증한다.

## 오류 클래스

| 클래스 | 언제 | 필드 |
|---|---|---|
| `PolicyContractError` | 로딩 시점 불변식 위반. 부분 로딩 없이 즉시 throw | `code`, `detail`, `path` |
| `UnverifiedPolicyError` | 로딩은 통과했으나 **계산 경로 진입 시** 미검증 값 사용 (사양 §0 문서 규칙, §5.2.1 주석) | `packKind`, `ruleId` |

`NumericContractError`(순서 1, `@cube/numeric`)는 정책 계층이 던지지 않는다. canonical 해시 경로에서 올라오면 정책 계층 code 로 감싼다 — 정책 팩이 해싱 불가라는 사실 자체가 거절 사유이므로 `NON_ASCII_KEY_IN_PACK` 으로 보고한다(R31).

`SCHEMA_VIOLATION` 은 고유 code 를 배정하지 않은 구조 위반의 backstop 이다. 거절된다는 결론은 같고 감사 로그의 해상도만 달라진다.

---

## A. 정책 팩 / 규칙 (사양 §5.1)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R01 | `pack_kind` 누락 | CLAUDE.md 규칙 0 | 팩의 권위 등급을 모르면 스탬프·거절 판정을 할 수 없다. 기본값을 두면 미검증 값이 조용히 법률로 취급된다 | `PACK_KIND_MISSING` | `policy-pack.reject.test.ts` › R01 pack_kind 누락 |
| R02 | `pack_kind` 가 열거 밖 | CLAUDE.md 규칙 0 | 3종 외의 등급은 처리 규칙이 정의돼 있지 않다 | `PACK_KIND_INVALID` | `policy-pack.reject.test.ts` › R02 pack_kind 열거 밖 |
| R03 | `policy_snapshot` 누락 | §5.1 | RunManifest 재현성의 단위. 없으면 결과를 특정 정책 버전에 못 묶는다 | `SNAPSHOT_VERSION_MISSING` | `policy-pack.reject.test.ts` › R03 policy_snapshot 누락 |
| R04 | 규칙 `id` 중복 | §5.1 (버전 누적·덮어쓰기 금지) | 같은 id 두 규칙이면 조회 결과가 비결정적이 된다 | `DUPLICATE_RULE_ID` | `policy-pack.reject.test.ts` › R04 rule id 중복 |
| R05 | `effect` 가 있는데 `sources` 에 `role: PRIMARY` 없음 | §5.1 불변식 | "PRIMARY source 없이 effect 기재 불가". 근거 없는 값이 계산에 들어가는 것을 막는 1차 방어 | `EFFECT_WITHOUT_PRIMARY_SOURCE` | `policy-pack.reject.test.ts` › R05 PRIMARY source 부재 |
| R06 | `sources` 가 빈 배열 | §5.1 불변식 | R05 의 특수 케이스. 출처 0건은 원문 대조 자체가 성립하지 않는다 | `EMPTY_SOURCES` | `policy-pack.reject.test.ts` › R06 sources 빈 배열 |
| R67 | 규칙이 인용한 `source_id` 가 **코퍼스에 실재하지 않음** (`knownSourceIds` 주입 시에만 검사) | §5.1 불변식 · §12 수집 원칙 | R05·R06 은 출처가 **선언됐는지**만 본다. 그 id 가 **실제 조문을 가리키는지**는 아무도 검사하지 않아, 존재하지 않는 조문을 근거로 든 규칙이 통과했다. 이 검사가 두 미션을 잇는 이음매(정책 팩 `source_id` == 코퍼스 `ArticleSnapshot.sourceId`)를 기계적으로 지킨다. **`SYNTHETIC_DEMO` 는 면제** — 합성 팩이 합성 출처를 갖는 것은 정상이며, 여기 걸면 알고리즘 검증용 fixture 를 못 쓴다. `knownSourceIds` 미지정 시 미검사(기존 호출 무회귀) | `SOURCE_SNAPSHOT_NOT_FOUND` | `phase8-gaps.test.ts` › 8-3 코퍼스에 없는 source_id 를 인용하면 거절 |
| R07 | `field_bindings` 가 `sources` 에 없는 `source_id` 참조 | §5.1 | dangling 참조. 어느 조문이 어느 필드를 뒷받침하는지 추적 불가 | `DANGLING_FIELD_BINDING` | `policy-pack.reject.test.ts` › R07 field_bindings dangling |
| R08 | `lifecycle.status` 가 열거(`PROPOSED`/`ENACTED`/`REPEALED`) 밖 | §5.1 | 유효성 판정식이 정의되지 않은 상태 | `LIFECYCLE_STATUS_INVALID` | `policy-pack.reject.test.ts` › R08 lifecycle.status 열거 밖 |
| R09 | 규칙 어딘가에 시간 상태 토큰(`CURRENT`·`TODAY`·`NOW`) 저장 | §5.1 · P2 · CLAUDE.md 규칙 6 | 시간 상태를 데이터에 저장하면 조회일 기준 재계산이 무의미해지고 재현성이 깨진다 | `TEMPORAL_STATE_STORED` | `policy-pack.reject.test.ts` › R09 시간 상태 저장 |
| R10 | `authority.type` 이 열거 밖 | §5.1 | 충돌 서열(법률→시행령→…)에서 순위를 매길 수 없다 | `AUTHORITY_TYPE_INVALID` | `policy-pack.reject.test.ts` › R10 authority.type 열거 밖 |
| R11 | `temporal.valid_from` 누락 | §5.1 유효성식 | 시행일 없이는 조회일 기준 유효성을 계산할 수 없다 | `VALID_FROM_MISSING` | `policy-pack.reject.test.ts` › R11 valid_from 누락 |
| R12 | 날짜가 KST `YYYY-MM-DD` 형식이 아님 (ISO datetime·`Z` 접미사 등) | §5.3.4 · CLAUDE.md 규칙 6 | UTC 변환이 개입하면 시행일 경계 ±1일이 어긋난다 | `DATE_FORMAT_INVALID` | `policy-pack.reject.test.ts` › R12 날짜 형식 오류 |
| R13 | 날짜가 형식은 맞으나 달력상 존재하지 않음 (`2026-02-30`) | §5.3.4 | 정규식만으로는 못 잡는다. 존재하지 않는 시행일은 경계 비교를 오염시킨다 | `DATE_NOT_A_CALENDAR_DATE` | `policy-pack.reject.test.ts` › R13 존재하지 않는 날짜 |
| R14 | `valid_to <= valid_from` | §5.1 유효성식 | 유효 구간이 공집합인 규칙. 로드해도 절대 적용되지 않으므로 작성 오류다 | `EMPTY_VALIDITY_INTERVAL` | `policy-pack.reject.test.ts` › R14 빈 유효구간 |
| R15 | `effect.rounding` 의 `stage`/`mode`/`unit_krw` 중 일부만 존재 | §5.2 · §5.1 | 반올림 사양이 불완전하면 계산 단계에서 코드가 기본값을 지어내게 된다 | `ROUNDING_SPEC_INCOMPLETE` | `policy-pack.reject.test.ts` › R15 rounding 불완전 |
| R16 | `effect.rounding.unit_krw <= 0` | §5.2 불변식 | `unitKrw > 0`. 0 이하면 반올림 단위가 정의되지 않는다 | `ROUNDING_UNIT_NOT_POSITIVE` | `policy-pack.reject.test.ts` › R16 unit_krw <= 0 |
| R17 | `effect.rounding.mode`/`stage` 가 열거 밖 | §5.2 | numeric 이 해석할 수 없는 모드 | `ROUNDING_ENUM_INVALID` | `policy-pack.reject.test.ts` › R17 rounding 열거 밖 |
| R18 | `effect.value` 가 JSON number (정수 포함) | §5.2 · CLAUDE.md 규칙 2 | 금액·세율에 부동소수점 금지. 정수 number 를 열어두면 YAML 파서가 큰 값을 double 로 읽는 경로가 생긴다 | `FLOAT_IN_POLICY_VALUE` | `policy-pack.reject.test.ts` › R18 부동소수점 값 |
| R19 | `effect.value` 유리수의 `denominator <= 0` | §5.2 불변식 | `DecimalRate` 불변식 위반 | `RATE_DENOMINATOR_NOT_POSITIVE` | `policy-pack.reject.test.ts` › R19 분모 <= 0 |
| R20 | `effect.value` 에 자리표시자(`<원문 대조 후 기재>`) 잔존 + `pack_kind: VERIFIED_LAW` | §0 문서 규칙 · §5.1 | 검증 완료를 선언한 팩에 미기재 값이 남아 있는 것은 선언과 내용의 모순이다 | `PLACEHOLDER_IN_VERIFIED_PACK` | `policy-pack.reject.test.ts` › R20 VERIFIED_LAW 플레이스홀더 |
| R21 | `scope.jurisdiction` 또는 `scope.tax_years` 누락 | §5.1 | 적용 관할·과세연도 없이는 규칙을 조회 대상에 넣을 수 없다 | `SCOPE_INCOMPLETE` | `policy-pack.reject.test.ts` › R21 scope 누락 |
| R22 | `scope.tax_years` 원소가 안전 정수가 아님 | §5.2.1 canonical 규약 | 해시 대상 payload 에 비안전 정수가 들어가면 재현성이 조용히 깨진다 | `UNSAFE_INTEGER` | `policy-pack.reject.test.ts` › R22 비안전 정수 |
| R23 | 스키마에 없는 필드 존재 (`additionalProperties`) | §5.1 | 오타난 필드가 조용히 무시되면 의도한 제약이 적용되지 않은 채 로딩된다 | `UNKNOWN_FIELD` | `policy-pack.reject.test.ts` › R23 미지 필드 |
| R24 | 동일 `applies_to` + 동일 `conflict_group` 에서 **같은 authority 서열**의 두 규칙이 조회일에 동시 유효 | §5.1 충돌 해소 | 서열로 해소 불가 → 거절. 임의로 한쪽을 고르면 근거 없는 판단이 된다 | `UNRESOLVABLE_CONFLICT` | `registry.test.ts` › R24 서열 동률 충돌 |

## B. pack_kind 3종 (CLAUDE.md 규칙 0)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R25 | `pack_kind: VERIFIED_LAW` 인데 `review.approved !== true` 인 규칙이 하나라도 존재 | §5.1 불변식 · CLAUDE.md 규칙 0 | "승인 전 배포 불가". 법률 등급을 선언했으면 전 규칙이 Maker–Checker 를 통과해야 한다 | `VERIFIED_PACK_HAS_UNAPPROVED_RULE` | `pack-kind.test.ts` › R25 VERIFIED_LAW 미승인 규칙 |
| R26 | `pack_kind: VERIFIED_LAW` 인데 `review.reviewer_id` 또는 `reviewed_at` 이 null | §5.1 · §6.2 Maker–Checker | `approved: true` 만 있고 서명이 없으면 승인 주체를 추적할 수 없다 | `VERIFIED_PACK_MISSING_REVIEW_SIGNATURE` | `pack-kind.test.ts` › R26 VERIFIED_LAW 서명 부재 |
| R27 | `pack_kind: UNVERIFIED_DRAFT` 팩으로 **계산 경로 진입** | §0 문서 규칙 · CLAUDE.md 규칙 0 | 미검증 값이 계산에 들어가면 결과가 사실을 참칭한다. 로딩은 허용하되 값 인출을 막는다 | `UnverifiedPolicyError` | `pack-kind.test.ts` › R27 UNVERIFIED_DRAFT 계산 진입 |
| R28 | `pack_kind: SYNTHETIC_DEMO` 결과에 스탬프 미부착 | CLAUDE.md 규칙 0 | 합성 값 결과가 스탬프 없이 나가면 실제 세법 계산으로 오인된다. **스탬프 없는 반환 경로 자체가 존재하면 안 된다** | (구조적 불가) | `stamp-enforcement.test.ts` › R28 스탬프 없는 경로 부재 — Registry 표면 전수 검사 |
| R29 | `pack_kind: SYNTHETIC_DEMO` 인데 규칙이 `review.approved: true` 로 승인을 참칭 | CLAUDE.md 규칙 0 · §5.1 | 합성 값에 승인 도장을 찍으면 등급 체계가 무의미해진다 | `SYNTHETIC_PACK_CLAIMS_APPROVAL` | `pack-kind.test.ts` › R29 SYNTHETIC_DEMO 승인 참칭 |

## C. AccountSpec (사양 §5.3.1 · §5.3.2)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R30 | `accountId` 가 ASCII `[A-Za-z0-9_]` 밖 (한글·하이픈·점 등) | §5.3.2 식별자 규칙 · §5.2.1 | `Record<AccountId, KRW>` 의 동적 key 가 해시 대상이므로 canonical ASCII 규칙에 직결된다 | `IDENTIFIER_NOT_ASCII` | `account-spec.reject.test.ts` › R30 accountId 비ASCII |
| R31 | 정책 팩에 비ASCII **key** 존재 → canonical 해시 불가 | §5.2.1 | 해시할 수 없는 팩은 RunManifest 재현성 단위가 될 수 없다 | `NON_ASCII_KEY_IN_PACK` | `yaml-canonical.test.ts` › R31 비ASCII key 팩 |
| R31b | 정책 팩 key 에 `[A-Za-z0-9_]` 밖의 ASCII 문자(점·하이픈 등) — **사양 §5.1 의 `field_bindings: { "effect.value": … }` 예시가 여기 해당한다** | §5.2.1 vs §5.1 (사양 내부 모순, OPEN-Q11) | 같은 이유로 해싱 불가. 사양 예시가 자기 canonical 규칙을 위반하므로 보수적으로 거절한다 | `NON_ASCII_KEY_IN_PACK` | `yaml-canonical.test.ts` › R31b 점 포함 key |
| R32 | `accountId` 중복 (여러 spec 간) | §5.3.2 | 계좌 조회가 비결정적이 된다 | `DUPLICATE_ACCOUNT_ID` | `account-spec.reject.test.ts` › R32 accountId 중복 |
| R33 | `requiredEngineCapabilities ⊄ 엔진 지원 MechanismType` | §5.3.1 커버리지 검사 | "아니면 부분 계산 없이 로딩 거절". 지원 못 하는 성질을 가진 계좌를 절반만 계산하면 결과가 조용히 틀린다 | `CAPABILITY_NOT_SUPPORTED` | `account-spec.reject.test.ts` › R33 커버리지 검사 실패 |
| R34 | `mechanismInstances[].mechanismType` 이 `requiredEngineCapabilities` 에 미선언 | §5.3.1 | 선언과 실제 인스턴스의 불일치. 커버리지 검사를 우회하는 구멍 | `UNDECLARED_MECHANISM_TYPE` | `account-spec.reject.test.ts` › R34 미선언 mechanismType |
| R35 | `mechanismType` 이 성질 어휘(§5.3.1 표) 밖 | §5.3.1 | 정의되지 않은 성질 | `MECHANISM_TYPE_UNKNOWN` | `account-spec.reject.test.ts` › R35 어휘 밖 mechanismType |
| R36 | `mechanismInstanceId` 중복 | §5.3.2 · §5.3.4 | 정렬 키의 최종 tie-breaker 가 유일하지 않으면 실행 순서가 미결정이다 | `DUPLICATE_MECHANISM_INSTANCE_ID` | `mechanism-graph.reject.test.ts` › R36 instanceId 중복 |
| R37 | `parameterRuleIds` 가 정책 팩에 없는 rule id 참조 | §5.3.2 (spec 에 값 없음) | dangling 참조. 파라미터를 못 찾으면 계산 시점에 값을 지어내게 된다 | `DANGLING_RULE_REFERENCE` | `account-spec.reject.test.ts` › R37 parameterRuleIds dangling |
| R38 | `eligibilityRuleIds` / `instrumentEligibilityRuleIds` dangling | §5.3.2 | 동일 | `DANGLING_RULE_REFERENCE` | `account-spec.reject.test.ts` › R38 eligibility dangling |
| R39 | `effectiveTo <= effectiveFrom` | §5.3.2 | 유효 구간 공집합 | `EMPTY_VALIDITY_INTERVAL` | `account-spec.reject.test.ts` › R39 spec 빈 유효구간 |
| R40 | `supportedEvents` 원소가 `PlanEventType` 열거 밖 | §5.3.2 | 처리 규칙이 없는 이벤트 | `PLAN_EVENT_TYPE_UNKNOWN` | `account-spec.reject.test.ts` › R40 supportedEvents 열거 밖 |
| R41 | `priority` 가 안전 정수가 아님 | §5.2.1 canonical 규약 · §5.3.4 | 정렬 키가 해시 payload 에 들어간다 | `UNSAFE_INTEGER` | `account-spec.reject.test.ts` › R41 priority 비안전 정수 |
| R42 | `sourceIds` 가 빈 배열 | §5.3.2 · §5.1 | 계좌 spec 도 출처 없이는 근거를 제시할 수 없다 | `EMPTY_SOURCES` | `account-spec.reject.test.ts` › R42 sourceIds 빈 배열 |

## D. 최적화 성질 호환성 (사양 §5.3.1 [v1.4 신설])

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R43 | 메커니즘이 `MechanismOptimizationProperties` 를 선언하지 않음 | §5.3.1 v1.4 | 선언이 없으면 Optimizer 가정을 깨는지 검사할 방법이 없다. 미선언을 "안전"으로 보면 검사가 무력화된다 | `OPTIMIZATION_PROPERTIES_MISSING` | `mechanism-graph.reject.test.ts` › R43 성질 미선언 |
| R44 | `nonConvex && !finiteBreakpoints` | §5.3.1 v1.4 (명시 예시) | 유한 경계점 없는 비볼록 문제는 전수 열거로 최적성이 성립하지 않는다 | `UNSUPPORTED_OPTIMIZATION_PROPERTIES` | `mechanism-graph.reject.test.ts` › R44 비볼록+무한경계 |
| R45 | `pathDependent && !finiteBreakpoints` | §5.3.1 v1.4 (보수적 확장) | 경로 의존인데 경계점이 유한하지 않으면 후보 공간을 유한하게 만들 수 없다. **사양이 조합을 전부 열거하지 않아 보수적으로 거절한다 (OPEN-Q3)** | `UNSUPPORTED_OPTIMIZATION_PROPERTIES` | `mechanism-graph.reject.test.ts` › R45 경로의존+무한경계 |
| R46 | `!piecewiseLinear && !piecewiseMonotone && !finiteBreakpoints` | §5.3.1 v1.4 (보수적 확장) | 세 성질 모두 없으면 현 Optimizer 가 기댈 구조가 하나도 없다 (OPEN-Q3) | `UNSUPPORTED_OPTIMIZATION_PROPERTIES` | `mechanism-graph.reject.test.ts` › R46 구조 없음 |

## E. 메커니즘 그래프 로더 불변식 (사양 §5.3.3 · §5.3.4)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R47 | 의존성 순환 | §5.3.3 로더 불변식 | 위상정렬 불가 → 실행 순서 미결정 | `DEPENDENCY_CYCLE` | `mechanism-graph.reject.test.ts` › R47 의존성 순환 |
| R48 | 선행 인스턴스 누락 (의존 대상 타입의 인스턴스가 계좌에 없음) | §5.3.3 로더 불변식 | 의존하는 계산이 실행되지 않은 채 후행이 돈다 | `MISSING_PREREQUISITE_INSTANCE` | `mechanism-graph.reject.test.ts` › R48 선행 인스턴스 누락 |
| R49 | 동일 phase 에서 동일 `StateField` 에 두 인스턴스가 동시 쓰기 | §5.3.3 로더 불변식 | 같은 phase 안에서는 순서가 정해지지 않으므로 마지막 쓰기가 비결정적이 된다 | `CONCURRENT_WRITE_SAME_PHASE` | `mechanism-graph.reject.test.ts` › R49 동시 쓰기 충돌 |
| R50 | 정렬 키 정적 3단계(PHASE_ORDER → priority → mechanismInstanceId)로 순서 미결정 | §5.3.4 | "마지막까지 미결정이면 로딩 거절". 이벤트 축은 순서 3 소관 (OPEN-Q8) | `ORDER_UNDETERMINED` | `mechanism-graph.reject.test.ts` › R50 정렬 미결정 |

## F. RunManifest (사양 §5.6)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R51 | 필수 버전 필드 누락 (`policySnapshotVersion`·`accountSpecVersion`·`mechanismSchemaVersion`·`instrumentDataVersion`·`strategyCoverageVersion`·`strategyTemplateVersion`·`optimizerVersion`·`engineBuildVersion` 중 하나라도) | §5.6 · §1.3 재현성 정의 | 재현성의 단위가 RunManifest 다. 버전 하나가 비면 같은 결과를 재현할 수 없다 | `MANIFEST_FIELD_MISSING` | `manifest.reject.test.ts` › R51 버전 필드 누락 |
| R52 | ③ 전망 산출인데 `assumptionSetVersion` 없음 | §5.6 (③ 산출 시 필수) | 가정 없이 전망을 재현할 수 없다 | `ASSUMPTION_SET_REQUIRED_FOR_PROJECTION` | `manifest.reject.test.ts` › R52 전망에 가정 버전 부재 |
| R53 | `confirmedInputHash` 가 소문자 hex 64자가 아님 | §5.2 (SHA-256 소문자 hex) | 해시 형식이 다르면 대조가 성립하지 않는다 | `HASH_FORMAT_INVALID` | `manifest.reject.test.ts` › R53 해시 형식 오류 |
| R54 | `queryAsOf` / `createdAt` 날짜 형식 오류 | §5.3.4 | KST LocalDate 규약 | `DATE_FORMAT_INVALID` | `manifest.reject.test.ts` › R54 매니페스트 날짜 오류 |
| R55 | `taxYear` 가 안전 정수가 아님 | §5.2.1 | 해시 payload 제약 | `UNSAFE_INTEGER` | `manifest.reject.test.ts` › R55 taxYear 비안전 정수 |
| R56 | SYNTHETIC_DEMO 팩 기반 RunManifest 에 합성 스탬프 없음 | CLAUDE.md 규칙 0 | 매니페스트는 결과의 출처 기록이다. 합성 사실이 여기 없으면 감사에서 사라진다 | `SYNTHETIC_STAMP_REQUIRED` | `manifest.reject.test.ts` › R56 매니페스트 스탬프 부재 |

## G. FactAnswerManifest (사양 §5.6 · §1.2)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R57 | `answerClass: REGISTRY_RESOLVED_FACT` 인데 `resolvedRuleIds` 가 빈 배열 | §5.6 (REGISTRY_RESOLVED_FACT면 필수) | 규칙 ID 없는 "공식 팩트"는 근거 없는 단정이다 | `RESOLVED_RULE_IDS_REQUIRED` | `manifest.reject.test.ts` › R57 팩트에 규칙 ID 부재 |
| R58 | `answerClass: UNMODELED_OFFICIAL_SOURCE` 인데 `resolvedRuleIds` 가 비어있지 않음 | §5.6 (UNMODELED면 `[]`) · §1.2 | 미모델링 답변이 규칙 ID 를 달면 팩트 결론으로 오인된다 | `RESOLVED_RULE_IDS_MUST_BE_EMPTY` | `manifest.reject.test.ts` › R58 미모델링에 규칙 ID |
| R59 | `sourceSnapshotIds` 와 `sourceHashes` 의 길이 불일치 | §5.6 | 스냅샷과 해시가 짝을 이루지 않으면 원문 대조가 성립하지 않는다 | `SOURCE_HASH_PAIRING_MISMATCH` | `manifest.reject.test.ts` › R59 출처 해시 짝 불일치 |
| R60 | `answerPayloadHash` 또는 `sourceHashes` 형식 오류 | §5.2 | R53 과 동일 | `HASH_FORMAT_INVALID` | `manifest.reject.test.ts` › R60 답변 해시 형식 |

## H. Registry 조회 — 조회일 기준 유효 규칙 계산 (사양 §5.1)

| # | 조건 | 사양 절 | 거절 이유 | code | 테스트 |
|---|---|---|---|---|---|
| R61 | `PROPOSED` 규칙을 계산 경로에서 인출 | §5.1 (계산 사용 금지) | 통과 전 개정안을 현행법으로 쓰면 결과가 거짓이 된다 | `RULE_NOT_ENACTED` | `registry.test.ts` › R61 PROPOSED 인출 |
| R62 | `REPEALED` 규칙 인출 | §5.1 (과거 재현 전용) | 폐지 규칙은 과거 재현에만 쓴다. 재현 컨텍스트를 구분할 입력이 순서 2 에 없으므로 일반 조회로는 막는다 | `RULE_NOT_EFFECTIVE_AT_DATE` | `registry.test.ts` › R62 REPEALED 인출 |
| R63 | 조회일이 `valid_from` 이전 | §5.1 유효성식 | 시행 전 규칙 | `RULE_NOT_EFFECTIVE_AT_DATE` | `registry.test.ts` › R63 시행 전 조회 |
| R64 | 조회일이 `valid_to` 이상 (경계는 `query_date < valid_to`) | §5.1 유효성식 | 만료 경계 ±1일. `valid_to` 당일은 이미 무효다 | `RULE_NOT_EFFECTIVE_AT_DATE` | `registry.test.ts` › R64 만료 경계 |
| R65 | 존재하지 않는 rule id 조회 · effect 없는 규칙에서 값 인출 | §5.1 | 없는 규칙을 조용히 무시하면 계산이 빈 값으로 진행된다 | `RULE_NOT_FOUND` | `registry.test.ts` › R65 미존재 규칙 |
| R66 | 조회일 형식 오류 | §5.3.4 | R12 와 동일 규약 | `DATE_FORMAT_INVALID` | `registry.test.ts` › R66 조회일 형식 오류 |

---

## 정상 로딩 (거절되면 안 되는 경로)

거절 테스트만 있으면 "전부 거절"하는 구현도 초록색이 된다. 정상 경로가 살아 있는지 함께 고정한다.

| # | 시나리오 | 테스트 |
|---|---|---|
| P01 | SYNTHETIC_DEMO YAML 팩 + AccountSpec 2종 정상 로딩 | `load-ok.test.ts` › P01 정상 로딩 |
| P02 | snake_case key 정책 팩이 canonical ASCII 검사를 통과하고 해시가 계산된다 | `yaml-canonical.test.ts` › P02 snake_case 해시 통과 |
| P03 | 조회일 기준 유효 규칙만 반환하고, 시간 상태를 데이터에 쓰지 않는다 | `registry.test.ts` › P03 조회일 기준 재계산 |
| P04 | 서로 다른 `conflict_group` 의 동시 유효 규칙은 충돌이 아니라 병렬 적용 | `registry.test.ts` › P04 축이 다르면 병렬 |
| P05 | 같은 `conflict_group` 에서 서열이 다르면 상위 권위가 이긴다 | `registry.test.ts` › P05 서열 해소 |
| P06 | 동일 입력 → 동일 팩 해시, key 순서 무관, 값 1 차이면 다른 해시 | `yaml-canonical.test.ts` › P06 해시 재현성 |
| P07 | UNVERIFIED_DRAFT 팩도 **로딩 자체는** 성공한다 (계산 진입에서만 막힌다) | `pack-kind.test.ts` › P07 초안 로딩 성공 |
| P08 | VERIFIED_LAW 팩(전 규칙 승인+서명)은 로딩되고 합성 스탬프가 붙지 않는다 | `pack-kind.test.ts` › P08 VERIFIED_LAW 정상 |

---

## 순서 2 범위 밖 (여기서 거절하지 않는 것)

- 사양 §4.2 **거절 조건**(소득 개념 불명확·범위 밖 질의 등) — 사용자 입력 게이트이며 순서 7 소관.
- 메커니즘 `apply()` 실행 중 발생하는 한도 초과·자격 미달 — 순서 3 이후.
- 이벤트 축(`occurredAt`·`sequence`)을 포함한 전체 정렬 결정론 — 순서 3 (`TODO(순서3)`).
- 후보 상속 불변식(§6.1 CandidateInheritanceInvariant) — 순서 6 Optimizer 소관.
- `REPEALED` 규칙의 과거 재현(replay) 경로 — 순서 5 (`TODO(순서5)`).
- 골든 벡터 서명(§6.2 v1.4) — 사람 검토 절차이며 코드 거절 대상이 아니다.
