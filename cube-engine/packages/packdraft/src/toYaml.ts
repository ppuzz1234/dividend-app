/**
 * 초안 → 정책 팩 YAML.
 *
 * 사양 §5.1 스키마를 그대로 따른다. 표기법은 **snake_case** (§5.2.1 네이밍 계약 —
 * 정책 팩 계층은 사람이 쓰고 법령과 대조하는 계층이라 TS 의 camelCase 와 다르다).
 *
 * ## 항상 UNVERIFIED_DRAFT 로 나온다
 * `review.approved` 는 **언제나 false**, `reviewer_id`·`reviewed_at` 은 null 이다.
 * 이 함수가 승인된 팩을 만들 수 있으면 승인 절차를 우회하는 경로가 생긴다.
 * 승인은 사람이 YAML 을 편집하는 것으로만 이뤄진다.
 */

import { stringify } from "yaml";

import type { DraftRule } from "./draft.js";

export interface PackMeta {
  readonly policySnapshot: string;
  readonly sourceId: string;
  readonly authorityType: "STATUTE" | "DECREE" | "RULE" | "ADMIN_GUIDANCE" | "PROVIDER_POLICY";
  readonly promulgatedAt: string;
  readonly validFrom: string;
  readonly recordedAt: string;
  readonly taxYears: readonly number[];
}

/** `9/100` → 유리수 객체. 그 밖에는 정수 문자열 그대로. */
function toPolicyValue(value: string, unit: DraftRule["unit"]): unknown {
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(value.trim());
  if (frac !== undefined && frac !== null) {
    return { numerator: frac[1], denominator: frac[2] };
  }
  if (unit === "KRW" || unit === "COUNT") return value.trim();
  return value.trim();
}

export function draftToPackYaml(rules: readonly DraftRule[], meta: PackMeta): string {
  const pack = {
    pack_kind: "UNVERIFIED_DRAFT",
    policy_snapshot: meta.policySnapshot,
    rules: rules.map((r) => ({
      id: r.id,
      lifecycle: { status: "ENACTED" },
      authority: {
        type: meta.authorityType,
        delegated_by: null,
        applies_to: "TAX_TREATMENT",
        conflict_group: r.id.split(".")[0] ?? "UNSPECIFIED",
      },
      temporal: {
        promulgated_at: meta.promulgatedAt,
        valid_from: meta.validFrom,
        valid_to: null,
        recorded_at: meta.recordedAt,
      },
      scope: { jurisdiction: "KR", tax_years: [...meta.taxYears] },
      effect: {
        value: toPolicyValue(r.value, r.unit),
        // ★ 예전엔 `UNKNOWN → KRW` 로 조용히 메웠다. 그래서 나이 60 이 `60 KRW` 로
        //   승인 팩까지 들어갔다(실측). **모르는 단위를 아는 척하면 검토자도 속는다.**
        //   이제 스키마에 없는 값을 그대로 내보내 **로딩에서 터지게** 한다 — 사람이 채운다.
        unit: r.unit === "UNKNOWN" ? "<원문 대조 후 기재: KRW/RATE/YEARS/MONTHS/COUNT>" : r.unit,
        // ★ 반올림 사양은 **아예 넣지 않는다.**
        //   조문에서 못 뽑는 경우가 대부분인데, ① 지어내면 절대 규칙 1 위반이고
        //   ② PLACEHOLDER 를 넣으면 stage/mode 가 enum 이라 스키마 검증에서 먼저 터져
        //      `PLACEHOLDER_IN_VERIFIED_PACK` 이 아닌 `ROUNDING_ENUM_INVALID` 로 보고돼
        //      원인 지목이 어긋난다(실측).
        //   매트릭스 R15 는 "일부만 존재하면 거절"이므로 전부 없는 것은 유효하다.
        //   사람이 원문에서 확인해 채워 넣는다.
      },
      // ★ **씨앗 조문을 PRIMARY 로 못박지 않는다.** 생성기는 위임 사슬을 통째로 읽히므로
      //   값이 참조 조문에 있는 경우가 흔한데, 예전엔 그걸 전부 씨앗 조문 탓으로 적었다.
      //   실측: 근퇴법 시행령 §17의2 로 뜬 초안의 7개 값이 **모두** 「소득세법 시행령」
      //   §40의2 의 것이었는데 PRIMARY 는 §17의2 로 나갔다 — 승인 팩이 없는 근거를 가리켰다.
      sources: [{ source_id: r.sourceId ?? meta.sourceId, role: "PRIMARY" }],
      field_bindings: { effect_value: [r.sourceId ?? meta.sourceId] },
      // ★ 승인은 사람이 이 세 줄을 손으로 고치는 것으로만 이뤄진다.
      review: { approved: false, reviewer_id: null, reviewed_at: null },
    })),
  };

  const header = [
    "# UNVERIFIED_DRAFT — AI 초안이다. **아직 어떤 계산에도 쓸 수 없다.**",
    `# 이 팩으로 resolveEffect 를 호출하면 UnverifiedPolicyError 가 난다 (registry.ts).`,
    "#",
    "# 승인 절차 (사양 §2.2 5단계):",
    "#   1. `npm run review -w @cube/packdraft -- <이 파일>` 로 대조표를 본다",
    "#   2. 각 규칙의 인용을 **원문에서 직접 확인**한다",
    "#   3. 확인된 규칙만 review.approved: true + reviewer_id + reviewed_at 을 손으로 적는다",
    "#   4. <원문 대조 후 기재> 를 실제 값으로 바꾼다 (남아 있으면 승격이 거절된다)",
    "#   4-1. ★ effect.rounding 을 **직접 추가**한다 — 초안에는 아예 없다.",
    "#        AI 가 반올림 사양을 지어내면 절대 규칙 1 위반이라 비워 보낸다.",
    "#        stage/mode/unit_krw 셋 다 적어야 한다 (일부만 있으면 ROUNDING_SPEC_INCOMPLETE).",
    "#   5. pack_kind 를 VERIFIED_LAW 로 바꾸고 `npm run promote` 로 검증",
    "#   6. 다른 사람이 git diff 로 확인 (Checker)",
    "#",
    "# 승인 버튼이 없는 이유: 버튼이 있으면 원문을 안 보게 된다.",
    "",
  ].join("\n");

  return header + stringify(pack, { lineWidth: 0 });
}
