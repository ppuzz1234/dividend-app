# 미션 2 이음새 — A4-Logic 이 이어받을 지점

> BUILD-PLAN Phase End E-4. 작성 2026-08-07 (실물 대조 기준).
>
> **목적:** 미션 1(A4-RAG)과 미션 2(A4-Logic)를 나중에 합칠 때, **어디가 공유되고 어디가 갈라지면 안 되는지**를 못 박는다.
> 사양 §1.1은 두 미션이 **동일한 Authoritative Policy Registry**를 공유할 것을 요구한다(split-brain 금지).

---

## 0. 현재 분리 상태

| | A4-RAG (미션 1) | A4-Logic (미션 2) |
|---|---|---|
| 하는 일 | 법령 원문 → 인용된 답 | 상황 → 코드 계산 |
| 패키지 | `corpus` `factindex` `fact` `factui` `packdraft` `plan` | `engine` `intake` `taxlens` |
| 공유 사본 | `numeric` `policy` | `numeric` `policy` |

---

## 1. ❄ 공유 사본 — 현재 **동일함** (2026-08-07 확인)

`numeric`·`policy`는 양쪽 레포에 **같은 사본**이 있다. CLAUDE.md가 수정을 금지한다:

> **`numeric`·`policy` 는 양쪽에 같은 사본이 있다. ❄ 수정 금지** — 한쪽만 고치면 조용히 갈라진다. 고칠 일이 생기면 고치지 말고 사람에게 알려라.

**검증 결과 (파일 해시 대조):**

| | 결과 |
|---|---|
| `numeric/src/*.ts` | ✅ 동일 |
| `policy/src/*.ts` | ✅ 동일 |
| `packs/INCTAX_D_40_2.yaml` (승인 팩) | ✅ **바이트 동일** |

재확인 방법 — 합치기 전에 반드시 다시 돌린다:
```powershell
foreach ($p in 'numeric','policy') {
  $a = "…\A4-RAG\packages\$p\src";  $b = "…\A4-Logic\packages\$p\src"
  $ha = (Get-ChildItem $a -Recurse -Filter *.ts | Sort-Object Name | Get-FileHash | % Hash) -join ''
  $hb = (Get-ChildItem $b -Recurse -Filter *.ts | Sort-Object Name | Get-FileHash | % Hash) -join ''
  "$p : " + $(if ($ha -eq $hb) { "동일" } else { "갈라짐" })
}
```

---

## 2. ✅ 해소됨 — 로딩 집합이 갈라져 있던 문제 (2026-08-11)

> **초판(08-07)의 진단이 틀렸다.** "A4-Logic 이 미승인 초안을 로드해 절대 규칙 0·1 을 위반할
> 수 있다"고 적었는데, 실제로 파일을 열어보니 **각 규칙에 `reviewer_id: Seohyun Park` ·
> `reviewed_at: 2026-08-07` 이 이미 들어가 있었다.** 승인은 끝나 있었고, `.draft.yaml` 이라는
> **파일명만 남아 있던 것**이다. 즉 (a) 였다.
>
> 그리고 방향도 반대였다 — **A4-Logic 이 앞서 있고 A4-RAG 가 뒤처져 있었다.**

### 2.1 무엇이 문제였나

| | 당시 읽던 팩 |
|---|---|
| **A4-RAG** | **1개** — `factui/src/server.ts` 가 `files[0]` 하나만 읽음 |
| **A4-Logic** | **5개** — 파일명을 명시 나열해 `composeRegistries` 로 합침 |

승인은 **100건 가까이 끝나 있었는데 화면에는 8건만 반영**되고 있었다.
사람이 원문을 대조해 서명한 값이 쓰이지 않으면 **승인 절차가 있으나 마나**가 된다.

### 2.2 조치

1. 승인 완료된 초안 8개에 **승격 게이트를 태웠다** — `npm run promote -w @cube/packdraft -- <경로>`.
   `loadPolicyPack` 이 `VERIFIED_PACK_HAS_UNAPPROVED_RULE` · `MISSING_REVIEW_SIGNATURE` ·
   `PLACEHOLDER_IN_VERIFIED_PACK` · `SOURCE_SNAPSHOT_NOT_FOUND` 를 전부 검사한다. **8/8 통과.**
2. `packs/drafts/*.draft.yaml` → `packs/*.yaml` 로 이동. **폴더 위치가 곧 승격 여부**가 되게 했다.
3. `factui/src/server.ts` 가 `packs/*.yaml` 을 **전부 읽고 병합**하도록 고쳤다
   (`factui/src/composeRegistries.ts` 신설).

**결과:** 부팅 로그가 `승인 정책 팩 9개 · 규칙 94개 · VERIFIED_LAW → 계산 가능` 으로 바뀌었다.

### 2.3 남은 것

- `RETIRE_D_17_2.draft.yaml` 은 **의도적으로 `drafts/` 에 남는다.** 두 규칙(`HOUSING_SALE` ·
  `REAL_ESTATE_SALE`)의 값이 `<원문 대조 후 기재>` 라 2026-08-03 에 `approved` 를 false 로
  되돌린 것이다 — *모르는 값에 붙은 승인은 "사람이 확인했다"는 거짓 기록*이기 때문이다.
- **`composeRegistries` 가 양쪽에 하나씩 있다** (`factui/src/` · `taxlens/src/`). 의미는 같게
  써 뒀으나 **합칠 때 하나로 수렴시켜야 한다.** `@cube/policy` 에 넣지 않은 이유는 그 패키지가
  ❄ 동결된 공유 사본이기 때문이다.
