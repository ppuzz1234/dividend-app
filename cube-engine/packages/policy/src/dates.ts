/**
 * KST LocalDate — 사양 §5.3.4 · CLAUDE.md 규칙 6.
 *
 * 날짜는 `YYYY-MM-DD` 문자열로만 다룬다. Date 객체를 만들지 않는 이유: JS Date 는 UTC 로 정규화되어
 * 시행일 경계 ±1일이 실행 환경의 타임존에 따라 흔들린다. 이 형식은 사전순 비교가 곧 시간순 비교이므로
 * 문자열 비교로 충분하다.
 */

import { reject } from "./errors.js";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 형식과 달력 존재 여부를 모두 검사한다. 정규식만으로는 2026-02-30 을 못 잡는다. */
export function assertLocalDate(value: unknown, path: string): string {
  if (typeof value !== "string" || !LOCAL_DATE_RE.test(value)) {
    reject(
      "DATE_FORMAT_INVALID",
      path,
      `KST YYYY-MM-DD 문자열이어야 한다 (UTC 변환·시각 성분 금지): ${JSON.stringify(value)}`,
    );
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12) {
    reject("DATE_NOT_A_CALENDAR_DATE", path, `월이 1~12 범위 밖이다: ${value}`);
  }
  const base = DAYS_IN_MONTH[month - 1] as number;
  const maxDay = month === 2 && isLeapYear(year) ? 29 : base;
  if (day < 1 || day > maxDay) {
    reject("DATE_NOT_A_CALENDAR_DATE", path, `달력에 존재하지 않는 날짜다: ${value}`);
  }
  return value;
}

/** 사전순 비교 = 시간순 비교. 두 인자 모두 assertLocalDate 를 통과한 값이어야 한다. */
export function compareLocalDate(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
