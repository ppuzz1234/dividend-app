/* 숫자 포맷 유틸 (원화) */
export const fmtKRW = (v) => {
  v = Math.round(v);
  if (v >= 1e8) {
    const eok = Math.floor(v / 1e8);
    const man = Math.round((v % 1e8) / 1e4);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
};

export const fmtShort = (v) => {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return `${v}`;
};

export const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
