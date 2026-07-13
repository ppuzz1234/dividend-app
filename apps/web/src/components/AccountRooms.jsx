import { Wallet, ShieldCheck, PiggyBank, Landmark, Plus, Check, Info, Infinity as InfinityIcon } from "lucide-react";
import { buildAccountRooms } from "@devidend/core";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import { C } from "../theme/tokens.js";
import styles from "./AccountRooms.module.css";

const ICONS = { general: Wallet, isa: ShieldCheck, pensionSavings: PiggyBank, irp: Landmark };

/* 4계좌(일반·ISA·연금저축·IRP) 연 한도·올해 납입·남은 여력 카드
 * 프로필(마이데이터 연동 직후)과 전략 화면(미연동 fallback)이 공유한다.
 * income(전년도 총소득)에 따라 세액공제 환급률(16.5/13.2%)이 달라진다. */
export function AccountRooms({ mydata, income }) {
  const { rooms, totalRefund, openable } = buildAccountRooms({ mydata, income });

  return (
    <>
      <div className={styles.list}>
        {rooms.map((r) => {
          const Icon = ICONS[r.id] || Wallet;
          const unlimited = r.roomType === "none";
          const needsOpen = r.held === false; // 연동됐으나 미보유
          return (
            <div key={r.id} className={cx(styles.acct, needsOpen && styles.acctOpen)}>
              <div className={styles.acctTop}>
                <span className={cx(styles.iconBox, needsOpen && styles.iconBoxOpen)}>
                  <Icon size={19} color={needsOpen ? C.gold : C.jade} />
                </span>
                <span className={styles.txt}>
                  <span className={styles.name}>
                    {r.name}
                    {r.institution && <span className={styles.inst}>{r.institution}</span>}
                  </span>
                  <span className={styles.desc}>{r.benefit}</span>
                </span>
                <span className={styles.status}>
                  {r.held === true ? (
                    /* 잔액 = 지금까지 쌓인 총 평가액 (올해 납입액과 별개) */
                    <span className={styles.bal}>
                      <span className={styles.balCap}>누적 평가액</span>
                      {fmtKRW(r.balance)}
                    </span>
                  ) : needsOpen ? (
                    <span className={styles.openTag}>
                      <Plus size={12} strokeWidth={3} /> 개설 추천
                    </span>
                  ) : null}
                </span>
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

              {r.constraint && (
                <div className={styles.constraint}>
                  <Info size={12} strokeWidth={2.5} /> {r.constraint}
                </div>
              )}

              {needsOpen && r.recommend && (
                <div className={styles.recommend}>
                  <Check size={13} color={C.gold} strokeWidth={3} />
                  <span>{r.recommend}</span>
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
    </>
  );
}
