import { useState, useEffect, useMemo } from "react";
import { ChromeBody } from "./components/layout/ChromeBody.jsx";
import { PlainShell } from "./components/layout/PlainShell.jsx";
import { PhoneShell } from "./components/layout/PhoneShell.jsx";
import { STEPS, STAGE, NO_HEADER } from "./lib/flow.js";
import {
  STOCKS,
  simulatePortfolio,
  allocate,
  buildStrategy,
  buildOrderPlan,
  MYDATA_ACCOUNTS,
  MYDATA_PROFILE,
} from "@devidend/core";
import { Splash } from "./screens/Splash.jsx";
import { Login } from "./screens/Login.jsx";
import { Intro } from "./screens/Intro.jsx";
import { Onboarding } from "./screens/Onboarding.jsx";
import { Accounts } from "./screens/Accounts.jsx";
import { Picker } from "./screens/Picker.jsx";
import { Simulating } from "./screens/Simulating.jsx";
import { Result } from "./screens/Result.jsx";
import { Order } from "./screens/Order.jsx";
import { Done } from "./screens/Done.jsx";

/* ------------------------------------------------------------------ *
 *  GENIUS — 상장 배당주 투자·절세 시뮬레이터
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
  const [step, setStep] = useState("splash");
  const [region, setRegion] = useState("ALL");
  const [query, setQuery] = useState("");
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
  // 온보딩 시트의 "마이데이터 연동하기" 진입 여부 → 계좌 화면을 GENIUS 로딩부터 자동 시작
  const [autoLinkAccounts, setAutoLinkAccounts] = useState(false);

  // 전략 화면의 마이데이터 연동 완료 → 프로필·시드 반영
  const linkMydata = () => {
    setMydata(true);
    setAge(MYDATA_PROFILE.age);
    setFinIncome(MYDATA_PROFILE.financialIncomePrevYear);
    setIncome(MYDATA_PROFILE.totalIncomePrevYear);
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
  const effectiveSeed = mydata ? mydataTotal : seed;

  // 시뮬레이션 단계 → 자동 진행
  useEffect(() => {
    if (step === "simulate") {
      const t = setTimeout(() => go("result"), 2600);
      return () => clearTimeout(t);
    }
  }, [step]);

  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const chosen = useMemo(
    () => (selected.length ? STOCKS.filter((s) => selected.includes(s.id)) : STOCKS.filter((s) => s.elite)),
    [selected]
  );
  // ③ 계좌 운용 전략 (현황 여력 × 목표 → 상세 방안 + 종목 유형)
  const strategy = useMemo(() => buildStrategy({ goal, income, mydata }), [goal, income, mydata]);
  const chosenCats = strategy.chosenCats;
  // ⑤ 배분 설계 엔진 → 계좌별 배분안
  const allocation = useMemo(
    () => allocate({ seed: effectiveSeed, monthly, age, income, goal }),
    [effectiveSeed, monthly, age, income, goal]
  );
  // ④ 배분안 기반 멀티계좌 시뮬레이션 (일반 수익률 가정)
  const sim = useMemo(
    () => simulatePortfolio({ plan: allocation.plan, years, holdings: chosen, reinvest }),
    [allocation, years, chosen, reinvest]
  );
  // ⑥ 배분안 × 선택 종목 → 주문 계획
  const orderPlan = useMemo(() => buildOrderPlan({ plan: allocation.plan, stocks: chosen }), [allocation, chosen]);

  const stage = NO_HEADER.includes(step) ? null : STAGE[step] ?? 0;

  const body = (
    <ChromeBody stage={stage} onBack={back} contentKey={step}>
      {step === "splash" && <Splash onStart={() => go("intro")} />}
      {step === "intro" && <Intro onNext={() => go("login")} />}
      {/* 서비스 콘셉트 안내 후 로그인 → 회원가입은 건너뛰고 온보딩 훅 화면으로 진입 */}
      {step === "login" && <Login onNext={() => go("onboarding")} />}
      {/* 온보딩 시트의 "마이데이터 연동하기" → 계좌 화면을 GENIUS 로딩부터 자동 시작 */}
      {step === "onboarding" && (
        <Onboarding
          monthlyGoal={monthlyGoal}
          setMonthlyGoal={setMonthlyGoal}
          onNext={() => {
            setAutoLinkAccounts(true);
            go("accounts");
          }}
        />
      )}
      {step === "accounts" && (
        <Accounts {...{ mydata, answers, monthly, finIncome, income, age, autoLoad: autoLinkAccounts, onLinked: linkMydata, onNext: () => go("simulate") }} />
      )}
      {step === "simulate" && <Simulating />}
      {step === "result" && (
        <Result sim={sim} allocation={allocation} chosen={chosen} years={years} reinvest={reinvest} age={age} onNext={() => go("picker")} />
      )}
      {step === "picker" && (
        <Picker
          {...{ chosenCats, region, setRegion, query, setQuery, selected, toggle, onNext: () => go("order") }}
        />
      )}
      {step === "order" && <Order orderPlan={orderPlan} onNext={() => go("done")} />}
      {step === "done" && (
        <Done
          sim={sim}
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
