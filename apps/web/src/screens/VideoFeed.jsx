import { useEffect, useRef, useState } from "react";
import { ExternalLink, Play, RefreshCw, Video } from "lucide-react";
import { CubeLoader } from "../components/ui/CubeLoader.jsx";
import { hasYoutube, createVideoFeed } from "../lib/youtube.js";
import styles from "./VideoFeed.module.css";

/* 피드 탭 — 구독 채널(유튜브)의 새 영상 모아보기.
 * 첫 페이지는 최신순 리스트, 스크롤 다운 시 다음 페이지를 추가 조회(무한 스크롤).
 * 데이터는 lib/youtube.js 의 병합 페이지네이션에서 온다 — 하드코딩 없음. */
const FIRST_LOAD = 12; // 첫 화면 분량
const MORE_LOAD = 8; // 스크롤 1회당 추가 분량

export function VideoFeed() {
  const feedRef = useRef(null); // createVideoFeed 인스턴스 (페이지 토큰 상태 보존)
  const busyRef = useRef(false); // 중복 조회 방지
  const doneRef = useRef(false); // 모든 채널 소진
  const sentinelRef = useRef(null); // 무한 스크롤 트리거
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(hasYoutube ? "loading" : "unset"); // loading|idle|done|error|unset
  // 인라인 재생 중인 영상 — 한 번에 하나만(다른 카드를 누르면 이전 플레이어는 내려간다).
  // 클릭 전에는 iframe 을 만들지 않는 façade 패턴이라 목록 성능에 부담이 없다.
  const [playingId, setPlayingId] = useState(null);

  const loadMore = async (count) => {
    if (!hasYoutube || busyRef.current || doneRef.current) return;
    busyRef.current = true;
    setStatus("loading");
    try {
      feedRef.current ??= createVideoFeed();
      const { items: rows, done } = await feedRef.current.next(count);
      doneRef.current = done;
      setItems((prev) => [...prev, ...rows]);
      setStatus(done ? "done" : "idle");
    } catch (e) {
      console.warn("[VideoFeed] 조회 실패:", e);
      setStatus("error");
    } finally {
      busyRef.current = false;
    }
  };

  // 최초 진입 — 첫 페이지 로드
  useEffect(() => {
    loadMore(FIRST_LOAD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 무한 스크롤 — 하단 센티널이 보이면(바닥 300px 전 미리) 다음 페이지 조회
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && loadMore(MORE_LOAD),
      { rootMargin: "300px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={styles.feed}>
      <header className={styles.head}>
        <h1 className={styles.title}>피드</h1>
        <p className={styles.sub}>절세와 투자 관련 정보를 참고하세요.</p>
      </header>

      {items.map((v) => (
        <article key={v.id} className={styles.card}>
          <div className={styles.thumbWrap}>
            {playingId === v.id ? (
              /* 인라인 재생 — 임베드 플레이어. 컨트롤바의 유튜브 로고("YouTube에서
               * 보기")로 원본 영상 페이지로 넘어갈 수 있다(임베드 기본 제공). */
              <iframe
                className={styles.player}
                src={`https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0`}
                title={v.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <button type="button" className={styles.thumbBtn} onClick={() => setPlayingId(v.id)} aria-label={`재생: ${v.title}`}>
                <img className={styles.thumb} src={v.thumb} alt="" loading="lazy" />
                <span className={styles.playBadge}>
                  <Play size={15} strokeWidth={0} fill="currentColor" />
                </span>
              </button>
            )}
          </div>
          <div className={styles.meta}>
            {v.channelAvatar ? (
              <img className={styles.avatar} src={v.channelAvatar} alt="" loading="lazy" />
            ) : (
              <span className={styles.avatarFallback}>
                <Video size={14} strokeWidth={2.2} />
              </span>
            )}
            <div className={styles.metaText}>
              <h2 className={styles.videoTitle}>{v.title}</h2>
              <span className={styles.byline}>
                {v.channelTitle} · {relTime(v.publishedAt)}
              </span>
            </div>
            {/* 유튜브 원본으로 이동 — 재생 전에도 쓸 수 있는 보조 진입점 */}
            <a
              className={styles.extLink}
              href={v.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="YouTube에서 보기"
            >
              <ExternalLink size={15} strokeWidth={2.2} />
            </a>
          </div>
        </article>
      ))}

      {status === "loading" && (
        <div className={styles.state}>
          {/* 루빅스 큐브 로더 — 문구 위에 배치해 조립 애니메이션이 보이는 크기로 */}
          <span className={styles.cubeSpin} aria-hidden="true">
            <CubeLoader size={26} bare />
          </span>
          영상 불러오는 중
        </div>
      )}
      {status === "error" && (
        <div className={styles.state}>
          영상을 불러오지 못했어요.
          <button
            type="button"
            className={styles.retry}
            onClick={() => {
              doneRef.current = false;
              loadMore(items.length ? MORE_LOAD : FIRST_LOAD);
            }}
          >
            <RefreshCw size={13} strokeWidth={2.4} /> 다시 시도
          </button>
        </div>
      )}
      {status === "done" && items.length > 0 && <div className={styles.state}>모든 영상을 확인했어요.</div>}
      {status === "unset" && (
        <div className={styles.state}>
          유튜브 연동 키가 설정되지 않았어요.
          <br />
          <code className={styles.code}>VITE_YOUTUBE_API_KEY</code> 를 설정하면 채널 영상이 표시돼요.
        </div>
      )}

      {/* 무한 스크롤 트리거 — 리스트 맨 끝 */}
      <div ref={sentinelRef} aria-hidden="true" />
    </div>
  );
}

/* 상대 시각 — "3시간 전 · 2일 전 · 3주 전", 오래되면 날짜로 */
function relTime(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
  if (s < 86400 * 30) return `${Math.floor(s / (86400 * 7))}주 전`;
  const d = new Date(t);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}
