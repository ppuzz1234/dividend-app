/* ------------------------------------------------------------------ *
 *  계좌 전략 — 4계좌(일반·ISA·연금저축·IRP) 활용가능 여력(room) 산출
 *  ──────────────────────────────────────────────────────────────
 *  전략 화면이 "네 계좌 각각 올해 얼마를 더 넣을 수 있나"를 시인성 높게
 *  보여주기 위한 프레젠테이션 헬퍼. 보유하지 않은 계좌는 개설을 추천하고
 *  여력은 한도 최대치로 잡는다.
 *  · 한도·세액공제 파라미터는 accountProfiles(ACCOUNT_PROFILES) 기준
 *  · 보유·납입 현황은 MYDATA_ACCOUNTS(engine id: general/isa/pension)에서 매핑
 * ------------------------------------------------------------------ */
import { MYDATA_ACCOUNTS, MYDATA_PROFILE } from "../holdings/snapshot.js";
import { deductionRate } from "../knowledge/accounts.js";
import { ETF_BENCHMARKS } from "../knowledge/etfBenchmarks.js";
import { projectIsaRollover } from "./isaRollover.js";
import { accountEligibility } from "./eligibility.js";

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
    depositLimit: 18_000_000, // 연금계좌 합산 납입 한도(연금저축+IRP, 참고)
    // 공제 한도(300만)와 납입 한도(합산 1,800만)가 다르다는 점을 카드에서 명확히 안내
    depositNote:
      "여기 300만원은 세액공제 여력이에요. 납입 자체는 연금저축과 합산 연 1,800만원까지 가능하고, 공제 한도를 넘긴 금액은 비공제·과세이연으로 쌓여요.",
    benefit: "세액공제 한도 확대 + 퇴직소득세 감면",
    recommend: "IRP를 개설하면 세액공제 한도를 300만원 더 채울 수 있어요.",
    about:
      "개인형 퇴직연금(IRP)은 스스로 적립하는 퇴직연금 계좌예요. 연금저축과 합산해 연 900만원까지 세액공제(최대 16.5%)를 받고, 납입 자체는 합산 연 1,800만원까지 가능해요(공제 초과분은 비공제·과세이연). 과세이연·저율 연금소득세 혜택이 있고, 예금 등 원리금보장상품으로 안전자산 30% 요건을 채울 수 있는 유일한 계좌이며 위험자산은 70%로 제한돼요.",
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

/* 월 불입 배분 우선순위 — 절세선호도(taxPref)에 따라 두 갈래.
 *
 * · growth(장기 자산 증식 우선, 기본) — 20년 세후 시뮬레이션 검증 결과:
 *   연금저축 공제분 → ISA → IRP → 연금저축 비공제 추가납입 → 일반.
 *   IRP의 안전자산 30% 의무로 인한 수익률 드래그(장기 복리)가 세액공제 300만의
 *   이점을 상쇄하므로, 주식 기대수익 연 9%+ 가정에선 ISA가 IRP보다 앞선다.
 * · refund(올해 세액공제 최우선):
 *   연금저축 공제분 → IRP → ISA → 연금저축 비공제 추가납입 → 일반.
 *   공제 한도 900만(연금저축 600 + IRP 300)을 먼저 소진해 올해 연말정산
 *   환급을 최대로 확보한 뒤 비과세(ISA)를 채운다.
 * 공통:
 * · 연금저축 공제분(600만): 원금의 최대 16.5% 즉시 환급 + 100% 주식 가능 → 항상 1순위
 * · 연금저축 비공제 추가납입: 연금계좌 합산 납입한도(연 1,800만)의 잔여분 —
 *   세액공제는 없지만 과세이연·저율과세·건보료 차단은 동일하고 원금은 인출 시 비과세
 * 각 계좌의 "올해 남은 여력(연)"을 한도로 흘려 담는다. */
const PLAN_ORDERS = {
  growth: ["pensionSavings", "isa", "irp"],
  refund: ["pensionSavings", "irp", "isa"],
};
const PENSION_DEPOSIT_LIMIT = 18_000_000; // 연금계좌(연금저축+IRP) 합산 연 납입한도
const PLAN_REASONS = {
  growth: {
    pensionSavings: "세액공제 환급률이 가장 높아 1순위로 채워요.",
    isa: "전액 주식 투자가 가능하고, 3년 만기마다 연금저축으로 이전하며 추가 세액공제(이전액 10%)까지 받아 IRP보다 유리해요.",
    irp: "안전자산 30% 의무로 장기 기대수익이 낮아져, 세액공제 한도(300만)는 ISA 다음에 채워요.",
  },
  refund: {
    pensionSavings: "연말정산 세액공제의 첫 번째 상자예요. 공제 한도 연 600만원부터 채워요.",
    irp: "연금저축과 합산해 공제 한도 900만원까지 마저 채워, 올해 연말정산 환급을 극대화해요.",
    isa: "공제 한도를 넘는 추가 투자금은 배당소득세 절세를 위해 ISA에 담아 비과세·손익통산으로 운용해요.",
  },
  common: {
    pensionExtra: "세액공제는 없지만 연금계좌 납입한도(연 1,800만)까지 더 채우면 과세이연·건보료 차단 혜택을 받고, 원금은 인출 시 비과세예요.",
    general: "절세계좌·연금 납입한도를 모두 채우고 남는 금액만 담아요.",
  },
};

