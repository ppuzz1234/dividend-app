/* 설계 완료 스냅샷 — localStorage 저장소.
 * 배분 전략까지 마치고 메인 앱(자산 탭)에 도달한 순간의 입력·결과를 봉인해 두고,
 * 이후 로그인에서는 온보딩 전체를 건너뛰고 곧바로 메인 앱(뉴스 홈)으로 진입한다.
 * (Supabase 플랜 저장과 별개 — 데모 로그인·미설정 환경에서도 동작하는 로컬 복원용) */
const KEY = "pc_setup_v1";

/** 저장된 완료 스냅샷 — 없거나, 파싱 불가거나, 다른 계정의 것이면 null.
 * @param {string} who 계정 식별자 — 구글은 userId, 데모(네이버·카카오)는 "demo" */
export function loadSetup(who = "demo") {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 다른 계정의 스냅샷으로 온보딩을 건너뛰지 않는다 — 새 계정은 미설계 상태로 시작
    return s && s.done && s.who === who ? s : null;
  } catch {
    return null; // 사생활 모드 등 localStorage 불가 환경 — 매번 온보딩부터
  }
}

/** 이 브라우저에 완료 스냅샷이 존재하는가(계정 무관).
 * 재방문 유저에게 서비스 소개(인트로)를 다시 보여주지 않기 위한 판단용 —
 * 실제 복원·직행 여부는 계정이 일치하는 loadSetup 결과로만 결정한다. */
export function hasAnySetup() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    return !!(s && s.done);
  } catch {
    return false;
  }
}

/** 설계 완료 시점의 입력·결과를 저장 (호출할 때마다 최신으로 덮어쓴다) */
export function saveSetup(who, data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, who, done: true, savedAt: Date.now() }));
  } catch {
    /* 저장 실패 — 다음 로그인에 온보딩이 다시 나올 뿐, 치명적이지 않다 */
  }
}
