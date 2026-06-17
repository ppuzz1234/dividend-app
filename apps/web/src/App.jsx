import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowRight, ChevronLeft, Check, Search, TrendingUp, Wallet, Landmark,
  ShieldCheck, Sparkles, PiggyBank, RefreshCw, Plus, Minus, Globe, Lock,
  BadgeCheck, Building2, Signal, Wifi, BatteryFull, CircleDollarSign,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 — 상장 배당주 투자 시뮬레이터 (iPhone 17 Pro)
 *  · 단일 통화(원) 정규화, 표기 수익률은 예시 가정치
 *  · 투자 권유가 아니며 실제 수익을 보장하지 않음
 * ------------------------------------------------------------------ */

const C = {
  bg: "#0A0F0D", bg2: "#0E1512", card: "#131B17", cardHi: "#18211C",
  line: "#222E27", line2: "#2C3A32",
  text: "#EAF1EC", sub: "#8A998F", faint: "#5C6B62",
  jade: "#3FD08B", jadeDeep: "#27A06C", jadeDim: "#16321F",
  gold: "#E8C078", goldDeep: "#C99A4E", goldDim: "#332915",
  danger: "#E8775C",
};

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Apple SD Gothic Neo", "Pretendard", system-ui, "Malgun Gothic", sans-serif';

/* ---------------------------- 종목 데이터 (예시 가정치) --------------------------- */
const STOCKS = [
  { id: "schd", name: "SCHD", ticker: "美 배당성장 ETF", region: "US", type: "growth", sector: "ETF", yield: 0.035, divG: 0.11, priceG: 0.085, elite: true },
  { id: "kb", name: "KB금융", ticker: "105560", region: "KR", type: "high", sector: "금융", yield: 0.052, divG: 0.07, priceG: 0.06, elite: true },
  { id: "ko", name: "코카콜라", ticker: "KO", region: "US", type: "growth", sector: "필수소비재", yield: 0.030, divG: 0.05, priceG: 0.06, elite: true },
  { id: "ss", name: "삼성전자", ticker: "005930", region: "KR", type: "growth", sector: "반도체", yield: 0.026, divG: 0.05, priceG: 0.07 },
  { id: "shin", name: "신한지주", ticker: "055550", region: "KR", type: "high", sector: "금융", yield: 0.050, divG: 0.06, priceG: 0.05 },
  { id: "skt", name: "SK텔레콤", ticker: "017670", region: "KR", type: "high", sector: "통신", yield: 0.064, divG: 0.02, priceG: 0.02 },
  { id: "ktg", name: "KT&G", ticker: "033780", region: "KR", type: "high", sector: "필수소비재", yield: 0.058, divG: 0.03, priceG: 0.03 },
  { id: "mki", name: "맥쿼리인프라", ticker: "088980", region: "KR", type: "high", sector: "인프라", yield: 0.065, divG: 0.03, priceG: 0.02 },
  { id: "sf", name: "삼성화재", ticker: "000810", region: "KR", type: "growth", sector: "보험", yield: 0.042, divG: 0.08, priceG: 0.07 },
  { id: "jepi", name: "JEPI", ticker: "美 고배당 ETF", region: "US", type: "high", sector: "ETF", yield: 0.080, divG: 0.005, priceG: 0.03 },
  { id: "o", name: "리얼티인컴", ticker: "O · 美리츠", region: "US", type: "high", sector: "리츠", yield: 0.055, divG: 0.03, priceG: 0.035 },
  { id: "jnj", name: "존슨앤드존슨", ticker: "JNJ", region: "US", type: "growth", sector: "헬스케어", yield: 0.031, divG: 0.06, priceG: 0.055 },
];

const ACCOUNTS = [
  { id: "general", name: "일반 위탁계좌", desc: "배당소득세 15.4%", tax: 0.154, icon: Wallet },
  { id: "isa", name: "ISA 계좌", desc: "비과세 후 9.9% 분리과세", tax: 0.099, icon: ShieldCheck },
  { id: "pension", name: "연금저축 · IRP", desc: "과세이연 (적립기간 비과세)", tax: 0, icon: Landmark },
];

/* ------------------------------------ 유틸 ------------------------------------ */
const fmtKRW = (v) => {
  v = Math.round(v);
  if (v >= 1e8) {
    const eok = Math.floor(v / 1e8);
    const man = Math.round((v % 1e8) / 1e4);
    return man > 0 ? `${eok}억 ${man.toLocaleString()}만원` : `${eok}억원`;
  }
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만원`;
  return `${v.toLocaleString()}원`;
};
const fmtShort = (v) => {
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만`;
  return `${v}`;
};
const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);

/* ----------------------------------- 시뮬레이션 ----------------------------------- */
function simulate({ seed, monthly, years, holdings, reinvest, account }) {
  const list = holdings.length ? holdings : STOCKS.filter((s) => s.elite);
  const y0 = avg(list.map((s) => s.yield));
  const g = avg(list.map((s) => s.divG));
  const p = avg(list.map((s) => s.priceG));
  const acc = ACCOUNTS.find((a) => a.id === account) || ACCOUNTS[0];
  const tax = acc.tax;
  const n = years * 12;
  const rp = Math.pow(1 + p, 1 / 12) - 1;

  let value = seed, contributed = seed, cumDiv = 0;
  const series = [{ year: 0, value: seed, principal: seed, gain: 0, income: seed * y0 }];

  for (let m = 1; m <= n; m++) {
    value *= 1 + rp;
    const yNow = y0 * Math.pow((1 + g) / (1 + p), m / 12);
    let div = value * (yNow / 12) * (1 - tax);
    cumDiv += div;
    if (reinvest) value += div;
    value += monthly;
    contributed += monthly;
    if (m % 12 === 0)
      series.push({
        year: m / 12, value, principal: contributed,
        gain: Math.max(0, value - contributed), income: value * yNow * (1 - tax),
      });
  }
  const last = series[series.length - 1];
  return {
    series, finalValue: value, contributed, gain: value - contributed, cumDiv,
    annualIncome: last.income, monthlyIncome: last.income / 12,
    yoc: last.income / contributed, blended: { y0, g, p }, taxRate: tax, account: acc,
  };
}

