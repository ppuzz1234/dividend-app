import { ArrowRight, PiggyBank, CircleDollarSign } from "lucide-react";
import { Button } from "../components/ui/Button.jsx";
import { Tag } from "../components/ui/Tag.jsx";
import { C } from "../theme/tokens.js";
import styles from "./Splash.module.css";

export function Splash({ onStart }) {
  return (
    <div className={styles.screen}>
      <div className={styles.center}>
        <div className={`${styles.logoWrap} floaty`}>
          <div className={styles.logo}>
            <PiggyBank size={58} color={C.onJade} strokeWidth={2} />
          </div>
          <div className={styles.badge}>
            <CircleDollarSign size={26} strokeWidth={2.2} />
          </div>
        </div>
        <h1 className={styles.title}>배당 눈덩이</h1>
        <p className={styles.desc}>
          상장 배당주를 골라 담고, 재투자 복리로 내 배당금이 얼마나 굴러가는지 시뮬레이션해요.
        </p>
        <div className={styles.tags}>
          <Tag>국내 · 미국 배당주</Tag>
          <Tag tone="gold">배당 재투자</Tag>
        </div>
      </div>
      <Button onClick={onStart} icon={ArrowRight}>
        시작하기
      </Button>
      <p className={styles.disclaimer}>
        본 시뮬레이션은 예시 가정치를 사용하며, 실제 수익을 보장하지 않습니다. 투자 권유가 아닙니다.
      </p>
    </div>
  );
}
