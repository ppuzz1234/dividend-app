/**
 * 절대 규칙 8 / 사양 §5.8 — **UI 에서 계산 금지**를 소스 grep 으로 강제한다.
 *
 * ## 왜 리뷰가 아니라 테스트인가
 * "UI 에서 계산하지 말자"는 합의는 리뷰어가 피곤한 날 뚫린다. 한 번 뚫리면
 * 그 다음부터는 "이미 저기서도 하는데"가 되고, 결국 **값의 출처가 조문이 아니게 된다.**
 * 그러면 이 프로젝트의 전제(§1.1 "RAG 는 팩트를 결정하지 않는다")가 UI 층에서 무너진다.
 * 그래서 사람 대신 파일을 훑는다.
 *
 * ## 주석은 벗기고 본다
 * 이 레포는 주석에 조문 값(`1천800만원`·`100분의 9`)을 자주 인용한다. 주석은 실행되지
 * 않으므로 벗겨내고 검사한다 — 안 그러면 설명을 쓸 때마다 테스트가 터진다.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** UI 층 전체 — 서버·렌더러·브라우저 JS·HTML. 하나라도 빼면 거기로 계산이 샌다. */
const SCAN_DIRS = [join(PKG_ROOT, "src"), join(PKG_ROOT, "scripts"), join(PKG_ROOT, "public")];
const SCAN_EXT = new Set([".ts", ".js", ".html"]);

function filesToScan(): string[] {
  const out: string[] = [];
  for (const d of SCAN_DIRS) {
    for (const name of readdirSync(d)) {
      if (SCAN_EXT.has(extname(name))) out.push(join(d, name));
    }
  }
  return out;
}

/** 블록·행 주석 제거. 실행되는 코드만 남긴다. */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * 금지 패턴. "산술이 있다"가 아니라 **"세법 값을 만지고 있다"**를 잡는 것이 목적이라
 * 문자열 인덱싱(`slice(0, 8)`)이나 배열 길이 비교는 걸리지 않게 골랐다.
 */
const BANNED: readonly (readonly [RegExp, string])[] = [
  [/\d\s*[*/%]\s*\d/, "숫자 리터럴 산술 — 금액·세율 계산의 흔적"],
  [/\b\d+\s*[-+]\s*\d+\b/, "숫자 리터럴 가감산"],
  // 변수 × 상수 — `base * 12` 처럼 이름만 봐서는 세법 값인지 모르는 계산. UI 는 어차피 계산하면 안 되므로 전부 막는다.
  [/[A-Za-z_$)\]]\s*[*/]\s*\d|\d\s*[*/]\s*[A-Za-z_$(]/, "변수와 숫자의 곱·나눗셈"],
  // IP·버전(127.0.0.1, 1.0.2)은 앞뒤 점으로 걸러낸다 — 세율은 그런 이웃을 갖지 않는다.
  [/(?<![\d.])0\.\d+(?![\d.])/, "소수 리터럴 — 세율일 가능성이 높다"],
  [/Math\.(?:round|floor|ceil|trunc|abs|max|min|pow)/, "반올림·절사 — 반올림 사양은 정책 팩의 몫이다"],
  [/\.toFixed\(/, "자릿수 처리"],
  [/\bparseFloat\b|\bparseInt\b|\bBigInt\b/, "수치 파싱 — UI 는 문자열만 옮긴다"],
  [/(?:rate|tax|amount|deduction|limit|krw|won)\w*\s*(?:[-+*/]=|=\s*[^=])[^;\n]*[-+*/][^;\n]*[;\n]/i, "세액·한도 변수 산술"],
  // 산술이 없어도 위반이다: 세법스러운 이름에 큰 수를 박아두면 그게 곧 하드코딩된 세법 값이다.
  // 4자리 이상으로 잡아 `topK: 10` 같은 검색 파라미터와 구분한다.
  [/(?:rate|tax|amount|deduction|limit|krw|won|한도|세율)\w*\s*[:=]\s*\d{4,}/i, "세법 값으로 보이는 상수가 박혀 있다 (절대 규칙 1)"],
  [/authorityRank|phaseRank|\bPRIORITY\b|\bpriority\b/, "우선순위 상수 — 서열 판단은 policy 층에서만"],
  // 어휘 자체는 금지하지 않는다 — 예시 질문("IRP 납입한도")은 값이 아니라 질문이다.
  // 금지되는 건 그 어휘에 **숫자가 붙은 것**, 즉 값이 소스에 박힌 경우다.
  [
    /(?:한도|세율|공제액|과세표준)[^\n]{0,12}\d|\d[^\n]{0,12}(?:한도|세율|공제액|과세표준)/,
    "세법 값이 UI 소스에 하드코딩됐다 (절대 규칙 1)",
  ],
];

test("★ UI 코드에 계산·세법 값이 없다 (절대 규칙 8 · 사양 §5.8)", () => {
  const violations: string[] = [];
  for (const f of filesToScan()) {
    const code = stripComments(readFileSync(f, "utf8"));
    for (const [re, why] of BANNED) {
      const m = re.exec(code);
      if (m !== null) {
        violations.push(`${f.slice(PKG_ROOT.length + 1)}: ${why}\n      걸린 것: ${JSON.stringify(m[0].slice(0, 80))}`);
      }
    }
  }
  assert.deepEqual(violations, [], `UI 층에서 계산 흔적이 나왔다:\n  - ${violations.join("\n  - ")}`);
});

test("검사 대상이 실제로 잡혔다 (스캔이 0건이면 테스트가 무의미하다)", () => {
  const files = filesToScan();
  assert.ok(files.length >= 5, `스캔 대상 ${files.length}건 — 경로가 틀렸을 수 있다`);
  for (const need of ["render.ts", "server.ts", "app.js", "index.html"]) {
    assert.ok(files.some((f) => f.endsWith(need)), `${need} 가 스캔에서 빠졌다`);
  }
});

test("탐지기가 실제로 동작한다 (금지 패턴을 심으면 잡힌다)", () => {
  // 검사기 자체가 고장 나면 위 테스트는 조용히 항상 통과한다.
  const bait = "const t = income * 0.15;";
  const hit = BANNED.filter(([re]) => re.test(stripComments(bait)));
  assert.ok(hit.length > 0, "산술을 심었는데 탐지기가 못 잡았다");
});

test("주석 속 조문 인용은 오탐이 아니다", () => {
  const commented = "// 조문은 100분의 9 라고 쓴다\n/* 1천800만원 한도 */\nconst a = b;";
  const stripped = stripComments(commented);
  assert.equal(BANNED.filter(([re]) => re.test(stripped)).length, 0);
});

test("오탐 회귀: IP 주소와 '한도'라는 낱말 자체는 걸리지 않는다", () => {
  // 좁히기 전에는 `127.0.0.1` 의 `0.0` 이 세율로, 예시 질문의 `납입한도` 가 하드코딩 값으로 잡혔다(실측).
  const OK = ['server.listen(8787, "127.0.0.1");', "<button>IRP 납입한도</button>", "const v = a.length > 0;"];
  for (const ok of OK) {
    assert.deepEqual(BANNED.filter(([re]) => re.test(ok)).map(([, w]) => w), [], `오탐: ${ok}`);
  }
});

test("좁힌 뒤에도 진짜 위반은 잡는다", () => {
  for (const bad of ["const rate = 0.15;", "const nonTaxLimit = 20000000;", "const x = base * 12;"]) {
    assert.ok(BANNED.some(([re]) => re.test(bad)), `놓쳤다: ${bad}`);
  }
});
