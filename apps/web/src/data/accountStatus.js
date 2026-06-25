import { ACCOUNTS } from "./accounts.js";

/* ------------------------------------------------------------------ *
 *  마이데이터 연동 시 가져오는 계좌 현황 (예시 데이터)
 *  · balance: 현재 평가액/예수금
 *  · contributedThisYear: 올해 납입액 (연 한도·세액공제 한도 소진분)
 * ------------------------------------------------------------------ */
export const MYDATA_ACCOUNTS = {
  general: { balance: 8_000_000, contributedThisYear: 0 },
  isa: { balance: 12_000_000, contributedThisYear: 7_000_000 },
  pension: { balance: 5_000_000, contributedThisYear: 3_000_000 },
};

/* 계좌별 "올해 더 쓸 수 있는 금액"(여력) 계산.
 * 세액공제 한도가 있으면 그 잔여를 핵심 여력으로, 아니면 연 납입한도 잔여를 사용.
 * mydata 미연동이면 올해 납입 0으로 가정(= 한도 전부 여력). */
export function accountHeadroom(accountId, status, mydata) {
  const acc = ACCOUNTS.find((a) => a.id === accountId) || ACCOUNTS[0];
  const contributed = mydata ? status?.contributedThisYear || 0 : 0;

  if (acc.deductCap > 0) {
    return {
      type: "deduct", // 세액공제 한도 기준
      limit: acc.deductCap,
      used: Math.min(contributed, acc.deductCap),
      remaining: Math.max(0, acc.deductCap - contributed),
      depositLimit: acc.annualLimit,
      depositRemaining: Math.max(0, acc.annualLimit - contributed),
    };
  }
  if (Number.isFinite(acc.annualLimit)) {
    return {
      type: "limit", // 연 납입한도 기준
      limit: acc.annualLimit,
      used: Math.min(contributed, acc.annualLimit),
      remaining: Math.max(0, acc.annualLimit - contributed),
      depositRemaining: Math.max(0, acc.annualLimit - contributed),
    };
  }
  return { type: "none", limit: Infinity, used: 0, remaining: Infinity, depositRemaining: Infinity };
}
