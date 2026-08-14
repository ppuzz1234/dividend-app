/**
 * R28 의 타입 수준 증명. 런타임 테스트가 아니므로 `*.test.js` 글롭에 걸리지 않는다.
 *
 * `@ts-expect-error` 는 "이 줄은 반드시 타입 에러여야 한다"를 뜻한다. 스탬프 brand 가 약해져서
 * 에러가 사라지면 tsc 가 "unused '@ts-expect-error' directive"(TS2578) 로 빌드를 실패시킨다.
 * 즉 "스탬프를 손으로 만들어 붙일 수 없다"는 계약을 빌드가 매번 검증한다.
 *
 * 각 위조 시도를 한 줄 대입으로 쓴 이유: 여러 줄 객체 리터럴을 쓰면 에러가 안쪽 속성 줄에 찍혀
 * directive 가 닿지 않는다.
 */

import type { PolicyEffect, ResultStamp, StampedResult } from "../src/index.js";

const effect: PolicyEffect = { value: { kind: "INTEGER", value: 1n }, unit: "KRW" };

/** 스탬프와 구조는 같지만 brand 가 없는 객체. */
const lookalike = {
  packKind: "SYNTHETIC_DEMO" as const,
  policySnapshotVersion: "DEMO",
  policyPackHash: "0".repeat(64),
  synthetic: true,
  notice: "합성 세법 값 · 실제 세법이 아님",
};

// @ts-expect-error brand 가 없는 객체는 ResultStamp 가 될 수 없다
const forgedStamp: ResultStamp = lookalike;

// @ts-expect-error 스탬프를 만들 수 없으므로 봉투도 위조할 수 없다
const forgedEnvelope: StampedResult<PolicyEffect> = { value: effect, stamp: lookalike };

// @ts-expect-error 스탬프를 생략한 봉투도 만들 수 없다
const unstamped: StampedResult<PolicyEffect> = { value: effect };

// KNOWN-LIMITATION(policy-stamp): 이미 발급된 봉투에서 value 를 꺼내 다른 봉투에 옮기는 것은
// 타입이 막지 못한다(구조적으로 동일한 봉투이므로). 다만 봉투를 **처음 만드는** 경로가
// Registry 하나뿐이라 값의 출처는 항상 스탬프와 함께이며, 그 전수 검사는
// stamp-enforcement.test.ts 가 런타임에서 수행한다. 더 강하게 막으려면 봉투에 발급 Registry 를
// 묶는 nonce 를 넣고 소비 지점에서 대조해야 하는데, 순서 2 에는 소비 지점이 없어 미룬다.

export type _Unused = [typeof forgedStamp, typeof forgedEnvelope, typeof unstamped];
