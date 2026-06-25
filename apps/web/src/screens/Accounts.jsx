import { ArrowRight, Wallet, ShieldCheck, Landmark } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { ACCOUNTS } from "../data/accounts.js";
import { fmtKRW } from "../lib/format.js";
import styles from "./Accounts.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pension: Landmark };
const GOALS = [
  { v: "retirement", l: "노후 자산" },
  { v: "cashflow", l: "월 현금흐름" },
];
// 마이데이터 연동 시 보여줄 예시 잔액
const MOCK_BALANCE = { general: 8_000_000, isa: 12_000_000, pension: 5_000_000 };

export function Accounts({ goal, setGoal, mydata, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 목표로 상품 추천받기</Button>}>
      <Heading sub={mydata ? "불러온 계좌 현황이에요. 목표를 고르면 계좌별로 상품을 추천해드려요." : "보유(또는 개설 가능한) 계좌예요. 목표를 고르면 계좌별로 상품을 추천해드려요."}>
        내 계좌 현황
      </Heading>

      <div className={styles.list}>
        {ACCOUNTS.map((a) => {
          const Icon = ICONS[a.id] || Wallet;
          return (
            <div key={a.id} className={styles.acct}>
              <span className={styles.iconBox}>
                <Icon size={22} />
              </span>
              <span className={styles.txt}>
                <span className={styles.name}>{a.name}</span>
                <span className={styles.desc}>{a.desc}</span>
              </span>
              <span className={styles.bal}>
                {mydata ? fmtKRW(MOCK_BALANCE[a.id] || 0) : <span className={styles.open}>개설 가능</span>}
              </span>
            </div>
          );
        })}
      </div>

      <Label top>투자 목표</Label>
      <Segmented value={goal} onChange={setGoal} opts={GOALS} />
      <p className={styles.goalHint}>
        {goal === "retirement"
          ? "은퇴 후 노후 자산을 키우는 데 초점을 맞춰요. 연금·장기 성장형 비중이 커져요."
          : "지금 받는 월 배당 현금흐름에 초점을 맞춰요. ISA·고분배 비중이 커져요."}
      </p>
    </Pad>
  );
}
