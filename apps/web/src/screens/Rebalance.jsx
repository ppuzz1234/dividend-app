import { ArrowRight, ArrowDown, MoveRight, Anchor, Link2 } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { Label } from "../components/ui/Label.jsx";
import { fmtKRW } from "../lib/format.js";
import styles from "./Rebalance.module.css";

/* ④ 보유 상품 운용 계좌 조정 — 제안은 core(rebalance)가 산출 */
export function Rebalance({ mydata, rebalance, onNext }) {
  const { proposals, keeps, totalMovable } = rebalance;

  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>조정 반영하고 배분안 보기</Button>}>
      <Heading sub="지금 보유한 상품을 더 절세 유리한 계좌로 옮길 수 있는지 살펴봤어요.">
        보유 상품 계좌 조정
      </Heading>

      {!mydata ? (
        <div className={styles.empty}>
          <Link2 size={28} />
          <div className={styles.emptyTitle}>연동된 보유 내역이 없어요</div>
          <div className={styles.emptyDesc}>마이데이터를 연동하면 보유 상품별로 계좌 조정안을 분석해드려요. 지금은 건너뛰어도 좋아요.</div>
        </div>
      ) : (
        <>
          {proposals.length > 0 && (
            <>
              <div className={styles.sumRow}>
                <Label>이전 제안 {proposals.length}건</Label>
                <span className={styles.sumAmt}>총 {fmtKRW(totalMovable)}</span>
              </div>
              <div className={styles.list}>
                {proposals.map((p, i) => (
                  <div key={i} className={styles.card}>
                    <div className={styles.moveRow}>
                      <span className={styles.holding}>{p.holding.name}</span>
                      <span className={styles.value}>{fmtKRW(p.holding.value)}</span>
                    </div>
                    <div className={styles.path}>
                      <span className={styles.acct}>{p.from.name}</span>
                      <MoveRight size={15} />
                      <span className={styles.acctTo}>{p.to.name}</span>
                    </div>
                    <div className={styles.gain}>
                      <ArrowDown size={13} strokeWidth={3} />
                      {p.gainNote}
                    </div>
                    {p.condNote && <div className={styles.cond}>조건: {p.condNote}</div>}
                    <div className={styles.method}>{p.method}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {keeps.length > 0 && (
            <>
              <Label top>그대로 두는 게 나은 상품 {keeps.length}건</Label>
              <div className={styles.list}>
                {keeps.map((k, i) => (
                  <div key={i} className={styles.keep}>
                    <Anchor size={14} className={styles.keepIcon} />
                    <span className={styles.keepTxt}>
                      <span className={styles.keepName}>
                        {k.holding.name} <em>· {k.account.name}</em>
                      </span>
                      <span className={styles.keepReason}>{k.reason}</span>
                    </span>
                    <span className={styles.keepVal}>{fmtKRW(k.holding.value)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Pad>
  );
}