/* 절세선호도 선택지 메타 — 분석 화면의 선호 선택 UI 가 그대로 렌더한다 */
export const TAX_PREFS = [
  {
    id: "growth",
    label: "장기 자산 증식 우선",
    desc: "IRP의 안전자산 30% 제한을 피해 ISA를 먼저 채워, 장기 복리 수익을 극대화해요.",
  },
  {
    id: "refund",
    label: "올해 세액공제 우선",
    desc: "연금저축·IRP 공제 한도(연 900만원)부터 채워, 올해 연말정산 환급을 최대로 확보해요.",
  },
];

/* ── ISA 만기(3년) 세부전략 — 넘버링 코드(isa1~3)로 식별 ──
 * DB 스키마를 바꾸지 않기 위해 코드 문자열로 관리하고, 절세선호도와 합쳐
 * "growth-isa1" 같은 단일 전략 코드(encodeStrategy)로 직렬화한다.
 * isa3(롤오버 없음)는 배분이 refund(공제 우선)와 동치라 선택 UI 에서는
 * 제외됐다(간소화) — 저장된 과거 코드 호환을 위해 엔진 지원은 유지한다. */
export const ISA_ROLLOVERS = [
  {
    id: "isa1",
    label: "연금저축 롤오버",
    desc: "3년 만기마다 목돈을 연금저축으로 이전해요. 만기 특례로 한도 없이 전액 인정되고, 이전액 10%(최대 300만원) 추가 세액공제도 받아요. 노후 목적 자금이면 항상 유리한 표준 전략이에요. 연금저축 공제분(연 600만)은 직접 납입 공제가 더 커서 그래도 먼저 채워요.",
  },
  {
    id: "isa2",
    label: "자금 유동성 확보",
    desc: "만기 목돈으로 ISA를 재가입해 비과세를 반복해요. 55세 전에 쓸 계획이 있는 중기 자금에 맞는 선택이에요. 재가입 한도(연 2,000만·총 1억) 때문에 목돈이 크면 일부는 일반계좌에서 대기하고, 다음 만기에 연금저축 이전을 다시 선택할 수도 있어요.",
  },
  {
    id: "isa3",
    label: "롤오버 없음",
    desc: "만기 후 자금을 자유 운용해요. 유동성은 가장 높지만 장기 절세 효과가 줄어, IRP 세액공제를 ISA보다 먼저 채우도록 순서가 조정돼요.",
  },
];

/* growth 프리셋에서 ISA 를 IRP 보다 앞세우는 근거 — 롤오버 세부전략에 따라 문구가 달라진다
 * (isa1 의 '이전 추가공제'는 다른 전략에선 성립하지 않으므로) */
const ISA_REASON_GROWTH = {
  isa1: "전액 주식 투자가 가능하고, 3년 만기마다 연금저축으로 이전하며 추가 세액공제(이전액 10%)까지 받아 IRP보다 유리해요.",
  isa2: "전액 주식 투자가 가능하고, 3년 만기마다 재가입해 비과세·손익통산 한도를 반복 활용해요.",
  isa3: "전액 주식 투자가 가능하고 비과세·손익통산 혜택이 있어, 안전자산 30% 의무가 있는 IRP보다 유리해요.",
};

/** 전략 코드 직렬화 — 절세선호도 + ISA 세부전략(+유동성)을 한 문자열로
 * (예: "growth-isa1", 유동성 확보 전략은 "growth-isa2-liq").
 * plan_revisions.note 등 기존 text 필드에 그대로 실을 수 있다(스키마 변경 불요). */
export function encodeStrategy({ taxPref = "growth", isaRollover = "isa1", liquidity = null } = {}) {
  return `${taxPref}-${isaRollover}${liquidity === "short" ? "-liq" : ""}`;
}

/** 전략 코드 역직렬화 — 형식이 아니면 null (과거 데이터·자유 텍스트 안전).
 * "-liq" 접미사가 없는 과거 코드는 liquidity:null 로 복원된다(하위 호환). */
export function decodeStrategy(code) {
  const m = /^(growth|refund)-(isa[123])(-liq)?$/.exec(String(code || "").trim());
  return m ? { taxPref: m[1], isaRollover: m[2], liquidity: m[3] ? "short" : null } : null;
}

/** 계좌별 월 납입 한도 직렬화 — "isa=100,irp=0" (만원 단위, monthlyMax 만).
 * 전략 코드처럼 note 텍스트에 실어 스키마 변경 없이 저장/복원한다. */
