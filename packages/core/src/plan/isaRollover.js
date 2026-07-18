/* ------------------------------------------------------------------ *
 *  ISA 3년 만기 롤오버 모델 — 만기금을 연금저축으로 이전하는 시뮬레이션
 *  ──────────────────────────────────────────────────────────────
 *  세법 근거(가정 단순화):
 *  · ISA 의무가입 3년 — 만기 정산 시 순이익 200만 비과세, 초과분 9.9% 분리과세
 *  · 만기금을 60일 내 연금계좌로 이전하면 이전액의 10%(최대 300만)를
 *    "추가" 세액공제 — 연 900만 세액공제 한도와 별개
 *  · 이전액은 연금계좌 연 납입한도(1,800만)와 별개로 입금 가능
 *    → 3년마다 ISA에 쌓인 목돈을 한 번에 연금저축으로 옮길 수 있다
 *  · 이전 후 ISA 재가입 → 연 2,000만 한도가 다시 열림
 *  단순화: 납입은 연말 일시, 수익률은 연 복리 고정, 만기 즉시 전액 이전
 * ------------------------------------------------------------------ */

const ISA_TAXFREE = 2_000_000; // 만기 순이익 비과세 한도
const ISA_EXCESS_RATE = 0.099; // 비과세 초과분 분리과세율
const TRANSFER_DEDUCT_RATE = 0.1; // 이전액의 10% 세액공제
const TRANSFER_DEDUCT_CAP = 3_000_000; // 추가 세액공제 한도(300만)

/**
 * @param {object} p
 * @param {number} p.isaAnnual  ISA에 배분되는 연 납입액(원)
 * @param {number} [p.years=20]  시뮬레이션 기간(년)
 * @param {number} [p.cycleYears=3]  ISA 만기 주기(년)
 * @param {number} [p.cagr=0.07]  참고 연환산 수익률(연 복리)
 * @param {number} [p.deductRate=0.165]  세액공제 환급률(16.5%/13.2%)
 * @returns 만기 이벤트 목록(연도·이전액·정산세·추가공제·환급)과 20년 합계
 */
export function projectIsaRollover({
  isaAnnual = 0,
  years = 20,
  cycleYears = 3,
  cagr = 0.07,
  deductRate = 0.165,
} = {}) {
  const events = [];
  let bal = 0; // ISA 평가액
  let principal = 0; // 이번 사이클 납입 원금
  let totalTransferred = 0;
  let totalIsaTax = 0;
  let totalExtraRefund = 0;

  for (let y = 1; y <= years; y++) {
    bal = bal * (1 + cagr) + isaAnnual; // 연말 납입 단순화
    principal += isaAnnual;
    if (y % cycleYears !== 0) continue;

    // 만기 정산 — 순이익 200만 비과세, 초과분 9.9%
    const gain = Math.max(0, bal - principal);
    const tax = Math.max(0, gain - ISA_TAXFREE) * ISA_EXCESS_RATE;
    const transferred = bal - tax; // 연금저축으로 대량 이전(연 납입한도와 별개)
    const extraDeduction = Math.min(transferred * TRANSFER_DEDUCT_RATE, TRANSFER_DEDUCT_CAP);
    const refund = extraDeduction * deductRate;

    events.push({ year: y, transferred, gain, tax, extraDeduction, refund });
    totalTransferred += transferred;
    totalIsaTax += tax;
    totalExtraRefund += refund;

    bal = 0; // 재가입 — 한도 리셋
    principal = 0;
  }

  return { events, totalTransferred, totalIsaTax, totalExtraRefund, cycleYears, years };
}

export default projectIsaRollover;
