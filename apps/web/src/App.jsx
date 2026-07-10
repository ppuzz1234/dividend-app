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
  buildRiskProfile,
  surveyComplete,
  assessCapacity,
  buildRebalance,
  buildOrderPlan,
  MYDATA_ACCOUNTS,
} from "@devidend/core";
import { Splash } from "./screens/Splash.jsx";
import { Signup } from "./screens/Signup.jsx";
import { Survey } from "./screens/Survey.jsx";
import { Mydata } from "./screens/Mydata.jsx";
import { Capacity } from "./screens/Capacity.jsx";
import { Accounts } from "./screens/Accounts.jsx";
import { Rebalance } from "./screens/Rebalance.jsx";
import { Plan } from "./screens/Plan.jsx";
import { Picker } from "./screens/Picker.jsx";
import { Simulating } from "./screens/Simulating.jsx";
import { Result } from "./screens/Result.jsx";
import { Order } from "./screens/Order.jsx";
import { Done } from "./screens/Done.jsx";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 — 상장 배당주 투자 시뮬레이터
 *  App 은 단계 상태 관리와 화면 조립만 담당. (UI/스타일은 각 화면 모듈)
 * ------------------------------------------------------------------ */
export default function App() {
  // 발표용 아이폰 베젤 모드 (?frame=1). 기본은 일반 풀뷰(실서비스).
  const framed = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("frame");
  const [step, setStep] = useState("splash");
  const [region, setRegion] = useState("ALL");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [seed, setSeed] = useState(10000000);
  const [years, setYears] = useState(20);
  const [monthly, setMonthly] = useState(500000);
  const [reinvest, setReinvest] = useState(true);
  const [mydata, setMydata] = useState(false);
  // 개인 프로파일 (배분 엔진 입력)
  const [age, setAge] = useState(40);
  const [income, setIncome] = useState(50000000);
  const [goal, setGoal] = useState("retirement"); // retirement | cashflow
  // ① 성향 서베이 응답
  const [answers, setAnswers] = useState({});
  // ② 여력 진단 입력
  const [monthlyExpense, setMonthlyExpense] = useState(2500000);
  const [cash, setCash] = useState(30000000);

  const go = (s) => {
    setStep(s);
    document.getElementById("scrollArea")?.scrollTo(0, 0);
  };
  const idx = STEPS.indexOf(step);
  const back = () => idx > 1 && go(STEPS[idx - 1]);

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
  // ① 서베이 응답 → 성향 프로파일
  const riskProfile = useMemo(() => (surveyComplete(answers) ? buildRiskProfile(answers) : null), [answers]);
  // ② 소득·지출·현금 → 투자 여력 진단
  const cap = useMemo(
    () => assessCapacity({ annualIncome: income, monthlyExpense, cash }),
    [income, monthlyExpense, cash]
  );
  // ③ 계좌 운용 전략 (현황 여력 × 목표 → 상세 방안 + 종목 유형)
  const strategy = useMemo(() => buildStrategy({ goal, income, mydata }), [goal, income, mydata]);
  const chosenCats = strategy.chosenCats;
  // ④ 보유 상품 × 편입가능표 → 계좌 조정 제안
  const rebalance = useMemo(() => buildRebalance(mydata ? MYDATA_ACCOUNTS : null), [mydata]);
  // ⑤ 배분 설계 엔진 → 계좌별 배분안
  const allocation = useMemo(
    () => allocate({ seed, monthly, age, income, goal }),
    [seed, monthly, age, income, goal]
  );
  // ⑥ 배분안 기반 멀티계좌 시뮬레이션
  const sim = useMemo(
    () => simulatePortfolio({ plan: allocation.plan, years, holdings: chosen, reinvest }),
    [allocation, years, chosen, reinvest]
  );
  // ⑦ 배분안 × 선택 종목 → 주문 계획
  const orderPlan = useMemo(() => buildOrderPlan({ plan: allocation.plan, stocks: chosen }), [allocation, chosen]);

  const stage = NO_HEADER.includes(step) ? null : STAGE[step] ?? 0;

  const body = (
    <ChromeBody stage={stage} onBack={back} contentKey={step}>
      {step === "splash" && <Splash onStart={() => go("signup")} />}
      {step === "signup" && <Signup onNext={() => go("survey")} />}
      {step === "survey" && (
        <Survey
          {...{ answers, setAnswers }}
          onNext={() => {
            if (answers.goal) setGoal(answers.goal); // 서베이 목표 → 전략 엔진 목표
            go("mydata");
          }}
        />
      )}
      {step === "mydata" && (
        <Mydata
          {...{ mydata, setMydata, age, setAge, income, setIncome, onNext: () => go("capacity") }}
        />
      )}
      {step === "capacity" && (
        <Capacity
          {...{ cap, monthlyExpense, setMonthlyExpense, cash, setCash, seed, setSeed, monthly, setMonthly, onNext: () => go("accounts") }}
        />
      )}
      {step === "accounts" && <Accounts {...{ goal, setGoal, mydata, strategy, onNext: () => go("rebalance") }} />}
      {step === "rebalance" && <Rebalance {...{ mydata, rebalance, onNext: () => go("plan") }} />}
      {step === "plan" && (
        <Plan
          {...{ allocation, strategy, riskProfile, years, setYears, reinvest, setReinvest, onNext: () => go("picker") }}
        />
      )}
      {step === "picker" && (
        <Picker
          {...{ chosenCats, region, setRegion, query, setQuery, selected, toggle, onNext: () => go("simulate") }}
        />
      )}
      {step === "simulate" && <Simulating />}
      {step === "result" && (
        <Result sim={sim} allocation={allocation} chosen={chosen} years={years} reinvest={reinvest} onNext={() => go("order")} />
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

  return framed ? <PhoneShell>{body}</PhoneShell> : <PlainShell>{body}</PlainShell>;
}
