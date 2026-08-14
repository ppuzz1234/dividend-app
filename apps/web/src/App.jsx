import { useState, useEffect, useMemo, useRef } from "react";
import { ChromeBody } from "./components/layout/ChromeBody.jsx";
import { PlainShell } from "./components/layout/PlainShell.jsx";
import { PhoneShell } from "./components/layout/PhoneShell.jsx";
import { STEPS, STAGE, NO_HEADER } from "./lib/flow.js";
import { CubeCopilot } from "./components/cube/CubeCopilot.jsx";
import {
  STOCKS,
  simulatePortfolio,
  allocate,
  projectRetirementScenario,
  ETF_BENCHMARKS,
  MYDATA_ACCOUNTS,
  MYDATA_PROFILE,
  decodeStrategy,
  decodePerAccount,
} from "@devidend/core";
import { onAuthChange, isReturningFromOAuth, isAuthPopup, logAuthDiagnostics, logout } from "./auth/google.js";
import { usePlanStore } from "./lib/usePlanStore.js";
import { loadSetup, saveSetup, hasSeenIntro, markIntroSeen } from "./lib/setupStore.js";
import { hasSupabase } from "./lib/supabase.js";
import { getCurrentPlan, listAccounts, getProfile } from "./lib/planRepo.js";
import { Splash } from "./screens/Splash.jsx";
import { Login } from "./screens/Login.jsx";
import { Intro } from "./screens/Intro.jsx";
import { MydataStep } from "./screens/MydataStep.jsx";
import { AccountsAnalysis } from "./screens/AccountsAnalysis.jsx";
import { Accounts } from "./screens/Accounts.jsx";
import { PassiveGoal } from "./screens/PassiveGoal.jsx";
import { AllocationPlan } from "./screens/AllocationPlan.jsx";
import { Simulating } from "./screens/Simulating.jsx";
import { Result } from "./screens/Result.jsx";
import { MainApp } from "./screens/MainApp.jsx";

/* ------------------------------------------------------------------ *
 *  PLUS CUBE — 상장 배당주 투자·절세 시뮬레이터
 *  App 은 단계 상태 관리와 화면 조립만 담당. (UI/스타일은 각 화면 모듈)
 *  흐름: 목표 → 계좌 전략 → 시뮬/분석 → 종목 → 매수
 * ------------------------------------------------------------------ */
