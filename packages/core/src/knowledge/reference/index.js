/* ------------------------------------------------------------------ *
 *  세제·계좌 레퍼런스 데이터 모음
 *  엔진 고도화를 위해 출처별 원천 자료를 순차 수집하는 곳.
 *  여기 값은 검토 후 선별적으로 data/accounts.js 등 엔진 입력으로 승격한다.
 *
 *  수집 현황
 *  ─ irp-samsung.js               : IRP 계좌 세제 규칙 (삼성증권, 2026)
 *  ─ retirement-whitepaper-2025.js : 퇴직연금 시장 통계·수익률 (고용노동부·금감원, 2025)
 *  ─ pension-letter-89.js          : 2026 세제개편 (인모스트 연금레터 89호)
 *  ─ kyobo-db-dc.js                : 퇴직연금 DB↔DC 전환 가이드 (교보생명)
 *  ─ isa-productive-2026.js        : 2026 생산적 금융 ISA 신설 (청년형·국민성장형)
 *  ─ pension-vs-general-2026.js    : 은퇴기 배당 계좌별 세금·건보료 비교 근거
 *  ─ (추가 예정)
 * ------------------------------------------------------------------ */
export { IRP_SAMSUNG } from "./irp-samsung.js";
export { RETIREMENT_WHITEPAPER_2025 } from "./retirement-whitepaper-2025.js";
export { PENSION_LETTER_89 } from "./pension-letter-89.js";
export { KYOBO_DB_DC } from "./kyobo-db-dc.js";
export { ISA_PRODUCTIVE_2026 } from "./isa-productive-2026.js";
export { PENSION_VS_GENERAL_2026 } from "./pension-vs-general-2026.js";

export const REFERENCES = {
  "irp-samsung": () => import("./irp-samsung.js"),
  "retirement-whitepaper-2025": () => import("./retirement-whitepaper-2025.js"),
  "pension-letter-89": () => import("./pension-letter-89.js"),
  "kyobo-db-dc": () => import("./kyobo-db-dc.js"),
  "isa-productive-2026": () => import("./isa-productive-2026.js"),
  "pension-vs-general-2026": () => import("./pension-vs-general-2026.js"),
};