export function encodePerAccount(perAccount) {
  if (!perAccount) return "";
  const parts = [];
  for (const id of ["pensionSavings", "isa", "irp"]) {
    const max = perAccount[id]?.monthlyMax;
    if (max != null) parts.push(`${id}=${Math.round(max / 10_000)}`);
  }
  return parts.join(",");
}

/** 계좌별 월 납입 한도 역직렬화 — 형식이 아니면 null */
export function decodePerAccount(str) {
  if (!str) return null;
  const out = {};
  for (const part of String(str).split(",")) {
    const m = /^(pensionSavings|isa|irp)=(\d+)$/.exec(part.trim());
    if (m) out[m[1]] = { monthlyMax: Number(m[2]) * 10_000 };
  }
  return Object.keys(out).length ? out : null;
}

/* 입력 정규화 — 평면(구버전) 시그니처와 그룹형(profile/ledger/strategy/contribution)
 * 시그니처를 모두 받아 내부 표준형으로 변환한다. 호출부의 점진 이행용. */
function normalizeRoomsInput(o = {}) {
  const grouped = o.profile || o.ledger || o.strategy || o.contribution;
  const flat = grouped
    ? {
        mydata: o.ledger?.source === "mydata",
        manual: o.ledger?.accounts ?? null,
        income: o.profile?.income,
        age: o.profile?.age,
        earnedIncome: o.profile?.earnedIncome,
        businessIncome: o.profile?.businessIncome,
        finIncome: o.profile?.finIncome,
        monthlyContribution: o.contribution?.monthly,
        taxPref: o.strategy?.taxPref,
        isaRollover: o.strategy?.isaRollover,
        priorityOverride: o.strategy?.priorityOverride,
        perAccount: o.strategy?.perAccount,
        liquidity: o.strategy?.liquidity,
      }
    : o;
  return {
    mydata: flat.mydata ?? false,
    manual: flat.manual ?? null,
    income: flat.income ?? 50_000_000,
    age: flat.age ?? null,
    earnedIncome: flat.earnedIncome ?? null,
    businessIncome: flat.businessIncome ?? null,
    finIncome: flat.finIncome ?? null,
    monthlyContribution: flat.monthlyContribution ?? 0,
    taxPref: flat.taxPref ?? "growth",
    isaRollover: flat.isaRollover ?? "isa1",
    priorityOverride: flat.priorityOverride ?? null,
    perAccount: flat.perAccount ?? null,
    liquidity: flat.liquidity ?? null,
  };
}

/* 수동 순위 오버라이드 정리 — 유효한 절세계좌 id 만 취하고, 빠진 계좌는 기본 순서로 뒤에 붙인다 */
function sanitizeOrder(override, baseOrder) {
  if (!Array.isArray(override)) return baseOrder;
  const valid = override.filter((id) => baseOrder.includes(id));
  if (!valid.length) return baseOrder;
  return [...valid, ...baseOrder.filter((id) => !valid.includes(id))];
}

/* ── 동적 우선순위 산정 — 고정 프리셋 대신 요소별 점수 합산 ──
 * 연금저축 1순위 고정 없이, 아래 요소가 모두 순서에 관여한다:
 *  · 환급 효율: 세액공제율(16.5/13.2%) — refund 선호면 가중 ×3, 공제 실효가
 *    없으면(소득이 면세점 부근 이하) 0. ISA 는 isa1(만기 이전 10% 추가공제)일 때만 소액.
 *  · 성장 효율: 주식 노출·과세혜택 — growth 선호면 가중 ×3.
 *    연금저축 100(과세이연·100% 주식) / ISA 90(비과세, isa3 는 60으로 약화) / IRP 70(안전자산 30% 드래그)
 *  · 잠김 페널티: 공제 효과가 없으면 55세까지 잠기는 연금계좌(연금저축·IRP)를 감점 —
 *    55세 이상이면 잠김 부담이 사실상 없어 페널티 0.
 *  · 유동성 선호(liquidity === "short", 3~5년 내 목돈 계획): ISA 가점, 연금계좌 감점.
 *  · 한도 소진: 올해 여력(room)이 0이면 최하위로 — 표시 순서가 실질 납입 순서와 일치한다.
 * 가중치는 기본 케이스에서 기존 프리셋 순서(growth: 연금저축→ISA→IRP,
 * refund: 연금저축→IRP→ISA)를 정확히 재현하도록 보정된 휴리스틱 값이다. */
const EFFECTIVE_DEDUCT_INCOME_MIN = 15_000_000; // 결정세액 근사 — 이하면 공제 환급 실효 없음(근로소득 면세점 부근)

