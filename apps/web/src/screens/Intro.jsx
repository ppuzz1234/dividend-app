import { useRef, useState } from "react";
import { ArrowRight, ChevronRight, ShieldCheck, Repeat } from "lucide-react";
import BrandMark from "../components/ui/BrandMark.jsx";
import { Button } from "../components/ui/Button.jsx";
import { cx } from "../lib/cx.js";
import styles from "./Intro.module.css";

const SLIDES = [
  {
    Icon: ShieldCheck,
    title: "은퇴 후에도 흔들리지 않는\n고정수익이 필요해요",
    desc: "근로소득이 사라진 뒤에도 생활비를 지탱할 안정적인 현금흐름이 반드시 있어야 해요.",
  },
  {
    Icon: Repeat,
    title: "젊을 땐 배당성장주,\n은퇴 후엔 배당주로",
    desc: "젊을 때는 매달 배당성장 ETF에 꾸준히 투자해 자산을 키우고, 은퇴 후에는 배당 ETF로 전환해 그 배당금으로 생활비를 마련해요.",
  },
  {
    Icon: null, // BrandMark 로 대체
    title: "PLUS GENIUS가\n최적의 포트폴리오를 설계해요",
    desc: "세금 최적화 기반의 ETF 투자 전략과, 은퇴 이후 최적의 배당주 포트폴리오까지 함께 설계해드려요.",
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
      <div ref={listRef} className={styles.track} onScroll={handleScroll}>
        {SLIDES.map(({ Icon, title, desc }, i) => (
          <div key={i} className={styles.slide}>
            <div className={styles.iconWrap}>{Icon ? <Icon size={38} /> : <BrandMark size={54} glow />}</div>
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
        {!last && (
          <button type="button" className={styles.skip} onClick={onNext}>
            건너뛰기
          </button>
        )}
        <div className={styles.grow}>
          <Button onClick={last ? onNext : () => goTo(slide + 1)} icon={last ? ArrowRight : ChevronRight}>
            {last ? "시작하기" : "다음"}
          </Button>
        </div>
      </div>
    </div>
  );
}
