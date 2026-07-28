import { useMemo, useRef, useState } from "react";
import {
  Newspaper,
  Rss,
  Wallet,
  RotateCcw,
  Landmark,
  PiggyBank,
  Briefcase,
  BarChart3,
  Coins,
  ReceiptText,
  CalendarClock,
  LayoutGrid,
  NotebookPen,
  LogOut,
} from "lucide-react";
import { findProduct } from "@devidend/core";
import { EtfBrandTile } from "../components/ui/EtfBrandTile.jsx";
import { PrepModal } from "../components/ui/PrepModal.jsx";
import { CoachTour } from "../components/ui/CoachTour.jsx";
import { DividendSwitch } from "./DividendSwitch.jsx";
import { NewsFeed } from "./NewsFeed.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./MainApp.module.css";

/* 첫 진입 코치마크 — 브라우저당 1회. ?coach=1 이면 강제 노출(리뷰용). */
const COACH_KEY = "pc_home_coach_v1";
function shouldShowCoach() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("coach") === "1") return true;
    return !localStorage.getItem(COACH_KEY);
  } catch {
    return true;
  }
}

const ACCOUNT_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };
const ORDER = ["isa", "pensionSavings", "irp", "general"];
const TABS = [
  { id: "news", label: "뉴스", Icon: Newspaper },
  { id: "feed", label: "피드", Icon: Rss },
  { id: "assets", label: "자산", Icon: Wallet },
];
const CYCLES = {
  daily: { label: "매일", perYear: 365 },
  weekly: { label: "매주", perYear: 52 },
  monthly: { label: "매월", perYear: 12 },
};

/* 홈 상단 퀵메뉴 — 데모용 진입점 그리드 (색은 항목 구분용 뮤트 틴트) */
const QUICK_MENU = [
  { label: "ISA", Icon: Landmark, color: "#5b8def" },
  { label: "연금", Icon: PiggyBank, color: "#e8672b" },
  { label: "IRP", Icon: Briefcase, color: "#12a594" },
  { label: "ETF", Icon: BarChart3, color: "#f2c21d" },
  { label: "받은배당", Icon: Coins, color: "#c25b6e" },
  { label: "주문내역", Icon: ReceiptText, color: "#7d8a96" },
  { label: "배당달력", Icon: CalendarClock, color: "#2f9e44" },
  { label: "전체메뉴", Icon: LayoutGrid, color: "#aab4ad" },
];

/* 투자 시작 이후의 메인 앱 — 뉴스 · 피드 · 자산 3탭.
 * 최종 진행 직후 '자산' 탭(홈)으로 진입해 내 투자 현황을 본다. */
