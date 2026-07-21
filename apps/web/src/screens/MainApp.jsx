import { useState } from "react";
import { Newspaper, LineChart, Wallet, CheckCircle2, RotateCcw } from "lucide-react";
import { findProduct } from "@devidend/core";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./MainApp.module.css";

const ACCOUNT_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const ORDER = ["isa", "pensionSavings", "irp", "general"];
const TABS = [
  { id: "news", label: "뉴스", Icon: Newspaper },
  { id: "analysis", label: "분석", Icon: LineChart },
  { id: "assets", label: "자산", Icon: Wallet },
];

/* 투자 시작 이후의 메인 앱 — 뉴스 · 분석 · 자산 3탭.
 * 최종 진행 직후 '자산' 탭으로 진입해 내 투자 현황을 본다.
 * 뉴스·분석 콘텐츠는 추후 정의(현재 placeholder). */
export function MainApp({ alloc = {}, defaultTab = "assets", onRestart }) {
  const [tab, setTab] = useState(defaultTab);

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        {tab === "assets" && <Assets alloc={alloc} onRestart={onRestart} />}
        {tab === "news" && <Placeholder Icon={Newspaper} title="뉴스" desc="보유 종목·시장 뉴스를 여기서 모아 보여드릴 예정이에요." />}
        {tab === "analysis" && <Placeholder Icon={LineChart} title="분석" desc="내 포트폴리오의 수익·배당·세금 분석을 여기서 제공할 예정이에요." />}
      </div>

      <nav className={styles.tabBar} role="tablist" aria-label="메인 탭">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={cx(styles.tab, tab === id && styles.tabOn)}
            onClick={() => setTab(id)}
          >
            <Icon size={22} strokeWidth={2.2} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

/* 자산 탭 — 방금 시작한 배분·투자 현황(계좌별 상품·월 매수금) */
function Assets({ alloc, onRestart }) {
  const accounts = ORDER
    .map((id) => ({
      id,
      name: ACCOUNT_LABELS[id],
      items: Object.entries(alloc[id] || {})
        .filter(([, amt]) => amt > 0)
        .map(([code, amt]) => ({ code, name: findProduct(code)?.name || code, amt })),
    }))
    .filter((a) => a.items.length > 0)
    .map((a) => ({ ...a, subtotal: a.items.reduce((s, i) => s + i.amt, 0) }));
  const grandTotal = accounts.reduce((s, a) => s + a.subtotal, 0);

  return (
    <div className={styles.assets}>
      <div className={styles.started}>
        <CheckCircle2 size={18} strokeWidth={2.4} />
        배분 · 투자가 시작됐어요
      </div>

      <div className={styles.totalCard}>
        <span className={styles.totalCap}>매달 자동 매수</span>
        <strong className={styles.totalVal}>{fmtKRW(grandTotal)}</strong>
      </div>

      <div className={styles.secTitle}>내 투자 현황</div>
      {accounts.length === 0 ? (
        <p className={styles.empty}>아직 담긴 상품이 없어요.</p>
      ) : (
        <div className={styles.list}>
          {accounts.map((a) => (
            <div key={a.id} className={styles.acct}>
              <div className={styles.acctHead}>
                <span className={styles.acctName}>{a.name}계좌</span>
                <span className={styles.acctSum}>월 {fmtKRW(a.subtotal)}</span>
              </div>
              {a.items.map((it) => (
                <div key={it.code} className={styles.item}>
                  <span className={styles.itemName}>{it.name}</span>
                  <span className={styles.itemAmt}>월 {fmtKRW(it.amt)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {onRestart && (
        <button type="button" className={styles.restart} onClick={onRestart}>
          <RotateCcw size={14} strokeWidth={2.4} />
          처음부터 다시 설계하기
        </button>
      )}
    </div>
  );
}

/* 뉴스·분석 탭 — 추후 콘텐츠 정의 예정 */
function Placeholder({ Icon, title, desc }) {
  return (
    <div className={styles.placeholder}>
      <div className={styles.phIcon}>
        <Icon size={30} strokeWidth={1.8} />
      </div>
      <div className={styles.phTitle}>{title}</div>
      <p className={styles.phDesc}>{desc}</p>
      <span className={styles.phSoon}>준비 중</span>
    </div>
  );
}
