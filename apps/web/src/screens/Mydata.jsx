import { ArrowRight, RefreshCw, Lock, BadgeCheck } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Field } from "../components/ui/Field.jsx";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Mydata.module.css";

const digits = (v) => Number(String(v).replace(/\D/g, "")) || 0;

export function Mydata({ mydata, setMydata, age, setAge, income, setIncome, onNext }) {
  return (
    <Pad
      footer={
        <div className={styles.footerCol}>
          <Button onClick={onNext} icon={ArrowRight}>
            {mydata ? "연동 완료 · 다음" : "다음"}
          </Button>
          {!mydata && (
            <button onClick={onNext} className={styles.skip}>
              나중에 할게요
            </button>
          )}
        </div>
      }
    >
      <Heading sub="흩어진 계좌·보유 자산을 한 번에 불러와 보유 종목과 계좌를 자동으로 채워드려요.">
        마이데이터 연동
      </Heading>
      <div className={styles.card}>
        <div className={cx(styles.icon, mydata && styles.iconOn)}>
          {mydata ? <BadgeCheck size={36} color={C.onJade} /> : <Lock size={32} color={C.jade} />}
        </div>
        <div className={styles.cardTitle}>{mydata ? "연동되었어요" : "안전하게 연동돼요"}</div>
        <div className={styles.cardSub}>
          {mydata ? "보유 종목 4건 · 계좌 2개를 불러왔어요" : "금융보안원 인증 · 조회 전용 권한만 사용"}
        </div>
      </div>
      <button onClick={() => setMydata((v) => !v)} className={cx(styles.linkBtn, mydata && styles.linkBtnOn)}>
        <RefreshCw size={17} />
        {mydata ? "다시 불러오기" : "내 계좌 연동하기"}
      </button>

      <Label top>개인 현황 (맞춤 배분에 사용돼요)</Label>
      <div className={styles.profileRow}>
        <Field
          label="나이"
          value={age ? String(age) : ""}
          onChange={(v) => setAge(digits(v))}
          placeholder="40"
          inputMode="numeric"
        />
        <Field
          label="연소득 (만원)"
          value={income ? String(income / 10000) : ""}
          onChange={(v) => setIncome(digits(v) * 10000)}
          placeholder="5000"
          inputMode="numeric"
        />
      </div>
    </Pad>
  );
}
