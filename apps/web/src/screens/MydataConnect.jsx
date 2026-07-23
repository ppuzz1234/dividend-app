import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight, RefreshCw, ShieldCheck, Lock, Check, X, BadgeCheck, ChevronDown, ChevronRight,
  Landmark, CreditCard, Shield, TrendingUp, Wallet, HeartPulse, Smartphone, FileText,
} from "lucide-react";
import { MYDATA_ACCOUNTS } from "@devidend/core";
import { Button } from "../components/ui/Button.jsx";
import { logoFor } from "../lib/institutionLogos.js";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./MydataConnect.module.css";

/* 마이데이터로 불러오는 계좌 유형 라벨 (mock 스냅샷 키 매핑) */
const ACCT_LABELS = { general: "일반 위탁계좌", isa: "ISA", irp: "IRP", pension: "연금저축" };

/* ── 동의 시트 콘텐츠 (마이데이터 통합인증 동의 화면 재현) ── */
/* 전송요구 정보 — 업권별 */
const TRANSFER = [
  ["은행", "계좌(수신/펀드/신탁/ISA/대출/숨은금융자산), 퇴직연금(개인형IRP/DB/DC), 선불카드 목록 및 관련 정보"],
  ["카드", "카드 및 선불카드 목록, 관련 정보(포인트, 청구·결제, 리볼빙 포함), 대출상품 정보"],
  ["금융투자", "계좌 목록 및 정보, 퇴직연금(개인형IRP/DB/DC형) 목록 및 정보"],
  ["보험", "(계약자/피보험자) 보험(증권 목록 및 정보), (계약자) 대출(계좌 목록 및 상품 정보), (계약자) 퇴직연금(개인형IRP/DB/DC형 목록 및 정보)"],
  ["할부금융", "계좌(대출/운용리스) 목록 및 관련 정보"],
  ["전자금융", "선불전자지급수단 목록(계정 포함) 및 관련 정보(결제 정보 포함)"],
  ["통신", "통신 계약 목록 및 정보"],
];
/* 정확한 자산관리를 위한 선택 항목 설명 + 토글 */
const OPT_DESCS = [
  "적요, 거래메모: 보낸 사람과 받은 사람의 정보 등 나의 개인 생활과 경제 활동에 대한 상세 정보가 포함되어 있어요",
  "가맹점명, 사업자 등록번호: 나의 소비생활에 관련된 상세정보가 포함되어 있어요",
  "상품카테고리: 구매한 상품의 카테고리 정보가 포함되어 있어요",
];
const OPT_TOGGLES = [
  { key: "memo", label: "입·출금한 곳 볼게요" },
  { key: "pay", label: "어디서 결제했는지 볼게요" },
  { key: "category", label: "카테고리 정보 볼게요" },
];
/* 개인(신용)정보 제공 동의 대상 */
const PROVIDE = [
  {
    provider: "한화투자증권 외 201개 금융사",
    purpose: "본인확인 및 개인(신용)정보의 전송",
    period: "본인확인 및 개인(신용정보)의 전송 목적 달성 시까지",
    info: "전자서명, CI, 인증서, 전송요구서",
  },
  {
    provider: "한국신용정보원",
    purpose: "마이데이터 서비스 가입현황 안내 및 전송요구내역 통합조회 서비스 제공",
    period: "한국신용정보원에게 마이데이터 서비스 가입현황 안내 및 전송요구내역 통합조회 서비스 제공 목적 달성 시까지",
    info: "회원 가입 여부, 서비스목록 수, 서비스목록, 클라이언트ID, 전송요구내역 수, 전송요구내역목록, 정보제공자 기관코드, 권한 범위, 전송요구일자, 전송요구종료시점 항목",
  },
];
/* 유의사항 */
const NOTES = [
  "신중히 고민하고 필요한 서비스만 이용해 주세요. 안 쓰는 서비스는 언제든 탈퇴할 수 있어요. 나의 마이데이터 가입현황과 개인정보처리방침 확인해주세요",
  "개인(신용)정보 수집·이용 필수 항목 동의를 하지 않을 경우 본인 신용정보 통합 조회 및 데이터 분석 서비스 이용이 제한됩니다. 선택 항목 동의를 하지 않을 경우 해당 항목 관련 서비스 이용이 제한될 수 있습니다. 또한, 개인(신용)정보 제공 동의는 상기 서비스 및 마이데이터 서비스 이용의 필수 사항으로, 동의 해야만 해당 서비스 제공이 가능합니다.",
];
/* 하단 필수 동의 항목 + 본인확인 인증 하위 항목 */
const REQ_ITEMS = [
  { key: "collect", label: "개인(신용)정보 수집·이용 동의" },
  { key: "provide", label: "개인(신용)정보 제공 동의" },
];
const AUTH_SUBS = [
  "[필수] 본인인증을 위한 개인정보 제3자 제공 동의 (PLUS CUBE → 카카오)",
  "[필수] 마이데이터 통합인증을 위한 개인정보 제3자 제공 동의 (카카오 → PLUS CUBE, 정보제공자)",
];

