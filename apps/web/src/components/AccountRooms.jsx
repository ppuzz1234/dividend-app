import { useState, useRef } from "react";
import { Plus, Check, Info, Infinity as InfinityIcon, Landmark, ChevronRight, X, MoveRight, ExternalLink, Sparkles } from "lucide-react";
import { buildAccountRooms } from "@devidend/core";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./AccountRooms.module.css";

/* 개설 유도 — 한화투자증권 개설 링크 (계좌 공통) */
const OPEN_INSTITUTION = "한화투자증권";
const OPEN_URL = "https://m.hanwhawm.com:9090/M/nftf/main/index.cmd#noback";

/* 보유 상품 → 계좌 적합성 조언 (내부 법규·전략 지식 = productEligibility 요약) */
const ADVICE = {
  foreignEtf: {
    general: { tone: "keep", text: "해외상장 ETF는 절세계좌에 담을 수 없어 일반계좌 보관이 맞아요. 다만 배당이 커 종합과세·건보료 부담이 있으니, 같은 지수의 국내상장 ETF로 교체하면 ISA·연금 활용이 열려요." },
  },
  krListedGlobalEtf: {
    pensionSavings: { tone: "good", text: "국내상장 해외ETF는 과세이연되는 연금계좌가 최적 보관처예요. 잘 담겨 있어요." },
    isa: { tone: "good", text: "손익통산·비과세가 적용돼 ISA에 적합해요." },
    general: { tone: "move", text: "일반계좌에선 배당소득으로 과세돼요. ISA·연금으로 옮기면 절세할 수 있어요." },
  },
  krEtf: {
    isa: { tone: "good", text: "국내ETF는 ISA 손익통산·비과세 활용에 적합해요." },
    general: { tone: "move", text: "ISA로 옮기면 비과세·손익통산 한도를 쓸 수 있어요." },
    pensionSavings: { tone: "good", text: "과세이연 혜택을 받아 연금계좌에 적합해요." },
  },
  krReit: {
    isa: { tone: "good", text: "상장리츠는 배당 비중이 커서 ISA 비과세가 특히 유리해요." },
    general: { tone: "move", text: "배당이 큰 리츠는 ISA·연금으로 옮기면 절세 효과가 커요." },
    pensionSavings: { tone: "good", text: "연금계좌에서 과세이연돼 리츠 배당에 유리해요." },
  },
};
const adviceFor = (productType, accountId) =>
  ADVICE[productType]?.[accountId] || { tone: "keep", text: "현재 계좌에 적합하게 보유 중이에요." };

/* 4계좌(일반·ISA·연금저축·IRP) 연 한도·올해 납입·남은 여력 카드
 * 연동(mydata)된 보유 계좌 타일은 탭하면 상세·조정 추천 시트를 연다. */