export default function App() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  // 발표용 아이폰 베젤 모드 (?frame=1). 기본은 일반 풀뷰(실서비스).
  const framed = params.has("frame");
  // /device 프레임 시뮬레이터의 iframe(?device=1)으로 임베드된 경우 —
  // 상단 콘텐츠(헤더·뒤로가기)가 다이나믹 아일랜드에 가리지 않도록 상단 인셋 적용.
  const deviceInset = params.has("device");
  // 시연용 인트로 강제 노출(?intro=1) — 인트로는 원래 최초 설치 1회만 나온다.
  // TODO: 데모 프로세스를 걷어낼 때 이 우회로도 함께 제거할 것.
  const forceIntro = params.get("intro") === "1";
  // 구글 인증에서 막 돌아온 경우엔 스플래시·인트로를 건너뛰고 대기 화면에서 세션을 기다린다
  const [step, setStep] = useState(isReturningFromOAuth() ? "authWait" : "splash");
  const [selected, setSelected] = useState([]);
  const [seed] = useState(10000000); // 미연동 시 기본 시드
  const [monthly] = useState(500000);
  const [monthlyGoal, setMonthlyGoal] = useState(300); // 목표 passive income(만원, 은퇴 후 월)
  const [reinvest] = useState(true);
  // 프로필 단계 제거 — 기본 프로파일로 시작, 전략 화면에서 마이데이터 연동 시 갱신
  const [mydata, setMydata] = useState(false);
  const [age, setAge] = useState(40);
  const [income, setIncome] = useState(50000000); // 전년도 총소득
  const [finIncome, setFinIncome] = useState(0); // 전년도 금융소득 (이자+배당)
  const [goal] = useState("retirement"); // retirement | cashflow
  const [answers] = useState({}); // 성향 응답 (서베이 제거로 빈 값 유지)
  const [user, setUser] = useState(null); // 로그인 프로필 (Supabase 세션 or 데모)
  // 수기 입력 계좌 현황 — { isa, pensionSavings, irp, general } (원 단위, 0=계좌 없음)
  const [manualAccounts, setManualAccounts] = useState(null);
  // 계좌 별 투자 상품 설정 결과 — { [accountId]: { [productCode]: 월배분액(원) } }
  const [productAlloc, setProductAlloc] = useState({});
  // 매수 리듬(일/주/월) — 배분 화면(allocate)에서 결정, 확인 시트·메인 앱에 표시
  const [buyCycle, setBuyCycle] = useState("weekly");
  /* 절세선호도 — 계좌 배분 waterfall 우선순위 분기 (growth: 장기 증식 ISA 우선
   * / refund: 올해 세액공제 IRP 우선). ③ 분석 화면에서 선택, 이후 전 단계에 반영.
   * 기본 추천(CUBE)은 refund — 연말정산 세액공제(연금저축600→IRP300)부터 확보하는 내러티브 */
  const [taxPref, setTaxPref] = useState("refund");
  // ISA 만기(3년) 세부전략 — isa1: 연금저축 롤오버(추가공제) / isa2: 재가입 반복 / isa3: 롤오버 없음
  const [isaRollover, setIsaRollover] = useState("isa1");
  /* 자금 유동성 선호 — "short"(3~5년 내 목돈 계획)면 엔진이 ISA 를 1순위로 올린다.
   * '자금 유동성 확보' 전략(growth-isa2-liq) 선택 시에만 켜진다 */
  const [liquidity, setLiquidity] = useState(null);
  /* 계좌별 월 납입 한도 — { [계좌id]: { monthlyMax } } 또는 null(한도 없음).
   * "내 선호 반영"에서 직접 설정하며, 한도를 넘는 금액은 다음 순위 계좌로 흘러간다 */
  const [perAccount, setPerAccount] = useState(null);
  // 메인 앱 진입 탭 — 최초 완주 직후엔 자산 탭, 설계를 마친 재로그인 복귀는 뉴스 홈
  const [homeTab, setHomeTab] = useState("assets");
  // 자산 탭 "다시 설계" — 마이데이터 단계에서 수기입력 폼을 강제하고 기존 값을 채워 보여준다
  const [redesign, setRedesign] = useState(false);
  /* 계좌·플랜 저장소 — Supabase 미설정이거나 로그인 전이면 no-op.
   * (로그인 전 조회는 RLS·권한에 막혀 401 만 발생시키므로 아예 호출하지 않는다) */
  const store = usePlanStore({ enabled: !!user?.userId });

  /* 완료 스냅샷 복원 — 저장해 둔 입력·배분 결과를 상태에 되살린다 (재로그인 직행용) */
  const applySetup = (s) => {
    setMydata(!!s.mydata);
    if (s.manualAccounts) setManualAccounts(s.manualAccounts);
    if (s.age) setAge(s.age);
    if (s.income != null) setIncome(s.income);
    if (s.finIncome != null) setFinIncome(s.finIncome);
    if (s.monthlyGoal) setMonthlyGoal(s.monthlyGoal);
    if (s.productAlloc) setProductAlloc(s.productAlloc);
    if (s.buyCycle) setBuyCycle(s.buyCycle);
    if (s.taxPref) setTaxPref(s.taxPref);
    if (s.isaRollover) setIsaRollover(s.isaRollover);
    if (s.liquidity) setLiquidity(s.liquidity);
    if (s.perAccount) setPerAccount(s.perAccount);
  };

  /* 서버에 저장된 최신 플랜(리비전) → 화면 상태 복원.
   * 로컬 스냅샷이 없는 구글 로그인(다른 브라우저·기기, 스토리지 삭제)이라도
   * 계정에 설계 이력이 있으면 메인 앱을 바로 그릴 수 있게 한다. */
  const applyServerPlan = (plan, ledger, profile = null) => {
    // 프로필(나이·소득) — 세액공제율·투자기간(60−나이) 분기를 저장 당시 그대로 재현
    if (profile?.age) setAge(profile.age);
    if (profile?.total_income != null) setIncome(profile.total_income);
    if (profile?.fin_income != null) setFinIncome(profile.fin_income);
    // 전략 코드 복원 — note 텍스트에 "strategy:growth-isa1 caps:isa=100" 형태로 실려 온다(스키마 변경 없이)
    const st = decodeStrategy(/strategy:([a-z0-9-]+)/.exec(plan.note || "")?.[1]);
    if (st) {
      setTaxPref(st.taxPref);
      setIsaRollover(st.isaRollover);
      setLiquidity(st.liquidity ?? null);
    }
    const caps = decodePerAccount(/caps:([A-Za-z0-9=,]+)/.exec(plan.note || "")?.[1]);
    if (caps) setPerAccount(caps);
    const kindOf = new Map(ledger.map((a) => [a.id, a.kind]));
    // 계좌 원장 잔고 → 수기입력 형태의 계좌 현황 (자산 합계·"다시 설계" 초기값)
    if (ledger.length) {
      const accounts = { isa: 0, pensionSavings: 0, irp: 0, general: 0 };
      for (const a of ledger) if (a.kind in accounts) accounts[a.kind] = a.balance || 0;
      setManualAccounts(accounts);
    }
    if (plan.monthly_goal_manwon) setMonthlyGoal(plan.monthly_goal_manwon);
    // 매수 규칙 → 상품 배분({계좌: {상품코드: 월 배분액}})과 매수 주기
    const PER_MONTH = { daily: 365 / 12, weekly: 52 / 12, monthly: 1, yearly: 1 / 12 };
    const alloc = {};
    let cycle = null;
    for (const o of plan.orders ?? []) {
      const kind = kindOf.get(o.account_id);
      if (!kind) continue;
      const monthly = Math.round((o.amount_per_order || 0) * (PER_MONTH[o.cycle] ?? 1));
      if (monthly <= 0) continue;
      (alloc[kind] ??= {})[o.product_code] = (alloc[kind][o.product_code] || 0) + monthly;
      cycle ??= o.cycle;
    }
    if (Object.keys(alloc).length) setProductAlloc(alloc);
    if (["daily", "weekly", "monthly"].includes(cycle)) setBuyCycle(cycle);
  };

  /* 데모 진입 리셋 — 같은 페이지 세션에서 이전 로그인·설계가 남긴 상태를 모두
   * 지워 항상 "첫 접속"과 동일한 온보딩 시나리오를 보여준다 (시연용) */
  const resetDemoState = () => {
    setMydata(false);
    setManualAccounts(null);
    setProductAlloc({});
    setBuyCycle("weekly");
    setTaxPref("refund");
    setIsaRollover("isa1");
    setLiquidity(null);
    setPerAccount(null);
    setMonthlyGoal(300);
    setAge(40);
    setIncome(50_000_000);
    setFinIncome(0);
    setSelected([]);
    setRedesign(false);
    setHomeTab("assets");
  };

  /* 서버 플랜 프리페치 — 세션이 복원되는 즉시(대개 스플래시 재생 중) 미리 조회해
   * 두면, 스플래시가 끝나는 시점엔 결과가 준비돼 있어 로딩 화면 없이 곧바로
   * 목적지(뉴스 홈/온보딩)로 진입할 수 있다. */
  const serverPlanRef = useRef(null); // { promise, settled, value: {plan, ledger}|null } | null
  const prefetchServerPlan = (profile) => {
    if (!profile?.userId || !hasSupabase) return null;
    if (serverPlanRef.current) return serverPlanRef.current;
    const entry = { settled: false, value: null };
    entry.promise = (async () => {
      try {
        const plan = await getCurrentPlan();
        if (plan) {
          // 프로필(나이·소득)은 부가 정보 — 실패해도 플랜 복원 자체는 막지 않는다
          const [ledger, profile] = await Promise.all([listAccounts(), getProfile().catch(() => null)]);
          entry.value = { plan, ledger: ledger ?? [], profile };
        } else {
          entry.value = null;
        }
      } catch {
        entry.value = null; // 조회 실패 — 설계 여부를 알 수 없으니 안전하게 온보딩부터
      }
      entry.settled = true;
      return entry.value;
    })();
    serverPlanRef.current = entry;
    return entry;
  };

  /* 로그인 완료 공통 진입점 — 최초의 미설계 상태가 아니라면 온보딩을 건너뛰고
   * 곧바로 메인 앱 뉴스 홈으로 진입한다. 판별 순서:
   *  ① 로컬 완료 스냅샷(데모·구글 공통, 같은 브라우저 재방문)
   *  ② 구글 실계정 — 서버(Supabase)에 저장된 플랜 리비전 (다른 브라우저·기기)
   * 둘 다 없으면(진짜 처음) 마이데이터 단계부터 시작한다. */
  const enteringRef = useRef(false); // 팝업 완료 시 onNext·onAuthChange 가 겹쳐 불리는 중복 진입 방지
  const enterAfterLogin = async (profile = null) => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    try {
      const saved = loadSetup(profile?.userId ?? "demo");
      if (saved) {
        applySetup(saved);
        setHomeTab("news");
        go("portfolio");
        return;
      }
      if (profile?.userId && hasSupabase) {
        /* 로딩 화면 없이 결정한다 — 프리페치(세션 복원 직후 시작)가 아직이면
         * 현재 화면(로그인·스플래시)에 그대로 머문 채 잠깐(수백 ms) 기다렸다가
         * 곧바로 목적지(뉴스 홈/온보딩)로 진입한다 */
        const entry = prefetchServerPlan(profile);
        const value = await entry.promise;
        if (value) {
          applyServerPlan(value.plan, value.ledger, value.profile);
          setHomeTab("news");
          go("portfolio");
          return;
        }
      }
      go("mydata");
    } finally {
      enteringRef.current = false;
    }
  };

  // onAuthChange 콜백(구독 시점 고정)에서 현재 단계를 읽기 위한 참조
  const stepRef = useRef(step);
  stepRef.current = step;

  /* 구글 SSO 세션 구독 — 초기 복원과 로그인 완료를 모두 통지받는다.
   * (getSession() 즉시 호출은 URL 해시 파싱 전이라 null 이 나올 수 있어 로그인 화면으로
   *  되돌아가는 원인이 된다.) Supabase 미설정이면 항상 null 이라 기존 데모 흐름 유지. */
  useEffect(() => {
    logAuthDiagnostics(); // 콘솔에 복귀 상태 요약 (설정 점검용)
    const off = onAuthChange((profile) => {
      // 구글 인증 팝업창 안이라면 — 세션은 스토리지/브로드캐스트로 본창에 전달되므로
      // 이 창(팝업)은 할 일이 끝났다. 스스로 닫는다.
      if (profile && isAuthPopup()) {
        window.close();
        return;
      }
      setUser(profile);
      // 인증 완료 → 대기/인트로/로그인에 있었다면 다음 목적지로
      // (설계를 이미 마쳤으면 뉴스 홈 직행, 아니면 마이데이터 단계).
      // 스플래시는 여기서 낚아채지 않는다 — 한 사이클을 끝까지 보여준 뒤
      // Splash 의 onStart 가 user 유무를 보고 같은 분기를 태운다.
      if (profile) {
        // 완료 스냅샷이 없는 계정이면 서버 플랜을 지금 바로 미리 조회해 둔다
        // (스플래시가 도는 동안 끝나므로, 완주 후 로딩 화면 없이 바로 진입)
        if (!loadSetup(profile.userId ?? "demo")) prefetchServerPlan(profile);
        if (["authWait", "intro", "login"].includes(stepRef.current)) enterAfterLogin(profile);
      } else {
        serverPlanRef.current = null; // 로그아웃 — 다음 세션에서 새로 조회
        // 세션이 없는데 복귀 대기 중이면(인증 취소·실패) 로그인 화면으로
        setStep((s) => (s === "authWait" ? "login" : s));
      }
    });
    return off;
  }, []);

  // 저장된 최신 계획이 있으면 목표 생활비를 이어받는다(재방문 시 이전 설정 복원)
  useEffect(() => {
    if (store.plan?.monthly_goal_manwon) setMonthlyGoal(store.plan.monthly_goal_manwon);
  }, [store.plan]);

  /* 로그인 화면에 도달하는 순간 기존 세션을 정리한다(signOut).
   * 구글 로그인 후 뒤로가기로 돌아와도 이전 세션이 남지 않아,
   * 데모(네이버·카카오)·구글 어느 쪽을 다시 눌러도 깨끗한 상태에서 분기된다.
   * 로컬 user 는 signOut → onAuthChange(SIGNED_OUT) 구독에서 null 로 정리된다.
   * (Supabase 미설정이면 logout 은 no-op이고, 그 경우 user 는 데모 로그인에서
   *  항상 null 로만 세팅되므로 별도 초기화가 필요 없다.) */
  useEffect(() => {
    if (step === "login") {
      logout();
      setRedesign(false); // 재설계 도중 로그인으로 돌아오면 강제 수기입력 모드 해제
    }
  }, [step]);

  /* 설계 완주 → 메인 앱 도달 시점의 입력·배분 결과를 스냅샷으로 저장.
   * 이후 로그인은 이 스냅샷 덕에 온보딩을 건너뛰고 뉴스 홈으로 직행한다.
   * 데모(네이버·카카오)는 저장하지 않는다 — 데모는 항상 첫 접속처럼 온보딩 전체를 탄다. */
  useEffect(() => {
    if (step !== "portfolio" || !user?.userId) return;
    saveSetup(user.userId, { mydata, manualAccounts, age, income, finIncome, monthlyGoal, productAlloc, buyCycle, taxPref, isaRollover, liquidity, perAccount });
  }, [step, user, mydata, manualAccounts, age, income, finIncome, monthlyGoal, productAlloc, buyCycle, taxPref, isaRollover, liquidity, perAccount]);

  // 전략 화면의 마이데이터 연동 완료 → 프로필·시드 반영
  const linkMydata = () => {
    setMydata(true);
    setAge(MYDATA_PROFILE.age);
    setFinIncome(MYDATA_PROFILE.financialIncomePrevYear);
    setIncome(MYDATA_PROFILE.totalIncomePrevYear);
  };

  /* 수기 입력 계좌를 원장(user_accounts, source='manual')에 반영.
   * 슬라이더 값은 "올해 납입액"이자 현재 평가액으로 간주한다(입력 항목 최소화).
   * 0원은 계좌 없음 → 원장에 만들지 않는다. */
  const saveManualAccounts = (values) => {
    const list = Object.entries(values)
      .filter(([, v]) => v > 0)
      .map(([kind, v]) => ({ kind, balance: v, contributedThisYear: v, holdings: [] }));
    store.syncManual?.(list);
  };

  const go = (s) => {
    setStep(s);
    document.getElementById("scrollArea")?.scrollTo(0, 0);
  };
  const idx = STEPS.indexOf(step);
  const back = () => {
    if (idx <= 1) return;
    let i = idx - 1;
    while (i > 1 && STEPS[i] === "simulate") i--; // 로딩(시뮬) 화면은 건너뛰고 이전 실화면으로
    go(STEPS[i]);
  };

  // 마이데이터 총 잔고 → 연동 시 투자 시드로 사용 (여력 화면 대체)
  const mydataTotal = useMemo(
    () => Object.values(MYDATA_ACCOUNTS).reduce((s, a) => s + (a.balance || 0), 0),
    []
  );
  /* "다시 설계" 시 수기입력 폼에 채워 줄 기존 값 — 수기 입력값이 있으면 그대로,
   * 데모(마이데이터 연동)였다면 연동 잔고를 수기입력 계좌 형태로 옮겨 담는다 */
  const manualInit = useMemo(
    () => ({
      accounts:
        manualAccounts ??
        (mydata
          ? {
              isa: MYDATA_ACCOUNTS.isa?.balance || 0,
              pensionSavings: MYDATA_ACCOUNTS.pension?.balance || 0,
              irp: MYDATA_ACCOUNTS.irp?.balance || 0,
              general: MYDATA_ACCOUNTS.general?.balance || 0,
            }
          : null),
      age,
      income,
      finIncome,
    }),
    [manualAccounts, mydata, age, income, finIncome]
  );

  /* 현재 보유 자산 — 수기 입력 합계 > 마이데이터 총액 > 기본 시드 */
  const currentAssets = useMemo(() => {
    if (manualAccounts) return Object.values(manualAccounts).reduce((s, v) => s + (v || 0), 0);
    return mydata ? mydataTotal : seed;
  }, [manualAccounts, mydata, mydataTotal, seed]);

  /* 투자기간 = 은퇴 정년(60세) − 현재 나이. 하한 5년(나이가 높아도 최소 기간 확보).
   * 나이는 마이데이터 연동(데모) 또는 수기입력(구글)에서 확정된다. */
  const years = Math.max(5, 60 - age);

  /* 목표 passive income → 필요 자산(4% 룰) → 월 투자금 역산.
   * 전략 화면과 같은 계산을 여기서도 수행해, 최종 시뮬레이션이
   * 하드코딩된 값이 아니라 사용자가 정한 목표를 그대로 따르게 한다. */
  const scenario = useMemo(
    () => projectRetirementScenario({ monthlyLivingCost: monthlyGoal * 10_000, currentAssets, years }),
    [monthlyGoal, currentAssets, years]
  );
  const requiredMonthly = scenario.perEtf[0]?.requiredMonthly ?? monthly;
  const benchmark = ETF_BENCHMARKS[0]; // PLUS 미국S&P500 — 전 화면 공통 수익률 가정(연 10%)
  /* 기존 보유자산(currentAssets)은 성장 시뮬에서 제외(시드 0)한다.
   * 월 납입액(requiredMonthly)이 이미 gap(=필요자산−현재자산)을 채우도록 산출되므로,
   * 시드까지 복리로 굴리면 이중 계산이 되어 목표를 크게 초과한다.
   * → 시뮬은 '월 납입 성장분'만 계산하고, 기존 자산은 Result 에서 현재가치로 합산한다. */
  const effectiveSeed = 0;

  // 로딩(simulate) 단계 → 자동으로 자산 탭(portfolio)으로 진행 ("최종 진행하기" 직후 대기 화면)
  useEffect(() => {
    if (step === "simulate") {
      const t = setTimeout(() => go("portfolio"), 4600); // CubeLoader 한 사이클(4.6s) 완주 후 진행
      return () => clearTimeout(t);
    }
  }, [step]);

  const chosen = useMemo(
    () => (selected.length ? STOCKS.filter((s) => selected.includes(s.id)) : STOCKS.filter((s) => s.elite)),
    [selected]
  );
  // ⑤ 배분 설계 엔진 → 계좌별 배분안
  const allocation = useMemo(
    () => allocate({ seed: effectiveSeed, monthly: requiredMonthly, age, income, goal }),
    [effectiveSeed, requiredMonthly, age, income, goal]
  );
  // ④ 배분안 기반 멀티계좌 시뮬레이션 (일반 수익률 가정)
  const sim = useMemo(
    /* 수익률 가정을 온보딩·전략 화면과 동일하게(PLUS 미국S&P500 연 10%) 맞춘다 —
     * 종목별 배당 가정으로 계산하면 목표 역산과 결과가 어긋나기 때문 */
    () =>
      simulatePortfolio({
        plan: allocation.plan,
        years,
        holdings: chosen,
        reinvest,
        blended: { y0: benchmark.yield, g: benchmark.divG, p: benchmark.priceG },
      }),
    [allocation, years, chosen, reinvest, benchmark]
  );

  const stage = NO_HEADER.includes(step) ? null : STAGE[step] ?? 0;

  const body = (
    <ChromeBody stage={stage} onBack={back} contentKey={step}>
      {/* 구글 인증 복귀·내 정보 확인 대기 — 주문 맥락 기본 문구 대신 로그인 맥락 문구로 */}
      {step === "authWait" && <Simulating msgs={["로그인 확인 중", "내 정보 불러오는 중"]} />}
      {/* 스플래시는 무조건 한 사이클 완주 — 완주 시점에
       *  · 세션이 이미 복원돼 있으면: 로그인 과정 없이 진입 분기(뉴스 홈 직행/온보딩)로
       *  · 세션은 없어도 인트로를 본 적 있으면(최초 설치 아님): 인트로 없이 로그인으로
       *  · 진짜 처음(또는 ?intro=1 시연 모드)이면: 인트로부터 */}
      {step === "splash" && (
        <Splash onStart={() => (user ? enterAfterLogin(user) : go(!forceIntro && hasSeenIntro() ? "login" : "intro"))} />
      )}
      {/* 인트로 통과 = "최초 설치 1회" 소진 — 이후 방문부터는 인트로를 건너뛴다.
       *  이미 로그인된 세션이면 로그인 화면도 건너뛴다 (설계 완료자는 뉴스 홈 직행) */}
      {step === "intro" && (
        <Intro
          onNext={() => {
            markIntroSeen();
            user ? enterAfterLogin(user) : go("login");
          }}
        />
      )}
      {/* 서비스 콘셉트 안내 후 로그인 → 회원가입은 건너뛰고 온보딩 훅 화면으로 진입 */}
      {/* 로그인 — 구글은 Supabase Auth 실연동(설정 시), 그 외/미설정은 데모 프로필 */}
      {step === "login" && (
        <Login
          onNext={(profile) => {
            // 데모 provider(네이버·카카오 등)는 프로필이 없다 → user 를 초기화해야
            // 이전 구글 로그인이 남긴 user 때문에 데모 분기(마이데이터 목업 연동)가 막히지 않는다.
            setUser(profile ?? null);
            if (profile) {
              enterAfterLogin(profile);
            } else {
              // 데모 — 저장된 스냅샷·세션과 무관하게 항상 첫 접속처럼
              // 온보딩 전체 시나리오(마이데이터 연동부터)를 처음부터 노출한다
              resetDemoState();
              go("mydata");
            }
          }}
        />
      )}
      {/* ② 마이데이터 동의 — 최적 솔루션을 위해 마이데이터를 연동한다는 안내.
       *  · 데모(네이버·카카오, user 없음): 목업 마이데이터 연동(동의 시트 → 로딩 → 불러온 계좌).
       *    완료 시 프로필·시드 반영(linkMydata) 후 계좌 분석으로 진입.
       *  · 구글 실계정(user 있음): 실제 데이터이므로 수기입력(계좌 + 나이 + 연소득). */}
      {step === "mydata" && (
        <MydataStep
          isDemo={!user}
          name={user?.name || MYDATA_PROFILE.name}
          forceManual={redesign}
          initial={redesign ? manualInit : null}
          onDemoLink={() => {
            linkMydata();
            go("accountsAnalysis");
          }}
          onManualNext={({ accounts, age: inAge, income: inIncome, finIncome: inFin = 0 }) => {
            setMydata(false); // 수기 입력이 최신 — 이후 계산은 연동 목업 대신 이 값을 쓴다
            setManualAccounts(accounts);
            saveManualAccounts(accounts); // DB(user_accounts, source='manual') 반영
            store.saveProfile?.({ age: inAge, totalIncome: inIncome, finIncome: inFin }); // profiles 반영 — 미로그인·미설정은 no-op
            setAge(inAge);
            setIncome(inIncome);
            setFinIncome(inFin); // 가입자격 게이트(금소세)·피부양자 방어 판정에 쓰인다
            go("accountsAnalysis");
          }}
        />
      )}
      {/* ③ 3종계좌 최적화 분석 — 납입 우선순위 + 신호등 상태(양호/개선/조치) + 짧은 설명 */}
      {step === "accountsAnalysis" && (
        <AccountsAnalysis
          mydata={mydata}
          manualAccounts={manualAccounts}
          income={income}
          finIncome={finIncome}
          age={age}
          taxPref={taxPref}
          onTaxPref={setTaxPref}
          isaRollover={isaRollover}
          onIsaRollover={setIsaRollover}
          liquidity={liquidity}
          onLiquidity={setLiquidity}
          perAccount={perAccount}
          onPerAccount={setPerAccount}
          onNext={() => go("passiveGoal")}
        />
      )}
      {/* ⑤ 목표 Passive Income — 전환 히어로 + 목표 슬라이더(기간=60−나이) */}
      {step === "passiveGoal" && (
        <PassiveGoal
          monthlyGoal={monthlyGoal}
          setMonthlyGoal={setMonthlyGoal}
          requiredNestEgg={scenario.requiredNestEgg}
          requiredMonthly={requiredMonthly}
          years={years}
          gap={scenario.gap}
          onNext={() => go("strategy")}
        />
      )}
      {/* ⑥ 최적 솔루션 도출 — 목표 반영 계좌별 월 투자금 배분(done 뷰) */}
      {step === "strategy" && (
        <Accounts
          mode="allocation"
          nextLabel="배분 방식 정하기"
          {...{ years, mydata, manualAccounts, answers, monthly, monthlyGoal, finIncome, income, age, taxPref, isaRollover, liquidity, perAccount, store, onLinked: linkMydata, onNext: () => go("allocate") }}
        />
      )}
      {/* ⑦ 정기적 투자금 배분 방식 — 추천 상품 자동배정 + 매수 주기(일/주/월) 게이미피케이션 */}
      {step === "allocate" && (
        <AllocationPlan
          manualAccounts={manualAccounts}
          income={income}
          finIncome={finIncome}
          age={age}
          taxPref={taxPref}
          isaRollover={isaRollover}
          liquidity={liquidity}
          perAccount={perAccount}
          monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
          years={years}
          initialAlloc={productAlloc}
          onNext={(alloc, cycle) => {
            setProductAlloc(alloc);
            if (cycle) setBuyCycle(cycle);
            go("result");
          }}
        />
      )}
      {step === "simulate" && <Simulating />}
      {step === "result" && (
        <Result
          sim={sim}
          allocation={allocation}
          chosen={chosen}
          years={years}
          reinvest={reinvest}
          age={age}
          goalNestEgg={scenario.requiredNestEgg}
          monthlyGoal={monthlyGoal}
          manualAccounts={manualAccounts}
          income={income}
          finIncome={finIncome}
          taxPref={taxPref}
          isaRollover={isaRollover}
          liquidity={liquidity}
          perAccount={perAccount}
          monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
          existingAssets={currentAssets}
          productAlloc={productAlloc}
          cycle={buyCycle}
          onNext={() => go("simulate")}
        />
      )}
      {/* 최종 진행 이후 — 뉴스·분석·자산 3탭 메인 앱 (자산 탭에서 투자 현황 관리) */}
      {step === "portfolio" && (
        <MainApp
          alloc={productAlloc}
          cycle={buyCycle}
          assets={currentAssets}
          defaultTab={homeTab}
          onLogout={async () => {
            /* 세션·로그인 정보 flush — Supabase signOut 으로 로컬 인증 토큰을 지우고,
             * 전체 리로드로 메모리에 남은 사용자 상태(계좌·배분 등)까지 완전히 비운다.
             * (설계 완료 스냅샷은 계정 소유 데이터라 유지 — 재로그인 시 뉴스 홈 직행용) */
            await logout();
            window.location.replace("/");
          }}
          onRestart={() => {
            // "다시 설계" — 기존 입력값을 채운 수기입력 화면부터 플로우를 다시 밟는다
            setSelected([]);
            setRedesign(true);
            setHomeTab("assets"); // 재설계를 완주하면 원래처럼 자산 탭으로 진입
            go("mydata");
          }}
        />
      )}
    </ChromeBody>
  );

  // 세법 팩트 코파일럿 — 셸의 자식으로 넣는다. PhoneShell 이 transform: scale() 을 쓰므로
  // body 로 포탈하면 ?frame=1 에서 베젤 밖으로 튀어나온다.
  // 로그인 이후 화면에서만, 그리고 배포 빌드에서는 VITE_CUBE_API_BASE 가 있을 때만 뜬다.
  const cube = <CubeCopilot step={step} framed={framed} />;

  return framed
    ? <PhoneShell>{body}{cube}</PhoneShell>
    : <PlainShell inset={deviceInset}>{body}{cube}</PlainShell>;
}
