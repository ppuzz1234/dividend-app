import { useState } from "react";
import { ArrowRight, Check, Wallet, ShieldCheck, Landmark } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { ACCOUNTS } from "../data/accounts.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Account.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pension: Landmark };
const SOURCES = [
  { v: "mydata", l: "마이데이터" },
  { v: "manual", l: "수기 입력" },
];

export function Account({ account, setAccount, mydata, onNext }) {
  const [src, setSrc] = useState(mydata ? "mydata" : "manual");
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 설정으로 시뮬레이션</Button>}>
      <Heading sub="어떤 계좌로 굴릴지에 따라 배당에 붙는 세금이 달라져요.">보유 계좌 선택</Heading>

      <Label>계좌 보유 현황</Label>
      <div className={styles.sourceRow}>
        {SOURCES.map((o) => (
          <button
            key={o.v}
            onClick={() => setSrc(o.v)}
            className={cx(styles.sourceBtn, src === o.v && styles.sourceBtnOn)}
          >
            {o.l}
          </button>
        ))}
      </div>
      {src === "mydata" && !mydata && (
        <div className={styles.warn}>
          마이데이터가 연동되지 않았어요. 추천 계좌 중에서 선택해 진행할 수 있어요.
        </div>
      )}

      <div className={styles.list}>
        {ACCOUNTS.map((a) => {
          const on = account === a.id;
          const Icon = ICONS[a.id];
          return (
            <button key={a.id} onClick={() => setAccount(a.id)} className={cx(styles.acct, on && styles.acctOn)}>
              <span className={cx(styles.iconBox, on && styles.iconBoxOn)}>
                <Icon size={22} />
              </span>
              <span className={styles.txt}>
                <span className={styles.name}>{a.name}</span>
                <span className={styles.desc}>{a.desc}</span>
              </span>
              <span className={cx(styles.radio, on && styles.radioOn)}>
                {on && <Check size={13} color={C.onJade} strokeWidth={3.5} />}
              </span>
            </button>
          );
        })}
      </div>
    </Pad>
  );
}
