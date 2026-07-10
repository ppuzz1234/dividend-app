import { ArrowRight, Check } from "lucide-react";
import { Pad } from "../components/layout/Pad.jsx";
import { Heading } from "../components/layout/Heading.jsx";
import { Button } from "../components/ui/Button.jsx";
import { SURVEY_QUESTIONS, surveyComplete } from "@devidend/core";
import { cx } from "../lib/cx.js";
import styles from "./Survey.module.css";

/* ① 투자 성향 파악 — 문항은 core(profile/survey)가 정의 */
export function Survey({ answers, setAnswers, onNext }) {
  const complete = surveyComplete(answers);
  const pick = (qid, v) => setAnswers((a) => ({ ...a, [qid]: v }));

  return (
    <Pad
      footer={
        <Button onClick={complete ? onNext : undefined} icon={ArrowRight} disabled={!complete}>
          {complete ? "성향 분석 완료 · 다음" : "모든 문항에 답해주세요"}
        </Button>
      }
    >
      <Heading sub="4가지 질문으로 맞는 계좌와 운용 방식을 찾아드려요.">투자 성향 알아보기</Heading>

      {SURVEY_QUESTIONS.map((q, qi) => (
        <div key={q.id} className={styles.q}>
          <div className={styles.qTitle}>
            <span className={styles.qNum}>{qi + 1}</span>
            {q.q}
          </div>
          <div className={styles.opts}>
            {q.opts.map((o) => {
              const on = answers[q.id] === o.v;
              return (
                <button key={o.v} onClick={() => pick(q.id, o.v)} className={cx(styles.opt, on && styles.optOn)}>
                  <span className={styles.optTxt}>
                    <span className={styles.optLabel}>{o.l}</span>
                    <span className={styles.optDesc}>{o.d}</span>
                  </span>
                  {on && <Check size={16} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Pad>
  );
}
