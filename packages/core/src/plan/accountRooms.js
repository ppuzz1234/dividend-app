/* ------------------------------------------------------------------ *
 *  계좌 전략 — 4계좌(일반·ISA·연금저축·IRP) 활용가능 여력(room) 산출
 *  ──────────────────────────────────────────────────────────────
 *  전략 화면이 "네 계좌 각각 올해 얼마를 더 넣을 수 있나"를 시인성 높게
 *  보여주기 위한 프레젠테이션 헬퍼. 보유하지 않은 계좌는 개설을 추천하고
 *  여력은 한도 최대치로 잡는다.
 *  · 한도·세액공제 파라미터는 accountProfiles(ACCOUNT_PROFILES) 기준
 *  · 보유·납입 현황은 MYDATA_ACCOUNTS(engine id: general/isa/pension)에서 매핑
 * ------------------------------------------------------------------ */
import { MYDATA_ACCOUNTS } from "../holdings/snapshot.js";
import { deductionRate } from "../knowledge/accounts.js";
import { ETF_BENCHMARKS } from "../knowledge/etfBenchmarks.js";
import { projectIsaRollover } from "./isaRollover.js";

// 롤오버 전망 수익률 — 시나리오와 동일한 벤치마크(PLUS 미국S&P500) 가정치 사용
const PLAN_CAGR = ETF_BENCHMARKS[0]?.cagrRef ?? 0.07;

/* 계좌별 "한줄 정리" — 시트 상단에 노출할 계좌 성격·추천 한 문장 */
const ONE_LINERS = {
  general: "해외ETF 배당이 커서 금융소득종합과세·건보료 부담이 있어요. 같은 지수의 국내상장 상품으로 옮기면 절세계좌 활용이 열려요.",
  isa: "비과세·손익통산 한도가 남아 있어요. 배당형 국내상장 상품을 ISA로 모으면 절세 효과가 커져요.",
  pensionSavings: "과세이연되는 연금계좌예요. 국내상장 해외ETF·배당ETF를 담기에 가장 유리해요.",
  irp: "세액공제 한도가 남아 있어요. 안전자산 30% 요건만 지키면 추가 납입이 유리해요.",
};

/* 4계좌 정의 — 연금계좌 세액공제 합산 한도(900만)를 연금저축600 + IRP300 으로 분해 */
const ROOM_DEFS = [
  {
    id: "isa",
    engineId: "isa",
    name: "ISA",
    roomType: "limit",
    limit: 20_000_000,
    benefit: "순이익 200만 비과세 + 초과분 9.9% 분리과세",
    recommend: "ISA를 개설하면 비과세·손익통산 한도를 매년 활용할 수 있어요.",
    constraint: "3년 만기마다 재가입(롤오버) · 금융소득종합과세 대상 시 가입 제한",
    about:
      "개인종합자산관리계좌(ISA)는 예금·펀드·국내상장 주식·ETF·리츠를 한 계좌에 담아 굴리는 절세 계좌예요. 순이익 200만원까지 비과세, 초과분은 9.9%로 분리과세되고 손익통산이 돼요. 3년 이상 유지가 조건이에요.",
  },
  {
    id: "pensionSavings",
    engineId: "pension",
    name: "연금저축",
    roomType: "deduct",
    limit: 6_000_000, // 세액공제 한도(단독 600만)
    depositLimit: 18_000_000, // 연금계좌 합산 납입 한도(참고)
    benefit: "납입액 최대 16.5% 세액공제 + 과세이연",
    recommend: "연금저축을 개설하면 납입액의 최대 16.5%를 세액공제로 돌려받아요.",
    about:
      "노후 대비 세제혜택 계좌예요. 납입액의 최대 16.5%를 연말정산에서 세액공제로 돌려받고, 수익은 인출 전까지 과세이연돼요. 만 55세 이후 연금으로 받으면 낮은 연금소득세(3.3~5.5%)만 부담해요.",
  },
  {
    id: "irp",
    engineId: "pension",
    name: "IRP",
    roomType: "deduct",
    limit: 3_000_000, // 연금저축 600 이후 세액공제 합산 잔여 300만
    benefit: "세액공제 한도 확대 + 퇴직소득세 감면",
    recommend: "IRP를 개설하면 세액공제 한도를 300만원 더 채울 수 있어요.",
    about:
      "개인형 퇴직연금(IRP)은 스스로 적립하는 퇴직연금 계좌예요. 연금저축과 합산해 연 900만원까지 세액공제(최대 16.5%)를 받고, 과세이연·저율 연금소득세 혜택이 있어요. 예금 등 원리금보장상품으로 안전자산 30% 요건을 채울 수 있는 유일한 계좌이며, 위험자산은 70%로 제한돼요.",
  },
  {
    id: "general",
    engineId: "general",
    name: "일반 위탁계좌",
    roomType: "none",
    benefit: "배당세 15.4% · 한도·상품 제약 없음",
    about:
      "증권사에서 국내외 주식·ETF를 자유롭게 매매하는 기본 계좌예요. 한도·상품 제약은 없지만 배당(15.4%)·해외 매매차익(양도세 22%)에 세금이 그대로 부과돼요.",
  },
];

