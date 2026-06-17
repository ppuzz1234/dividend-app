import { ArrowRight, Check, Search, Sparkles, Globe, Building2 } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { STOCKS } from "../data/stocks.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Picker.module.css";

export function Picker({
  path,
  pmode,
  setPmode,
  region,
  setRegion,
  divType,
  setDivType,
  query,
  setQuery,
  selected,
  toggle,
  onNext,
}) {
  let list;
  if (path === "manual") {
    list = STOCKS.filter((s) => (s.name + s.ticker + s.sector).toLowerCase().includes(query.toLowerCase()));
  } else if (pmode === "top3") {
    list = STOCKS.filter((s) => s.elite);
  } else {
    list = STOCKS.filter((s) => s.region === region && s.type === divType);
  }

  return (
    <Pad
      footer={
        <Button onClick={onNext} disabled={selected.length === 0 && path === "manual"} icon={ArrowRight}>
          {selected.length ? `${selected.length}개 담고 다음` : "추천 그대로 담고 다음"}
        </Button>
      }
    >
      <Heading
        sub={
          path === "manual"
            ? "종목명·티커로 검색해 담아보세요."
            : "마음에 드는 종목을 탭해서 담아요. 안 고르면 추천 종목으로 진행돼요."
        }
      >
        {path === "manual" ? "종목 검색" : "추천 종목"}
      </Heading>

      {path === "manual" && (
        <div className={styles.searchWrap}>
          <Search size={18} color={C.faint} className={styles.searchIcon} />
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="예: 삼성전자, SCHD, 리츠"
          />
        </div>
      )}

      {path === "platform" && (
        <>
          <Segmented
            value={pmode}
            onChange={setPmode}
            opts={[
              { v: "top3", l: "우량 TOP3" },
              { v: "dividend", l: "배당주 선정" },
            ]}
          />
          {pmode === "dividend" && (
            <div className={styles.filterRow}>
              <Segmented
                small
                value={region}
                onChange={setRegion}
                opts={[
                  { v: "KR", l: "국내" },
                  { v: "US", l: "미국" },
                ]}
              />
              <Segmented
                small
                value={divType}
                onChange={setDivType}
                opts={[
                  { v: "high", l: "고배당주" },
                  { v: "growth", l: "배당성장주" },
                ]}
              />
            </div>
          )}
          {pmode === "top3" && (
            <p className={styles.hint}>
              <Sparkles size={14} /> 안정성·배당 매력을 종합한 우량 3종목이에요.
            </p>
          )}
        </>
      )}

      <div className={styles.list}>
        {list.length === 0 && <Empty />}
        {list.map((s) => (
          <StockRow key={s.id} s={s} on={selected.includes(s.id)} onClick={() => toggle(s.id)} />
        ))}
      </div>
    </Pad>
  );
}

function StockRow({ s, on, onClick }) {
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
      <span className={styles.yieldWrap}>
        <span className={styles.yield}>{(s.yield * 100).toFixed(1)}%</span>
        <span className={styles.yieldLbl}>배당수익률</span>
      </span>
      <span className={cx(styles.check, on && styles.checkOn)}>
        {on && <Check size={14} color={C.onJade} strokeWidth={3} />}
      </span>
    </button>
  );
}

function Empty() {
  return (
    <div className={styles.empty}>
      <Search size={30} className={styles.emptyIcon} />
      <div className={styles.emptyText}>검색 결과가 없어요. 다른 종목명을 입력해보세요.</div>
    </div>
  );
}
