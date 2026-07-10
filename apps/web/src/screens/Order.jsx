import { ShoppingCart, ShieldAlert } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { fmtKRW } from "../lib/format.js";
import styles from "./Order.module.css";

/* ⑦ 매수 프로세스 — 주문 계획(core/order)까지. 실체결은 apps/api(KIS) 연동 예정 */
export function Order({ orderPlan, onNext }) {
  const { byAccount, totalSeed, totalMonthly, orderCount } = orderPlan;

  return (
    <Pad
      footer={
        <Button onClick={onNext} variant="gold" icon={ShoppingCart}>
          모의 매수 주문 접수 ({orderCount}건)
        </Button>
      }
    >
      <Heading sub="제안된 계좌에 담을 주문 내역이에요. 확인 후 접수하세요.">매수 주문 확인</Heading>

      <div className={styles.total}>
        <div className={styles.totalRow}>
          <span>즉시 매수 합계</span>
          <strong>{fmtKRW(totalSeed)}</strong>
        </div>
        <div className={styles.totalRow}>
          <span>매월 자동 매수</span>
          <strong>{fmtKRW(totalMonthly)}</strong>
        </div>
      </div>

      {byAccount.map((a) => (
        <div key={a.accountId} className={styles.acct}>
          <div className={styles.acctHead}>
            <span className={styles.acctName}>{a.account.name}</span>
            <span className={styles.acctSum}>{fmtKRW(a.seed)}</span>
          </div>
          <div className={styles.orders}>
            {a.orders.map((o) => (
              <div key={o.stock.id} className={styles.order}>
                <span className={styles.stock}>{o.stock.name}</span>
                <span className={styles.amts}>
                  {fmtKRW(o.amount)}
                  {o.monthlyAmount > 0 && <em> +월 {fmtKRW(o.monthlyAmount)}</em>}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className={styles.notice}>
        <ShieldAlert size={15} />
        <span>
          지금은 모의 접수예요. 한국투자증권 Open API 연동 후 실제 주문이 체결되며, 시장가 기준 수량 환산은
          체결 시점에 확정돼요.
        </span>
      </div>
    </Pad>
  );
}
