import { ACCOUNTS } from "../knowledge/accounts.js";

/* ------------------------------------------------------------------ *
 *  ③ 절세 최적화 — 계좌별 "올해 더 쓸 수 있는 금액"(여력) 계산
 *  세액공제 한도가 있으면 그 잔여를 핵심 여력으로, 아니면 연 납입한도
 *  잔여를 사용. mydata 미연동이면 올해 납입 0으로 가정(= 한도 전부 여력).
 *  (구 data/accountStatus.js 에서 로직만 분리 — 목데이터는 holdings/snapshot.js)
 * ------------------------------------------------------------------ */
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
