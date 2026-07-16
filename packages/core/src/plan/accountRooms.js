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
    id: "general",
    engineId: "general",
    name: "일반 위탁계좌",
    roomType: "none",
    benefit: "배당세 15.4% · 한도·상품 제약 없음",
    about:
      "증권사에서 국내외 주식·ETF를 자유롭게 매매하는 기본 계좌예요. 한도·상품 제약은 없지만 배당(15.4%)·해외 매매차익(양도세 22%)에 세금이 그대로 부과돼요.",
  },
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
];

/**
 * @param {object} p
 * @param {boolean} [p.mydata=false]  마이데이터 연동 여부(미연동이면 여력=한도 최대)
 * @param {number} [p.income]  전년도 총소득 — 세액공제 환급률(16.5%/13.2%) 분기
 * @returns 4계좌 room 목록 + 요약
 */
export function buildAccountRooms({ mydata = false, income = 50_000_000 } = {}) {
  const DEDUCT_RATE = deductionRate(income); // 총급여 5,500만 이하 16.5%, 초과 13.2%
  // 연금계좌 납입액을 연금저축(600 우선) → IRP 순으로 배분
  const pensionContributed = mydata ? MYDATA_ACCOUNTS.pension?.contributedThisYear || 0 : 0;
  const pensionUsed = { pensionSavings: Math.min(pensionContributed, 6_000_000), irp: Math.max(0, pensionContributed - 6_000_000) };

  const rooms = ROOM_DEFS.map((d) => {
    const snap = mydata ? MYDATA_ACCOUNTS[d.engineId] : null;
    // held: true(보유) | false(연동됐으나 미보유) | null(미연동 — 보유 여부 미상)
    // engine 'pension' 잔고는 두 계좌가 공유 — 연금저축을 대표 보유로 표기
    const held = !mydata ? null : d.id === "irp" ? false : !!snap;
    const balance = held ? snap?.balance ?? 0 : 0;
    const institution = held ? snap?.institution || null : null; // 보유 금융사
    // 보유 상품 — engine 'pension' 잔고는 연금저축을 대표로 표기(IRP는 mock 미보유)
    const holdings = held && d.id !== "irp" ? snap?.holdings ?? [] : [];
    const oneLiner = ONE_LINERS[d.id];

    if (d.roomType === "none") {
      return { ...d, held, balance, institution, holdings, oneLiner, used: 0, room: Infinity, roomText: "한도 없음", pct: 0, estSaving: 0 };
    }

    const used =
      d.id === "isa"
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

  const totalRefund = rooms.reduce((s, r) => s + (r.estRefund || 0), 0);
  // 개설 추천 대상 — 연동됐으나 미보유(held===false)인 절세계좌 (일반계좌는 제외)
  const openable = rooms.filter((r) => r.held === false && r.recommend).map((r) => r.name);

  return { rooms, totalRefund, openable, mydata };
}

export default buildAccountRooms;