function scorePriority({ rooms, taxPref, isaRollover, income, workIncome, age, liquidity, defense = false, pensionOnly = false, noWorkIncome = false }) {
  const rate = deductionRate(income);
  /* 공제 실효 판정은 근로·사업소득 기준 — 금융소득 분리과세는 결정세액을 만들지
   * 않아 세액공제 환급이 불가하다(금융소득만 있는 은퇴자·주부가 여기 해당) */
  const noTaxBenefit = (workIncome ?? income ?? 0) < EFFECTIVE_DEDUCT_INCOME_MIN;
  const wRefund = taxPref === "refund" ? 3 : 1;
  const wGrowth = taxPref === "refund" ? 1 : 3;
  const locked = age != null && age >= 55 ? 0 : 1; // 55세 이상이면 연금계좌 잠김 부담 없음

  const factors = {
    pensionSavings: {
      refund: noTaxBenefit ? 0 : rate * 100,
      growth: 100,
      /* defense(무소득 + 금융소득 산입 임계 근접): 잠김 페널티 대신 가점 —
       * 계좌 안의 배당은 소득으로 안 잡혀 피부양자 방어 가치가 잠김 비용을 상회.
       * pensionOnly(ISA 가입 불가로 절세 대안이 연금저축뿐): "잠김 대비 보상 없음"
       * 페널티는 ISA 라는 대체 절세처가 있을 때만 유효하므로 마찬가지로 가점 */
      lock: defense || pensionOnly ? 20 : noTaxBenefit ? -40 * locked : 0,
    },
    isa: {
      refund: !noTaxBenefit && isaRollover === "isa1" ? 5 : 0, // 만기 이전 10% 추가공제의 연 환산 근사
      growth: ({ isa1: 90, isa2: 90, isa3: 60 })[isaRollover] ?? 90,
      lock: 0,
    },
    irp: {
      refund: noTaxBenefit ? 0 : rate * 100,
      growth: 70,
      lock: noTaxBenefit ? -40 * locked : 0,
    },
  };
  if (liquidity === "short") {
    factors.isa.lock += 30;
    factors.pensionSavings.lock -= 30 * locked;
    factors.irp.lock -= 30 * locked;
  }
  if (defense) {
    /* 피부양자 방어 — ISA·연금저축 모두 배당을 '소득'에서 빼내는 방어 계좌지만,
     * 공제 슬라이스가 막힌 연금저축(비공제 전용)보다 비과세+유동성의 ISA 를 앞세운다.
     * 연금저축은 ISA 한도를 넘는 금액의 2순위 방어처(비공제 추가납입). */
    factors.isa.lock += 60;
  } else if (noWorkIncome) {
    /* 무소득자(주부·은퇴자) 기본 전략 — 유동성 있는 ISA 1순위, 연금저축 2순위.
     * 55세 이상은 잠김 페널티가 0이라 연금저축이 역전할 수 있어 가점으로 고정한다 */
    factors.isa.lock += 40;
  }

  const base = PLAN_ORDERS[taxPref] ?? PLAN_ORDERS.growth; // 동점 시 프리셋 순서 유지
  const roomOf = (id) => rooms.find((r) => r.id === id)?.room ?? 0;
  const scores = Object.fromEntries(
    base.map((id) => {
      const f = factors[id];
      const s = f.refund * wRefund + f.growth * wGrowth + f.lock;
      return [id, roomOf(id) > 0 ? s : s - 1000]; // 한도 소진 → 최하위
    })
  );
  const order = [...base].sort((a, b) => scores[b] - scores[a] || base.indexOf(a) - base.indexOf(b));
  return { order, scores, noTaxBenefit };
}

/* 순위 근거 문구 — 동적 상황(자격 없음·한도 소진·공제 실효 없음)이 프리셋 문구보다 우선 */
function priorityReasonFor(id, { rooms, reasons, noTaxBenefit, defense, pensionOnly, noWorkIncome, isaSeomin }) {
  const r = rooms.find((x) => x.id === id);
  if (r && r.eligible === false) return r.ineligibleReason; // 가입자격 없음 — 최우선 안내
  if (r && r.roomType !== "none" && (r.room ?? 0) <= 0) return "올해 납입 한도를 모두 채워서, 남은 계좌부터 담아요.";
  if (noTaxBenefit) {
    if (id === "isa")
      return isaSeomin
        ? "세액공제와 무관한 비과세 계좌인 데다 3년 뒤부터 유동성도 확보돼, 공제 효과가 없는 상황에서 1순위예요. 서민형 가입 대상이라 비과세 한도도 400만원으로 2배예요."
        : "세액공제와 무관한 비과세 계좌인 데다 3년 뒤부터 유동성도 확보돼, 공제 효과가 없는 상황에서 1순위예요.";
    if (id === "pensionSavings") {
      if (defense)
        return "소득이 없어 세액공제는 없지만, 계좌 안에서 받는 배당은 소득으로 잡히지 않아요. 금융소득 산입(연 1,000만)·피부양자 상실(연 2,000만) 임계를 피하는 비공제 납입처로 활용해요.";
      if (pensionOnly)
        return "ISA·IRP는 가입 요건이 안 되어, 나이·소득 제한이 없는 연금저축이 유일한 절세 계좌예요. 세액공제는 없지만 과세이연과 55세 이후 저율 연금소득세 이점을 위해 우선 담아요.";
      if (noWorkIncome)
        return "근로소득이 없어 세액공제 환급은 없지만, ISA 다음 2순위 절세처예요. 과세이연과 55세 이후 저율 연금소득세(3.3~5.5%) 이점이 있어요.";
      return "소득이 적어 세액공제 환급이 없어요. 55세까지 잠기는 부담만 남아 지금은 담지 않아요.";
    }
    if (id === "irp") return "소득이 적어 세액공제 환급이 없어요. 55세까지 잠기는 부담만 남아 지금은 담지 않아요.";
  }
  return reasons[id];
}

