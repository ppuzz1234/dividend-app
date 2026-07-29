import { useState } from "react";
import { Plus, Check, Info, Infinity as InfinityIcon, Landmark, MoveRight, ExternalLink, Repeat } from "lucide-react";
import { buildAccountRooms } from "@devidend/core";
import { logoFor } from "../lib/institutionLogos.js";
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

/* 금융사 로고 — 레지스트리 매칭 시 PNG, 미등록 기관은 Landmark 아이콘 폴백 */
function InstLogo({ institution }) {
  const src = logoFor(institution);
  return (
    <span className={styles.instLogo}>
      {src ? <img src={src} alt="" className={styles.instImg} /> : <Landmark size={11} strokeWidth={2.4} />}
    </span>
  );
}

/* 탭 순서·라벨 — ISA · 연금저축 · IRP · 일반 (일반 위탁계좌는 짧게 "일반") */
const TAB_ORDER = ["isa", "pensionSavings", "irp", "general"];
const TAB_LABELS = { isa: "ISA", pensionSavings: "연금저축", irp: "IRP", general: "일반" };

/* 월 불입 배분 표시 순서 — 탭과 동일하게 ISA → 연금저축 → IRP → 일반 */
const PLAN_VIEW_ORDER = TAB_ORDER;

/* 4계좌(ISA·연금저축·IRP·일반) 탭 — 선택한 계좌 하나의 전략을 한 패널에 정리.
 * 기존 계좌 타일(한도·납입·여력 게이지)과 상세 시트(한줄 정리·보유 상품 조정 추천·
 * 개설 안내) 내용을 합쳐 간결하게 재구성했다.
 * monthlyContribution 전달 시 — 절세 한도 waterfall 배분으로 "어느 계좌에 매달
 * 얼마를 납입할지"를 상단 스트립과 각 탭의 추천 카드로 보여준다. */