/* ----------------------------------- UI 프리미티브 ----------------------------------- */
function Btn({ children, onClick, disabled, variant = "primary", icon: Icon }) {
  const styles = {
    primary: { background: C.jade, color: "#06140C", boxShadow: "0 8px 24px -8px rgba(63,208,139,.55)" },
    gold: { background: C.gold, color: "#1A1305", boxShadow: "0 8px 24px -8px rgba(232,192,120,.5)" },
    ghost: { background: "transparent", color: C.text, border: `1px solid ${C.line2}` },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", height: 54, borderRadius: 16, border: "none", fontFamily: FONT,
        fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", cursor: disabled ? "default" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        opacity: disabled ? 0.38 : 1, transition: "transform .12s, opacity .2s",
        WebkitTapHighlightColor: "transparent", ...styles,
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.975)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
      {Icon && <Icon size={19} strokeWidth={2.4} />}
    </button>
  );
}

function Tag({ children, tone = "jade" }) {
  const t = tone === "gold"
    ? { bg: C.goldDim, fg: C.gold } : tone === "muted"
    ? { bg: C.line, fg: C.sub } : { bg: C.jadeDim, fg: C.jade };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 7,
      background: t.bg, color: t.fg, letterSpacing: "-0.01em", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function useCountUp(target, dur = 1000) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf, start;
    const tick = (t) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      setV(target * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return v;
}

/* ====================================== 앱 ====================================== */
const STEPS = ["splash", "signup", "mydata", "recommend", "picker", "seed", "period", "account", "simulate", "result", "done"];
const STAGE = { signup: 0, mydata: 0, recommend: 1, picker: 1, seed: 2, period: 2, account: 3, simulate: 4, result: 4, done: 4 };
const STAGE_LABELS = ["가입", "종목", "금액", "계좌", "결과"];

export default function App() {
  const [step, setStep] = useState("splash");
  const [path, setPath] = useState("platform");      // platform | manual
  const [pmode, setPmode] = useState("top3");          // top3 | dividend
  const [region, setRegion] = useState("KR");
  const [divType, setDivType] = useState("high");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [seed, setSeed] = useState(10000000);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(500000);
  const [reinvest, setReinvest] = useState(true);
  const [account, setAccount] = useState("isa");
  const [mydata, setMydata] = useState(false);
  const [scale, setScale] = useState(1);

  const go = (s) => { setStep(s); document.getElementById("scrollArea")?.scrollTo(0, 0); };
  const idx = STEPS.indexOf(step);
  const back = () => idx > 1 && go(STEPS[idx - 1]);

  useEffect(() => {
    const onR = () => setScale(Math.min(1, (window.innerWidth - 16) / 426));
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);

  // 시뮬레이션 단계 → 자동 진행
  useEffect(() => {
    if (step === "simulate") {
      const t = setTimeout(() => go("result"), 1700);
      return () => clearTimeout(t);
    }
  }, [step]);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const chosen = useMemo(
    () => (selected.length ? STOCKS.filter((s) => selected.includes(s.id)) : STOCKS.filter((s) => s.elite)),
    [selected]
  );
  const sim = useMemo(
    () => simulate({ seed, monthly, years, holdings: chosen, reinvest, account }),
    [seed, monthly, years, chosen, reinvest, account]
  );

  const showHeader = !["splash", "simulate", "done"].includes(step);

  return (
    <div style={{ fontFamily: FONT, width: "100%", display: "flex", justifyContent: "center", padding: "24px 0" }}>
      <Style />
      {/* 1. 크기가 스케일링되는 최상위 컨테이너 크기 최적화 및 중앙 정렬 */}
      <div style={{ width: 426 * scale, height: 894 * scale, display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "center center", width: 426, height: 894 }}>
          
          {/* ----------------------------- 기기 프레임 ----------------------------- */}
          {/* 2. 상하좌우 대칭을 위해 padding을 12px에서 14px 균등 배치 및 그림자 위치 조정 */}
          <div style={{
            width: 426, height: 894, borderRadius: 56, padding: 14,
            background: "#2A2E2B", // 조금 더 세련된 프레임 색상으로 조정
            boxShadow: "0 25px 50px -12px rgba(0,0,0,.7), inset 0 0 0 1px rgba(255,255,255,.1)",
            boxSizing: "border-box"
          }}>
            {/* 화면 (프레임 내부 실제 디스플레이) */}
            <div style={{
              position: "relative", width: "100%", height: "100%", borderRadius: 44, overflow: "hidden",
              background: C.bg, color: C.text, display: "flex", flexDirection: "column",
            }}>
              {/* 다이내믹 아일랜드 */}
              <div style={{
                position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
                width: 110, height: 30, background: "#000", borderRadius: 15, zIndex: 50,
              }} />
              
              {/* 상태바 */}
              <div style={{
                height: 54, paddingTop: 16, display: "flex", alignItems: "center",
                justifyContent: "space-between", paddingLeft: 24, paddingRight: 24, flexShrink: 0,
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>9:41</span>
                <div style={{ display: "flex", gap: 6, alignItems: "center", color: C.text }}>
                  <Signal size={15} strokeWidth={2.5} />
                  <Wifi size={15} strokeWidth={2.5} />
                  <BatteryFull size={20} strokeWidth={2} />
                </div>
              </div>

              {/* 헤더 / 진행바 */}
              {showHeader && (
                <div style={{ padding: "6px 20px 12px", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <button onClick={back} aria-label="뒤로" style={{
                      width: 34, height: 34, borderRadius: 11, border: `1px solid ${C.line}`,
                      background: C.card, display: "grid", placeItems: "center", cursor: "pointer", color: C.text,
                    }}>
                      <ChevronLeft size={20} />
                    </button>
                    <Stepper stage={STAGE[step] ?? 0} />
                  </div>
                </div>
              )}

              {/* 콘텐츠 */}
              <div id="scrollArea" className="noscroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
                <div key={step} className="fadeUp" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
                  {step === "splash" && <Splash onStart={() => go("signup")} />}
                  {step === "signup" && <Signup onNext={() => go("mydata")} />}
                  {step === "mydata" && <Mydata mydata={mydata} setMydata={setMydata} onNext={() => go("recommend")} />}
                  {step === "recommend" && <Recommend path={path} setPath={setPath} onNext={() => go("picker")} />}
                  {step === "picker" && (
                    <Picker {...{ path, pmode, setPmode, region, setRegion, divType, setDivType, query, setQuery, selected, toggle, onNext: () => go("seed") }} />
                  )}
                  {step === "seed" && <Seed seed={seed} setSeed={setSeed} onNext={() => go("period")} />}
                  {step === "period" && <Period {...{ years, setYears, monthly, setMonthly, reinvest, setReinvest, onNext: () => go("account") }} />}
                  {step === "account" && <Account {...{ account, setAccount, mydata, onNext: () => go("simulate") }} />}
                  {step === "simulate" && <Simulating />}
                  {step === "result" && <Result sim={sim} chosen={chosen} years={years} reinvest={reinvest} onNext={() => go("done")} />}
                  {step === "done" && <Done sim={sim} onRestart={() => { setSelected([]); go("splash"); }} />}
                </div>
              </div>

              {/* 홈 인디케이터 */}
              <div style={{ height: 20, display: "grid", placeItems: "center", flexShrink: 0, paddingBottom: 4 }}>
                <div style={{ width: 120, height: 4, borderRadius: 2, background: "rgba(255,255,255,.4)" }} />
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------- 진행 스텝퍼 ----------------------------------- */
function Stepper({ stage }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
      {STAGE_LABELS.map((l, i) => (
        <div key={l} style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            height: 4, borderRadius: 2, marginBottom: 5,
            background: i <= stage ? C.jade : C.line,
            transition: "background .35s", boxShadow: i === stage ? `0 0 10px ${C.jade}88` : "none",
          }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: i <= stage ? C.jade : C.faint }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------ 공통 레이아웃 ------------------------------------ */
const Pad = ({ children, footer }) => (
  <>
    <div style={{ padding: "4px 20px 16px", flex: 1 }}>{children}</div>
    {footer && <div style={{ padding: "8px 20px 14px" }}>{footer}</div>}
  </>
);
const H1 = ({ children, sub }) => (
  <div style={{ marginBottom: 22 }}>
    <h1 style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.25, margin: 0 }}>{children}</h1>
    {sub && <p style={{ fontSize: 14.5, color: C.sub, margin: "9px 0 0", lineHeight: 1.5, letterSpacing: "-0.01em" }}>{sub}</p>}
  </div>
);

/* -------------------------------------- 스플래시 -------------------------------------- */
function Splash({ onStart }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 24px 18px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div className="floaty" style={{ marginBottom: 30, position: "relative" }}>
          <div style={{
            width: 116, height: 116, borderRadius: 36, display: "grid", placeItems: "center",
            background: `radial-gradient(circle at 30% 25%, ${C.jade}, ${C.jadeDeep})`,
            boxShadow: `0 24px 50px -12px ${C.jade}66, inset 0 1px 0 rgba(255,255,255,.4)`,
          }}>
            <PiggyBank size={58} color="#06140C" strokeWidth={2} />
          </div>
          <div style={{
            position: "absolute", right: -10, bottom: -6, width: 44, height: 44, borderRadius: 14,
            display: "grid", placeItems: "center", background: C.gold, color: "#1A1305",
            boxShadow: `0 10px 24px -6px ${C.gold}99`,
          }}>
            <CircleDollarSign size={26} strokeWidth={2.2} />
          </div>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", margin: 0, lineHeight: 1.15, color: "#ffffff", textShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
          배당 눈덩이
        </h1>
        <p style={{ fontSize: 16, color: C.sub, margin: "12px 0 0", lineHeight: 1.55, maxWidth: 280, letterSpacing: "-0.01em" }}>
          상장 배당주를 골라 담고, 재투자 복리로
          <br />내 배당금이 얼마나 굴러가는지 시뮬레이션해요.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 22 }}>
          <Tag>국내 · 미국 배당주</Tag>
          <Tag tone="gold">배당 재투자</Tag>
        </div>
      </div>
      <Btn onClick={onStart} icon={ArrowRight}>시작하기</Btn>
      <p style={{ fontSize: 11.5, color: C.faint, textAlign: "center", margin: "14px 0 0", lineHeight: 1.5 }}>
        본 시뮬레이션은 예시 가정치를 사용하며, 실제 수익을 보장하지 않습니다. 투자 권유가 아닙니다.
      </p>
    </div>
  );
}

/* ------------------------------------- 회원가입 ------------------------------------- */
function Signup({ onNext }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  return (
    <Pad footer={<Btn onClick={onNext} disabled={!name || !agree} icon={ArrowRight}>다음</Btn>}>
      <H1 sub="개인정보를 입력하고 약관에 동의하면 시작할 수 있어요.">회원가입</H1>
      <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
      <Field label="휴대폰 번호" placeholder="010-0000-0000" inputMode="numeric" />
      <Field label="이메일" placeholder="you@example.com" />
      <button onClick={() => setAgree((a) => !a)} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 8,
        background: C.card, border: `1px solid ${agree ? C.jade : C.line}`, borderRadius: 14,
        padding: "14px 16px", cursor: "pointer", textAlign: "left", transition: "border-color .2s",
      }}>
        <span style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center",
          background: agree ? C.jade : "transparent", border: `1.5px solid ${agree ? C.jade : C.line2}`,
        }}>{agree && <Check size={15} color="#06140C" strokeWidth={3} />}</span>
        <span style={{ fontSize: 13.5, color: C.text, lineHeight: 1.4 }}>
          서비스 이용약관 및 개인정보 처리방침에 동의합니다 <span style={{ color: C.faint }}>(필수)</span>
        </span>
      </button>
    </Pad>
  );
}
function Field({ label, value, onChange, placeholder, inputMode }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.sub, display: "block", marginBottom: 7 }}>{label}</span>
      <input
        value={value} onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder} inputMode={inputMode}
        style={{
          width: "100%", height: 50, borderRadius: 13, border: `1px solid ${C.line}`,
          background: C.card, color: C.text, padding: "0 16px", fontSize: 16, fontFamily: FONT,
          outline: "none", letterSpacing: "-0.01em", boxSizing: "border-box",
        }}
        onFocus={(e) => (e.target.style.borderColor = C.jade)}
        onBlur={(e) => (e.target.style.borderColor = C.line)}
      />
    </label>
  );
}