/* ── 상황 기반 자동 금액 조절 — 사용자 입력이 아니라 엔진이 판단한다 ──
 * 핵심 질문: "이 돈을 55세까지 잠가도 되는가".
 *  · 공제 슬라이스(연금저축 600만·IRP 300만): 즉시 환급(13.2~16.5%)이 잠김을
 *    보상하므로 원칙 허용. 단 공제 실효가 없으면(저소득 근사 + 55세 미만)
 *    보상이 없어 담지 않는다(0원).
 *  · 비공제 연금 추가납입(4단계): 과세이연뿐이라 보상이 약함 — 55세까지 남은
 *    기간이 짧을수록 많이 허용한다(≤5년 전액 / ≤10년 절반 / ≤15년 1/4 / 그 외 0).
 *    유동성 단기 선호(liquidity==="short")면 0. 넘치는 금액은 ISA·일반으로 흐른다. */
function deriveAutoLimits({ age, noTaxBenefit, liquidity, defense = false, pensionOnly = false, noWorkIncome = false }) {
  const t = age == null ? 15 : Math.max(0, 55 - age); // 나이 미상 → 40세 상당으로 보수 추정
  const lockedNoReward = noTaxBenefit && t > 0; // 공제 보상 없이 잠김만 남는 상황
  /* defense(무소득 + 금융소득이 피부양자 임계 근접): 공제 보상이 없어도
   * 과세이연·건보 산정 제외가 잠김을 보상 → 비공제 납입을 오히려 넉넉히 허용.
   * pensionOnly(ISA 불가로 절세 대안이 연금저축뿐 — 미성년·무소득 등)와
   * noWorkIncome(무소득 주부·은퇴자 — ISA 1순위, 연금저축 2순위 기본 전략):
   * 일반계좌 대비 과세이연·저율 연금소득세가 잠김을 보상하므로 동일하게 허용한다 */
  const extraFactor =
    liquidity === "short" ? 0
      : defense || pensionOnly || noWorkIncome ? (t <= 5 ? 1 : t <= 10 ? 0.75 : 0.5)
      : lockedNoReward ? 0
      : t <= 5 ? 1 : t <= 10 ? 0.5 : t <= 15 ? 0.25 : 0;
  return {
    allowDeduct: !lockedNoReward, // false 면 연금저축·IRP 공제 슬라이스도 담지 않는다
    extraFactor, // 비공제 추가납입 허용 비율(잔여 납입한도 대비)
    defense, // 피부양자 방어 모드 — 문구 분기용
    pensionOnly, // 연금저축 단독 절세 모드 — 문구 분기용
    noWorkIncome, // 무소득자(주부·은퇴자) 기본 전략 — 문구 분기용
  };
}

/**
 * @param {object} p
 * @param {boolean} [p.mydata=false]  마이데이터 연동 여부(미연동이면 여력=한도 최대)
 * @param {object} [p.manual]  수기 입력 계좌 — { isa, pensionSavings, irp, general }
 *   각 값은 { contributedThisYear, balance } 또는 숫자(당해 기납=평가액). 전달 시
 *   mydata 목데이터 대신 이 값으로 여력을 계산한다(0/미입력 = 계좌 없음).
 * @param {number} [p.income]  전년도 총소득 — 세액공제 환급률(16.5%/13.2%) 분기
 * @param {number} [p.monthlyContribution=0]  매달 투자할 금액(원) — 전달 시 계좌별
 *   월 납입 추천(planMonthly/planAnnual/planShare/planReason)을 함께 산출
 * @param {"growth"|"refund"} [p.taxPref="growth"]  절세선호도 — 배분 우선순위 분기
 *   (growth: 장기 증식 우선 ISA→IRP / refund: 올해 세액공제 우선 IRP→ISA)
 * @param {"isa1"|"isa2"|"isa3"} [p.isaRollover="isa1"]  ISA 만기 세부전략(ISA_ROLLOVERS)
 * @param {string[]} [p.priorityOverride]  절세계좌 순위 수동 오버라이드 — 선호 프리셋보다 우선
 * @param {object} [p.perAccount]  계좌별 우선납입·상한(월 원 단위) — { [id]: { monthlyMin?, monthlyMax? } }
 *   monthlyMin 은 waterfall 전에 우선 확보, monthlyMax 는 그 계좌 배분 상한(초과분은 다음 순위로)
 *
 * 그룹형 시그니처도 지원: { profile:{age,income}, ledger:{source,accounts},
 *   strategy:{taxPref,isaRollover,priorityOverride,perAccount}, contribution:{monthly} }
 * @returns 4계좌 room 목록 + 요약 (+ priority: 우선순위 id 배열, strategyCode: "growth-isa1" 형식)
 */