/* intro 에서 미리 보여주는 연동 기관(업권) 칩 */
const SCOPE_CHIPS = ["은행", "카드", "보험", "전자금융업", "보증보험", "금융투자", "건강보험", "통신사"];

/* 불러온 계좌 리스트 — 스냅샷을 화면용으로 정규화 */
const LOADED = Object.entries(MYDATA_ACCOUNTS).map(([id, a]) => ({
  id,
  label: ACCT_LABELS[id] ?? id,
  institution: a.institution,
  logo: logoFor(a.institution),
  balance: a.balance,
}));
const LOADED_TOTAL = LOADED.reduce((s, a) => s + (a.balance || 0), 0);

/* (데모) 마이데이터로 연동되는 금융사·기관 — 업권별로 흩어진 자산을 한 번에 가져오는 느낌을 준다.
 * 실제 자산 분석에는 LOADED(투자계좌 3개)만 쓰고, 이 목록은 '광범위 연동' 시각화 용도.
 * color: 업권별 고유 색(아이콘·체크 배지에 사용) — 단색(제이드)이 아닌 정돈된 다색 팔레트. */
const MYDATA_SOURCES = [
  { key: "bank", label: "은행", Icon: Landmark, color: "#5b9dff", insts: ["KB국민은행", "신한은행", "하나은행", "우리은행", "NH농협은행", "IBK기업은행"] },
  { key: "card", label: "카드", Icon: CreditCard, color: "#b07cff", insts: ["신한카드", "삼성카드", "현대카드", "KB국민카드"] },
  { key: "invest", label: "금융투자", Icon: TrendingUp, color: "#2fc98a", insts: ["한화투자증권", "키움증권", "미래에셋증권", "삼성증권"] },
  { key: "insure", label: "보험", Icon: Shield, color: "#35c4dd", insts: ["삼성생명", "한화생명", "교보생명", "삼성화재"] },
  { key: "efin", label: "전자금융", Icon: Wallet, color: "#f2a63d", insts: ["네이버페이", "토스", "페이코"] },
  { key: "guarantee", label: "보증보험", Icon: FileText, color: "#f2795b", insts: ["SGI서울보증"] },
  { key: "health", label: "건강보험", Icon: HeartPulse, color: "#f56a9c", insts: ["국민건강보험공단"] },
  { key: "telco", label: "통신", Icon: Smartphone, color: "#8a8cff", insts: ["SKT", "KT", "LG U+"] },
];
const SRC_TOTAL = MYDATA_SOURCES.reduce((s, c) => s + c.insts.length, 0);

/* 로딩 타일 등장 간격(ms)과 전체 로딩 시간 — 마지막 타일 연동 완료 직후 곧바로 다음 화면으로 넘긴다.
 * (마지막 딜레이 + 체크 팝 애니메이션 완료 ≈ 550ms 뒤 + 짧은 여운) */
const LOAD_STAGGER = 170;
const LOAD_MS = (MYDATA_SOURCES.length - 1) * LOAD_STAGGER + 1000;

/* (데모 전용) 마이데이터 연동 — 화면 레이아웃(본문 + 하단 고정 CTA)을 직접 소유한다.
 *  intro(동의 유도) → [동의 시트] → loading(브랜드 로더) → loaded(불러온 계좌 확인)
 *  → onNext 로 계좌 분석 화면 진입. 데이터는 파일(MYDATA_ACCOUNTS)에서 그대로. */
