import { ArrowRight, Wallet, ShieldCheck, Landmark } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import styles from "./Strategy.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pension: Landmark };

export function Strategy({ recommendations, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>이 유형으로 종목 보기</Button>}>
      <Heading sub="계좌 성격과 목표를 조합해, 계좌마다 어떤 상품이 유리한지 추천했어요.">
        계좌별 추천 상품
      </Heading>

      <div className={styles.list}>
        {recommendations.map((r) => {
          const Icon = ICONS[r.accountId] || Wallet;
          return (
            <div key={r.accountId} className={styles.card}>
              <div className={styles.head}>
                <span className={styles.iconBox}>
                  <Icon size={20} />
                </span>
                <span className={styles.acctName}>{r.account.name}</span>
                <span className={styles.badge}>{r.categoryLabel}</span>
              </div>
              <p className={styles.reason}>{r.reason}</p>
            </div>
          );
        })}
      </div>

      <p className={styles.note}>
        다음 단계에서 추천 유형의 종목을 보여드려요. 다른 유형도 직접 추가해 담을 수 있어요.
      </p>
    </Pad>
  );
}