export function buildAccountRooms(input = {}) {
  const { mydata, manual, income, age, liquidity, monthlyContribution, taxPref, isaRollover, priorityOverride, perAccount, earnedIncome, businessIncome, finIncome } =
    normalizeRoomsInput(input);
  /* 소득 종류·금융소득 해석 — 호출부(사용자 입력)가 최우선.
   * 금융소득(finIncome)이 명시되면 총소득에서 금융소득을 뺀 나머지를 근로소득으로
   * 근사한다(수기 입력은 종류 미상이라 근사). 소득 종류가 하나도 지정되지 않은
   * 마이데이터 연동 호출에만 목업 프로필로 보충한다(레거시 호환) — 그렇지 않으면
   * mydata 플래그가 사용자 입력(나이·소득)을 목업 소득으로 덮어써 가입자격
   * 게이트·피부양자 방어 판정이 입력과 무관하게 나온다. */
  const useMockProfile = mydata && earnedIncome == null && businessIncome == null && finIncome == null;
  const fin = finIncome ?? (useMockProfile ? MYDATA_PROFILE.financialIncomePrevYear : 0);
  const business = businessIncome ?? (useMockProfile ? MYDATA_PROFILE.businessIncomePrevYear : 0);
  const earned = earnedIncome ?? (useMockProfile ? MYDATA_PROFILE.earnedIncomePrevYear : Math.max(0, (income || 0) - fin));
  /* 공제 실효 판정은 근로·사업소득 기준 — 금융소득 분리과세는 결정세액을 만들지
   * 않아 세액공제 환급이 불가하다(총소득이 커도 금융소득뿐이면 환급 실효 없음) */
  const workIncome = earned + business;
  const noDeduct = workIncome < EFFECTIVE_DEDUCT_INCOME_MIN; // 결정세액 근사 — 공제 환급 실효 없음
  const noWorkIncome = workIncome <= 0; // 무소득자(주부·은퇴자) — ISA 1순위·연금저축 2순위 기본 전략
  /* 서민형 ISA 판정(근사) — 직전년도 총급여 5,000만 이하 근로자 또는 종합소득
   * 3,800만 이하 사업자. 무소득자(주부·은퇴자)도 소득확인증명으로 가입 대상.
   * 서민형은 비과세 한도가 200만 → 400만으로 2배 */
  const isaSeomin = earned <= 50_000_000 && business <= 38_000_000;
  const ISA_TAXFREE_LIMIT = isaSeomin ? 4_000_000 : 2_000_000;
  /* 피부양자 방어 모드 — 무소득(공제 실효 없음)인데 금융소득이 전액 산입
   * 임계(연 1,000만)에 걸리는 상황: 비공제 연금저축이 배당을 '소득'에서 빼낸다 */
  const defense = noDeduct && fin >= 10_000_000;
  /* 프리셋 문구(선호·ISA 세부전략 반영) — 순서 자체는 rooms 산출 뒤
   * scorePriority 가 요소별 점수로 동적으로 계산한다(연금저축 1순위 고정 없음). */
  const reasons = { ...PLAN_REASONS.common, ...(PLAN_REASONS[taxPref] ?? PLAN_REASONS.growth) };
  if (taxPref === "growth") {
    if (isaRollover === "isa3") {
      // 롤오버 없음 — ISA 장기 우위 논거 소멸 (점수에서도 growth 90→60 으로 약화)
      reasons.irp = "롤오버 없는 ISA는 장기 우위가 약해져, 세액공제 한도(300만)를 먼저 확보해요.";
      reasons.isa = "공제 계좌를 채운 뒤, 한 사이클(3년)의 비과세·손익통산 한도를 활용해요.";
    } else {
      // growth 의 ISA 근거는 롤오버 세부전략에 맞는 문구로 교체
      reasons.isa = ISA_REASON_GROWTH[isaRollover] ?? reasons.isa;
    }
    /* 연금 이전(isa1) 전략에서 "그럼 ISA 가 1순위 아닌가?"라는 자연스러운 의문에 답하는 근거 —
     * 직접 납입 공제(최대 16.5%)가 만기 이전 추가공제(이전액의 10%만 공제 대상, 실효 약 1.65%)
     * 보다 10배 크고, 공제 한도는 매년 소멸하므로 연 600만원만 먼저 챙기고 ISA 로 보낸다. */
    if (isaRollover === "isa1") {
      reasons.pensionSavings =
        "매년 소멸하는 세액공제 한도(연 600만)만 먼저 채워요. 직접 납입 공제(최대 16.5%)가 ISA 만기 이전 추가공제(실효 약 1.65%)보다 10배 커서, 나머지는 전부 ISA로 보내요.";
    }
  }
  /* 자금 유동성 확보 전략 — scorePriority 의 liquidity 가중(ISA +30 / 연금계좌 −30)으로
   * ISA 가 1순위로 올라오므로, 사유 문구도 유동성 관점으로 교체한다 */
  if (liquidity === "short") {
    reasons.isa =
      "55세 전에 쓸 계획이 있는 자금이라, 언제든 인출할 수 있는 ISA부터 채워요. 만기 목돈은 재가입으로 비과세를 반복해요.";
    reasons.pensionSavings = "세액공제 환급은 그대로 챙기되, 55세까지 잠기는 계좌라 ISA 다음에 채워요.";
    reasons.irp = "안전자산 30% 의무에 55세 잠김까지 겹쳐, 세액공제 한도(300만)는 마지막에 채워요.";
  }
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
    // 공제 실효가 없는 저·무소득자는 환급 추정 0 (결정세액이 없어 돌려받을 세금이 없음)
    const effRate = noDeduct ? 0 : DEDUCT_RATE;
    const estRefund = d.roomType === "deduct" ? Math.round(room * effRate) : 0;
    // 이 계좌를 한도(limit)까지 다 채웠을 때 매년 받는 총 세액공제 환급액 (여력이 아닌 총액 기준)
    const maxRefund = d.roomType === "deduct" ? Math.round(d.limit * effRate) : 0;
    // 예상 절세효과 — 연금계좌: 세액공제 환급, ISA: 비과세 한도(일반 200만·서민형 400만) 상당의 절세액
    const estSaving = d.roomType === "deduct" ? estRefund : d.id === "isa" ? Math.round(ISA_TAXFREE_LIMIT * 0.154) : 0;

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
      maxRefund,
      estSaving,
      // ISA 전용 — 서민형 여부와 적용 비과세 한도(UI 문구·절세액 표기용)
      ...(d.id === "isa" && { seomin: isaSeomin, taxFreeLimit: ISA_TAXFREE_LIMIT }),
    };
  });

  /* 가입자격 게이트 — 무소득자·미성년자 등: 자격 없는 계좌는 여력 0 처리
   * (배분·순위에서 자동 최하위) + 개설 추천 대상에서도 제외한다 */
  const elig = accountEligibility({ age, earnedIncome: earned, businessIncome: business, finIncome: fin });
  for (const r of rooms) {
    const e = elig[r.id] || { eligible: true };
    r.eligible = e.eligible;
    if (!e.eligible) {
      r.ineligibleReason = e.reason;
      r.room = 0;
      r.roomText = "가입 대상 아님";
      r.estRefund = 0;
      r.maxRefund = 0;
      r.estSaving = 0;
    }
  }

  /* 연금저축 단독 절세 모드 — ISA 가입이 불가(미성년·금소세 등)하고 연금저축만
   * 열려 있으면, 공제 실효가 없어도 연금저축 비공제 납입을 일반계좌보다 앞세운다 */
  const pensionOnly = elig.isa?.eligible === false && elig.pensionSavings?.eligible !== false;

  /* 동적 우선순위 — 선호·소득(공제 실효)·나이(잠김)·유동성·한도 소진을 점수로 합산.
   * 수동 오버라이드(priorityOverride)가 있으면 그것이 최우선. */
  const scored = scorePriority({ rooms, taxPref, isaRollover, income, workIncome, age, liquidity, defense, pensionOnly, noWorkIncome });
  const order = priorityOverride ? sanitizeOrder(priorityOverride, scored.order) : scored.order;
  const reasonFor = (id) => priorityReasonFor(id, { rooms, reasons, noTaxBenefit: scored.noTaxBenefit, defense, pensionOnly, noWorkIncome, isaSeomin });
  // 상황 기반 자동 금액 한도 — 순서와 함께 "각 계좌에 얼마까지"도 엔진이 판단
  const auto = deriveAutoLimits({ age, noTaxBenefit: scored.noTaxBenefit, liquidity, defense, pensionOnly, noWorkIncome });

  // 월 불입 배분 — 우선순위대로 남은 여력(연)까지 waterfall 로 흘려 담는다
  if (monthlyContribution > 0) {
    const annual = monthlyContribution * 12;
    const get = (id) => rooms.find((x) => x.id === id);
    let rem = annual;

    /* 계좌별 연간 하한/상한 — 자동 판단(auto)과 프로그램적 perAccount(월 원 단위)를 병합.
     * 공제 보상이 없는 상황(allowDeduct=false)이면 연금저축·IRP 는 금액 자체를 0으로 막는다 */
    const capOf = (id) => {
      const c = perAccount?.[id];
      const userMax = c?.monthlyMax != null ? Math.max(0, Math.round(c.monthlyMax * 12)) : Infinity;
      const autoMax = (id === "pensionSavings" || id === "irp") && !auto.allowDeduct ? 0 : Infinity;
      return {
        min: Math.max(0, Math.round((c?.monthlyMin || 0) * 12)),
        max: Math.min(userMax, autoMax),
      };
    };

    // 0단계: 우선납입(하한) 확보 — 순위순, 각 계좌의 여력·상한·잔여 내에서
    for (const id of order) {
      const r = get(id);
      if (!r) continue;
      const { min, max } = capOf(id);
      const put = Math.max(0, Math.min(rem, r.room, min, max));
      r.planAnnual = put;
      rem -= put;
    }

    // 1~3단계: 절세계좌 3종을 우선순위대로 잔여 여력까지 (상한 초과분은 다음 순위로 흘림)
    for (const id of order) {
      const r = get(id);
      if (!r) continue;
      const { max } = capOf(id);
      const already = r.planAnnual || 0;
      const put = Math.max(0, Math.min(rem, r.room - already, max - already));
      r.planAnnual = already + put;
      r.planReason = reasonFor(id);
      // ISA 롤오버 전망 — 연금저축 이전 전략(isa1)일 때만 첨부 (이전 추가공제가 전제)
      if (id === "isa" && r.planAnnual > 0 && isaRollover === "isa1") {
        r.rollover = projectIsaRollover({ isaAnnual: r.planAnnual, deductRate: DEDUCT_RATE, cagr: PLAN_CAGR });
      }
      rem -= put;
    }

    // 4단계: 연금저축 비공제 추가납입 — 연금계좌 합산 납입한도(1,800만) 잔여분에
    // 상황 기반 허용 비율(auto.extraFactor: 55세까지 남은 기간·유동성 반영)을 곱해 담는다
    const ps = get("pensionSavings");
    const irp = get("irp");
    const depositUsed = pensionContributed + (ps?.planAnnual || 0) + (irp?.planAnnual || 0);
    const extraRoom = Math.max(0, PENSION_DEPOSIT_LIMIT - depositUsed);
    const extraAllowed = Math.round(extraRoom * auto.extraFactor);
    const extra = Math.max(0, Math.min(rem, extraAllowed));
    if (ps && extra > 0) {
      ps.planExtraAnnual = extra;
      ps.planExtraReason = auto.defense
        ? "세액공제 없이도 과세이연·건보료 산정 제외 효과는 동일해요. 배당을 '소득'에서 빼내 피부양자 자격을 지키는 비공제 납입이에요."
        : auto.pensionOnly
          ? "ISA·IRP는 가입 요건이 안 되어 연금저축이 유일한 절세 계좌예요. 세액공제는 없지만 과세이연과 55세 이후 저율 연금소득세 이점이 있는 비공제 납입이에요."
          : auto.noWorkIncome
            ? "근로소득이 없어 세액공제는 없지만, ISA 한도를 채운 뒤의 2순위 절세처예요. 과세이연과 55세 이후 저율 연금소득세 이점이 있는 비공제 납입이에요."
            : auto.extraFactor < 1
              ? `${reasons.pensionExtra} 55세까지 잠기는 기간을 고려해 잔여 한도의 일부만 담아요.`
              : reasons.pensionExtra;
    }
    rem -= extra;

    // 5단계: 일반 — 남는 전액
    const gen = get("general");
    if (gen) {
      gen.planAnnual = rem;
      gen.planReason = reasons.general;
    }

    // 월·비중 확정 — 연금저축은 공제분 + 비공제 추가납입 합산
    for (const r of rooms) {
      const total = (r.planAnnual || 0) + (r.planExtraAnnual || 0);
      r.planTotalAnnual = total;
      r.planMonthly = total / 12;
      r.planShare = total / annual;
      if (!r.planReason) r.planReason = reasons[r.id];
    }
  }

  // 우선순위 근거 — 금액(monthlyContribution) 유무와 무관하게 항상 부여
  // (③ 분석 화면이 금액 없이 순서·이유만 보여줄 때 사용. 동적 상황이 프리셋 문구보다 우선)
  for (const r of rooms) r.priorityReason = reasonFor(r.id);

  const totalRefund = rooms.reduce((s, r) => s + (r.estRefund || 0), 0);
  // 개설 추천 대상 — 연동됐으나 미보유(held===false)인 절세계좌 (일반계좌·가입자격 없는 계좌 제외)
  const openable = rooms.filter((r) => r.held === false && r.recommend && r.eligible !== false).map((r) => r.name);

  return {
    rooms,
    totalRefund,
    openable,
    mydata,
    monthlyContribution,
    taxPref,
    isaRollover,
    strategyCode: encodeStrategy({ taxPref, isaRollover, liquidity }),
    priority: order,
    priorityScores: scored.scores, // 요소별 합산 점수 — 순위 산출 근거(디버그·설명용)
    autoLimits: auto, // 상황 기반 자동 금액 판단(allowDeduct·extraFactor·defense) — 설명 UI 용
    eligibility: elig, // 계좌별 가입자격 판정 결과 — 안내 UI 용
  };
}

export default buildAccountRooms;
