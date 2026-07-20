import { useRef, useState } from "react";
import { ArrowRight, ChevronRight, ChevronsRight, ShieldCheck, Repeat } from "lucide-react";
import BrandMark from "../components/ui/BrandMark.jsx";
import { Button } from "../components/ui/Button.jsx";
import { cx } from "../lib/cx.js";
import styles from "./Intro.module.css";

const SLIDES = [
  {
    Icon: ShieldCheck,
    title: "우리는 100세 시대의 절반을,\n근로 소득 없이 살아야 할 운명",
    desc: "근로소득이 사라진 뒤에도 생활비를 지탱할 안정적인 현금흐름이 반드시 있어야 해요.",
  },
  {
    Icon: null, // BrandMark 로 대체
    title: "PLUS CUBE가\n똑똑한 해결책을 제안합니다",
    desc: "절세 계좌 최적화,\n 시기에 맞는 ETF 선택 \n 그리고 은퇴 이후의 똑똑한 배당 전략까지, 당신의 20년을 설계해드려요.",
  },
  {
    Icon: Repeat,
    title: "젊을 땐 성장주,\n은퇴 후엔 고배당주!",
    desc: "성장주 ETF 장기 투자로 기초 자산을 불리고, 은퇴 후에는 배당 ETF로 전환, 그 배당금이 당신의 생활비가 될거예요.",
  },

];

/* 온보딩 훅(목표 생활비 계산) 화면 진입 전 — 서비스 콘셉트를 3장으로 안내하는
 * 진짜 온보딩. 스와이프/점 클릭/다음 버튼으로 넘기며, 마지막 장에서 시작한다. */
export function Intro({ onNext }) {
  const [slide, setSlide] = useState(0);
  const listRef = useRef(null);
  const programmatic = useRef(false);

  const goTo = (i) => {
    const el = listRef.current;
    if (!el) return;
    const target = i * el.clientWidth;
    programmatic.current = true;
    el.style.scrollSnapType = "none";
    const finish = () => {
      el.scrollLeft = target;
      el.style.scrollSnapType = "";
      programmatic.current = false;
    };
    el.addEventListener("scrollend", finish, { once: true });
    setTimeout(finish, 500); // scrollend 미지원 브라우저 폴백
    el.scrollTo({ left: target, behavior: "smooth" });
    setSlide(i);
  };

  const handleScroll = () => {
    if (programmatic.current) return;
    const el = listRef.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setSlide(Math.min(SLIDES.length - 1, Math.max(0, i)));
  };

  const last = slide === SLIDES.length - 1;

  return (
    <div className={styles.wrap}>
      {!last && (
        <button type="button" className={styles.skip} onClick={onNext}>
          건너뛰기
          <ChevronsRight size={15} strokeWidth={2.4} />
        </button>
      )}

      <div ref={listRef} className={styles.track} onScroll={handleScroll}>
        {SLIDES.map(({ Icon, title, desc }, i) => (
          <div key={i} className={styles.slide}>
            <div className={cx(styles.iconWrap, !Icon && styles.iconWrapBrand)}>
              {Icon ? <Icon size={38} /> : <BrandMark size={84} glow />}
            </div>
            <h2 className={styles.title}>{title}</h2>
            <p className={styles.desc}>{desc}</p>
          </div>
        ))}
      </div>

      <div className={styles.dots}>
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}번째`}
            className={cx(styles.dot, i === slide && styles.dotOn)}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <div className={styles.footerRow}>
        <Button onClick={last ? onNext : () => goTo(slide + 1)} icon={last ? ArrowRight : ChevronRight}>
          {last ? "시작하기" : "다음"}
        </Button>
      </div>
    </div>
  );
}
