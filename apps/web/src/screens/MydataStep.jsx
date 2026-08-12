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
  // 일반계좌는 한도가 없어 최대 10억까지 입력 가능하게 잡는다
  { id: "general", name: "일반 위탁계좌", max: 1_000_000_000, hint: "한도·상품 제약 없음" },
];
const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* ② 마이데이터 동의 — 최적의 솔루션을 위해 마이데이터를 연동한다는 안내 화면.
 *  · 데모(네이버·카카오): 목업 마이데이터 연동(MydataConnect: 동의 시트 → 로딩 → 불러온 계좌)
 *  · 구글 실계정: 실제 데이터 입력이므로 '수기입력'(계좌 현황 + 나이 + 연소득)으로 진행
 *  · forceManual: 자산 탭 "다시 설계" 재진입 — 데모여도 수기입력 폼을 띄우고,
 *    initial(기존 계좌·나이·연소득)을 채워 수정에서 시작하게 한다 */
export function MydataStep({ isDemo, name, onDemoLink, onManualNext, forceManual = false, initial = null }) {
  // ── 데모: 목업 마이데이터 연동 (MydataConnect 가 화면 레이아웃을 직접 소유) ──
  if (isDemo && !forceManual) {
    return <MydataConnect onNext={onDemoLink} name={name} />;
  }

  // ── 구글 또는 재설계: 수기입력(계좌 + 나이 + 연소득) ──
  return <ManualForm onNext={onManualNext} initial={initial} />;
}

function ManualForm({ onNext, initial }) {
  const [values, setValues] = useState({ isa: 0, pensionSavings: 0, irp: 0, general: 0, ...(initial?.accounts || {}) });
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  // 연소득(만원) — initial.income 은 원 단위라 만원으로 환산해 보여준다
  const [income, setIncome] = useState(initial?.income ? String(Math.round(initial.income / 10_000)) : "");
  /* 금융소득(만원, 선택) — ISA 가입 제한(금소세)·피부양자 방어 판정에 쓰인다.
   * 미입력은 0(금융소득 없음)으로 처리한다 */
  const [finIncome, setFinIncome] = useState(initial?.finIncome ? String(Math.round(initial.finIncome / 10_000)) : "");
  const set = (id, v) => setValues((s) => ({ ...s, [id]: v }));
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const owned = ACCOUNTS.filter((a) => values[a.id] > 0);
  const ready = age.trim() !== "" && income.trim() !== "";

  const submit = () => {
    if (!ready) return;
    // 금융소득은 총소득을 넘을 수 없다 — 초과 입력은 총소득으로 클램프
    const incomeWon = digits(income) * 10_000;
    const finWon = Math.min(digits(finIncome) * 10_000, incomeWon);
    onNext?.({
      accounts: values,
      age: digits(age),
      income: incomeWon, // 만원 → 원
      finIncome: finWon,
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

      {/* 나이 · 연소득 — 계좌 최적화 가설과 투자기간(60−나이) 산정에 쓰는 필수 입력이라 맨 위에 배치 */}
      <div className={styles.sectionLabel}>나이 · 연소득</div>
      <div className={styles.fields}>
        <label className={cx(styles.field, age.trim() !== "" && styles.fieldOn)}>
          <span className={styles.fieldK}>
            나이
            <span className={styles.editBadge} aria-hidden="true">
              <Pencil size={11} strokeWidth={2.6} />
            </span>
          </span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(String(digits(e.target.value) || ""))}
              placeholder="예) 32"
            />
            <span className={styles.unit}>세</span>
          </div>
        </label>
        <label className={cx(styles.field, income.trim() !== "" && styles.fieldOn)}>
          <span className={styles.fieldK}>
            전년도 연소득
            <span className={styles.editBadge} aria-hidden="true">
              <Pencil size={11} strokeWidth={2.6} />
            </span>
          </span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              inputMode="numeric"
              /* 표시만 천단위 콤마 — 상태(income)는 숫자 문자열 그대로 유지하고,
               * onChange 의 digits() 가 콤마를 걷어내 파싱하므로 로직은 그대로다 */
              value={income ? Number(income).toLocaleString() : ""}
              onChange={(e) => setIncome(String(digits(e.target.value) || ""))}
              placeholder="예) 9,000"
            />
            <span className={styles.unit}>만원</span>
          </div>
        </label>
        <label className={cx(styles.field, finIncome.trim() !== "" && styles.fieldOn)}>
          <span className={styles.fieldK}>
            이 중 금융소득 (이자·배당, 선택)
            <span className={styles.editBadge} aria-hidden="true">
              <Pencil size={11} strokeWidth={2.6} />
            </span>
          </span>
          <div className={styles.inputWrap}>
            <input
              className={styles.input}
              inputMode="numeric"
              value={finIncome ? Number(finIncome).toLocaleString() : ""}
              onChange={(e) => setFinIncome(String(digits(e.target.value) || ""))}
              placeholder="없으면 비워두세요"
            />
            <span className={styles.unit}>만원</span>
          </div>
        </label>
      </div>
      <p className={styles.hint2}>
        <BadgeCheck size={12} /> 총급여 5,500만원 이하면 연금 세액공제율이 16.5%로 높아져요. 금융소득이 연 2,000만원을 넘으면 ISA 가입이 제한돼요.
      </p>

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
    </Pad>
  );
}
