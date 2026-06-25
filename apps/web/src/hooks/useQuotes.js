import { useEffect, useRef, useState } from "react";
import { fetchQuote, quoteRef } from "../lib/quotes.js";

/* ------------------------------------------------------------------ *
 *  종목 목록의 현재가를 주기적으로(기본 5초) 폴링.
 *  · 반환: { [stock.id]: quote }
 *  · 백엔드 미기동/실패 시 해당 종목은 비어 있고 화면은 graceful 폴백
 * ------------------------------------------------------------------ */
export function useQuotes(stocks, intervalMs = 5000) {
  const [quotes, setQuotes] = useState({});
  const ref = useRef(stocks);
  useEffect(() => {
    ref.current = stocks;
  }, [stocks]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const results = await Promise.allSettled(
        ref.current.map(async (s) => [s.id, await fetchQuote(quoteRef(s))])
      );
      if (!alive) return;
      const next = {};
      for (const r of results) if (r.status === "fulfilled") next[r.value[0]] = r.value[1];
      if (Object.keys(next).length) setQuotes((q) => ({ ...q, ...next }));
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);

  return quotes;
}