/* ------------------------------------ 마이데이터 연동 ------------------------------------ */
function Mydata({ mydata, setMydata, onNext }) {
  return (
    <Pad footer={
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Btn onClick={onNext} icon={ArrowRight}>{mydata ? "연동 완료 · 다음" : "다음"}</Btn>
        {!mydata && (
          <button onClick={onNext} style={{ background: "none", border: "none", color: C.sub, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
            나중에 할게요
          </button>
        )}
      </div>
    }>
      <H1 sub="흩어진 계좌·보유 자산을 한 번에 불러와 보유 종목과 계좌를 자동으로 채워드려요.">마이데이터 연동</H1>
      <div style={{
        borderRadius: 18, padding: 22, textAlign: "center", marginBottom: 18,
        background: `linear-gradient(160deg,${C.cardHi},${C.card})`, border: `1px solid ${C.line}`,
      }}>
        <div style={{
          width: 70, height: 70, borderRadius: 22, margin: "0 auto 16px", display: "grid", placeItems: "center",
          background: mydata ? C.jade : C.bg2, border: `1px solid ${C.line2}`, transition: "background .3s",
        }}>
          {mydata ? <BadgeCheck size={36} color="#06140C" /> : <Lock size={32} color={C.jade} />}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{mydata ? "연동되었어요" : "안전하게 연동돼요"}</div>
        <div style={{ fontSize: 13, color: C.sub, marginTop: 6, lineHeight: 1.5 }}>
          {mydata ? "보유 종목 4건 · 계좌 2개를 불러왔어요" : "금융보안원 인증 · 조회 전용 권한만 사용"}
        </div>
      </div>
      <button onClick={() => setMydata((v) => !v)} style={{
        width: "100%", height: 50, borderRadius: 13, fontFamily: FONT, fontSize: 15, fontWeight: 700,
        cursor: "pointer", border: `1px solid ${C.jade}`, background: mydata ? C.jadeDim : "transparent",
        color: C.jade, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        <RefreshCw size={17} />{mydata ? "다시 불러오기" : "내 계좌 연동하기"}
      </button>
    </Pad>
  );
}

/* ------------------------------------ 종목 추천 경로 ------------------------------------ */
function Recommend({ path, setPath, onNext }) {
  const opts = [
    { id: "platform", title: "플랫폼 추천 종목", desc: "우량 TOP3 또는 조건별 배당주를 제안받아요", icon: Sparkles },
    { id: "manual", title: "개별 종목 수기 검색", desc: "원하는 종목을 직접 검색해 담아요", icon: Search },
  ];
  return (
    <Pad footer={<Btn onClick={onNext} icon={ArrowRight}>다음</Btn>}>
      <H1 sub="어떻게 종목을 고를까요? 언제든 직접 추가·삭제할 수 있어요.">종목 추천 방식</H1>
      {opts.map((o) => {
        const on = path === o.id;
        return (
          <button key={o.id} onClick={() => setPath(o.id)} style={{
            display: "flex", gap: 14, width: "100%", textAlign: "left", marginBottom: 12, cursor: "pointer",
            background: on ? C.cardHi : C.card, border: `1px solid ${on ? C.jade : C.line}`,
            borderRadius: 16, padding: 18, transition: "all .18s", color: C.text,
          }}>
            <span style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center",
              background: on ? C.jade : C.bg2, color: on ? "#06140C" : C.jade,
            }}><o.icon size={24} /></span>
            <span style={{ flex: 1 }}>
              <span style={{ fontSize: 16.5, fontWeight: 700, display: "block" }}>{o.title}</span>
              <span style={{ fontSize: 13, color: C.sub, display: "block", marginTop: 4, lineHeight: 1.4 }}>{o.desc}</span>
            </span>
            <span style={{
              width: 22, height: 22, borderRadius: "50%", alignSelf: "center", flexShrink: 0,
              border: `2px solid ${on ? C.jade : C.line2}`, background: on ? C.jade : "transparent",
              display: "grid", placeItems: "center",
            }}>{on && <Check size={13} color="#06140C" strokeWidth={3.5} />}</span>
          </button>
        );
      })}
    </Pad>
  );
}

/* -------------------------------------- 종목 선택 -------------------------------------- */
function Picker({ path, pmode, setPmode, region, setRegion, divType, setDivType, query, setQuery, selected, toggle, onNext }) {
  let list;
  if (path === "manual") {
    list = STOCKS.filter((s) => (s.name + s.ticker + s.sector).toLowerCase().includes(query.toLowerCase()));
  } else if (pmode === "top3") {
    list = STOCKS.filter((s) => s.elite);
  } else {
    list = STOCKS.filter((s) => s.region === region && s.type === divType);
  }

  return (
    <Pad footer={
      <Btn onClick={onNext} disabled={selected.length === 0 && path === "manual"} icon={ArrowRight}>
        {selected.length ? `${selected.length}개 담고 다음` : "추천 그대로 담고 다음"}
      </Btn>
    }>
      <H1 sub={path === "manual" ? "종목명·티커로 검색해 담아보세요." : "마음에 드는 종목을 탭해서 담아요. 안 고르면 추천 종목으로 진행돼요."}>
        {path === "manual" ? "종목 검색" : "추천 종목"}
      </H1>

      {path === "manual" && (
        <div style={{ position: "relative", marginBottom: 16 }}>
          <Search size={18} color={C.faint} style={{ position: "absolute", left: 14, top: 16 }} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="예: 삼성전자, SCHD, 리츠"
            style={{
              width: "100%", height: 50, borderRadius: 13, border: `1px solid ${C.line}`, background: C.card,
              color: C.text, padding: "0 16px 0 42px", fontSize: 15.5, fontFamily: FONT, outline: "none", boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = C.jade)} onBlur={(e) => (e.target.style.borderColor = C.line)}
          />
        </div>
      )}

      {path === "platform" && (
        <>
          <Seg value={pmode} onChange={setPmode} opts={[{ v: "top3", l: "우량 TOP3" }, { v: "dividend", l: "배당주 선정" }]} />
          {pmode === "dividend" && (
            <div style={{ display: "flex", gap: 8, margin: "12px 0 4px" }}>
              <Seg small value={region} onChange={setRegion} opts={[{ v: "KR", l: "국내" }, { v: "US", l: "미국" }]} />
              <Seg small value={divType} onChange={setDivType} opts={[{ v: "high", l: "고배당주" }, { v: "growth", l: "배당성장주" }]} />
            </div>
          )}
          {pmode === "top3" && (
            <p style={{ fontSize: 12.5, color: C.gold, margin: "12px 0 4px", display: "flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={14} /> 안정성·배당 매력을 종합한 우량 3종목이에요.
            </p>
          )}
        </>
      )}

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {list.length === 0 && <Empty />}
        {list.map((s) => <StockRow key={s.id} s={s} on={selected.includes(s.id)} onClick={() => toggle(s.id)} />)}
      </div>
    </Pad>
  );
}
function Seg({ value, onChange, opts, small }) {
  return (
    <div style={{ display: "flex", flex: small ? 1 : "none", background: C.card, borderRadius: 13, padding: 4, gap: 4, border: `1px solid ${C.line}` }}>
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            flex: 1, height: small ? 36 : 42, borderRadius: 10, border: "none", cursor: "pointer",
            fontFamily: FONT, fontSize: small ? 13 : 14.5, fontWeight: 700, transition: "all .18s",
            background: on ? C.jade : "transparent", color: on ? "#06140C" : C.sub,
          }}>{o.l}</button>
        );
      })}
    </div>
  );
}
function StockRow({ s, on, onClick }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 13, width: "100%", textAlign: "left", cursor: "pointer",
      background: on ? C.cardHi : C.card, border: `1px solid ${on ? C.jade : C.line}`, borderRadius: 15, padding: "13px 15px",
      transition: "all .15s", color: C.text,
    }}>
      <span style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center",
        background: s.region === "US" ? C.goldDim : C.jadeDim, color: s.region === "US" ? C.gold : C.jade,
      }}>{s.region === "US" ? <Globe size={20} /> : <Building2 size={20} />}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 15.5, fontWeight: 700 }}>{s.name}</span>
          {s.elite && <Tag tone="gold">우량</Tag>}
        </span>
        <span style={{ fontSize: 12, color: C.sub, display: "block", marginTop: 2 }}>{s.ticker} · {s.sector}</span>
      </span>
      <span style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.jade, fontVariantNumeric: "tabular-nums" }}>
          {(s.yield * 100).toFixed(1)}%
        </span>
        <span style={{ fontSize: 10.5, color: C.faint, display: "block" }}>배당수익률</span>
      </span>
      <span style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: "grid", placeItems: "center", marginLeft: 2,
        background: on ? C.jade : "transparent", border: `1.5px solid ${on ? C.jade : C.line2}`,
      }}>{on && <Check size={14} color="#06140C" strokeWidth={3} />}</span>
    </button>
  );
}
const Empty = () => (
  <div style={{ textAlign: "center", padding: "40px 0", color: C.faint }}>
    <Search size={30} style={{ marginBottom: 10, opacity: 0.6 }} />
    <div style={{ fontSize: 14 }}>검색 결과가 없어요. 다른 종목명을 입력해보세요.</div>
  </div>
);