/* 월 불입 배분 우선순위 — 20년 세후 시뮬레이션 검증 결과
 * (연금저축 공제분 → ISA → IRP → 연금저축 비공제 추가납입 → 일반):
 * · 연금저축 공제분(600만): 원금의 16.5% 즉시 환급 + 100% 주식 가능 → 압도적 1순위
 * · ISA(2,000만): 3년 만기마다 연금저축으로 대량 이전(+이전액 10% 추가공제),
 *   전액 주식 투자 가능 — IRP의 안전자산 30% 의무로 인한 수익률 드래그(장기 복리)가
 *   세액공제 300만의 이점을 상쇄하므로, 주식 기대수익 연 9%+ 가정에선 ISA가 IRP보다 앞선다
 * · IRP(300만): 세액공제는 받되 위험자산 70% 제한 → ISA 다음
 * · 연금저축 비공제 추가납입: 연금계좌 합산 납입한도(연 1,800만)의 잔여분 —
 *   세액공제는 없지만 과세이연·저율과세·건보료 차단은 동일하고 원금은 인출 시 비과세.
 *   은퇴 후 연금계좌 안에서 고배당 ETF 배당을 받는 전략의 래퍼 유입을 최대화한다
 * 각 계좌의 "올해 남은 여력(연)"을 한도로 흘려 담는다. */
const PLAN_ORDER = ["pensionSavings", "isa", "irp"];
const PENSION_DEPOSIT_LIMIT = 18_000_000; // 연금계좌(연금저축+IRP) 합산 연 납입한도
const PLAN_REASONS = {
  pensionSavings: "세액공제 환급률이 가장 높아 1순위로 채워요.",
  isa: "전액 주식 투자가 가능하고, 3년 만기마다 연금저축으로 이전하며 추가 세액공제(이전액 10%)까지 받아 IRP보다 유리해요.",
  irp: "안전자산 30% 의무로 장기 기대수익이 낮아져, 세액공제 한도(300만)는 ISA 다음에 채워요.",
  pensionExtra: "세액공제는 없지만 연금계좌 납입한도(연 1,800만)까지 더 채우면 과세이연·건보료 차단 혜택을 받고, 원금은 인출 시 비과세예요.",
  general: "절세계좌·연금 납입한도를 모두 채우고 남는 금액만 담아요.",
};

/**
 * @param {object} p
 * @param {boolean} [p.mydata=false]  마이데이터 연동 여부(미연동이면 여력=한도 최대)
 * @param {object} [p.manual]  수기 입력 계좌 — { isa, pensionSavings, irp, general }
 *   각 값은 { contributedThisYear, balance } 또는 숫자(당해 기납=평가액). 전달 시
 *   mydata 목데이터 대신 이 값으로 여력을 계산한다(0/미입력 = 계좌 없음).
 * @param {number} [p.income]  전년도 총소득 — 세액공제 환급률(16.5%/13.2%) 분기
 * @param {number} [p.monthlyContribution=0]  매달 투자할 금액(원) — 전달 시 계좌별
 *   월 납입 추천(planMonthly/planAnnual/planShare/planReason)을 함께 산출
 * @returns 4계좌 room 목록 + 요약
 */