export function AccountRooms({ mydata, manual, income, age, monthlyContribution = 0, taxPref = "growth", isaRollover = "isa1", perAccount = null }) {
  const { rooms, openable } = buildAccountRooms({ mydata, manual, income, age, monthlyContribution, taxPref, isaRollover, perAccount });
  const ordered = TAB_ORDER.map((id) => rooms.find((r) => r.id === id)).filter(Boolean);
  const [tab, setTab] = useState(ordered[0].id);
  const room = ordered.find((r) => r.id === tab) || ordered[0];
  const unlimited = room.roomType === "none";
  const needsOpen = room.held === false; // 연동됐으나 미보유 → 개설 추천
  const hasPlan = monthlyContribution > 0;
  // 배분된(0원 초과) 계좌만 우선순위 순으로 — 스트립 막대·칩 공용
  const planned = PLAN_VIEW_ORDER.map((id) => rooms.find((r) => r.id === id)).filter(
    (r) => r && (r.planMonthly || 0) > 0
  );

  return (
    <>
      {/* 월 납입 배분 스트립 — 매달 투자금이 어느 계좌로 얼마씩 가는지 한눈에 */}
      {hasPlan && planned.length > 0 && (
        <div className={styles.allocCard}>
          <div className={styles.allocHead}>
            매달 <b>{fmtKRW(monthlyContribution)}</b>은 이렇게 나눠 담아요
          </div>
          {/* 각 세그먼트가 곧 계좌 선택 버튼 — 내부에 계좌명·월 납입액을 직접 표기 */}
          <div className={styles.allocBar}>
            {planned.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-label={`${TAB_LABELS[r.id]} 월 ${fmtKRW(Math.round(r.planMonthly))} 선택`}
                aria-pressed={tab === r.id}
                className={cx(
                  styles.allocSeg,
                  styles[`seg_${r.id}`],
                  tab === r.id && styles.allocSegOn // 선택 계좌의 세그먼트를 링으로 강조
                )}
                style={{ flexGrow: r.planShare }}
                onClick={() => setTab(r.id)}
              >
                <span className={styles.segName}>{TAB_LABELS[r.id]}</span>
                <span className={styles.segAmt}>{fmtKRW(Math.round(r.planMonthly))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 계좌 탭바 */}
      <div className={styles.tabs} role="tablist" aria-label="계좌별 전략">
        {ordered.map((r) => (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={tab === r.id}
            className={cx(styles.tab, tab === r.id && styles.tabOn)}
            onClick={() => setTab(r.id)}
          >
            {TAB_LABELS[r.id]}
            {r.held === false && <Plus size={11} strokeWidth={3.2} className={styles.tabPlus} />}
          </button>
        ))}
      </div>

      {/* 선택 계좌 패널 — key 교체로 탭 전환마다 페이드인.
       * 끝 탭 선택 시 해당 쪽 상단 모서리를 각지게 해 탭 옆면과 직선으로 잇는다 */}
      <div
        key={room.id}
        className={cx(
          styles.panel,
          tab === ordered[0].id && styles.panelFirst,
          tab === ordered[ordered.length - 1].id && styles.panelLast
        )}
      >
        {/* 헤더 — 금융사 / 누적 평가액 또는 개설 추천 태그 (계좌명은 탭이 대신한다) */}
        <div className={styles.panelTop}>
          <div className={styles.txt}>
            {room.institution ? (
              <span className={styles.inst}>
                <InstLogo institution={room.institution} />
                {room.institution}
              </span>
            ) : (
              <span className={styles.desc}>{room.benefit}</span>
            )}
          </div>
          {room.held === true ? (
            <div className={styles.balBox}>
              <span className={styles.balCap}>누적 평가액</span>
              <span className={styles.balVal}>{fmtKRW(room.balance)}</span>
            </div>
          ) : needsOpen ? (
            <span className={styles.openTag}>
              <Plus size={12} strokeWidth={3} /> 개설 추천
            </span>
          ) : null}
        </div>

        {/* 월 납입 추천 — 남은 여력(연) 안에서 이 계좌가 받을 몫 */}
        {hasPlan &&
          ((room.planMonthly || 0) > 0 ? (
            <div className={styles.planCard}>
              <div className={styles.planTop}>
                <span className={styles.planK}>{needsOpen ? "개설 후 월 납입 추천" : "월 납입 추천"}</span>
                <span className={styles.planShare}>월 투자금의 {Math.round((room.planShare || 0) * 100)}%</span>
              </div>
              <div className={styles.planV}>
                매달 {fmtKRW(Math.round(room.planMonthly))}
                <span className={styles.planYear}>연 {fmtKRW(room.planTotalAnnual ?? room.planAnnual)}</span>
              </div>
              <p className={styles.planReason}>{room.planReason}</p>
              {/* 비공제 추가납입 — 납입한도(1,800만)까지 래퍼를 더 채우는 몫 */}
              {(room.planExtraAnnual || 0) > 0 && (
                <p className={styles.planExtra}>
                  이 중 월 {fmtKRW(Math.round(room.planExtraAnnual / 12))}은 비공제 추가납입 — {room.planExtraReason}
                </p>
              )}
              {/* ISA 3년 롤오버 — 만기금 연금저축 대량 이전(납입한도 별개) + 추가 세액공제 */}
              {room.rollover?.events.length > 0 && (
                <p className={styles.planRollover}>
                  <Repeat size={12} strokeWidth={2.6} />
                  3년 만기마다 약 {fmtKRW(Math.round(room.rollover.events[0].transferred))}을 연금저축으로 한 번에
                  이전(연금 납입한도와 별개)하고, 이전액 10% 추가 세액공제로 20년간 약 +
                  {fmtKRW(Math.round(room.rollover.totalExtraRefund))}을 더 환급받아요.
                </p>
              )}
            </div>
          ) : (
            <div className={cx(styles.planCard, styles.planCardEmpty)}>
              이번 배분에서는 납입하지 않아요 — {room.planReason}
            </div>
          ))}

        {/* 납입 여력 — 연간 총 한도 · 당해 기납 · 남은 여력 */}
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
                  <span className={styles.roomK}>{room.roomType === "deduct" ? "연 공제 한도" : "연 납입 한도"}</span>
                  <span className={styles.roomV}>{fmtKRW(room.limit)}</span>
                </div>
                <div className={styles.roomCell}>
                  <span className={styles.roomK}>당해 기납</span>
                  <span className={styles.roomV}>{fmtKRW(room.used)}</span>
                </div>
                <div className={styles.roomCell}>
                  <span className={styles.roomK}>
                    남은 여력
                    {needsOpen && <span className={styles.maxBadge}>최대</span>}
                  </span>
                  <span className={cx(styles.roomV, styles.roomVAccent)}>{fmtKRW(room.room)}</span>
                </div>
              </div>
              <div className={styles.gauge}>
                <div className={styles.gaugeFill} style={{ width: `${room.pct}%` }} />
              </div>
              <div className={styles.gaugeCaption}>
                <span>올해 한도 소진율</span>
                <span>{Math.round(room.pct)}%</span>
              </div>
            </>
          )}
          {room.estRefund > 0 && (
            <div className={styles.roomRefund}>여력을 다 채우면 예상 세액공제 환급 +{fmtKRW(room.estRefund)}</div>
          )}
          {/* 공제 한도 ≠ 납입 한도 안내 — IRP처럼 둘이 다른 계좌에서만 노출 */}
          {room.depositNote && <p className={styles.roomNote}>{room.depositNote}</p>}
        </div>

        {/* 한줄 정리 — 미보유(개설 추천) 계좌는 계좌 소개로 대체 */}
        <p className={styles.oneLiner}>{needsOpen ? room.about : room.oneLiner}</p>

        {/* 보유 계좌 — 보유 상품별 조정 추천 */}
        {room.held === true &&
          (room.holdings.length > 0 ? (
            <div className={styles.panelSec}>
              <div className={styles.secTitle}>보유 상품 · 조정 추천</div>
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
            </div>
          ) : (
            <p className={styles.prodEmpty}>아직 보유 상품이 없어요. 남은 여력만큼 새로 담으면 절세 혜택을 받을 수 있어요.</p>
          ))}

        {/* 개설 추천 계좌 — 좋은 점 + 개설 링크 */}
        {needsOpen && (
          <>
            <div className={styles.panelSec}>
              <div className={styles.secTitle}>이런 점이 좋아요</div>
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
        )}
      </div>

      {/* 요약 배너 */}
      <div className={styles.summary}>
        {openable.length > 0 && (
          <div className={styles.sumNote}>
            <Plus size={13} color={C.gold} strokeWidth={3} />
            {openable.join(" · ")} 개설 시 여력을 최대로 쓸 수 있어요
          </div>
        )}
      </div>
    </>
  );
}