export function AccountRooms({ mydata, income }) {
  const { rooms, totalRefund, openable } = buildAccountRooms({ mydata, income });
  const [sheetRoom, setSheetRoom] = useState(null);

  return (
    <>
      <div className={styles.list}>
        {rooms.map((r) => {
          const unlimited = r.roomType === "none";
          const needsOpen = r.held === false; // 연동됐으나 미보유 → 개설 추천
          const clickable = mydata; // 연동 시 보유(상세)·미보유(개설 안내) 모두 진입
          const openProps = clickable
            ? {
                role: "button",
                tabIndex: 0,
                onClick: () => setSheetRoom(r),
                onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSheetRoom(r)),
              }
            : {};
          return (
            <div key={r.id} className={cx(styles.acct, needsOpen && styles.acctOpen, clickable && styles.acctClickable)} {...openProps}>
              {/* 상단 — 계좌명 + (개행) 금융사 로고·명칭 / 우측 누적 평가액(상하 분리) */}
              <div className={styles.acctTop}>
                <div className={styles.txt}>
                  <span className={styles.name}>{r.name}</span>
                  {r.institution ? (
                    <span className={styles.inst}>
                      <span className={styles.instLogo}>
                        <Landmark size={11} strokeWidth={2.4} />
                      </span>
                      {r.institution}
                    </span>
                  ) : (
                    <span className={styles.desc}>{r.benefit}</span>
                  )}
                </div>
                {r.held === true ? (
                  <div className={styles.balBox}>
                    <span className={styles.balCap}>누적 평가액</span>
                    <span className={styles.balVal}>{fmtKRW(r.balance)}</span>
                  </div>
                ) : needsOpen ? (
                  <span className={styles.openTag}>
                    <Plus size={12} strokeWidth={3} /> 개설 추천
                  </span>
                ) : null}
              </div>

              {/* 납입 여력 — 연간 총 한도 · 올해 납입 · 남은 여력 */}
              <div className={styles.roomBox}>
                {unlimited ? (
                  <>
                    <div className={styles.roomLead}>연 납입 한도</div>
                    <div className={cx(styles.roomVal, styles.roomValMuted)}>
                      <InfinityIcon size={22} strokeWidth={2.6} /> 무제한
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.roomGrid}>
                      <div className={styles.roomCell}>
                        <span className={styles.roomK}>{r.roomType === "deduct" ? "연 공제 한도" : "연 납입 한도"}</span>
                        <span className={styles.roomV}>{fmtKRW(r.limit)}</span>
                      </div>
                      <div className={styles.roomCell}>
                        <span className={styles.roomK}>올해 납입</span>
                        <span className={styles.roomV}>{fmtKRW(r.used)}</span>
                      </div>
                      <div className={cx(styles.roomCell, styles.roomCellAccent)}>
                        <span className={styles.roomK}>
                          남은 여력
                          {needsOpen && <span className={styles.maxBadge}>최대</span>}
                        </span>
                        <span className={cx(styles.roomV, styles.roomVAccent)}>{fmtKRW(r.room)}</span>
                      </div>
                    </div>
                    <div className={styles.gauge}>
                      <div className={styles.gaugeFill} style={{ width: `${r.pct}%` }} />
                    </div>
                    <div className={styles.gaugeCaption}>
                      <span>올해 한도 소진율</span>
                      <span>{Math.round(r.pct)}%</span>
                    </div>
                  </>
                )}
                {r.estRefund > 0 && (
                  <div className={styles.roomRefund}>여력을 다 채우면 예상 세액공제 환급 +{fmtKRW(r.estRefund)}</div>
                )}
              </div>

              {/* 하단 밴드 — 보유 계좌는 상세, 개설 추천 계좌는 개설 안내로 진입 */}
              {clickable && (
                <div className={cx(styles.tapHint, needsOpen && styles.tapHintOpen)}>
                  {needsOpen ? "탭하면 계좌 소개와 개설 안내를 볼 수 있어요" : "탭하면 계좌 상세와 조정 추천을 볼 수 있어요"}
                  <ChevronRight size={14} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 요약 배너 */}
      <div className={styles.summary}>
        {totalRefund > 0 && (
          <div className={styles.sumItem}>
            <span className={styles.sumK}>연금 세액공제 다 채울 시</span>
            <strong className={styles.sumV}>연 {fmtKRW(totalRefund)} 환급</strong>
          </div>
        )}
        {openable.length > 0 && (
          <div className={styles.sumNote}>
            <Plus size={13} color={C.gold} strokeWidth={3} />
            {openable.join(" · ")} 개설 시 여력을 최대로 쓸 수 있어요
          </div>
        )}
      </div>

      {/* 계좌 상세 · 조정 추천 바텀시트 */}
      {sheetRoom && <AccountSheet room={sheetRoom} onClose={() => setSheetRoom(null)} />}
    </>
  );
}

/* 계좌 상세 바텀시트 — 잔액·진행률·3스탯·한줄 정리·보유상품별 조정 추천 */
function AccountSheet({ room, onClose }) {
  const unlimited = room.roomType === "none";
  const needsOpen = room.held === false; // 개설 추천 계좌
  const sheetRef = useRef(null);
  const startY = useRef(0);
  const curY = useRef(0); // 현재 드래그 오프셋(px)
  const dragActive = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [sheetH, setSheetH] = useState(640); // 시트 높이 — 드래그/닫기 시작 시 측정 (렌더 중 ref 접근 금지)

  const DISMISS_PX = 90; // 이 이상 내리면 닫힘, 아니면 스냅백

  // 닫기 — 슬라이드 다운 + 페이드아웃 후 트랜지션 종료 시 실제 언마운트
  const dismiss = () => {
    const h = sheetRef.current?.offsetHeight || 640;
    setSheetH(h);
    setDragging(false);
    setClosing(true);
    curY.current = h;
    setOffset(h);
  };
  const onTransEnd = (e) => {
    if (closing && e.propertyName === "transform" && e.target === sheetRef.current) onClose();
  };

  // 최상단 핸들 그랩 영역에서만 스와이프 닫기 (본문 스와이프는 스크롤만)
  const onPointerDown = (e) => {
    dragActive.current = true;
    startY.current = e.clientY;
    curY.current = 0;
    setSheetH(sheetRef.current?.offsetHeight || 640);
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragActive.current) return;
    const dy = Math.max(0, e.clientY - startY.current); // 아래로만
    curY.current = dy;
    setOffset(dy);
  };
  const endDrag = () => {
    if (!dragActive.current) return;
    dragActive.current = false;
    setDragging(false);
    if (curY.current > DISMISS_PX) dismiss();
    else {
      curY.current = 0;
      setOffset(0); // 스냅백
    }
  };

  const progress = Math.min(1, offset / (sheetH * 0.7));
  const sheetOpacity = offset ? Math.max(0, 1 - progress) : undefined;
  const springTransition = "transform 0.3s cubic-bezier(0.33, 0, 0.2, 1), opacity 0.3s ease";

  return (
    <div
      className={styles.sheetBackdrop}
      style={{
        opacity: dragging ? Math.max(0, 1 - progress) : closing ? 0 : undefined,
        transition: dragging ? "none" : "opacity 0.3s ease",
      }}
      onClick={dismiss}
    >
      <div
        ref={sheetRef}
        className={styles.sheet}
        style={{
          transform: offset ? `translateY(${offset}px)` : undefined,
          opacity: sheetOpacity,
          transition: dragging ? "none" : springTransition,
        }}
        onTransitionEnd={onTransEnd}
        role="dialog"
        aria-modal="true"
        aria-label={`${room.name} 계좌 ${needsOpen ? "개설 안내" : "상세"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 최상단 그랩 바 — 여기서만 아래로 스와이프하면 닫힘 */}
        <div
          className={styles.sheetGrab}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className={styles.sheetHandle} aria-hidden="true" />
        </div>
        <button type="button" className={styles.sheetClose} aria-label="닫기" onClick={dismiss}>
          <X size={16} />
        </button>

        {needsOpen ? (
          /* 개설 추천 계좌 — 개념 설명 + 한화투자증권 개설 링크 */
          <>
            <div className={styles.shOpenTag}>
              <Sparkles size={13} strokeWidth={2.6} /> 개설 추천
            </div>
            <div className={styles.shName}>{room.name} 계좌란?</div>
            <p className={styles.shAbout}>{room.about}</p>

            <div className={styles.shSection}>
              <div className={styles.shSecTitle}>이런 점이 좋아요</div>
              <ul className={styles.benefitList}>
                <li>{room.benefit}</li>
                {room.recommend && <li>{room.recommend}</li>}
                {room.roomType === "deduct" && room.room > 0 && (
                  <li>
                    지금 개설하면 올해 세액공제 여력 <b>{fmtKRW(room.room)}</b>을 새로 쓸 수 있어요.
                  </li>
                )}
              </ul>
            </div>

            <a className={styles.openCta} href={OPEN_URL} target="_blank" rel="noopener noreferrer">
              {OPEN_INSTITUTION}에서 {room.name} 개설하기
              <ExternalLink size={17} strokeWidth={2.4} />
            </a>
            <p className={styles.openNote}>
              {OPEN_INSTITUTION} 앱/웹으로 이동해요. 개설 후 마이데이터를 다시 연동하면 자동 반영돼요.
            </p>
          </>
        ) : (
          /* 보유 계좌 — 상세 + 조정 추천 */
          <>
            {/* 헤더 — 계좌명 + 금융사 · 누적 평가액 */}
            <div className={styles.shName}>{room.name} 계좌</div>
            {room.institution && (
              <span className={styles.inst}>
                <span className={styles.instLogo}>
                  <Landmark size={11} strokeWidth={2.4} />
                </span>
                {room.institution}
              </span>
            )}
            <div className={styles.shBal}>{fmtKRW(room.balance)}</div>

            {/* 진행률 바 */}
            {!unlimited && (
              <>
                <div className={styles.shBar}>
                  <div className={styles.shBarFill} style={{ width: `${room.pct}%` }} />
                </div>
                <div className={styles.shBarCap}>
                  <span>{room.name} {room.roomType === "deduct" ? "세액공제 한도" : "납입 한도"}</span>
                  <span>추가납입 가능 {fmtKRW(room.room)}</span>
                </div>
              </>
            )}

            {/* 3 스탯 */}
            <div className={styles.shStats}>
              <div className={styles.shStat}>
                <b>{unlimited ? "무제한" : fmtKRW(room.room)}</b>
                <span>남은 여력</span>
              </div>
              <div className={styles.shStat}>
                <b>{room.estSaving > 0 ? fmtKRW(room.estSaving) : "—"}</b>
                <span>예상 절세효과</span>
              </div>
              <div className={styles.shStat}>
                <b>{room.holdings.length}개</b>
                <span>보유 상품</span>
              </div>
            </div>

            {/* 한줄 정리 */}
            <div className={styles.shSection}>
              <div className={styles.shSecTitle}>한줄 정리</div>
              <p className={styles.shOneLiner}>{room.oneLiner}</p>
            </div>

            {/* 보유 상품 · 조정 추천 */}
            <div className={styles.shSection}>
              <div className={styles.shSecTitle}>보유 상품 · 조정 추천</div>
              {room.holdings.length > 0 ? (
                <div className={styles.prodList}>
                  {room.holdings.map((h) => {
                    const adv = adviceFor(h.productType, room.id);
                    return (
                      <div key={h.name} className={styles.prodRow}>
                        <div className={styles.prodTop}>
                          <span className={styles.prodName}>{h.name}</span>
                          <b className={styles.prodVal}>{fmtKRW(h.value)}</b>
                        </div>
                        <div className={cx(styles.prodAdvice, styles[`adv_${adv.tone}`])}>
                          {adv.tone === "good" ? <Check size={13} strokeWidth={3} /> : adv.tone === "move" ? <MoveRight size={13} strokeWidth={2.6} /> : <Info size={13} strokeWidth={2.6} />}
                          <span>{adv.text}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.prodEmpty}>아직 보유 상품이 없어요. 남은 여력만큼 새로 담으면 절세 혜택을 받을 수 있어요.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