export function buildAccountRooms({ mydata = false, manual = null, income = 50_000_000, monthlyContribution = 0 } = {}) {
  const DEDUCT_RATE = deductionRate(income); // 총급여 5,500만 이하 16.5%, 초과 13.2%
  // 수기 입력값 정규화 — 숫자면 {당해 기납 = 평가액} 으로 간주
  const norm = (v) =>
    v == null ? null : typeof v === "number"
      ? { contributedThisYear: v, balance: v }
      : { contributedThisYear: v.contributedThisYear ?? 0, balance: v.balance ?? v.contributedThisYear ?? 0 };
  const M = manual
    ? Object.fromEntries(["isa", "pensionSavings", "irp", "general"].map((k) => [k, norm(manual[k])]))
    : null;

  // 연금계좌 납입액을 연금저축(600 우선) → IRP 순으로 배분 (수기 모드에선 계좌별 입력값을 그대로 사용)
  const pensionContributed = mydata ? MYDATA_ACCOUNTS.pension?.contributedThisYear || 0 : 0;
  const pensionUsed = { pensionSavings: Math.min(pensionContributed, 6_000_000), irp: Math.max(0, pensionContributed - 6_000_000) };

  const rooms = ROOM_DEFS.map((d) => {
    const man = M?.[d.id];
    const snap = mydata && !M ? MYDATA_ACCOUNTS[d.engineId] : null;
    /* held: true(보유) | false(확인됐으나 미보유) | null(미확인)
     * · 수기 모드: 입력값 > 0 이면 보유, 0/미입력이면 "계좌 없음"
     * · 마이데이터: engine 'pension' 잔고는 두 계좌가 공유 — 연금저축을 대표 보유로 표기 */
    const held = M ? (man?.balance || man?.contributedThisYear || 0) > 0 : !mydata ? null : d.id === "irp" ? false : !!snap;
    const balance = held ? (M ? man.balance : snap?.balance ?? 0) : 0;
    const institution = held && !M ? snap?.institution || null : null; // 수기 입력은 금융사 미상
    const holdings = held && !M && d.id !== "irp" ? snap?.holdings ?? [] : [];
    const oneLiner = ONE_LINERS[d.id];

    if (d.roomType === "none") {
      return { ...d, held, balance, institution, holdings, oneLiner, used: 0, room: Infinity, roomText: "한도 없음", pct: 0, estSaving: 0 };
    }

    const used = M
      ? Math.min(man?.contributedThisYear ?? 0, d.limit)
      : d.id === "isa"
        ? (mydata ? MYDATA_ACCOUNTS.isa?.contributedThisYear || 0 : 0)
        : pensionUsed[d.id] || 0;
    const room = Math.max(0, d.limit - used);
    const pct = d.limit > 0 ? Math.min(100, (used / d.limit) * 100) : 0;
    const estRefund = d.roomType === "deduct" ? Math.round(room * DEDUCT_RATE) : 0;
    // 예상 절세효과 — 연금계좌: 세액공제 환급, ISA: 비과세 한도(200만) 상당의 절세액
    const estSaving = d.roomType === "deduct" ? estRefund : d.id === "isa" ? Math.round(2_000_000 * 0.154) : 0;

    return {
      ...d,
      held,
      balance,
      institution,
      holdings,
      oneLiner,
      used,
      room,
      pct,
      roomText: d.roomType === "deduct" ? "올해 세액공제 여력" : "올해 납입 여력",
      estRefund,
      estSaving,
    };
  });

  // 월 불입 배분 — 우선순위대로 남은 여력(연)까지 waterfall 로 흘려 담는다
  if (monthlyContribution > 0) {
    const annual = monthlyContribution * 12;
    const get = (id) => rooms.find((x) => x.id === id);
    let rem = annual;

    // 1~3단계: 연금저축 공제분 → ISA → IRP (각 남은 여력까지)
    for (const id of PLAN_ORDER) {
      const r = get(id);
      if (!r) continue;
      const put = Math.max(0, Math.min(rem, r.room));
      r.planAnnual = put;
      r.planReason = PLAN_REASONS[id];
      // ISA 배분이 있으면 3년 만기 롤오버(연금저축 대량 이전 + 추가 세액공제) 전망 첨부
      if (id === "isa" && put > 0) {
        r.rollover = projectIsaRollover({ isaAnnual: put, deductRate: DEDUCT_RATE, cagr: PLAN_CAGR });
      }
      rem -= put;
    }

    // 4단계: 연금저축 비공제 추가납입 — 연금계좌 합산 납입한도(1,800만)의 잔여분까지
    const ps = get("pensionSavings");
    const irp = get("irp");
    const depositUsed = pensionContributed + (ps?.planAnnual || 0) + (irp?.planAnnual || 0);
    const extraRoom = Math.max(0, PENSION_DEPOSIT_LIMIT - depositUsed);
    const extra = Math.max(0, Math.min(rem, extraRoom));
    if (ps && extra > 0) {
      ps.planExtraAnnual = extra;
      ps.planExtraReason = PLAN_REASONS.pensionExtra;
    }
    rem -= extra;

    // 5단계: 일반 — 남는 전액
    const gen = get("general");
    if (gen) {
      gen.planAnnual = rem;
      gen.planReason = PLAN_REASONS.general;
    }

    // 월·비중 확정 — 연금저축은 공제분 + 비공제 추가납입 합산
    for (const r of rooms) {
      const total = (r.planAnnual || 0) + (r.planExtraAnnual || 0);
      r.planTotalAnnual = total;
      r.planMonthly = total / 12;
      r.planShare = total / annual;
      if (!r.planReason) r.planReason = PLAN_REASONS[r.id];
    }
  }

  const totalRefund = rooms.reduce((s, r) => s + (r.estRefund || 0), 0);
  // 개설 추천 대상 — 연동됐으나 미보유(held===false)인 절세계좌 (일반계좌는 제외)
  const openable = rooms.filter((r) => r.held === false && r.recommend).map((r) => r.name);

  return { rooms, totalRefund, openable, mydata, monthlyContribution };
}

export default buildAccountRooms;
