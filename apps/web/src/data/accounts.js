/* 계좌 유형 — 배당세율이 다름 (icon은 화면 컴포넌트에서 id로 매핑) */
export const ACCOUNTS = [
  { id: "general", name: "일반 위탁계좌", desc: "배당소득세 15.4%", tax: 0.154 },
  { id: "isa", name: "ISA 계좌", desc: "비과세 후 9.9% 분리과세", tax: 0.099 },
  { id: "pension", name: "연금저축 · IRP", desc: "과세이연 (적립기간 비과세)", tax: 0 },
];
