import { useRef, useState } from "react";
import { ArrowRight, ChevronRight, ChevronsRight, ShieldCheck, Repeat } from "lucide-react";
import BrandMark from "../components/ui/BrandMark.jsx";
import { Button } from "../components/ui/Button.jsx";
import { cx } from "../lib/cx.js";
import styles from "./Intro.module.css";

const SLIDES = [
  {
    Icon: ShieldCheck,
    title: "당신이 은퇴 후 목표로 하는\n월 Passive Income 1,000만원?",
    desc: "은퇴 자산을 키워가는 계좌 최적화에 따라, 연 1.2억원의 Passive Income에 대한 소득세(지방소득세 추가), 건강보험료가 최대 0000만원까지 차이나게 됩니다.",
  },
  {
    Icon: null, // BrandMark 로 대체
    title: "당신의 은퇴를 위한 3개 계좌 최적화 현황을 분석하고,\n 최적의 솔루션을 제안드립니다.",
    desc: "그리고, 목표 은퇴자산 형성, 은퇴 이후의 \n Passive Income 최적화 솔루션도 제공합니다.",
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
