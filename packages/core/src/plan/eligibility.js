/* ------------------------------------------------------------------ *
 *  계좌 가입자격 게이트 — 무소득자·미성년자 등 페르소나별 자격 판정
 *  ──────────────────────────────────────────────────────────────
 *  법적 근거(2026-08 기준, knowledge/accountProfiles 와 정합):
 *  · ISA (조특법 §91조의18, 2021 개편): ① 만 19세 이상 거주자(소득 무관 —
 *    무소득 성인·주부 가입 가능) ② 15~19세 미만은 '직전 과세기간 근로소득'이
 *    있는 경우만 — 사업·배당소득은 인정되지 않음. 공통 배제: 직전 3개
 *    과세기간 중 금융소득 2,000만 초과(금융소득종합과세 대상).
 *  · 연금저축: 나이·소득 제한 없음 — 무소득자·미성년자도 가입 가능.
 *    (세액공제만 소득이 있어야 실효 — 비공제 납입도 과세이연·건보 제외는 동일)
 *  · IRP: 소득 증빙 가능한 경제활동자(근로·사업소득)만 — 무소득자 불가.
 *  · 일반 위탁계좌: 제한 없음(미성년은 법정대리인 개설).
 *  ⚠ 세법 개정 추진사항(국내투자형 ISA의 금소세 대상자 허용 등)은 확정 시 반영.
 * ------------------------------------------------------------------ */

const COMP_TAX_THRESHOLD = 20_000_000; // 금융소득종합과세 기준(직전 3개년 판정 — 여기선 전년도 값으로 근사)

/**
 * 계좌별 가입자격 판정.
 * @param {object} p
 * @param {number|null} [p.age]  나이 (null = 미상 → 성인으로 간주해 기존 동작 유지)
 * @param {number} [p.earnedIncome=0]  전년도 근로소득
 * @param {number} [p.businessIncome=0]  전년도 사업소득
 * @param {number} [p.finIncome=0]  전년도 금융소득 (금소세 배제 판정 근사)
 * @returns {{ isa, pensionSavings, irp, general: { eligible: boolean, reason?: string } }}
 */
export function accountEligibility({ age = null, earnedIncome = 0, businessIncome = 0, finIncome = 0 } = {}) {
  const hasWork = (earnedIncome || 0) > 0 || (businessIncome || 0) > 0;
  const compTaxed = (finIncome || 0) > COMP_TAX_THRESHOLD;

  let isa;
  if (compTaxed) {
    isa = { eligible: false, reason: "금융소득 연 2,000만원 초과(금융소득종합과세 대상)는 ISA 신규 가입·재가입이 제한돼요." };
  } else if (age != null && age < 15) {
    isa = { eligible: false, reason: "ISA는 만 19세 이상(근로소득이 있으면 15세 이상)부터 가입할 수 있어요." };
  } else if (age != null && age < 19 && (earnedIncome || 0) <= 0) {
    isa = { eligible: false, reason: "15~19세는 직전 과세기간 근로소득이 있어야 ISA 가입이 가능해요 — 사업·배당소득은 인정되지 않아요." };
  } else {
    isa = { eligible: true };
  }

  const irp = hasWork
    ? { eligible: true }
    : { eligible: false, reason: "IRP는 근로·사업소득 등 소득 증빙이 있어야 가입할 수 있어요. (연금저축은 소득 없이도 가입 가능)" };

  return {
    general: { eligible: true },
    pensionSavings: { eligible: true }, // 나이·소득 제한 없음
    isa,
    irp,
  };
}

export default accountEligibility;
