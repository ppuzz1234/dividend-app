import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, ExternalLink } from "lucide-react";
import { ARTICLES } from "../content/newsArticles.jsx";
import { cx } from "../lib/cx.js";
import styles from "./NewsFeed.module.css";

/* 뉴스 탭 — 카드뉴스 피드. 채널 행 + 제목 + 요약 + 카드별 고유 비주얼 썸네일,
 * 카드를 누르면 풀스크린 아티클 리더가 열린다. 콘텐츠는 content/newsArticles.jsx. */
export function NewsFeed() {
  const [openId, setOpenId] = useState(null);
  const article = ARTICLES.find((a) => a.id === openId);

  return (
    <div className={styles.feed}>
      <header className={styles.feedHead}>
        <h1 className={styles.feedTitle}>뉴스</h1>
        <p className={styles.feedSub}>절세와 ETF, 카드로 쉽게 공부해요.</p>
      </header>

      {ARTICLES.map((a, i) => (
        <FeedCard key={a.id} a={a} index={i} onOpen={() => setOpenId(a.id)} />
      ))}

      {article && <ArticleView a={article} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function FeedCard({ a, index, onOpen }) {
  const { ChannelIcon } = a;
  return (
    <article className={styles.card} style={{ "--i": index }}>
      <button type="button" className={styles.cardBtn} onClick={onOpen}>
        <div className={styles.chRow}>
          <span className={styles.chAvatar} style={{ color: a.channelColor, background: `color-mix(in srgb, ${a.channelColor} 16%, transparent)` }}>
            <ChannelIcon size={16} strokeWidth={2.2} />
          </span>
          <span className={styles.chName}>{a.channel}</span>
          <span className={styles.chDate}>{a.date}</span>
        </div>

        <h2 className={styles.cardTitle}>{a.title}</h2>
        <p className={styles.cardSummary}>{a.summary}</p>

        <Thumb a={a} />

        <div className={styles.cardFoot}>
          <span className={styles.readTime}>{a.read} 읽기</span>
          <span className={styles.readMore}>
            아티클 보기 <ChevronRight size={13} strokeWidth={2.6} />
          </span>
        </div>
      </button>
    </article>
  );
}

/* 카드별 썸네일 씬 — 그라디언트 배경 위 CSS 컴포지션(타이포 일러스트). */
function Thumb({ a, tall }) {
  return (
    <div
      className={cx(styles.thumb, tall && styles.thumbTall)}
      style={{ background: `linear-gradient(135deg, ${a.hero.from}, ${a.hero.to})`, "--ink": a.hero.ink }}
      aria-hidden="true"
    >
      <span className={styles.glowA} />
      <span className={styles.glowB} />

      {a.id === "isa" && (
        <div className={styles.scene}>
          <span className={cx(styles.floatChip, styles.posTL)}>비과세 200만원</span>
          <div className={styles.bigTile}>
            <b>ISA</b>
            <small>만능통장</small>
          </div>
          <span className={cx(styles.floatCoin, styles.posBR)}>9.9%</span>
        </div>
      )}

      {a.id === "vs" && (
        <div className={cx(styles.scene, styles.vsScene)}>
          <div className={styles.vsTile}>
            <small>연금저축</small>
            <b>600만</b>
          </div>
          <span className={styles.vsBadge}>VS</span>
          <div className={styles.vsTile}>
            <small>IRP</small>
            <b>+300만</b>
          </div>
        </div>
      )}

      {a.id === "trio" && (
        <div className={cx(styles.scene, styles.trioScene)}>
          <div className={cx(styles.trioTile, styles.trioL)}>연금저축</div>
          <div className={cx(styles.trioTile, styles.trioM)}>IRP</div>
          <div className={cx(styles.trioTile, styles.trioR)}>ISA</div>
        </div>
      )}

      {a.id === "terms" && (
        <div className={cx(styles.scene, styles.termsScene)}>
          <span className={cx(styles.bubble, styles.bubbleQ)}>연금저축?</span>
          <span className={cx(styles.bubble, styles.bubbleA)}>연금저축펀드!</span>
        </div>
      )}
    </div>
  );
}

/* 풀스크린 아티클 리더 — 썸네일 씬을 히어로로 이어받고 블록 단위로 본문을 렌더링. */
function ArticleView({ a, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className={styles.reader} style={{ "--acc": a.hero.acc }}>
      <header className={styles.readerTop}>
        <button type="button" className={styles.readerBack} aria-label="목록으로" onClick={onClose}>
          <ArrowLeft size={20} strokeWidth={2.2} />
        </button>
        <span className={styles.readerChannel}>{a.channel}</span>
      </header>

      <div className={styles.readerScroll}>
        <Thumb a={a} tall />

        <div className={styles.readerHead}>
          <span className={styles.readerTag}>{a.tag}</span>
          <h1 className={styles.readerTitle}>{a.title}</h1>
          <span className={styles.readerMeta}>
            {a.date} · {a.read} 읽기
          </span>
        </div>

        <div className={styles.body}>
          {a.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </div>

        <div className={styles.srcBox}>
          <a className={styles.srcLink} href={a.source.url} target="_blank" rel="noreferrer">
            <ExternalLink size={13} strokeWidth={2.4} />
            참고: {a.source.label}
          </a>
          <p className={styles.disclaimer}>
            교육 목적으로 재구성한 콘텐츠로 투자 권유가 아니에요. 세법 개정에 따라 한도와 세율은 달라질 수 있어요.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Block({ b }) {
  switch (b.type) {
    case "lead":
      return <p className={styles.lead}>{b.t}</p>;
    case "h":
      return <h2 className={styles.bh}>{b.t}</h2>;
    case "p":
      return <p className={styles.bp}>{b.t}</p>;
    case "note":
      return <p className={styles.bNote}>{b.t}</p>;
    case "nums":
      return (
        <div className={styles.nums}>
          {b.items.map((n) => (
            <div key={n.l} className={styles.numCell}>
              <b className={styles.numV}>{n.v}</b>
              <span className={styles.numL}>{n.l}</span>
            </div>
          ))}
        </div>
      );
    case "cards":
      return (
        <div className={styles.itemList}>
          {b.items.map((it) => (
            <div key={it.t} className={styles.item}>
              <span className={styles.itemDot} />
              <div className={styles.itemBody}>
                <b className={styles.itemT}>{it.t}</b>
                <span className={styles.itemD}>{it.d}</span>
              </div>
            </div>
          ))}
        </div>
      );
    case "compare":
      return (
        <div className={styles.compare}>
          <div className={cx(styles.cmpRow, styles.cmpHead)}>
            <span />
            <span>{b.a}</span>
            <span>{b.b}</span>
          </div>
          {b.rows.map(([k, va, vb]) => (
            <div key={k} className={styles.cmpRow}>
              <span className={styles.cmpK}>{k}</span>
              <span className={styles.cmpV}>{va}</span>
              <span className={styles.cmpV}>{vb}</span>
            </div>
          ))}
        </div>
      );
    case "callout":
      return (
        <div className={styles.callout}>
          <b className={styles.calloutT}>{b.title}</b>
          <p className={styles.calloutBody}>{b.t}</p>
        </div>
      );
    default:
      return null;
  }
}
