import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Field } from "../components/ui/Field.jsx";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Signup.module.css";

export function Signup({ onNext }) {
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  return (
    <Pad footer={<Button onClick={onNext} disabled={!name || !agree} icon={ArrowRight}>다음</Button>}>
      <Heading sub="개인정보를 입력하고 약관에 동의하면 시작할 수 있어요.">회원가입</Heading>
      <Field label="이름" value={name} onChange={setName} placeholder="홍길동" />
      <Field label="휴대폰 번호" placeholder="010-0000-0000" inputMode="numeric" />
      <Field label="이메일" placeholder="you@example.com" />
      <button onClick={() => setAgree((a) => !a)} className={cx(styles.agree, agree && styles.agreeOn)}>
        <span className={cx(styles.box, agree && styles.boxOn)}>
          {agree && <Check size={15} color={C.onJade} strokeWidth={3} />}
        </span>
        <span className={styles.text}>
          서비스 이용약관 및 개인정보 처리방침에 동의합니다 <span className={styles.req}>(필수)</span>
        </span>
      </button>
    </Pad>
  );
}
