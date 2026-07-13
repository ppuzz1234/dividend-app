import { ArrowRight, RefreshCw, Lock, BadgeCheck, Check, Pencil } from "lucide-react";
import { MYDATA_ACCOUNTS, MYDATA_PROFILE } from "@devidend/core";
import { AccountRooms } from "../components/AccountRooms.jsx";
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
  { id: "irp", name: "IRP" },
  { id: "pension", name: "연금저축" },
];

export function Mydata({ mydata, setMydata, age, setAge, income, setIncome, finIncome, setFinIncome, mydataTotal = 0, onNext }) {
  const heldCount = ACCT_TYPES.filter((t) => MYDATA_ACCOUNTS[t.id]).length;

  const connect = () => {
    const next = !mydata;
    setMydata(next);
    if (next) {
      // 마이데이터·소득정보 자동 로드 (아래에서 직접 수정 가능)
      setAge(MYDATA_PROFILE.age);
      setFinIncome(MYDATA_PROFILE.financialIncomePrevYear);
      setIncome(MYDATA_PROFILE.totalIncomePrevYear);
    }
  };

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
      <Heading sub="흩어진 4개 계좌와 전년도 소득을 한 번에 불러와요. 불러온 소득은 직접 수정할 수 있어요.">
        마이데이터로 내 정보 가져오기
      </Heading>

      {/* 연동 상태 카드 */}
      <div className={styles.card}>
        <div className={cx(styles.icon, mydata && styles.iconOn)}>
          {mydata ? <BadgeCheck size={36} color={C.onJade} /> : <Lock size={32} color={C.jade} />}
        </div>
        <div className={styles.cardTitle}>{mydata ? "연동되었어요" : "안전하게 연동돼요"}</div>
        <div className={styles.cardSub}>
          {mydata
            ? `계좌 ${heldCount}개 · 총 평가 ${fmtKRW(mydataTotal)} · 전년도 소득정보를 불러왔어요`
            : "금융보안원 인증 · 조회 전용 권한만 사용"}
        </div>
      </div>
      <button onClick={connect} className={cx(styles.linkBtn, mydata && styles.linkBtnOn)}>
        <RefreshCw size={17} />
        {mydata ? "다시 불러오기" : "내 정보 가져오기"}
      </button>

      {/* 연동 결과: 화면 전환 없이 전략 화면의 4계좌 여력 카드를 그대로 표시 (금융사 포함) */}
      {mydata && (
        <>
          <Label top>불러온 계좌 · 올해 여력</Label>
          <AccountRooms mydata income={income} />
        </>
      )}

      {/* 개인 정보 — 나이(자동) / 전년도 금융소득·총소득(자동 로드 + 수정 가능) */}
      <Label top>내 정보 확인</Label>
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

        {/* 전년도 금융소득 */}
        <div className={styles.planField}>
          <div className={styles.fieldHead}>
            <span className={styles.miniLabel}>전년도 금융소득 (만원) · 이자+배당</span>
            {mydata ? (
              <span className={styles.autoTag}>
                <BadgeCheck size={12} /> 자동 · 수정 가능
              </span>
            ) : (
              <span className={styles.editTag}>
                <Pencil size={11} /> 직접 입력
              </span>
            )}
          </div>
          <Field
            value={finIncome ? String(finIncome / 10000) : ""}
            onChange={(v) => setFinIncome(digits(v) * 10000)}
            placeholder="1200"
            inputMode="numeric"
          />
          <p className={styles.hint}>
            <Check size={12} color={C.jade} /> 연 2,000만원을 넘으면 금융소득종합과세 대상 — ISA 가입 제한 판정에도 쓰여요.
          </p>
        </div>

        {/* 전년도 총소득 */}
        <div className={styles.planField}>
          <div className={styles.fieldHead}>
            <span className={styles.miniLabel}>전년도 총소득 (만원)</span>
            {mydata ? (
              <span className={styles.autoTag}>
                <BadgeCheck size={12} /> 자동 · 수정 가능
              </span>
            ) : (
              <span className={styles.editTag}>
                <Pencil size={11} /> 직접 입력
              </span>
            )}
          </div>
          <Field
            value={income ? String(income / 10000) : ""}
            onChange={(v) => setIncome(digits(v) * 10000)}
            placeholder="9000"
            inputMode="numeric"
          />
          <p className={styles.hint}>
            <Check size={12} color={C.jade} /> 총급여 5,500만원 이하면 연금 세액공제율이 16.5%로 높아져요.
          </p>
        </div>
      </div>
    </Pad>
  );
}
