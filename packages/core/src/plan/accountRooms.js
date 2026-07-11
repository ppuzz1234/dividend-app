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

/* 4계좌 정의 — 연금계좌 세액공제 합산 한도(900만)를 연금저축600 + IRP300 으로 분해 */
const ROOM_DEFS = [
  {
    id: "general",
    engineId: "general",
    name: "일반 위탁계좌",
    roomType: "none",
    benefit: "배당세 15.4% · 한도·상품 제약 없음",
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
  },
  {
    id: "irp",
    engineId: "pension",
    name: "IRP",
    roomType: "deduct",
    limit: 3_000_000, // 연금저축 600 이후 세액공제 합산 잔여 300만
    benefit: "세액공제 한도 확대 + 퇴직소득세 감면",
    recommend: "IRP를 개설하면 세액공제 한도를 300만원 더 채울 수 있어요.",
  },
];

const DEDUCT_RATE = 0.165; // 세액공제 환급률(총급여 5,500만 이하 기준, 단순화)

/**
 * @param {object} p
 * @param {boolean} [p.mydata=false]  마이데이터 연동 여부(미연동이면 여력=한도 최대)
 * @returns 4계좌 room 목록 + 요약
 */
export function buildAccountRooms({ mydata = false } = {}) {
  // 연금계좌 납입액을 연금저축(600 우선) → IRP 순으로 배분
  const pensionContributed = mydata ? MYDATA_ACCOUNTS.pension?.contributedThisYear || 0 : 0;
  const pensionUsed = { pensionSavings: Math.min(pensionContributed, 6_000_000), irp: Math.max(0, pensionContributed - 6_000_000) };

  const rooms = ROOM_DEFS.map((d) => {
    const snap = mydata ? MYDATA_ACCOUNTS[d.engineId] : null;
    // held: true(보유) | false(연동됐으나 미보유) | null(미연동 — 보유 여부 미상)
    // engine 'pension' 잔고는 두 계좌가 공유 — 연금저축을 대표 보유로 표기
    const held = !mydata ? null : d.id === "irp" ? false : !!snap;
    const balance = held ? snap?.balance ?? 0 : 0;

    if (d.roomType === "none") {
      return { ...d, held, balance, used: 0, room: Infinity, roomText: "한도 없음", pct: 0 };
    }

    const used =
      d.id === "isa"
        ? (mydata ? MYDATA_ACCOUNTS.isa?.contributedThisYear || 0 : 0)
        : pensionUsed[d.id] || 0;
    const room = Math.max(0, d.limit - used);
    const pct = d.limit > 0 ? Math.min(100, (used / d.limit) * 100) : 0;

    return {
      ...d,
      held,
      balance,
      used,
      room,
      pct,
      roomText: d.roomType === "deduct" ? "올해 세액공제 여력" : "올해 납입 여력",
      estRefund: d.roomType === "deduct" ? Math.round(room * DEDUCT_RATE) : 0,
    };
  });

  const totalRefund = rooms.reduce((s, r) => s + (r.estRefund || 0), 0);
  // 개설 추천 대상 — 연동됐으나 미보유(held===false)인 절세계좌 (일반계좌는 제외)
  const openable = rooms.filter((r) => r.held === false && r.recommend).map((r) => r.name);

  return { rooms, totalRefund, openable, mydata };
}

export default buildAccountRooms;
