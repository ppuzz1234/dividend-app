/* ------------------------------------------------------------------ *
 *  유튜브 피드 — YouTube Data API v3 로 지정 채널들의 업로드 영상을
 *  최신순 "페이지 단위"로 조회한다 (영상 목록 하드코딩 없음).
 *
 *  · 채널 핸들 → 채널·업로드 재생목록 id 해석: channels?forHandle (1 unit)
 *    — 결과는 localStorage 에 캐시해 핸들당 1회만 호출한다.
 *  · 영상 목록: playlistItems.list (1 unit/페이지) + pageToken 페이지네이션
 *    — 검색(search.list, 100 unit)을 쓰지 않아 쿼터 부담이 거의 없다.
 *  · 여러 채널의 페이지 스트림을 publishedAt 기준으로 병합해 무한 스크롤에
 *    공급한다. 각 채널은 자기 큐가 빌 때만 다음 페이지를 조회하므로
 *    사용자가 스크롤한 만큼만 API 를 쓴다.
 *
 *  설정: .env.local 에 VITE_YOUTUBE_API_KEY
 *  (Google Cloud Console 에서 YouTube Data API v3 활성화 + API 키 발급,
 *   키는 HTTP 리퍼러(도메인)로 제한해 두는 것을 권장)
 * ------------------------------------------------------------------ */
const KEY = import.meta.env.VITE_YOUTUBE_API_KEY;
export const hasYoutube = !!KEY;

/* 피드에 모아 보여줄 채널 핸들 — 채널 추가·삭제는 이 배열만 수정 */
export const FEED_HANDLES = ["oilprof", "hbgom"];

const API = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 10; // 채널당 1회 조회 분량 — 한 번에 다 가져오지 않는다

async function yt(path, params) {
  const q = new URLSearchParams({ ...params, key: KEY });
  const res = await fetch(`${API}/${path}?${q}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message || `YouTube API ${res.status}`);
  return body;
}

/* 핸들 → 채널 메타(업로드 재생목록 id 포함). localStorage 캐시로 재호출 방지 */
const CH_CACHE = "pc_yt_channels_v1";
async function resolveChannel(handle) {
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(CH_CACHE) || "{}") || {};
  } catch {
    /* 캐시 불가 환경 — 매번 조회 (1 unit 이라 부담 없음) */
  }
  if (cache[handle]?.uploads) return cache[handle];

  const body = await yt("channels", { part: "snippet,contentDetails", forHandle: "@" + handle });
  const c = body?.items?.[0];
  if (!c) throw new Error(`채널을 찾을 수 없어요: @${handle}`);
  const meta = {
    handle,
    id: c.id,
    title: c.snippet?.title || handle,
    avatar: c.snippet?.thumbnails?.default?.url || "",
    uploads: c.contentDetails?.relatedPlaylists?.uploads,
  };
  cache[handle] = meta;
  try {
    localStorage.setItem(CH_CACHE, JSON.stringify(cache));
  } catch {
    /* no-op */
  }
  return meta;
}

/* 업로드 재생목록 1페이지 조회 → 표준화된 영상 행으로 큐에 적재 */
async function fetchPage(source) {
  const body = await yt("playlistItems", {
    part: "snippet",
    playlistId: source.channel.uploads,
    maxResults: String(PAGE_SIZE),
    ...(source.pageToken ? { pageToken: source.pageToken } : {}),
  });
  source.pageToken = body.nextPageToken || null;
  if (!source.pageToken) source.done = true;
  for (const it of body.items || []) {
    const sn = it.snippet;
    const videoId = sn?.resourceId?.videoId;
    if (!videoId) continue;
    source.queue.push({
      id: videoId,
      title: sn.title,
      publishedAt: sn.publishedAt,
      thumb: sn.thumbnails?.medium?.url || sn.thumbnails?.default?.url || "",
      channelTitle: source.channel.title,
      channelAvatar: source.channel.avatar,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
}

/**
 * 병합 피드 생성 — next(count) 를 부를 때마다 채널 스트림들에서 최신순으로
 * count 개를 꺼내 온다(무한 스크롤 1회분).
 * @returns {{ next: (count?: number) => Promise<{items: Array, done: boolean}> }}
 */
export function createVideoFeed(handles = FEED_HANDLES) {
  let sources = null;

  return {
    async next(count = PAGE_SIZE) {
      if (!sources) {
        const channels = await Promise.all(handles.map(resolveChannel));
        sources = channels.map((channel) => ({ channel, queue: [], pageToken: undefined, done: false }));
      }
      const out = [];
      while (out.length < count) {
        // 큐가 빈(아직 페이지가 남은) 소스만 채운다 — 병합 비교엔 모든 소스의 head 가 필요
        await Promise.all(sources.filter((s) => !s.queue.length && !s.done).map((s) => fetchPage(s)));
        const heads = sources.filter((s) => s.queue.length);
        if (!heads.length) break; // 모든 채널 소진
        // ISO 8601(UTC) 문자열은 사전순 비교 = 시간순 비교
        const newest = heads.reduce((a, b) => (a.queue[0].publishedAt >= b.queue[0].publishedAt ? a : b));
        out.push(newest.queue.shift());
      }
      return { items: out, done: sources.every((s) => s.done && !s.queue.length) };
    },
  };
}
