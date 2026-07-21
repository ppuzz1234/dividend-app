import { useState, useEffect, useMemo } from "react";
import { ChromeBody } from "./components/layout/ChromeBody.jsx";
import { PlainShell } from "./components/layout/PlainShell.jsx";
import { PhoneShell } from "./components/layout/PhoneShell.jsx";
import { STEPS, STAGE, NO_HEADER } from "./lib/flow.js";
import {
  STOCKS,
  simulatePortfolio,
  allocate,
  projectRetirementScenario,
  ETF_BENCHMARKS,
  MYDATA_ACCOUNTS,
  MYDATA_PROFILE,
} from "@devidend/core";
import { onAuthChange, isReturningFromOAuth, logAuthDiagnostics } from "./auth/google.js";
import { usePlanStore } from "./lib/usePlanStore.js";
import { Splash } from "./screens/Splash.jsx";
import { Login } from "./screens/Login.jsx";
import { Intro } from "./screens/Intro.jsx";
import { Onboarding } from "./screens/Onboarding.jsx";
import { ManualAccounts } from "./screens/ManualAccounts.jsx";
import { Accounts } from "./screens/Accounts.jsx";
import { ProductSetup } from "./screens/ProductSetup.jsx";
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
  // 구글 인증에서 막 돌아온 경우엔 스플래시·인트로를 건너뛰고 대기 화면에서 세션을 기다린다
  const [step, setStep] = useState(isReturningFromOAuth() ? "authWait" : "splash");
  const [selected, setSelected] = useState([]);
  const [seed] = useState(10000000); // 미연동 시 기본 시드
  const [years] = useState(20);
  const [monthly] = useState(500000);
  const [monthlyGoal, setMonthlyGoal] = useState(300); // 온보딩 훅: 목표 생활비(만원)
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
  // 계좌 현황 입력 — 화면 전환이 아니라 온보딩 위로 뜨는 바텀시트
  const [manualOpen, setManualOpen] = useState(false);
  // 계좌 별 투자 상품 설정 결과 — { [accountId]: { [productCode]: 월배분액(원) } }
  const [productAlloc, setProductAlloc] = useState({});
  /* 계좌·플랜 저장소 — Supabase 미설정이거나 로그인 전이면 no-op.
   * (로그인 전 조회는 RLS·권한에 막혀 401 만 발생시키므로 아예 호출하지 않는다) */
  const store = usePlanStore({ enabled: !!user?.userId });

  /* 구글 SSO 세션 구독 — 초기 복원과 로그인 완료를 모두 통지받는다.
   * (getSession() 즉시 호출은 URL 해시 파싱 전이라 null 이 나올 수 있어 로그인 화면으로
   *  되돌아가는 원인이 된다.) Supabase 미설정이면 항상 null 이라 기존 데모 흐름 유지. */
  useEffect(() => {
    logAuthDiagnostics(); // 콘솔에 복귀 상태 요약 (설정 점검용)
    const off = onAuthChange((profile) => {
      setUser(profile);
      // 인증 완료 → 대기/스플래시/인트로/로그인 어디에 있든 온보딩으로 진입
      if (profile) setStep((s) => (["authWait", "splash", "intro", "login"].includes(s) ? "onboarding" : s));
      // 세션이 없는데 복귀 대기 중이면(인증 취소·실패) 로그인 화면으로
      else setStep((s) => (s === "authWait" ? "login" : s));
    });
    return off;
  }, []);

  // 저장된 최신 계획이 있으면 목표 생활비를 이어받는다(재방문 시 이전 설정 복원)
  useEffect(() => {
    if (store.plan?.monthly_goal_manwon) setMonthlyGoal(store.plan.monthly_goal_manwon);
  }, [store.plan]);

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
  /* 현재 보유 자산 — 수기 입력 합계 > 마이데이터 총액 > 기본 시드 */
  const currentAssets = useMemo(() => {
    if (manualAccounts) return Object.values(manualAccounts).reduce((s, v) => s + (v || 0), 0);
    return mydata ? mydataTotal : seed;
  }, [manualAccounts, mydata, mydataTotal, seed]);

  /* 목표 생활비 → 필요 자산 → 월 투자금 역산.
   * 전략 화면과 같은 계산을 여기서도 수행해, 최종 시뮬레이션이
   * 하드코딩된 값이 아니라 사용자가 정한 목표를 그대로 따르게 한다. */
  const scenario = useMemo(
    () => projectRetirementScenario({ monthlyLivingCost: monthlyGoal * 10_000, currentAssets, years }),
    [monthlyGoal, currentAssets, years]
  );
  const requiredMonthly = scenario.perEtf[0]?.requiredMonthly ?? monthly;
  const benchmark = ETF_BENCHMARKS[0]; // PLUS 미국S&P500 — 전 화면 공통 수익률 가정(연 10%)
  const effectiveSeed = currentAssets;

  // 로딩(simulate) 단계 → 자동으로 자산 탭(portfolio)으로 진행 ("최종 진행하기" 직후 대기 화면)
  useEffect(() => {
    if (step === "simulate") {
      const t = setTimeout(() => go("portfolio"), 2600);
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
      {/* 구글 인증 복귀 대기 — onAuthChange 가 세션을 전달하면 즉시 온보딩으로 넘어간다 */}
      {step === "authWait" && <Simulating />}
      {step === "splash" && <Splash onStart={() => go("intro")} />}
      {/* 이미 로그인된 세션이면 로그인 화면을 건너뛴다 */}
      {step === "intro" && <Intro onNext={() => go(user ? "onboarding" : "login")} />}
      {/* 서비스 콘셉트 안내 후 로그인 → 회원가입은 건너뛰고 온보딩 훅 화면으로 진입 */}
      {/* 로그인 — 구글은 Supabase Auth 실연동(설정 시), 그 외/미설정은 데모 프로필 */}
      {step === "login" && (
        <Login
          onNext={(profile) => {
            if (profile) setUser(profile);
            go("onboarding");
          }}
        />
      )}
      {/* 목표 설정 후 → 계좌 현황 입력 바텀시트를 띄운다(화면 전환 대신 시트) */}
      {step === "onboarding" && (
        <Onboarding userName={user?.name} monthlyGoal={monthlyGoal} setMonthlyGoal={setMonthlyGoal} onNext={() => setManualOpen(true)} />
      )}
      {step === "accounts" && (
        <Accounts {...{ mydata, manualAccounts, answers, monthly, monthlyGoal, finIncome, income, age, store, onLinked: linkMydata, onNext: () => go("productSetup") }} />
      )}
      {/* 계좌 별 투자 상품 설정 — 계좌별 월 투자금 내에서 추천 상품 선택 + 금액 배분 */}
      {step === "productSetup" && (
        <ProductSetup
          manualAccounts={manualAccounts}
          income={income}
          monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
          initialAlloc={productAlloc}
          onNext={(alloc) => {
            setProductAlloc(alloc);
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
          monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
          productAlloc={productAlloc}
          onNext={() => go("simulate")}
        />
      )}
      {/* 최종 진행 이후 — 뉴스·분석·자산 3탭 메인 앱 (자산 탭에서 투자 현황 관리) */}
      {step === "portfolio" && (
        <MainApp
          alloc={productAlloc}
          onRestart={() => {
            setSelected([]);
            go("splash");
          }}
        />
      )}
    </ChromeBody>
  );

  return (
    <>
      {framed ? <PhoneShell>{body}</PhoneShell> : <PlainShell inset={deviceInset}>{body}</PlainShell>}
      {/* 계좌 현황 입력 시트 — 온보딩 위로 슬라이드업, 제출 시 전략(accounts)으로 진행 */}
      {manualOpen && (
        <ManualAccounts
          onNext={(values) => {
            setManualAccounts(values);
            saveManualAccounts(values); // DB(user_accounts, source='manual') 반영
            setManualOpen(false);
            go("accounts");
          }}
          onClose={() => setManualOpen(false)}
        />
      )}
    </>
  );
}
