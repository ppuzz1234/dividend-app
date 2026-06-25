# 배당 눈덩이 (devidend-app)

상장 배당주를 골라 담고 재투자 복리로 배당금이 얼마나 굴러가는지 보여주는 투자 시뮬레이터입니다.
프런트엔드와 (향후) 백오피스 API를 함께 관리하는 **npm workspaces 모노레포**입니다.

> 모든 수익률·배당은 예시 가정치이며 실제 수익을 보장하지 않습니다. 투자 권유가 아닙니다.

## 구조

```
devidend-app/
├─ package.json          # 워크스페이스 루트 (공통 스크립트)
└─ apps/
   ├─ web/               # React + Vite 프런트엔드
   │  └─ src/
   │     ├─ App.jsx          # 단계 상태 관리 + 화면 조립
   │     ├─ styles/          # theme.css(토큰 변수) · global.css(리셋/애니메이션)
   │     ├─ theme/tokens.js  # 차트·아이콘용 JS 색상 토큰
   │     ├─ data/            # stocks · accounts (예시 데이터)
   │     ├─ lib/             # format · simulate · flow · cx
   │     ├─ hooks/           # useCountUp
   │     ├─ components/      # ui/ (Button·Tag·… ) · layout/ (ChromeBody·PlainShell·PhoneShell·Stepper·…)
   │     └─ screens/         # 단계별 화면 (각 .jsx + .module.css)
   └─ api/               # Node.js 백오피스 API (현재 스텁)
```

### 스타일 규칙

- 인라인 스타일 대신 **CSS Modules**(`*.module.css`)로 컴포넌트별 스코프 분리.
- 색상·폰트는 `styles/theme.css`의 CSS 변수(`--jade`, `--card` …)가 단일 출처.
- 차트(recharts)·아이콘(lucide)처럼 JS에서 색상 문자열이 필요한 경우만 `theme/tokens.js`를 사용하며, 두 파일은 같은 값을 유지합니다.

## 실행

```bash
npm install          # 루트에서 1회 (모든 워크스페이스 설치)

npm run dev          # 프런트 개발 서버 (apps/web)
npm run build        # 프런트 프로덕션 빌드
npm run lint         # 프런트 린트
npm run dev:api      # 백오피스 API 개발 서버 (apps/api)
```

### 화면 모드

- 기본(`/`): 베젤 없는 **일반 풀뷰** — 실서비스. 모바일은 풀화면, 데스크톱은 모바일 폭 컬럼 중앙정렬.
- `?frame=1`(예: `localhost:5173/?frame=1`): **발표용 아이폰 베젤**. 폰 cosmetic(가짜 상태바·홈바)은 이 모드에서만 표시되며 [PhoneShell](apps/web/src/components/layout/PhoneShell.jsx)에 격리되어 실서비스에 영향 없음.

자세한 백엔드 내용은 [apps/api/README.md](apps/api/README.md) 참고.
