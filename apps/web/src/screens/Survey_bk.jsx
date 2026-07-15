import { ArrowRight, Check, Wallet } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { SURVEY_QUESTIONS, SURVEY_MONTHLY, surveyComplete } from "@devidend/core";
import { fmtKRW } from "../lib/format.js";
import { cx } from "../lib/cx.js";
import styles from "./Survey.module.css";

/* ① 투자 성향 파악 — 양자택일 타일 2문항 + 월 불입 슬라이더
 * 문항 정의는 core(profile/survey)가 관리 */
export function Survey({ answers, setAnswers, monthly, setMonthly, onNext }) {
  const complete = surveyComplete(answers);
  const pick = (qid, v) => setAnswers((a) => ({ ...a, [qid]: v }));

  return (
    <Pad
      footer={
        <Button onClick={complete ? onNext : undefined} icon={ArrowRight} disabled={!complete}>
          {complete ? "성향 분석 완료 · 다음" : "각 문항에서 하나를 선택해주세요"}
        </Button>
      }
    >
      <Heading sub="세 가지만 정하면 맞는 계좌와 운용 방식을 찾아드려요.">투자 성향 알아보기</Heading>

      {/* 1·2. 양자택일 타일 */}
      {SURVEY_QUESTIONS.map((q, qi) => (
        <div key={q.id} className={styles.q}>
          <div className={styles.qTitle}>
            <span className={styles.qNum}>{qi + 1}</span>
            {q.q}
          </div>
          <div className={styles.tiles} style={{ gridTemplateColumns: `repeat(${q.opts.length}, 1fr)` }}>
            {q.opts.map((o) => {
              const on = answers[q.id] === o.v;
              return (
                <button key={o.v} onClick={() => pick(q.id, o.v)} className={cx(styles.tile, on && styles.tileOn)}>
                  {on && (
                    <span className={styles.tileCheck}>
                      <Check size={13} strokeWidth={3.5} />
                    </span>
                  )}
                  <span className={styles.tileLabel}>{o.l}</span>
                  <span className={styles.tileDesc}>{o.d}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* 3. 월 불입 가능 금액 — 슬라이더 */}
      <div className={styles.q}>
        <div className={styles.qTitle}>
          <span className={styles.qNum}>{SURVEY_QUESTIONS.length + 1}</span>
          {SURVEY_MONTHLY.q}
          <span className={styles.monthlyVal}>
            <Wallet size={13} /> 월 {fmtKRW(monthly)}
          </span>
        </div>
        <input
          type="range"
          className="rng gold"
          min={SURVEY_MONTHLY.min}
          max={SURVEY_MONTHLY.max}
          step={SURVEY_MONTHLY.step}
          value={monthly}
          onChange={(e) => setMonthly(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div className={styles.rangeLabels}>
          <span>{fmtKRW(SURVEY_MONTHLY.min)}</span>
          <span>{fmtKRW(SURVEY_MONTHLY.max)}</span>
        </div>
        <div className={styles.presets}>
          {SURVEY_MONTHLY.presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setMonthly(p)}
              className={cx(styles.preset, monthly === p && styles.presetOn)}
            >
              {p / 10000}만원
            </button>
          ))}
        </div>
      </div>
    </Pad>
  );
}