/* ------------------------------------ 초기 시딩 금액 ------------------------------------ */
function Seed({ seed, setSeed, onNext }) {
  const presets = [0, 5000000, 10000000, 30000000, 50000000, 100000000];
  return (
    <Pad footer={<Btn onClick={onNext} icon={ArrowRight}>다음</Btn>}>
      <H1 sub="지금 한 번에 넣을 시드 금액이에요. 0원으로 두고 매월 적립만 할 수도 있어요.">초기 시딩 금액</H1>
      <div style={{
        background: `linear-gradient(160deg,${C.cardHi},${C.card})`, border: `1px solid ${C.line}`,
        borderRadius: 18, padding: "26px 20px", textAlign: "center", marginBottom: 18,
      }}>
        <div style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>설정 금액</div>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em", marginTop: 6, color: C.jade, fontVariantNumeric: "tabular-nums" }}>
          {fmtKRW(seed)}
        </div>
      </div>
      <input type="range" className="rng" min={0} max={200000000} step={1000000} value={seed}
        onChange={(e) => setSeed(Number(e.target.value))} style={{ width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint, marginTop: 6 }}>
        <span>0원</span><span>2억원</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
        {presets.map((p) => (
          <button key={p} onClick={() => setSeed(p)} style={{
            height: 44, borderRadius: 12, cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 700,
            border: `1px solid ${seed === p ? C.jade : C.line}`, background: seed === p ? C.jadeDim : C.card,
            color: seed === p ? C.jade : C.sub,
          }}>{p === 0 ? "0원" : fmtShort(p)}</button>
        ))}
      </div>
    </Pad>
  );
}

