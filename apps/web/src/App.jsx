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
import { onAuthChange, isReturningFromOAuth, logAuthDiagnostics, logout } from "./auth/google.js";
import { usePlanStore } from "./lib/usePlanStore.js";
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
      // 인증 완료 → 대기/스플래시/인트로/로그인 어디에 있든 마이데이터 단계로 진입
      if (profile) setStep((s) => (["authWait", "splash", "intro", "login"].includes(s) ? "mydata" : s));
      // 세션이 없는데 복귀 대기 중이면(인증 취소·실패) 로그인 화면으로
      else setStep((s) => (s === "authWait" ? "login" : s));
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
    if (step === "login") logout();
  }, [step]);

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
      {step === "intro" && <Intro onNext={() => go(user ? "mydata" : "login")} />}
      {/* 서비스 콘셉트 안내 후 로그인 → 회원가입은 건너뛰고 온보딩 훅 화면으로 진입 */}
      {/* 로그인 — 구글은 Supabase Auth 실연동(설정 시), 그 외/미설정은 데모 프로필 */}
      {step === "login" && (
        <Login
          onNext={(profile) => {
            // 데모 provider(네이버·카카오 등)는 프로필이 없다 → user 를 초기화해야
            // 이전 구글 로그인이 남긴 user 때문에 데모 분기(마이데이터 목업 연동)가 막히지 않는다.
            setUser(profile ?? null);
            go("mydata");
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
          onDemoLink={() => {
            linkMydata();
            go("accountsAnalysis");
          }}
          onManualNext={({ accounts, age: inAge, income: inIncome }) => {
            setManualAccounts(accounts);
            saveManualAccounts(accounts); // DB(user_accounts, source='manual') 반영
            setAge(inAge);
            setIncome(inIncome);
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
          {...{ years, mydata, manualAccounts, answers, monthly, monthlyGoal, finIncome, income, age, store, onLinked: linkMydata, onNext: () => go("allocate") }}
        />
      )}
      {/* ⑦ 정기적 투자금 배분 방식 — 추천 상품 자동배정 + 매수 주기(일/주/월) 게이미피케이션 */}
      {step === "allocate" && (
        <AllocationPlan
          manualAccounts={manualAccounts}
          income={income}
          monthlyContribution={scenario.gap > 0 ? requiredMonthly : 0}
          years={years}
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
          existingAssets={currentAssets}
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

  return framed ? <PhoneShell>{body}</PhoneShell> : <PlainShell inset={deviceInset}>{body}</PlainShell>;
}
