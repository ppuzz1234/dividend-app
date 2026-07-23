import { useState } from "react";
import { ArrowRight, BadgeCheck, Pencil } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { MydataConnect } from "./MydataConnect.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./MydataStep.module.css";

/* 수기입력(구글) 계좌 슬라이더 — 0(계좌 없음)~연 납입한도, 50만원 단위 */
const STEP = 500_000;
const ACCOUNTS = [
  { id: "isa", name: "ISA", max: 20_000_000, hint: "연 2,000만원까지" },
  { id: "pensionSavings", name: "연금저축", max: 18_000_000, hint: "납입 1,800만·공제 600만" },
  { id: "irp", name: "IRP", max: 18_000_000, hint: "연금저축과 합산 1,800만" },
  { id: "general", name: "일반 위탁계좌", max: 100_000_000, hint: "한도·상품 제약 없음" },
];
const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* ② 마이데이터 동의 — 최적의 솔루션을 위해 마이데이터를 연동한다는 안내 화면.
 *  · 데모(네이버·카카오): 목업 마이데이터 연동(MydataConnect: 동의 시트 → 로딩 → 불러온 계좌)
 *  · 구글 실계정: 실제 데이터 입력이므로 '수기입력'(계좌 현황 + 나이 + 연소득)으로 진행 */
export function MydataStep({ isDemo, onDemoLink, onManualNext }) {
  // ── 데모: 목업 마이데이터 연동 (MydataConnect 가 화면 레이아웃을 직접 소유) ──
  if (isDemo) {
    return <MydataConnect onNext={onDemoLink} />;
  }

  // ── 구글: 수기입력(계좌 + 나이 + 연소득) ──
  return <ManualForm onNext={onManualNext} />;
}

function ManualForm({ onNext }) {
  const [values, setValues] = useState({ isa: 0, pensionSavings: 0, irp: 0, general: 0 });
  const [age, setAge] = useState("");
  const [income, setIncome] = useState(""); // 연소득(만원)
  const set = (id, v) => setValues((s) => ({ ...s, [id]: v }));
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const owned = ACCOUNTS.filter((a) => values[a.id] > 0);
  const ready = age.trim() !== "" && income.trim() !== "";

  const submit = () => {
    if (!ready) return;
    onNext?.({
      accounts: values,
      age: digits(age),
      income: digits(income) * 10_000, // 만원 → 원
    });
  };

  return (
    <Pad
      footer={
        <Button onClick={submit} icon={ArrowRight} disabled={!ready}>
          {ready ? "이 정보로 계좌 분석하기" : "나이·연소득을 입력해 주세요"}
        </Button>
      }
    >
      <Heading sub="구글 로그인은 실제 데이터로 진행돼요. 흩어진 계좌 현황과 나이·연소득을 직접 입력해 주세요.">
        내 정보 직접 입력
      </Heading>

      {/* 계좌 현황 — 올해 납입액(=현재 평가액 가정) */}
      <div className={styles.sectionLabel}>계좌 현황</div>
      <div className={styles.list}>
        {ACCOUNTS.map((a) => {
          const v = values[a.id];
          const none = v === 0;
          return (
            <div key={a.id} className={cx(styles.card, !none && styles.cardOn)}>
              <div className={styles.top}>
                <span className={styles.name}>{a.name}</span>
                <span className={cx(styles.value, none && styles.valueNone)}>{none ? "계좌 없음" : fmtKRW(v)}</span>
              </div>
              <input
                type="range"
                className="rng"
                min={0}
                max={a.max}
                step={STEP}
                value={v}
                aria-label={`${a.name} 올해 납입액`}
                onChange={(e) => set(a.id, Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <div className={styles.scale}>
                <span>계좌 없음</span>
                <span className={styles.hint}>{a.hint}</span>
                <span>{fmtKRW(a.max)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.summary}>
        <span className={styles.sumK}>{owned.length ? `보유 계좌 ${owned.length}개` : "보유 계좌 없음"}</span>
        <b className={styles.sumV}>{fmtKRW(total)}</b>
      </div>

      {/* 나이 · 연소득 — 계좌 최적화 가설과 투자기간(60−나이) 산정에 사용 */}
      <div className={styles.sectionLabel}>나이 · 연소득</div>
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.fieldK}>
            <Pencil size={12} /> 나이
          </span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(String(digits(e.target.value) || ""))}
              placeholder="45"
            />
            <span className={styles.unit}>세</span>
          </div>
        </label>
        <label className={styles.field}>
          <span className={styles.fieldK}>
            <Pencil size={12} /> 전년도 연소득
          </span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={income}
              onChange={(e) => setIncome(String(digits(e.target.value) || ""))}
              placeholder="9000"
            />
            <span className={styles.unit}>만원</span>
          </div>
        </label>
      </div>
      <p className={styles.hint2}>
        <BadgeCheck size={12} /> 총급여 5,500만원 이하면 연금 세액공제율이 16.5%로 높아져요. 은퇴 정년은 60세로 계산돼요.
      </p>
    </Pad>
  );
}