/* --------------------------------- 투자 기간 · 월 불입금 --------------------------------- */
function Period({ years, setYears, monthly, setMonthly, reinvest, setReinvest, onNext }) {
  const presets = [100000, 300000, 500000, 1000000];
  return (
    <Pad footer={<Btn onClick={onNext} icon={ArrowRight}>다음</Btn>}>
      <H1 sub="얼마나 오래, 매월 얼마씩 적립할지 정해요.">투자 기간 · 월 불입금</H1>

      <Label>투자 기간</Label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: C.jade, fontVariantNumeric: "tabular-nums" }}>{years}</span>
        <span style={{ fontSize: 15, color: C.sub, fontWeight: 600 }}>년</span>
      </div>
      <input type="range" className="rng" min={1} max={40} step={1} value={years}
        onChange={(e) => setYears(Number(e.target.value))} style={{ width: "100%" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint, marginTop: 6 }}>
        <span>1년</span><span>40년</span>
      </div>

      <Label style={{ marginTop: 22 }}>매월 불입금</Label>
      <div style={{ fontSize: 23, fontWeight: 800, color: C.gold, marginBottom: 8, fontVariantNumeric: "tabular-nums" }}>
        {fmtKRW(monthly)}
      </div>
      <input type="range" className="rng gold" min={0} max={5000000} step={100000} value={monthly}
        onChange={(e) => setMonthly(Number(e.target.value))} style={{ width: "100%" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 7, marginTop: 14 }}>
        {presets.map((p) => (
          <button key={p} onClick={() => setMonthly(p)} style={{
            height: 40, borderRadius: 11, cursor: "pointer", fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
            border: `1px solid ${monthly === p ? C.gold : C.line}`, background: monthly === p ? C.goldDim : C.card,
            color: monthly === p ? C.gold : C.sub,
          }}>{fmtShort(p)}</button>
        ))}
      </div>

      <button onClick={() => setReinvest((v) => !v)} style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 24, cursor: "pointer",
        background: C.card, border: `1px solid ${reinvest ? C.jade : C.line}`, borderRadius: 15, padding: "15px 16px", textAlign: "left", color: C.text,
      }}>
        <RefreshCw size={22} color={reinvest ? C.jade : C.faint} />
        <span style={{ flex: 1 }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block" }}>배당금 재투자 (DRIP)</span>
          <span style={{ fontSize: 12.5, color: C.sub, display: "block", marginTop: 3 }}>받은 배당으로 다시 매수해 복리로 굴려요</span>
        </span>
        <Switch on={reinvest} />
      </button>
    </Pad>
  );
}
const Label = ({ children, style }) => (
  <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 6, ...style }}>{children}</div>
);
const Switch = ({ on }) => (
  <span style={{
    width: 48, height: 28, borderRadius: 16, flexShrink: 0, padding: 3, display: "flex",
    background: on ? C.jade : C.line2, justifyContent: on ? "flex-end" : "flex-start", transition: "all .2s",
  }}>
    <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff" }} />
  </span>
);

