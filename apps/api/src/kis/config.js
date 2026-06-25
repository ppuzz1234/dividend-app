/* ------------------------------------------------------------------ *
 *  한국투자증권(KIS) Open API 설정
 *  · 기본 환경은 모의투자(mock). 실전은 KIS_ENV=real
 *  · APP KEY/SECRET 미설정 시 hasKeys=false → 시세는 stub(가상)로 응답
 * ------------------------------------------------------------------ */
const ENV = process.env.KIS_ENV === "real" ? "real" : "mock";

const DOMAINS = {
  real: { rest: "https://openapi.koreainvestment.com:9443", ws: "ws://ops.koreainvestment.com:21000" },
  mock: { rest: "https://openapivts.koreainvestment.com:29443", ws: "ws://ops.koreainvestment.com:31000" },
};

export const KIS = {
  env: ENV,
  base: DOMAINS[ENV],
  appKey: process.env.KIS_APP_KEY || "",
  appSecret: process.env.KIS_APP_SECRET || "",
  get hasKeys() {
    return Boolean(this.appKey && this.appSecret);
  },
};

/* tr_id (모의/실전 공통 — 시세성 조회는 동일) */
export const TR = {
  domesticPrice: "FHKST01010100", // 국내주식 현재가
  overseasPrice: "HHDFS00000300", // 해외주식 현재가
};
