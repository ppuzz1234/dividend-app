import { useState, useRef, useEffect } from "react";
import { ArrowRight, Check, Search, Globe, Building2, Sparkles } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { STOCKS, CATEGORIES } from "../data/stocks.js";
import { useQuotes } from "../hooks/useQuotes.js";
import { fmtPrice } from "../lib/quotes.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Picker.module.css";

const REGIONS = [
  { v: "ALL", l: "전체" },
  { v: "KR", l: "국내" },
  { v: "US", l: "미국" },
];

const MODES = [
  { v: "top3", l: "우량 TOP3" },
  { v: "all", l: "유형별 전체" },
];

export function Picker({ chosenCats, region, setRegion, query, setQuery, selected, toggle, onNext }) {
  const [mode, setMode] = useState("all"); // top3(우량 추천) | all(유형 필터)
  // 추천 유형으로 초기화하되, 사용자가 다른 유형도 켜고 끌 수 있음
  const [activeCats, setActiveCats] = useState(chosenCats?.length ? chosenCats : CATEGORIES.map((c) => c.id));
  const toggleCat = (id) =>
    setActiveCats((cs) => (cs.includes(id) ? cs.filter((x) => x !== id) : [...cs, id]));

  const q = query.trim().toLowerCase();
  const list =
    mode === "top3"
      ? STOCKS.filter((s) => s.elite)
      : STOCKS.filter(
          (s) =>
            activeCats.includes(s.category) &&
            (region === "ALL" || s.region === region) &&
            (q ? (s.name + s.ticker + s.sector).toLowerCase().includes(q) : true)
        );

  const quotes = useQuotes(STOCKS, 3000); // 전 종목 현재가 폴링 (3초)

  return (
    <Pad
      footer={
        <Button onClick={onNext} icon={ArrowRight}>
          {selected.length ? `${selected.length}개 담고 다음` : "추천 그대로 담고 다음"}
        </Button>
      }
    >
      <Heading sub="우량 추천을 그대로 담거나, 유형별로 직접 골라 담아요. 안 고르면 추천 종목으로 진행돼요.">
        종목 선택
      </Heading>

      <Segmented value={mode} onChange={setMode} opts={MODES} />

      {mode === "top3" ? (
        <p className={styles.hint}>
          <Sparkles size={14} /> 안정성·배당 매력을 종합한 우량 종목이에요.
        </p>
      ) : (
        <>
          <div className={styles.searchWrap}>
            <Search size={18} color={C.faint} className={styles.searchIcon} />
            <input
              className={styles.search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 삼성전자, SCHD, 리츠"
            />
          </div>
          <div className={styles.cats}>
            {CATEGORIES.map((c) => {
              const on = activeCats.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleCat(c.id)} className={cx(styles.cat, on && styles.catOn)}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className={styles.filterRow}>
            <Segmented small value={region} onChange={setRegion} opts={REGIONS} />
          </div>
        </>
      )}

      <div className={styles.list}>
        {list.length === 0 && <Empty />}
        {list.map((s) => (
          <StockRow key={s.id} s={s} q={quotes[s.id]} on={selected.includes(s.id)} onClick={() => toggle(s.id)} />
        ))}
      </div>
    </Pad>
  );
}

function StockRow({ s, q, on, onClick }) {
  const us = s.region === "US";
  return (
    <button onClick={onClick} className={cx(styles.row, on && styles.rowOn)}>
      <span className={cx(styles.logo, us && styles.logoUs)}>
        {us ? <Globe size={20} /> : <Building2 size={20} />}
      </span>
      <span className={styles.info}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{s.name}</span>
          {s.elite && <Tag tone="gold">우량</Tag>}
        </span>
        <span className={styles.sub}>
          {s.ticker} · {s.sector}
        </span>
      </span>
      <span className={styles.metrics}>
        <span className={styles.divYield}>배당 {(s.yield * 100).toFixed(1)}%</span>
        <LivePrice q={q} />
      </span>
      <span className={cx(styles.check, on && styles.checkOn)}>
        {on && <Check size={14} color={C.onJade} strokeWidth={3} />}
      </span>
    </button>
  );
}

/* 현재가(부) — 폴링으로 값이 바뀔 때 직전 틱 대비 방향(상승=빨강/하락=파랑)으로 깜빡임 */
function LivePrice({ q }) {
  const prev = useRef(null);
  const [flash, setFlash] = useState(null);
  const price = q?.price;

  useEffect(() => {
    if (price == null) return;
    const p = prev.current;
    if (p != null && price !== p) {
      setFlash(price > p ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 550);
      prev.current = price;
      return () => clearTimeout(t);
    }
    prev.current = price;
  }, [price]);

  if (q == null) return <span className={styles.priceLine}><span className={styles.priceMuted}>시세 대기</span></span>;

  const down = q.changePct < 0;
  return (
    <span className={styles.priceLine}>
      <span className={cx(styles.price, flash === "up" && styles.flashUp, flash === "down" && styles.flashDown)}>
        {fmtPrice(q)}
      </span>
      <span className={cx(styles.chg, down ? styles.down : styles.up)}>
        {down ? "▼" : "▲"} {Math.abs(q.changePct).toFixed(2)}%
      </span>
    </span>
  );
}

function Empty() {
  return (
    <div className={styles.empty}>
      <Search size={30} className={styles.emptyIcon} />
      <div className={styles.emptyText}>해당 유형·지역에 종목이 없어요. 유형을 더 켜보세요.</div>
    </div>
  );
}
