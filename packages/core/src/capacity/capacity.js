/* ------------------------------------------------------------------ *
 *  ② 투자 여력 판단 — 소득·지출·보유현금 → 연/월 불입 가능액
 *  보수적 기본 룰(주석의 비율)로 제안치를 만들고, 사용자가 화면에서
 *  슬라이더로 확정한다. 확정값이 ③~⑤ 배분의 총알이 된다.
 * ------------------------------------------------------------------ */

const floorTo = (v, unit) => Math.floor(v / unit) * unit;

/**
 * @param {object} p
 *  - annualIncome: 연소득(원)
 *  - monthlyExpense: 월 고정지출(원)
 *  - cash: 투입 가능한 보유 현금(원)
 *  - emergencyMonths: 비상금으로 남길 개월수 (기본 3개월치 지출)
 */
export function assessCapacity({ annualIncome = 0, monthlyExpense = 0, cash = 0, emergencyMonths = 3 } = {}) {
  const monthlyIncome = annualIncome / 12;
  const surplus = Math.max(0, monthlyIncome - monthlyExpense); // 월 여유 현금흐름

  // 여유분의 70%만 투자 제안 (나머지는 변동지출 버퍼) — 만원 단위
  const suggestedMonthly = floorTo(surplus * 0.7, 10_000);

  // 보유 현금 중 비상금(지출 n개월치)을 뺀 나머지를 시드로 제안 — 100만원 단위
  const emergency = monthlyExpense * emergencyMonths;
  const investableCash = Math.max(0, cash - emergency);
  const suggestedSeed = floorTo(investableCash, 1_000_000);

  return {
    monthlyIncome,
    surplus,
    suggestedMonthly,
    emergency,
    investableCash,
    suggestedSeed,
    annualCapacity: suggestedMonthly * 12 + suggestedSeed, // 올해 총 투입 여력
    savingRate: monthlyIncome > 0 ? surplus / monthlyIncome : 0,
  };
}
