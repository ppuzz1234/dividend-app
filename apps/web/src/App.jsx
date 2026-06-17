import { useState, useEffect, useMemo } from "react";
import { DeviceFrame } from "./components/layout/DeviceFrame.jsx";
import { STEPS, STAGE, NO_HEADER } from "./lib/flow.js";
import { STOCKS } from "./data/stocks.js";
import { simulate } from "./lib/simulate.js";
import { Splash } from "./screens/Splash.jsx";
import { Signup } from "./screens/Signup.jsx";
import { Mydata } from "./screens/Mydata.jsx";
import { Recommend } from "./screens/Recommend.jsx";
import { Picker } from "./screens/Picker.jsx";
import { Seed } from "./screens/Seed.jsx";
import { Period } from "./screens/Period.jsx";
import { Account } from "./screens/Account.jsx";
import { Simulating } from "./screens/Simulating.jsx";
import { Result } from "./screens/Result.jsx";
import { Done } from "./screens/Done.jsx";

/* ------------------------------------------------------------------ *
 *  배당 눈덩이 — 상장 배당주 투자 시뮬레이터
 *  App 은 단계 상태 관리와 화면 조립만 담당. (UI/스타일은 각 화면 모듈)
 * ------------------------------------------------------------------ */
export default function App() {
  const [step, setStep] = useState("splash");
  const [path, setPath] = useState("platform"); // platform | manual
  const [pmode, setPmode] = useState("top3"); // top3 | dividend
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
  const sim = useMemo(
    () => simulate({ seed, monthly, years, holdings: chosen, reinvest, account }),
    [seed, monthly, years, chosen, reinvest, account]
  );

  const stage = NO_HEADER.includes(step) ? null : STAGE[step] ?? 0;

  return (
    <DeviceFrame stage={stage} onBack={back} contentKey={step}>
      {step === "splash" && <Splash onStart={() => go("signup")} />}
      {step === "signup" && <Signup onNext={() => go("mydata")} />}
      {step === "mydata" && <Mydata mydata={mydata} setMydata={setMydata} onNext={() => go("recommend")} />}
      {step === "recommend" && <Recommend path={path} setPath={setPath} onNext={() => go("picker")} />}
      {step === "picker" && (
        <Picker
          {...{ path, pmode, setPmode, region, setRegion, divType, setDivType, query, setQuery, selected, toggle, onNext: () => go("seed") }}
        />
      )}
      {step === "seed" && <Seed seed={seed} setSeed={setSeed} onNext={() => go("period")} />}
      {step === "period" && (
        <Period {...{ years, setYears, monthly, setMonthly, reinvest, setReinvest, onNext: () => go("account") }} />
      )}
      {step === "account" && <Account {...{ account, setAccount, mydata, onNext: () => go("simulate") }} />}
      {step === "simulate" && <Simulating />}
      {step === "result" && <Result sim={sim} chosen={chosen} years={years} reinvest={reinvest} onNext={() => go("done")} />}
      {step === "done" && (
        <Done
          sim={sim}
          onRestart={() => {
            setSelected([]);
            go("splash");
          }}
        />
      )}
    </DeviceFrame>
  );
}
