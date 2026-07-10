import { ACCOUNTS, deductionRate } from "../knowledge/accounts.js";
import { CATEGORIES } from "../knowledge/stocks.js";
import { recommendByAccount, chosenCategories } from "./assetLocation.js";
import { accountHeadroom } from "../taxopt/headroom.js";
import { MYDATA_ACCOUNTS } from "../holdings/snapshot.js";
import { fmtKRW } from "../util/format.js";

const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/* ================================================================== *
 *  ★ 계좌 운용 전략 플레이북 — 플랫폼 차별화 영역
 *  ──────────────────────────────────────────────────────────────
 *  전략(=계좌를 어떻게 더 운용할지에 대한 방안)은 여기서 관리·업데이트한다.
 *  goal × account 별 운용 방침. actions 의 토큰({remaining}/{refund}/
 *  {depositRemaining})은 엔진이 사용자의 실제 여력 금액으로 치환한다.
 *  version 으로 전략 개정 이력을 추적한다.
 * ================================================================== */
export const STRATEGY_PLAYBOOK = {
  version: "2026.06",
  goals: {
    retirement: {
      pension: {
        tagline: "세액공제 한도부터 채우기",
        actions: [
          "올해 세액공제 한도까지 {remaining} 추가 납입 → 약 {refund} 환급",
          "위험자산 70% 한도 내에서 배당성장 ETF 중심으로 운용",
        ],
        rationale: "과세이연 + 세액공제로 장기 복리에 가장 유리한 계좌예요.",
      },
      isa: {
        tagline: "비과세 한도 활용",
        actions: [
          "비과세 한도를 살려 고배당주를 {depositRemaining}까지 추가 매수",
          "3년 만기 후 연금계좌로 전환하면 전환액의 10%(최대 300만) 추가 세액공제",
        ],
        rationale: "비과세·분리과세라 배당을 받아도 세금 부담이 작아요.",
      },
      general: {
        tagline: "절세계좌 초과분 담기",
        actions: ["절세계좌 한도를 넘는 금액은 배당성장주 위주로 운용해 매년 배당세를 최소화"],
        rationale: "매년 15.4% 과세되니 배당이 적고 성장하는 종목이 유리해요.",
      },
    },
    cashflow: {
      isa: {
        tagline: "월 현금흐름 만들기",
        actions: ["커버드콜·고배당으로 비과세 한도 {depositRemaining}까지 채워 월 분배금 확보"],
        rationale: "비과세 한도 안에서 고분배 상품이 현금흐름에 가장 효율적이에요.",
      },
      pension: {
        tagline: "세액공제만 챙기기",
        actions: ["세액공제 한도까지 {remaining}만 납입(환급 {refund}) — 55세 전 자금이 묶이는 점 고려"],
        rationale: "현금흐름이 목표라 연금은 절세 효과분만 활용해요.",
      },
      general: {
        tagline: "유동성 확보",
        actions: ["즉시 인출이 필요한 자금은 일반계좌에서 배당성장주로 운용"],
        rationale: "언제든 꺼낼 수 있어 현금흐름 조절에 유리해요.",
      },
    },
  },
};

/* ------------------------------------------------------------------ *
 *  전략 엔진 — 계좌 현황(여력) × 목표 → 계좌별 상세 운용 방안 + 종목 유형
 *  Accounts 화면에 그대로 표시되고, chosenCats 는 뒤 단계(picker)로 연동된다.
 * ------------------------------------------------------------------ */
export function buildStrategy({ goal = "retirement", income = 50_000_000, mydata = false } = {}) {
  const dRate = deductionRate(income);
  const recs = recommendByAccount({ goal });
  const recCat = Object.fromEntries(recs.map((r) => [r.accountId, r.category]));
  const book = STRATEGY_PLAYBOOK.goals[goal] || STRATEGY_PLAYBOOK.goals.retirement;

  const items = ACCOUNTS.map((acc) => {
    const hr = accountHeadroom(acc.id, MYDATA_ACCOUNTS[acc.id], mydata);
    const refund = hr.type === "deduct" ? hr.remaining * dRate : 0;
    const entry = book[acc.id] || {};
    const category = recCat[acc.id] || "growth";

    const fill = (s) =>
      s
        .replaceAll("{remaining}", fmtKRW(hr.remaining))
        .replaceAll("{depositRemaining}", fmtKRW(hr.depositRemaining ?? hr.remaining))
        .replaceAll("{refund}", fmtKRW(refund));

    return {
      accountId: acc.id,
      account: acc,
      balance: mydata ? MYDATA_ACCOUNTS[acc.id]?.balance ?? 0 : null,
      headroom: hr,
      refund,
      category,
      categoryLabel: CATEGORY[category]?.label || category,
      tagline: entry.tagline || "",
      actions: (entry.actions || []).map(fill),
      rationale: entry.rationale || "",
    };
  });

  const totalRefund = items.reduce((s, it) => s + it.refund, 0);
  return { version: STRATEGY_PLAYBOOK.version, goal, deductionRate: dRate, items, totalRefund, chosenCats: chosenCategories(recs) };
}