export function MydataConnect({ onNext, name = "고객" }) {
  const [phase, setPhase] = useState("intro"); // intro | loading | loaded
  const [consentOpen, setConsentOpen] = useState(false);

  // 동의 완료 → 로딩 → 불러오기 완료
  useEffect(() => {
    if (phase !== "loading") return undefined;
    const t = setTimeout(() => setPhase("loaded"), LOAD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const onAgree = () => {
    setConsentOpen(false);
    setPhase("loading");
  };

  // ── 로딩: 여러 업권의 금융사·기관이 순차적으로 연동되는 비주얼 ──
  if (phase === "loading") {
    return (
      <div className={styles.screen}>
        <div className={styles.loadBody}>
          <header className={styles.loadHead}>
            <h2 className={styles.loadTitle}>
              여러 금융사에서
              <br />
              정보를 안전하게 모으고 있어요
            </h2>
            <p className={styles.loadSub}>
              은행·카드·보험·금융투자 등 흩어진 자산을 마이데이터로 한 번에 연동해요
            </p>
          </header>

          <div className={styles.srcGrid}>
            {MYDATA_SOURCES.map((c, ci) => {
              const delay = `${ci * LOAD_STAGGER}ms`;
              return (
                <div key={c.key} className={styles.srcTile} style={{ "--c": c.color, animationDelay: delay }}>
                  <span className={styles.srcTileCheck} style={{ animationDelay: `calc(${delay} + 150ms)` }}>
                    <Check size={12} strokeWidth={3.5} />
                  </span>
                  <span className={styles.srcTileIcon}>
                    <c.Icon size={17} strokeWidth={2.3} />
                  </span>
                  <span className={styles.srcTileName}>{c.label}</span>
                  <span className={styles.srcTileCount}>{c.insts.length}곳 연동</span>
                </div>
              );
            })}
          </div>

          <p className={styles.loadFoot}>
            <ShieldCheck size={14} /> 총 {SRC_TOTAL}개 기관에서 조회 전용으로 안전하게 가져오는 중
          </p>
        </div>
      </div>
    );
  }

  // ── 불러오기 완료 ──
  if (phase === "loaded") {
    return (
      <div className={styles.screen}>
        <div className={styles.body}>
          {/* 광범위 연동 요약 — 여러 업권의 금융사·기관에서 정보를 가져왔음을 강조 */}
          <div className={cx(styles.linkCard, styles.reveal)}>
            <div className={styles.linkHead}>
              <BadgeCheck size={16} />
              <span>{SRC_TOTAL}개 금융사·기관 정보 연동 완료</span>
            </div>
            <div className={styles.linkCats}>
              {MYDATA_SOURCES.map((c) => (
                <span key={c.key} className={styles.linkCat} style={{ "--c": c.color }}>
                  <span className={styles.linkCatIcon}>
                    <c.Icon size={12} strokeWidth={2.4} />
                  </span>
                  {c.label}
                  <b>{c.insts.length}</b>
                </span>
              ))}
            </div>
          </div>

          <div className={styles.acctLabel}>자산 분석에 사용할 계좌</div>
          <div className={cx(styles.totalCard, styles.reveal)}>
            <div className={styles.totalHead}>
              <BadgeCheck size={16} className={styles.totalCheck} />
              <span>투자 계좌 {LOADED.length}개</span>
            </div>
            <b className={styles.totalV}>{fmtKRW(LOADED_TOTAL)}</b>
            <span className={styles.totalK}>총 평가금액</span>
          </div>

          <ul className={styles.acctList}>
            {LOADED.map((a, i) => (
              <li key={a.id} className={cx(styles.acct, styles.seq)} style={{ animationDelay: `${i * 90}ms` }}>
                <span className={styles.acctLogo}>
                  {a.logo ? (
                    <img src={a.logo} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
                  ) : (
                    a.institution.slice(0, 1)
                  )}
                </span>
                <span className={styles.acctInfo}>
                  <b className={styles.acctInst}>{a.institution}</b>
                  <span className={styles.acctType}>{a.label}</span>
                </span>
                <b className={styles.acctBal}>{fmtKRW(a.balance)}</b>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <Button onClick={onNext} icon={ArrowRight}>
            이 계좌로 분석 시작하기
          </Button>
        </div>
      </div>
    );
  }

  // ── intro: 최적 솔루션을 위해 마이데이터 조회 동의를 구하는 화면 ──
  return (
    <div className={styles.screen}>
      <div className={cx(styles.body, styles.reveal)}>
        <header className={styles.head}>
          <h2 className={styles.title}>
            정확한 절세 설계를 위해,
            <br />
            {name}님의 금융데이터를 <br /><em>안전하게</em> 가져올게요.
          </h2>
          <p className={styles.sub}>
            흩어진 계좌와 전년도 소득을 마이데이터로 한 번에 조회해, 나에게 맞는 절세·배분 솔루션을 계산해요.
          </p>
        </header>

        <section className={styles.panel} aria-label="안전한 마이데이터 연동 안내">
          <div className={styles.emblem} aria-hidden="true">
            <span className={styles.emblemRing} />
            <Lock size={26} strokeWidth={2} />
          </div>
          <div className={styles.panelTitle}>조회 전용으로만 연결돼요</div>
          <div className={styles.panelSub}>금융보안원 인증 · 이체나 출금 권한은 요청하지 않아요</div>

          <ul className={styles.assure}>
            <li>
              <ShieldCheck size={16} /> 조회한 정보는 오직 절세·배분 전략 계산에만 사용돼요
            </li>
            <li>
              <ShieldCheck size={16} /> 동의 후에도 언제든 연동을 해지할 수 있어요
            </li>
          </ul>

          <div className={styles.scopes}>
            <span className={styles.scopeCap}>불러오는 정보</span>
            <div className={styles.chips}>
              {SCOPE_CHIPS.map((c) => (
                <span key={c} className={styles.chip}>
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className={styles.footer}>
        <Button onClick={() => setConsentOpen(true)} icon={RefreshCw}>
          마이데이터 연동하기
        </Button>
        <p className={styles.footNote}>연동은 30초면 끝나요. 다음 화면에서 조회 범위를 확인하고 동의할 수 있어요.</p>
      </div>

      {consentOpen && <ConsentSheet name={name} onAgree={onAgree} onClose={() => setConsentOpen(false)} />}
    </div>
  );
}

/* 라벨 + 값 세로쌍 (전송요구서/제공동의의 항목 표기) */
function MetaRow({ k, v, accent, underline }) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaK}>{k}</span>
      <span className={cx(styles.metaV, accent && styles.metaAccent, underline && styles.metaUnderline)}>{v}</span>
    </div>
  );
}

/* 마이데이터 통합인증 동의 시트 — 전송요구서·선택 동의·제공 동의·유의사항·필수 동의.
 * 실제 마이데이터 동의 화면 흐름을 재현하되 명칭은 PLUS CUBE / 한화투자증권 을 사용한다.
 * '모두 동의하고 계속하기'가 필수 항목을 일괄 동의하고 연동을 진행한다. */
function ConsentSheet({ name = "고객", onAgree, onClose }) {
  const [opts, setOpts] = useState({ memo: false, pay: false, category: false });
  const [reqs, setReqs] = useState({ collect: false, provide: false, auth: false });
  const toggleOpt = (k) => setOpts((s) => ({ ...s, [k]: !s[k] }));
  const toggleReq = (k) => setReqs((s) => ({ ...s, [k]: !s[k] }));
  const allAgreed = reqs.collect && reqs.provide && reqs.auth;

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
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="마이데이터 통합인증 동의"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.grabber} aria-hidden="true" />

        <div className={styles.sheetHead}>
          <div>
            <span className={styles.eyebrow}>인증 전, 마지막으로 확인해주세요</span>
            <h2 className={styles.sheetTitle}>{name}님의 안전한 정보 확인을 위한 동의 내용이에요</h2>
          </div>
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.sheetBody}>
          <p className={styles.introP}>
            <b>PLUS CUBE</b>는 「신용정보의 이용 및 보호에 관한 법률」, 「개인정보 보호법」 등 관련 법령에 따라 사용자의
            개인(신용)정보를 처리해요
          </p>

          <div className={styles.legalH}>개인(신용)정보 수집·이용 동의 및 전송요구서</div>
          <div className={styles.metaCard}>
            <MetaRow k="정보제공자" v="한화투자증권 외 201개 금융사" underline />
            <MetaRow k="제공받는자" v="PLUS CUBE" />
            <MetaRow k="목적" v="전송요구를 통한 본인신용정보 통합조회, 데이터분석 서비스의 이용" />
            <MetaRow
              k="종료 시점 및 보유·이용기간"
              v="서비스 이용 종료시, 삭제 요구 시 또는 마지막 서비스 로그인 일로부터 1년이 경과한 때까지 중 가장 먼저 도래하는 기한"
              accent
            />
          </div>

          <div className={styles.subH}>전송 요구 정보</div>
          <ul className={styles.bullets}>
            {TRANSFER.map(([k, v]) => (
              <li key={k} className={styles.bullet}>
                <b className={styles.bulletK}>{k}:</b> {v}
              </li>
            ))}
          </ul>

          <p className={styles.introP}>
            전자서명, 접근토큰, 인증서, 전송요구서 개인(식별) 정보를 수집·이용하고 <u>자세한 수집 이용정보</u> 확인할 수
            있어요
          </p>

          <div className={styles.freq}>
            <p>
              나의 금융 자산 정보를 정기적으로{" "}
              <span className={styles.pick}>
                1주에 1회 <ChevronDown size={13} />
              </span>{" "}
              가져오고
            </p>
            <p>
              정보 가져오기 종료일은{" "}
              <span className={styles.pick}>
                5년 후 <ChevronDown size={13} />
              </span>{" "}
              로 할게요
            </p>
            <p className={styles.freqNote}>6개월 동안 접속하지 않으면 더 이상 정보를 가져오지 않아요</p>
          </div>

          <div className={styles.rule} />

          <div className={styles.legalH}>정확한 자산관리를 위한 동의</div>
          <p className={styles.sectSub}>아래 내용을 꼼꼼히 살펴보고 선택해 주세요</p>
          <ul className={styles.bullets}>
            {OPT_DESCS.map((d) => (
              <li key={d} className={styles.bullet}>
                {d}
              </li>
            ))}
          </ul>
          <div className={styles.optList}>
            {OPT_TOGGLES.map((o) => (
              <button
                key={o.key}
                type="button"
                className={cx(styles.optCard, opts[o.key] && styles.optCardOn)}
                onClick={() => toggleOpt(o.key)}
                aria-pressed={opts[o.key]}
              >
                <span className={cx(styles.optCheck, opts[o.key] && styles.optCheckOn)}>
                  <Check size={14} strokeWidth={3} />
                </span>
                <span className={styles.optLabel}>{o.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.rule} />

          <div className={styles.legalH}>개인(신용)정보 제공 동의</div>
          {PROVIDE.map((p, i) => (
            <div
              key={p.provider}
              className={styles.metaCard}
              style={i > 0 ? { marginTop: 10 } : undefined}
            >
              <MetaRow k="정보제공자" v={p.provider} underline />
              <MetaRow k="목적" v={p.purpose} accent />
              <MetaRow k="보유·이용기간" v={p.period} accent />
              <MetaRow k="제공정보" v={p.info} />
            </div>
          ))}

          <div className={styles.rule} />

          <div className={styles.legalH}>유의사항</div>
          <ul className={styles.notes}>
            {NOTES.map((n) => (
              <li key={n} className={styles.note}>
                {n}
              </li>
            ))}
          </ul>

          {/* 하단 필수 동의 항목 */}
          <div className={styles.agreeBox}>
            {REQ_ITEMS.map((it) => (
              <button
                key={it.key}
                type="button"
                className={styles.agreeCard}
                onClick={() => toggleReq(it.key)}
                aria-pressed={reqs[it.key]}
              >
                <span className={cx(styles.check, reqs[it.key] && styles.checkOn)}>
                  {reqs[it.key] && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={styles.agreeLabel}>{it.label}</span>
              </button>
            ))}

            <div className={styles.agreeGroup}>
              <button
                type="button"
                className={styles.agreeGroupHead}
                onClick={() => toggleReq("auth")}
                aria-pressed={reqs.auth}
              >
                <span className={cx(styles.check, reqs.auth && styles.checkOn)}>
                  {reqs.auth && <Check size={14} strokeWidth={3} />}
                </span>
                <span className={styles.agreeLabel}>카카오 인증 본인확인을 위한 동의</span>
              </button>
              <div className={styles.subRows}>
                {AUTH_SUBS.map((t) => (
                  <div key={t} className={styles.subRow}>
                    <Check size={13} strokeWidth={3} className={styles.subCheck} />
                    <span className={styles.subText}>{t}</span>
                    <ChevronRight size={14} className={styles.subChevron} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.sheetFooter}>
          <Button onClick={() => allAgreed && onAgree?.()} icon={ArrowRight} disabled={!allAgreed}>
            모두 동의하고 계속하기
          </Button>
          {!allAgreed && <p className={styles.footNote}>필수 항목에 모두 동의해야 계속할 수 있어요.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}