- **두 레포의 로딩 집합을 다시 맞춰야 한다** — A4-Logic 은 아직 파일명을 명시 나열하고 있고,
  A4-RAG 는 폴더를 훑는다. 승격된 파일명이 바뀌었으므로 A4-Logic 쪽 목록도 갱신이 필요하다.
  (이 레포에서 고치지 않았다 — 소관 밖이고 CLAUDE.md 가 금지한다.)

---

## 3. 공유 계약 (합칠 때 지켜야 하는 것)

### 3.1 id 공간이 같다

```
FACT 매니페스트 resolvedRuleIds  ≡  PLAN sourceRuleIds
```
둘 다 `<PACK>.<PARAM>.<VARIANT>` 형태의 같은 규칙 id 를 쓴다.
예: `RETIRE_D_17_2.CONTRIBUTION_LIMIT_COMPONENT.GENERAL`

→ **합칠 때 id 를 재매핑하지 마라.** 같은 값을 두 이름으로 부르면 감사가 불가능해진다.

### 3.2 매니페스트 공통 필드

| 필드 | 뜻 |
|---|---|
| `packKind` | `VERIFIED_LAW` / `SYNTHETIC_DEMO` / `UNVERIFIED_DRAFT` |
| `syntheticStamp` | 합성 값이면 **반드시** 붙는다 (절대 규칙 0) |
| `policySnapshot` | 승인 팩 식별자 (없으면 `NO_APPROVED_PACK`) |
| `rendererModelVersion` | **`claude/claude-sonnet-5[effort=medium]`** — 모델뿐 아니라 effort 까지 |
| `rendererTemplateVersion` | `answer-prompt-15/plain+factui-10` |
| `ragIndexVersion` | 색인 해시 — 콜드 재빌드해도 동일함이 검증됨(§4) |

> `rendererModelVersion` 에 effort 가 들어간 이유: 같은 모델·같은 프롬프트라도 effort 가 다르면 다른 답이 나온다. 안 적으면 재현이 안 된다(사양 §1.3).

### 3.3 렌더러 교체 지점

`fact/src/render.ts` 를 **한 파일로 격리해 둔 이유**가 이것이다. 사양 §7 의 Claim Renderer 는 `MechanismHandler.explain()` 에 의존하는데, 그건 순서 5·6(A4-Logic 소관)이 있어야 한다.

→ **미션 2 가 붙으면 이 파일이 공용 렌더러로 교체된다.** 다른 파일에 렌더링 로직을 흩뜨리지 마라.

### 3.4 정책 팩의 주인

CLAUDE.md:
> `policy/packs/` 의 주인은 **A4-RAG** 다. 초안 생성(`packdraft`)과 사람 승인이 여기서 일어나고, A4-Logic 은 승인된 팩을 **읽기 전용 사본**으로 받는다.

**현재 §2 의 상태는 이 규칙과 어긋난다** — A4-Logic 이 A4-RAG 에 없는 로딩 집합을 갖고 있다.

---

## 4. 재현성 — 콜드 스타트 검증됨 ✅ (2026-08-07)

Phase End E-2. 색인을 **삭제하고 처음부터 재빌드**해 비교했다.

```
이전   ragIndexVersion 6df09cafb2fa31eb…
재빌드 ragIndexVersion 6df09cafb2fa31eb…   → ✅ 동일
vectors.bin SHA-256    4843E26F010D4530…   → ✅ 바이트까지 동일
check:retrieval        hit@1 22/26 · hit@5 25/26 · 회귀 없음 · exit 0
재빌드 소요            2,649 청크 · 128초 · L2 오차 최대 1.5e-8
```

**→ 색인은 결정론적이다.** 청크 텍스트를 저장하지 않는 설계(`loadCorpus + chunkAll` 이 결정론적이라 재생성됨)가 실제로 성립함이 확인됐다. 미션 2 가 합류해도 이 버전으로 과거 답변을 재현할 수 있다.

---

## 5. A4-RAG 쪽에 남은 이음새 관련 한계

| 항목 | 상태 | 위치 |
|---|---|---|
| 승인 팩을 **1개만** 읽는다 | `files[0]` 만 사용 — 팩이 2개가 되는 순간 손봐야 함 | `factui/src/server.ts` (ponytail 마커) |
| 팩 병합 규칙(충돌·서열) 없음 | 아직 승인 팩이 하나라 미구현. **A4-Logic 은 이미 `composeRegistries` 로 5개를 합치고 있다** | `policy` 층의 일 |
| 팩 추가 시 서버 재시작 필요 | 부팅 때 한 번 읽음. 승인은 자주 있는 일이 아니라 감수 | 같은 파일 |

→ **합칠 때 병합 규칙은 A4-Logic 쪽 구현을 기준으로 정리하는 편이 빠르다.**

---

## 6. 합치기 전 체크리스트

- [ ] `numeric`·`policy` 사본 해시 재대조 (§1)
- [ ] 🔴 **초안 4개의 승인 여부 사람 확인** (§2.3) — 이게 안 끝나면 합치면 안 된다
- [ ] 두 레포의 **팩 로딩 집합 일치**
- [ ] 팩 병합 규칙(충돌·서열) 확정
- [ ] `render.ts` → 공용 렌더러 교체
- [ ] 매니페스트 공통 필드 재확인 (§3.2)
- [ ] 콜드 스타트 재현 재실행 (§4)

---

## 7. 관련 문서

| | |
|---|---|
| `MISSION1-CLOSEOUT.md` | 미션 1 한계표 (Phase End E-3) |
| `A4-RAG_PROJECT_MASTER_SUMMARY.md` | 전체 서사 · 발표 자료 |
| `ORDER2-REJECTION-MATRIX.md` | 정책 팩 거절 조건 R01~R67 |
| `BUILD-PLAN.md` | Phase End 정의 |
