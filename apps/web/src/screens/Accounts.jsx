import { ArrowRight, Wallet, ShieldCheck, PiggyBank, Landmark, Plus, Check, Info, Infinity as InfinityIcon } from "lucide-react";
import { buildAccountRooms } from "@devidend/core";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { Segmented } from "../components/ui/Segmented.jsx";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Accounts.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pensionSavings: PiggyBank, irp: Landmark };
const GOALS = [
  { v: "retirement", l: "노후 자산" },
  { v: "cashflow", l: "월 현금흐름" },
];

export function Accounts({ goal, setGoal, mydata, onNext }) {
  const { rooms, totalRefund, openable } = buildAccountRooms({ mydata });

  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 전략으로 시뮬레이션</Button>}>
      <Heading sub={mydata ? "연동된 4개 계좌와 올해 더 채울 수 있는 여력이에요." : "네 가지 절세 계좌의 올해 활용 여력이에요."}>
        내 계좌 전략
      </Heading>

      {/* 활용가능 여력 4계좌 — 시인성 중심 */}
      <div className={styles.list}>
        {rooms.map((r) => {
          const Icon = ICONS[r.id] || Wallet;
          const unlimited = r.roomType === "none";
          const needsOpen = r.held === false; // 연동됐으나 미보유
          return (
            <div key={r.id} className={cx(styles.acct, needsOpen && styles.acctOpen)}>
              <div className={styles.acctTop}>
                <span className={cx(styles.iconBox, needsOpen && styles.iconBoxOpen)}>
                  <Icon size={19} color={needsOpen ? C.gold : C.jade} />
                </span>
                <span className={styles.txt}>
                  <span className={styles.name}>{r.name}</span>
                  <span className={styles.desc}>{r.benefit}</span>
                </span>
                <span className={styles.status}>
                  {r.held === true ? (
                    <span className={styles.bal}>
                      <span className={styles.balCap}>보유</span>
                      {fmtKRW(r.balance)}
                    </span>
                  ) : needsOpen ? (
                    <span className={styles.openTag}>
                      <Plus size={12} strokeWidth={3} /> 개설 추천
                    </span>
                  ) : null}
                </span>
              </div>

              {/* 활용가능 room — 큰 숫자로 강조 */}
              <div className={styles.roomBox}>
                <div className={styles.roomLead}>
                  {unlimited ? "납입 한도" : r.roomText}
                  {needsOpen && !unlimited && <span className={styles.maxBadge}>최대</span>}
                </div>
                <div className={cx(styles.roomVal, unlimited && styles.roomValMuted)}>
                  {unlimited ? (
                    <>
                      <InfinityIcon size={22} strokeWidth={2.6} /> 무제한
                    </>
                  ) : (
                    fmtKRW(r.room)
                  )}
                </div>
                {!unlimited && (
                  <div className={styles.gauge}>
                    <div className={styles.gaugeFill} style={{ width: `${100 - r.pct}%` }} />
                  </div>
                )}
                {r.estRefund > 0 && (
                  <div className={styles.roomRefund}>다 채우면 예상 세액공제 환급 +{fmtKRW(r.estRefund)}</div>
                )}
              </div>

              {r.constraint && (
                <div className={styles.constraint}>
                  <Info size={12} strokeWidth={2.5} /> {r.constraint}
                </div>
              )}

              {needsOpen && r.recommend && (
                <div className={styles.recommend}>
                  <Check size={13} color={C.gold} strokeWidth={3} />
                  <span>{r.recommend}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 요약 배너 */}
      <div className={styles.summary}>
        {totalRefund > 0 && (
          <div className={styles.sumItem}>
            <span className={styles.sumK}>연금 세액공제 다 채울 시</span>
            <strong className={styles.sumV}>연 {fmtKRW(totalRefund)} 환급</strong>
          </div>
        )}
        {openable.length > 0 && (
          <div className={styles.sumNote}>
            <Plus size={13} color={C.gold} strokeWidth={3} />
            {openable.join(" · ")} 개설 시 여력을 최대로 쓸 수 있어요
          </div>
        )}
      </div>

      {/* 투자 목표 */}
      <Label top>투자 목표</Label>
      <Segmented value={goal} onChange={setGoal} opts={GOALS} />
      <p className={styles.goalHint}>
        목표에 맞춰 계좌 우선순위와 종목 유형이 자동으로 조정돼요.
      </p>
    </Pad>
  );
}