/* -------------------------------------- 보유 계좌 -------------------------------------- */
function Account({ account, setAccount, mydata, onNext }) {
  const [src, setSrc] = useState(mydata ? "mydata" : "manual");
  return (
    <Pad footer={<Btn onClick={onNext} icon={ArrowRight}>이 설정으로 시뮬레이션</Btn>}>
      <H1 sub="어떤 계좌로 굴릴지에 따라 배당에 붙는 세금이 달라져요.">보유 계좌 선택</H1>

      <Label>계좌 보유 현황</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[{ v: "mydata", l: "마이데이터" }, { v: "manual", l: "수기 입력" }].map((o) => {
          const on = src === o.v;
          return (
            <button key={o.v} onClick={() => setSrc(o.v)} style={{
              flex: 1, height: 42, borderRadius: 12, cursor: "pointer", fontFamily: FONT, fontSize: 14, fontWeight: 700,
              border: `1px solid ${on ? C.jade : C.line}`, background: on ? C.jadeDim : C.card, color: on ? C.jade : C.sub,
            }}>{o.l}</button>
          );
        })}
      </div>
      {src === "mydata" && !mydata && (
        <div style={{ fontSize: 12.5, color: C.gold, marginBottom: 14, background: C.goldDim, padding: "10px 12px", borderRadius: 10 }}>
          마이데이터가 연동되지 않았어요. 추천 계좌 중에서 선택해 진행할 수 있어요.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {ACCOUNTS.map((a) => {
          const on = account === a.id;
          return (
            <button key={a.id} onClick={() => setAccount(a.id)} style={{
              display: "flex", alignItems: "center", gap: 14, width: "100%", textAlign: "left", cursor: "pointer",
              background: on ? C.cardHi : C.card, border: `1px solid ${on ? C.jade : C.line}`, borderRadius: 16, padding: 16, transition: "all .15s", color: C.text,
            }}>
              <span style={{ width: 44, height: 44, borderRadius: 13, flexShrink: 0, display: "grid", placeItems: "center", background: on ? C.jade : C.bg2, color: on ? "#06140C" : C.jade }}>
                <a.icon size={22} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700, display: "block" }}>{a.name}</span>
                <span style={{ fontSize: 12.5, color: C.sub, display: "block", marginTop: 3 }}>{a.desc}</span>
              </span>
              <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `2px solid ${on ? C.jade : C.line2}`, background: on ? C.jade : "transparent", display: "grid", placeItems: "center" }}>
                {on && <Check size={13} color="#06140C" strokeWidth={3.5} />}
              </span>
            </button>
          );
        })}
      </div>
    </Pad>
  );
}

