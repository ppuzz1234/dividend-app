import { ArrowRight, Wallet, ShieldCheck, Landmark, Check } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { fmtKRW } from "../lib/format.js";
import { C } from "../theme/tokens.js";
import styles from "./Accounts.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pension: Landmark };
const GOALS = [
  { v: "retirement", l: "노후 자산" },
  { v: "cashflow", l: "월 현금흐름" },
];

/* 여력 표시 라벨 */
function headroomLabel(hr) {
  if (hr.type === "deduct") return { lead: "세액공제 잔여", remaining: hr.remaining, limit: hr.limit };
  if (hr.type === "limit") return { lead: "납입 한도 잔여", remaining: hr.remaining, limit: hr.limit };
  return null; // 일반계좌: 한도 없음
}

export function Accounts({ goal, setGoal, mydata, strategy, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>보유 상품 조정 제안 보기</Button>}>
      <Heading sub={mydata ? "연동된 계좌와 올해 더 쓸 수 있는 여력이에요." : "보유(개설 가능한) 계좌와 연 한도 여력이에요."}>
        내 계좌 현황
      </Heading>

      {/* 1. 계좌 현황 + 여력 */}
      <div className={styles.list}>
        {strategy.items.map((it) => {
          const Icon = ICONS[it.accountId] || Wallet;
          const hl = headroomLabel(it.headroom);
          const pct = hl && Number.isFinite(hl.limit) ? Math.min(100, (it.headroom.used / hl.limit) * 100) : 0;
          return (
            <div key={it.accountId} className={styles.acct}>
              <div className={styles.acctTop}>
                <span className={styles.iconBox}>
                  <Icon size={20} />
                </span>
                <span className={styles.txt}>
                  <span className={styles.name}>{it.account.name}</span>
                  <span className={styles.desc}>{it.account.desc}</span>
                </span>
                <span className={styles.bal}>
                  {mydata ? fmtKRW(it.balance) : <span className={styles.open}>개설 가능</span>}
                </span>
              </div>
              {hl ? (
                <div className={styles.head}>
                  <div className={styles.gauge}>
                    <div className={styles.gaugeFill} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={styles.headRow}>
                    <span>{hl.lead}</span>
                    <strong>{fmtKRW(hl.remaining)}</strong>
                  </div>
                </div>
              ) : (
                <div className={styles.headRow}>
                  <span>납입 한도</span>
                  <strong>없음</strong>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. 투자 목표 */}
      <Label top>투자 목표</Label>
      <Segmented value={goal} onChange={setGoal} opts={GOALS} />

      {/* 3. 목표 기반 상세 운용 전략 (현재 화면에서 바로 제시) */}
      <div className={styles.stratHead}>
        <Label top>추천 계좌 운용 전략</Label>
        {strategy.totalRefund > 0 && (
          <span className={styles.refund}>예상 세액공제 환급 연 {fmtKRW(strategy.totalRefund)}</span>
        )}
      </div>
      <div className={styles.stratList}>
        {strategy.items.map((it) => (
          <div key={it.accountId} className={styles.strat}>
            <div className={styles.stratTop}>
              <span className={styles.stratName}>{it.account.name}</span>
              <span className={styles.badge}>{it.categoryLabel}</span>
            </div>
            {it.tagline && <div className={styles.tagline}>{it.tagline}</div>}
            <ul className={styles.actions}>
              {it.actions.map((a, i) => (
                <li key={i}>
                  <Check size={13} color={C.jade} strokeWidth={3} />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
            <div className={styles.rationale}>{it.rationale}</div>
          </div>
        ))}
      </div>
    </Pad>
  );
}