export function MainApp({ alloc = {}, cycle = "weekly", assets = 0, defaultTab = "assets", onRestart, onLogout }) {
  const [tab, setTab] = useState(defaultTab);
  const [tour, setTour] = useState(shouldShowCoach);
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === tab)); // 하이라이트 알약 위치

  // 코치마크 하이라이트 대상 (보유 ETF 현황 / 퀵메뉴 / 하단 탭)
  const holdRef = useRef(null);
  const quickRef = useRef(null);
  const tabRef = useRef(null);

  const endTour = () => {
    setTour(false);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* localStorage 불가 환경 — 다음 진입에도 노출 */
    }
  };

  const steps = useMemo(
    () => [
      { ref: holdRef, text: "이제 이곳에서 나의 장기 투자 상품을 확인할 수 있어요." },
      { ref: quickRef, text: "상품 카테고리별 상세 내용을 확인해요." },
      { ref: tabRef, text: "절세, 투자 등 다양한 정보를 제공해요.", scroll: false },
    ],
    []
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        {tab === "assets" && (
          <Home
            alloc={alloc}
            cycle={cycle}
            assets={assets}
            onRestart={onRestart}
            onLogout={onLogout}
            holdRef={holdRef}
            quickRef={quickRef}
          />
        )}
        {tab === "news" && <NewsFeed />}
        {tab === "feed" && <Placeholder Icon={Rss} title="피드" desc="내 투자와 관심 종목 소식을 모아 보는 피드를 준비하고 있어요." />}
      </div>

      <nav ref={tabRef} className={styles.tabBar} role="tablist" aria-label="메인 탭">
        <div className={styles.tabRow}>
          {/* 선택 탭을 따라 미끄러지는 하이라이트 알약 (토스·카카오페이 스타일) */}
          <span
            className={styles.tabInd}
            style={{ width: `${100 / TABS.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
            aria-hidden="true"
          />
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={cx(styles.tab, tab === id && styles.tabOn)}
              onClick={() => setTab(id)}
            >
              <Icon size={23} strokeWidth={2.2} className={styles.tabIcon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 최초 진입 스포트라이트 안내 — 자산 탭에서만(대상 요소 존재) */}
      {tour && tab === "assets" && <CoachTour steps={steps} onClose={endTour} />}
    </div>
  );
}

/* 다음 자동 매수일 — 매일: 내일 / 매주: 다음 월요일 / 매월: 다음달 1일 */
function nextBuyDate(cycle) {
  const d = new Date();
  if (cycle === "daily") d.setDate(d.getDate() + 1);
  else if (cycle === "weekly") d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  else {
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
  }
  return d;
}
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* 자산 탭(홈) — 퀵메뉴 그리드 + 중앙 보유 ETF 현황 + 다음 자동 매수 */
function Home({ alloc, cycle, assets, onRestart, onLogout, holdRef, quickRef }) {
  const [divOpen, setDivOpen] = useState(false); // 배당 전환 화면
  const [prep, setPrep] = useState(false); // 미구현 메뉴 → 준비 중 모달
  // 보유 ETF — 계좌별 배분을 상품 행으로 평탄화 (계좌 라벨 포함)
  const holdings = ORDER.flatMap((id) =>
    Object.entries(alloc[id] || {})
      .filter(([, amt]) => amt > 0)
      .map(([code, amt]) => ({
        key: `${id}-${code}`,
        acct: ACCOUNT_LABELS[id],
        name: findProduct(code)?.name || code,
        amt,
      }))
  );
  const grandTotal = holdings.reduce((s, h) => s + h.amt, 0);
  const acctCount = new Set(holdings.map((h) => h.acct)).size;

  const c = CYCLES[cycle] || CYCLES.weekly;
  const perBuy = Math.round(((grandTotal * 12) / c.perYear) / 1000) * 1000;
  const next = nextBuyDate(cycle);
  const nextLabel = `${next.getMonth() + 1}월 ${next.getDate()}일 (${WEEKDAYS[next.getDay()]})`;

  return (
    <div className={styles.home}>
      {/* 퀵메뉴 그리드 */}
      <div ref={quickRef} className={styles.quickCard}>
        {QUICK_MENU.map(({ label, Icon, color }) => (
          <button
            key={label}
            type="button"
            className={styles.quickItem}
            onClick={() => (label === "배당달력" ? setDivOpen(true) : setPrep(true))}
          >
            <span className={styles.quickIcon} style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
              <Icon size={21} strokeWidth={2} />
            </span>
            <span className={styles.quickLabel}>{label}</span>
          </button>
        ))}
      </div>

      {/* 중앙: 보유 ETF 현황 */}
      <section ref={holdRef} className={styles.holdCard} aria-label="보유 ETF 현황">
        <div className={styles.holdHead}>
          <h2 className={styles.holdTitle}>보유 ETF 현황</h2>
          <span className={styles.cyclePill}>{c.label} 자동 매수</span>
        </div>

        <div className={styles.holdTotal}>
          {/* 261만원은 '월 투자 총액'(합계) — 상단 배지·하단 문구의 매수 주기({c.label})와 별개.
           * 이전엔 '매달 자동 매수'로 하드코딩돼 배지의 주기와 모순돼 보였다. */}
          <span className={styles.holdCap}>월 투자 총액</span>
          <strong className={styles.holdVal}>{fmtKRW(grandTotal)}</strong>
          <span className={styles.holdSub}>
            {c.label} {fmtKRW(perBuy)}씩 자동 매수 · 총 평가금액은 첫 매수 후 표시돼요.
          </span>
        </div>

        {holdings.length === 0 ? (
          <p className={styles.empty}>아직 담긴 상품이 없어요.</p>
        ) : (
          <div className={styles.holdList}>
            {holdings.map((h) => (
              <div key={h.key} className={styles.holdRow}>
                <EtfBrandTile name={h.name} size={36} />
                <span className={styles.holdInfo}>
                  <b className={styles.holdName}>{h.name}</b>
                  <span className={styles.holdAcct}>{h.acct}계좌</span>
                </span>
                <span className={styles.holdAmt}>월 {fmtKRW(h.amt)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.holdActions}>
          <button type="button" className={styles.holdAction} onClick={() => setPrep(true)}>
            <ReceiptText size={15} strokeWidth={2.2} /> 주문내역
          </button>
          <button type="button" className={styles.holdAction} onClick={() => setPrep(true)}>
            <NotebookPen size={15} strokeWidth={2.2} /> 매매일지
          </button>
          <button type="button" className={styles.holdAction} onClick={() => setPrep(true)}>
            <Coins size={15} strokeWidth={2.2} /> 받은배당
          </button>
          {onRestart && (
            <button type="button" className={styles.holdAction} onClick={onRestart}>
              <RotateCcw size={15} strokeWidth={2.2} /> 다시 설계
            </button>
          )}
        </div>
      </section>

      {/* 다음 자동 매수 */}
      {grandTotal > 0 && (
        <section className={styles.nextCard} aria-label="다음 자동 매수">
          <span className={styles.nextIcon}>
            <CalendarClock size={19} strokeWidth={2.2} />
          </span>
          <span className={styles.nextInfo}>
            <b className={styles.nextDate}>{nextLabel} 자동 매수</b>
            <span className={styles.nextDesc}>{fmtKRW(perBuy)}이 계좌 {acctCount}곳에 나눠 매수돼요.</span>
          </span>
        </section>
      )}

      {/* 로그아웃 — 세션·로그인 정보를 비우고 처음(스플래시)부터 다시 시작 */}
      {onLogout && (
        <button type="button" className={styles.logoutBtn} onClick={onLogout}>
          <LogOut size={14} strokeWidth={2.2} /> 로그아웃
        </button>
      )}

      {/* 배당달력 → 배당 전환 스크롤텔링 / 그 외 미구현 메뉴 → 준비 중 */}
      {divOpen && <DividendSwitch assets={assets} onClose={() => setDivOpen(false)} />}
      {prep && <PrepModal onClose={() => setPrep(false)} />}
    </div>
  );
}

/* 피드 탭 — 추후 콘텐츠 정의 예정 */
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
