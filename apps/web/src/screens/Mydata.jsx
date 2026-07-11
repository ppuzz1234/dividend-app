import { useState } from "react";
import { ArrowRight, RefreshCw, Lock, BadgeCheck, Plus, Building2, Check, Wallet } from "lucide-react";
import { MYDATA_ACCOUNTS } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Field } from "../components/ui/Field.jsx";
import { cx } from "../lib/cx.js";
import { fmtKRW } from "../lib/format.js";
import { C } from "../theme/tokens.js";
import styles from "./Mydata.module.css";

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

/* 마이데이터로 불러오는 4가지 계좌 유형 (mock 스냅샷과 매핑) */
const ACCT_TYPES = [
  { id: "general", name: "일반 위탁계좌" },
  { id: "isa", name: "ISA" },
  { id: "pension", name: "연금저축" },
  { id: "irp", name: "IRP" },
];

const MYDATA_AGE = 45; // 마이데이터(본인 인증)로 불러온 나이
const MONTHLY_PRESETS = [10, 30, 50, 100]; // 만원

export function Mydata({ mydata, setMydata, age, setAge, income, setIncome, monthly, setMonthly, mydataTotal = 0, onNext }) {
  // 연소득은 마이데이터로 받을 수 없음 → 국세청 연동 또는 직접입력
  const [incomeSource, setIncomeSource] = useState(null); // 'nts' | 'manual' | null

  const heldCount = ACCT_TYPES.filter((t) => MYDATA_ACCOUNTS[t.id]).length;

  const connect = () => {
    const next = !mydata;
    setMydata(next);
    if (next) setAge(MYDATA_AGE); // 나이 자동 로드
  };

  const linkNts = () => {
    setIncomeSource("nts");
    setIncome(90_000_000); // 국세청 홈택스 연동으로 불러온 연소득(예시)
  };

  const incomeReady = income > 0 && incomeSource !== null;

  return (
    <Pad
      footer={
        <div className={styles.footerCol}>
          <Button onClick={onNext} icon={ArrowRight}>
            {mydata ? "입력 완료 · 계좌 전략 보기" : "다음"}
          </Button>
          {!mydata && (
            <button onClick={onNext} className={styles.skip}>
              나중에 할게요
            </button>
          )}
        </div>
      }
    >
      <Heading sub="흩어진 4개 계좌와 나이를 한 번에 불러오고, 월 불입금만 정하면 맞춤 전략이 완성돼요.">
        마이데이터 연동
      </Heading>

      {/* 연동 상태 카드 */}
      <div className={styles.card}>
        <div className={cx(styles.icon, mydata && styles.iconOn)}>
          {mydata ? <BadgeCheck size={36} color={C.onJade} /> : <Lock size={32} color={C.jade} />}
        </div>
        <div className={styles.cardTitle}>{mydata ? "연동되었어요" : "안전하게 연동돼요"}</div>
        <div className={styles.cardSub}>
          {mydata
            ? `계좌 ${heldCount}개 · 총 평가 ${fmtKRW(mydataTotal)} · 나이 ${MYDATA_AGE}세를 불러왔어요`
            : "금융보안원 인증 · 조회 전용 권한만 사용"}
        </div>
      </div>
      <button onClick={connect} className={cx(styles.linkBtn, mydata && styles.linkBtnOn)}>
        <RefreshCw size={17} />
        {mydata ? "다시 불러오기" : "내 계좌 연동하기"}
      </button>

      {/* 연동 결과: 4개 계좌 유형 현황 */}
      {mydata && (
        <>
          <Label top>불러온 계좌</Label>
          <div className={styles.acctList}>
            {ACCT_TYPES.map((t) => {
              const acc = MYDATA_ACCOUNTS[t.id];
              return (
                <div key={t.id} className={styles.acctRow}>
                  <span className={styles.acctIcon}>
                    <Building2 size={16} color={acc ? C.jade : C.faint} />
                  </span>
                  <span className={styles.acctName}>{t.name}</span>
                  {acc ? (
                    <span className={styles.acctBal}>{fmtKRW(acc.balance)}</span>
                  ) : (
                    <span className={styles.acctNone}>미보유 · 개설 추천</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 개인 정보 · 투자 계획 — 나이(자동) / 월 불입금(입력) / 연소득 */}
      <Label top>개인 정보 · 투자 계획</Label>
      <div className={styles.planGroup}>
        {/* 나이 */}
        <div className={styles.planField}>
          <div className={styles.fieldHead}>
            <span className={styles.miniLabel}>나이</span>
            {mydata && (
              <span className={styles.autoTag}>
                <BadgeCheck size={12} /> 마이데이터 자동
              </span>
            )}
          </div>
          <Field
            value={age ? String(age) : ""}
            onChange={(v) => setAge(digits(v))}
            placeholder="45"
            inputMode="numeric"
          />
        </div>

        {/* 월 불입금 */}
        <div className={styles.planField}>
          <div className={styles.fieldHead}>
            <span className={styles.miniLabel}>
              <Wallet size={13} color={C.jade} /> 월 불입금 · 매달 투자할 금액
            </span>
            <span className={styles.monthlyVal}>{monthly > 0 ? `월 ${fmtKRW(monthly)}` : ""}</span>
          </div>
          <div className={styles.presets}>
            {MONTHLY_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMonthly(v * 10000)}
                className={cx(styles.preset, monthly === v * 10000 && styles.presetOn)}
              >
                {v}만원
              </button>
            ))}
          </div>
          <Field
            value={monthly ? String(monthly / 10000) : ""}
            onChange={(v) => setMonthly(digits(v) * 10000)}
            placeholder="직접 입력 (만원)"
            inputMode="numeric"
          />
        </div>

        {/* 연소득 */}
        <div className={styles.planField}>
          <div className={styles.fieldHead}>
            <span className={styles.miniLabel}>연소득 · 절세·세액공제 계산에 사용</span>
          </div>
          {incomeReady ? (
            <div className={styles.incomeDone}>
              <span className={styles.incomeVal}>
                {incomeSource === "nts" && <BadgeCheck size={15} color={C.jade} />}
                연 {fmtKRW(income)}
                {incomeSource === "nts" && <span className={styles.incomeSrc}>국세청 인증</span>}
              </span>
              <button className={styles.reset} onClick={() => setIncomeSource(null)}>
                변경
              </button>
            </div>
          ) : incomeSource === "manual" ? (
            <Field
              value={income ? String(income / 10000) : ""}
              onChange={(v) => setIncome(digits(v) * 10000)}
              placeholder="연소득 직접 입력 (만원)"
              inputMode="numeric"
            />
          ) : (
            <div className={styles.srcRow}>
              <button className={styles.srcBtn} onClick={linkNts}>
                <Building2 size={16} />
                국세청 홈택스 연동
              </button>
              <button className={cx(styles.srcBtn, styles.srcBtnAlt)} onClick={() => setIncomeSource("manual")}>
                <Plus size={16} />
                직접 입력
              </button>
            </div>
          )}
          <p className={styles.hint}>
            <Check size={12} color={C.jade} /> 연소득은 마이데이터로 조회되지 않아 국세청 연동 또는 직접 입력으로 받아요.
          </p>
        </div>
      </div>
    </Pad>
  );
}
