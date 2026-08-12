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

/* 소득 유형 칩 — "얼마"보다 "어떤 소득"을 먼저 물어 총소득/금융소득 포함관계
 * 혼동을 없앤다. 유형에 따라 필요한 금액 필드만 노출된다 */
const INCOME_TYPES = [
  { id: "none", label: "없음" },
  { id: "work", label: "근로 · 사업" },
  { id: "fin", label: "금융 (이자·배당)" },
  { id: "mixed", label: "섞여 있어요" },
];

function ManualForm({ onNext, initial }) {
  const [values, setValues] = useState({ isa: 0, pensionSavings: 0, irp: 0, general: 0, ...(initial?.accounts || {}) });
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  // 재설계 진입 시 기존 소득값에서 유형·금액 역산 (원 → 만원)
  const initInc = initial?.income || 0;
  const initFin = initial?.finIncome || 0;
  const [incomeType, setIncomeType] = useState(
    initInc <= 0 ? "none" : initFin >= initInc ? "fin" : initFin > 0 ? "mixed" : "work"
  );
  const [workAmt, setWorkAmt] = useState(initInc > initFin ? String(Math.round((initInc - initFin) / 10_000)) : "");
  const [finAmt, setFinAmt] = useState(initFin > 0 ? String(Math.round(initFin / 10_000)) : "");
  const set = (id, v) => setValues((s) => ({ ...s, [id]: v }));
  const total = Object.values(values).reduce((s, v) => s + v, 0);
  const owned = ACCOUNTS.filter((a) => values[a.id] > 0);
  // 나이만 필수 — 소득 유형 기본값(없음)이라 무소득 주부·은퇴자·미성년은 바로 진행
  const ready = age.trim() !== "";

  const submit = () => {
    if (!ready) return;
    // 유형별로 총소득·금융소득을 합산 — 포함관계 계산을 사용자 대신 여기서 처리
    const w = digits(workAmt) * 10_000; // 만원 → 원
    const f = digits(finAmt) * 10_000;
    const finWon = incomeType === "fin" ? f : incomeType === "mixed" ? f : 0;
    const incomeWon = incomeType === "work" ? w : incomeType === "fin" ? f : incomeType === "mixed" ? w + f : 0;
    onNext?.({
      accounts: values,
      age: digits(age),
      income: incomeWon,
      finIncome: finWon,
    });
  };

  return (
    <Pad
      footer={
        <Button onClick={submit} icon={ArrowRight} disabled={!ready}>
          {ready ? "이 정보로 계좌 분석하기" : "나이를 입력해 주세요"}
        </Button>
      }
    >
      <Heading sub="구글 로그인은 실제 데이터로 진행돼요. 흩어진 계좌 현황과 나이·연소득을 직접 입력해 주세요.">
        내 정보 직접 입력
      </Heading>

      {/* 나이 — 계좌 최적화 가설과 투자기간(60−나이) 산정에 쓰는 필수 입력이라 맨 위에 배치 */}
      <div className={styles.sectionLabel}>나이 · 전년도 소득</div>
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
      </div>

      {/* 소득 유형 칩 — 유형을 먼저 고르면 필요한 금액 필드만 나타난다 */}
      <div className={styles.chipLabel}>전년도에 어떤 소득이 있으셨나요?</div>
      <div className={styles.chips} role="radiogroup" aria-label="전년도 소득 유형">
        {INCOME_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={incomeType === t.id}
            className={cx(styles.chip, incomeType === t.id && styles.chipOn)}
            onClick={() => setIncomeType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {incomeType !== "none" && (
        <div className={styles.fields} style={{ marginTop: 10 }}>
          {(incomeType === "work" || incomeType === "mixed") && (
            <label className={cx(styles.field, workAmt.trim() !== "" && styles.fieldOn)}>
              <span className={styles.fieldK}>
                {incomeType === "mixed" ? "근로 · 사업소득" : "연소득 (근로 · 사업)"}
                <span className={styles.editBadge} aria-hidden="true">
                  <Pencil size={11} strokeWidth={2.6} />
                </span>
              </span>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  /* 표시만 천단위 콤마 — 상태는 숫자 문자열 그대로, digits() 가 콤마를 걷어낸다 */
                  value={workAmt ? Number(workAmt).toLocaleString() : ""}
                  onChange={(e) => setWorkAmt(String(digits(e.target.value) || ""))}
                  placeholder="예) 5,000"
                />
                <span className={styles.unit}>만원</span>
              </div>
            </label>
          )}
          {(incomeType === "fin" || incomeType === "mixed") && (
            <label className={cx(styles.field, finAmt.trim() !== "" && styles.fieldOn)}>
              <span className={styles.fieldK}>
                금융소득 (이자 · 배당)
                <span className={styles.editBadge} aria-hidden="true">
                  <Pencil size={11} strokeWidth={2.6} />
                </span>
              </span>
              <div className={styles.inputWrap}>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  value={finAmt ? Number(finAmt).toLocaleString() : ""}
                  onChange={(e) => setFinAmt(String(digits(e.target.value) || ""))}
                  placeholder="예) 300"
                />
                <span className={styles.unit}>만원</span>
              </div>
            </label>
          )}
        </div>
      )}
      <p className={styles.hint2}>
        <BadgeCheck size={12} />
        {incomeType === "none"
          ? "소득이 없어도 ISA 비과세(서민형 400만원)와 연금저축은 활용할 수 있어요."
          : incomeType === "fin"
            ? "금융소득이 연 2,000만원을 넘으면 ISA 가입이 제한돼요."
            : "총급여 5,500만원 이하면 연금 세액공제율이 16.5%로 높아져요."}
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
