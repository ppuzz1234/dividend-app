/* ------------------------------------------------------------------ *
 *  금융사 로고 레지스트리 — 기관명(별칭 포함) → public/institutions/*.png
 *  ──────────────────────────────────────────────────────────────
 *  마이데이터·mock 데이터의 institution 문자열은 "한화투자증권",
 *  "한화투자증권㈜" 처럼 표기가 제각각이므로, 파일명으로 직접 매칭하지
 *  않고 이 레지스트리의 별칭(alias) 배열을 거쳐 로고 파일을 찾는다.
 *  · 키 = 파일명 스템({brand}-{bank|card|sec})
 *  · 미등록/미매칭 기관은 logoFor()가 null 반환 → 호출부에서 폴백 아이콘
 * ------------------------------------------------------------------ */

export const INSTITUTION_LOGOS = {
  /* ── 은행 ─────────────────────────────────────────── */
  "kb-bank": { name: "KB국민은행", aliases: ["국민은행", "KB은행", "KB Kookmin Bank"] },
  "hana-bank": { name: "하나은행", aliases: ["KEB하나은행", "하나銀"] },
  "woori-bank": { name: "우리은행", aliases: ["Woori Bank"] },
  "nh-bank": { name: "NH농협은행", aliases: ["농협은행", "농협", "NH농협"] },
  "ibk-bank": { name: "IBK기업은행", aliases: ["기업은행", "중소기업은행"] },
  "sc-bank": { name: "SC제일은행", aliases: ["제일은행", "스탠다드차타드", "Standard Chartered"] },
  "citi-bank": { name: "한국씨티은행", aliases: ["씨티은행", "씨티", "Citibank"] },
  "kakao-bank": { name: "카카오뱅크", aliases: ["카카오은행", "KakaoBank"] },
  "suhyup-bank": { name: "Sh수협은행", aliases: ["수협은행", "수협"] },
  "jb-bank": { name: "전북은행", aliases: ["JB전북은행", "JB금융"] },
  "kfcc-bank": { name: "새마을금고", aliases: ["MG새마을금고", "새마을금고중앙회"] },
  "nfcf-bank": { name: "산림조합", aliases: ["산림조합중앙회"] },
  "daol-bank": { name: "다올저축은행", aliases: [] },
  "hsbc-bank": { name: "HSBC은행", aliases: ["HSBC", "홍콩상하이은행"] },
  "deutsche-bank": { name: "도이치은행", aliases: ["도이치뱅크", "Deutsche Bank"] },
  "bnp-bank": { name: "BNP파리바", aliases: ["BNP파리바은행", "BNP Paribas"] },
  "jp-morgan-bank": { name: "JP모건", aliases: ["제이피모간체이스은행", "JPMorgan", "JP Morgan"] },
  "fsb-bank": { name: "저축은행중앙회", aliases: ["저축은행", "SB저축은행", "상호저축은행"] },
  /* ── 카드 ─────────────────────────────────────────── */
  "samsung-card": { name: "삼성카드", aliases: ["Samsung Card"] },
  "hyundai-card": { name: "현대카드", aliases: ["Hyundai Card"] },
  "lotte-card": { name: "롯데카드", aliases: ["Lotte Card"] },
  "bc-card": { name: "BC카드", aliases: ["비씨카드", "BC Card"] },
  "visa-card": { name: "비자", aliases: ["비자카드", "VISA"] },
  "master-card": { name: "마스터카드", aliases: ["마스터", "Mastercard"] },
  "amex-card": { name: "아메리칸엑스프레스", aliases: ["아멕스", "AMEX", "American Express"] },
  "jcb-card": { name: "JCB", aliases: ["JCB카드"] },
  "unionpay-card": { name: "유니온페이", aliases: ["은련", "UnionPay"] },
  "diners-card": { name: "다이너스클럽", aliases: ["다이너스", "Diners Club"] },
  "discover-card": { name: "디스커버", aliases: ["Discover"] },
  "payco-card": { name: "페이코", aliases: ["PAYCO"] },
  /* ── 증권 ─────────────────────────────────────────── */
  "hanwha-sec": { name: "한화투자증권", aliases: ["한화증권", "한화투자"] },
  "miraeasset-sec": { name: "미래에셋증권", aliases: ["미래에셋", "미래에셋대우"] },
  "samsung-sec": { name: "삼성증권", aliases: ["Samsung Securities"] },
  "kiwoom-sec": { name: "키움증권", aliases: ["키움", "Kiwoom"] },
  "korea-sec": { name: "한국투자증권", aliases: ["한투", "한국투자", "한국금융지주"] },
  "nh-sec": { name: "NH투자증권", aliases: ["NH증권", "NH투자"] },
  "meritz-sec": { name: "메리츠증권", aliases: ["메리츠종금증권"] },
  "hana-sec": { name: "하나증권", aliases: ["하나금융투자"] },
  "sk-sec": { name: "SK증권", aliases: [] },
  "kyobo-sec": { name: "교보증권", aliases: [] },
  "sinyoung-sec": { name: "신영증권", aliases: [] },
  "eujin-sec": { name: "유진투자증권", aliases: ["유진증권", "유진투자"] },
  "yuanta-sec": { name: "유안타증권", aliases: ["유안타", "동양증권"] },
  "daol-sec": { name: "다올투자증권", aliases: ["다올증권", "다올투자"] },
  "cape-sec": { name: "케이프투자증권", aliases: ["케이프증권"] },
  "bukuk-sec": { name: "부국증권", aliases: [] },
  "db-sec": { name: "DB금융투자", aliases: ["DB증권", "동부증권"] },
  "ds-sec": { name: "DS투자증권", aliases: ["DS증권"] },
  "ebest-sec": { name: "LS증권", aliases: ["이베스트투자증권", "이베스트증권"] },
  "im-sec": { name: "iM증권", aliases: ["하이투자증권"] },
  "woori-sec": { name: "우리투자증권", aliases: ["우리종합금융", "우리금융증권"] },
};

/* 표기 정규화 — ㈜/(주)/주식회사, 공백, "은행/증권/카드" 유무 차이를 흡수 */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/\s+/g, "");

/* 별칭 → 키 역인덱스 (모듈 로드 시 1회 구축) */
const INDEX = new Map();
for (const [key, def] of Object.entries(INSTITUTION_LOGOS)) {
  for (const label of [key, def.name, ...def.aliases]) {
    INDEX.set(norm(label), key);
  }
}

/**
 * 기관명(임의 표기) → 로고 이미지 경로
 * @param {string} institution  예: "한화투자증권", "한화투자증권㈜", "hanwha-sec"
 * @returns {string|null}  예: "/institutions/hanwha-sec.png" — 미매칭이면 null
 */
export function logoFor(institution) {
  const key = INDEX.get(norm(institution));
  return key ? `/institutions/${key}.png` : null;
}