/* ------------------------------------- 시뮬레이션 중 ------------------------------------- */
function Simulating() {
  const msgs = ["월별 적립금 굴리는 중", "배당금 재투자 복리 적용 중", "세금 효과 계산 중"];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % msgs.length), 520);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 30 }}>
      <div style={{ textAlign: "center" }}>
        <div className="spin" style={{
          width: 76, height: 76, borderRadius: "50%", margin: "0 auto 26px",
          border: `4px solid ${C.line}`, borderTopColor: C.jade,
        }} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>눈덩이를 굴리는 중…</div>
        <div style={{ fontSize: 14, color: C.sub, marginTop: 8 }}>{msgs[i]}</div>
      </div>
    </div>
  );
}

/* -------------------------------------- 결과 화면 -------------------------------------- */
function Result({ sim, chosen, years, reinvest, onNext }) {
  const val = useCountUp(sim.finalValue, 1100);
  const returnPct = ((sim.finalValue / sim.contributed - 1) * 100);

  return (
    <Pad footer={<Btn onClick={onNext} variant="gold" icon={ArrowRight}>요약 보기</Btn>}>
      <H1>{years}년 뒤 예상 결과</H1>

      {/* 히어로: 최종 평가금액 */}
      <div style={{
        background: `linear-gradient(160deg,${C.cardHi},${C.card})`, border: `1px solid ${C.line2}`,
        borderRadius: 20, padding: "22px 20px", marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>최종 예상 평가금액</div>
        <div style={{ fontSize: 33, fontWeight: 800, letterSpacing: "-0.04em", marginTop: 6, color: C.jade, fontVariantNumeric: "tabular-nums" }}>
          {fmtKRW(val)}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <Mini label="총 납입금" v={fmtKRW(sim.contributed)} />
          <Mini label="투자 수익" v={`+${returnPct.toFixed(0)}%`} tone="gold" />
        </div>
      </div>

      {/* 눈덩이 차트 */}
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: "16px 8px 8px 0", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, padding: "0 14px 10px", fontSize: 11.5 }}>
          <Legend c={C.jadeDeep} t="납입 원금" />
          <Legend c={C.gold} t="수익 · 배당" />
        </div>
        <div style={{ height: 178, width: "100%" }}>
          <ResponsiveContainer>
            <AreaChart data={sim.series} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.jade} stopOpacity={0.7} />
                  <stop offset="100%" stopColor={C.jade} stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="gG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.gold} stopOpacity={0.75} />
                  <stop offset="100%" stopColor={C.gold} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.line} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(y) => (y === 0 ? "지금" : `${y}년`)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} width={40}
                tickFormatter={fmtShort} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="principal" stackId="1" stroke={C.jadeDeep} strokeWidth={2} fill="url(#gP)" />
              <Area type="monotone" dataKey="gain" stackId="1" stroke={C.gold} strokeWidth={2} fill="url(#gG)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 배당 스탯 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <Stat icon={CircleDollarSign} label={`${years}년차 연 배당금`} v={fmtKRW(sim.annualIncome)} tone="gold" />
        <Stat icon={Wallet} label="월 환산 배당" v={fmtKRW(sim.monthlyIncome)} tone="gold" />
        <Stat icon={PiggyBank} label="누적 수령 배당" v={fmtKRW(sim.cumDiv)} />
        <Stat icon={TrendingUp} label="원가대비 배당률" v={`${(sim.yoc * 100).toFixed(1)}%`} />
      </div>

      {/* 가정·세금 */}
      <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: C.sub, marginBottom: 9 }}>적용 가정</div>
        <Row k="포트폴리오 배당수익률" v={`${(sim.blended.y0 * 100).toFixed(1)}%`} />
        <Row k="연 배당성장률" v={`${(sim.blended.g * 100).toFixed(1)}%`} />
        <Row k="연 주가상승률(가정)" v={`${(sim.blended.p * 100).toFixed(1)}%`} />
        <Row k="계좌 · 배당세" v={`${sim.account.name} · ${(sim.taxRate * 100).toFixed(1)}%`} />
        <Row k="배당 재투자" v={reinvest ? "적용" : "미적용"} last />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {chosen.map((s) => <Tag key={s.id} tone={s.region === "US" ? "gold" : "jade"}>{s.name}</Tag>)}
      </div>
      <p style={{ fontSize: 11, color: C.faint, marginTop: 14, lineHeight: 1.5 }}>
        예시 가정치를 적용한 추정 결과로, 실제 수익률·배당은 시장 상황에 따라 달라지며 손실이 발생할 수 있습니다. 투자 권유가 아닙니다.
      </p>
    </Pad>
  );
}
const Mini = ({ label, v, tone }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 11.5, color: C.faint }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 800, marginTop: 3, color: tone === "gold" ? C.gold : C.text, fontVariantNumeric: "tabular-nums" }}>{v}</div>
  </div>
);
const Legend = ({ c, t }) => (
  <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.sub }}>
    <span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{t}
  </span>
);
const Stat = ({ icon: Icon, label, v, tone }) => (
  <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 15, padding: 14 }}>
    <Icon size={18} color={tone === "gold" ? C.gold : C.jade} />
    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 9 }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, letterSpacing: "-0.02em", color: tone === "gold" ? C.gold : C.text, fontVariantNumeric: "tabular-nums" }}>{v}</div>
  </div>
);
const Row = ({ k, v, last }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: last ? "none" : `1px solid ${C.line}`, fontSize: 13 }}>
    <span style={{ color: C.sub }}>{k}</span>
    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
  </div>
);
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.line2}`, borderRadius: 12, padding: "10px 12px", fontFamily: FONT }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>{label === 0 ? "지금" : `${label}년 후`}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.jade, fontVariantNumeric: "tabular-nums" }}>{fmtKRW(d.value)}</div>
      <div style={{ fontSize: 11.5, color: C.sub, marginTop: 4 }}>원금 {fmtKRW(d.principal)} · 수익 {fmtKRW(d.gain)}</div>
      <div style={{ fontSize: 11.5, color: C.gold, marginTop: 2 }}>연 배당 {fmtKRW(d.income)}</div>
    </div>
  );
}

/* --------------------------------------- 완료 --------------------------------------- */
function Done({ sim, onRestart }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 24px 18px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div className="popIn" style={{
          width: 92, height: 92, borderRadius: 30, display: "grid", placeItems: "center", marginBottom: 24,
          background: `radial-gradient(circle at 30% 25%, ${C.jade}, ${C.jadeDeep})`,
          boxShadow: `0 22px 44px -12px ${C.jade}66`,
        }}>
          <Check size={48} color="#06140C" strokeWidth={3} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.035em", margin: 0 }}>시뮬레이션 완료</h1>
        <p style={{ fontSize: 15, color: C.sub, margin: "12px 0 0", lineHeight: 1.55, maxWidth: 290 }}>
          꾸준히 적립하고 배당을 재투자하면,
          <br />매월 받는 배당이 이만큼 자라요.
        </p>
        <div style={{
          marginTop: 26, width: "100%", background: `linear-gradient(160deg,${C.goldDim},${C.card})`,
          border: `1px solid ${C.goldDeep}55`, borderRadius: 18, padding: "20px",
        }}>
          <div style={{ fontSize: 12.5, color: C.sub }}>마지막 해 월 환산 배당</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: C.gold, marginTop: 6, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
            {fmtKRW(sim.monthlyIncome)}
          </div>
          <div style={{ fontSize: 12.5, color: C.sub, marginTop: 6 }}>최종 평가금액 {fmtKRW(sim.finalValue)}</div>
        </div>
      </div>
      <Btn onClick={onRestart} variant="ghost" icon={RefreshCw}>다시 시뮬레이션</Btn>
    </div>
  );
}

/* --------------------------------------- 스타일 --------------------------------------- */
function Style() {
  return (
    <style>{`
      .noscroll::-webkit-scrollbar{ display:none; }
      .noscroll{ -ms-overflow-style:none; scrollbar-width:none; }
      .fadeUp{ animation: fadeUp .42s cubic-bezier(.2,.7,.2,1); }
      @keyframes fadeUp{ from{ opacity:0; transform:translateY(10px);} to{ opacity:1; transform:none;} }
      .floaty{ animation: floaty 3.4s ease-in-out infinite; }
      @keyframes floaty{ 0%,100%{ transform:translateY(0);} 50%{ transform:translateY(-9px);} }
      .spin{ animation: spin 1s linear infinite; }
      @keyframes spin{ to{ transform:rotate(360deg);} }
      .popIn{ animation: popIn .5s cubic-bezier(.2,1.3,.4,1); }
      @keyframes popIn{ from{ opacity:0; transform:scale(.6);} to{ opacity:1; transform:scale(1);} }
      input.rng{ -webkit-appearance:none; appearance:none; height:6px; border-radius:4px; background:${C.line2}; outline:none; }
      input.rng::-webkit-slider-thumb{ -webkit-appearance:none; width:26px; height:26px; border-radius:50%; background:#fff; border:5px solid ${C.jade}; cursor:pointer; box-shadow:0 3px 10px rgba(0,0,0,.4); }
      input.rng.gold::-webkit-slider-thumb{ border-color:${C.gold}; }
      input.rng::-moz-range-thumb{ width:22px; height:22px; border-radius:50%; background:#fff; border:5px solid ${C.jade}; cursor:pointer; }
      input.rng.gold::-moz-range-thumb{ border-color:${C.gold}; }
      *:focus-visible{ outline:2px solid ${C.jade}; outline-offset:2px; }
      @media (prefers-reduced-motion: reduce){ *{ animation:none !important; transition:none !important; } }
    `}</style>
  );
}
