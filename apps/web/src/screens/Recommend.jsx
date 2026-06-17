import { ArrowRight, Check, Sparkles, Search } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./Recommend.module.css";

const OPTS = [
  { id: "platform", title: "플랫폼 추천 종목", desc: "우량 TOP3 또는 조건별 배당주를 제안받아요", icon: Sparkles },
  { id: "manual", title: "개별 종목 수기 검색", desc: "원하는 종목을 직접 검색해 담아요", icon: Search },
];

export function Recommend({ path, setPath, onNext }) {
  return (
    <Pad footer={<Button onClick={onNext} icon={ArrowRight}>다음</Button>}>
      <Heading sub="어떻게 종목을 고를까요? 언제든 직접 추가·삭제할 수 있어요.">종목 추천 방식</Heading>
      {OPTS.map((o) => {
        const on = path === o.id;
        return (
          <button key={o.id} onClick={() => setPath(o.id)} className={cx(styles.opt, on && styles.optOn)}>
            <span className={cx(styles.iconBox, on && styles.iconBoxOn)}>
              <o.icon size={24} />
            </span>
            <span className={styles.txt}>
              <span className={styles.optTitle}>{o.title}</span>
              <span className={styles.optDesc}>{o.desc}</span>
            </span>
            <span className={cx(styles.radio, on && styles.radioOn)}>
              {on && <Check size={13} color={C.onJade} strokeWidth={3.5} />}
            </span>
          </button>
        );
      })}
    </Pad>
  );
}
