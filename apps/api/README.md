# @devidend/api

배당 눈덩이의 백오피스 API. 한국투자증권(KIS) Open API **시세 프록시** 역할을 합니다.
프론트는 이 서버만 호출하고, KIS는 서버에서만 호출합니다(키 보호 + CORS 회피).

## 실행

```bash
# 루트에서
npm run dev:api          # http://localhost:4000

# 또는 워크스페이스에서 직접
npm run dev --workspace apps/api
```

기본 포트는 `4000`, `PORT` 환경변수로 변경 가능.

## 환경변수 (KIS)

`.env.example` 를 `.env` 로 복사해 채웁니다. **키가 없으면 stub(가상) 시세로 동작**하므로 키 발급 전에도 개발할 수 있습니다.

| 변수 | 설명 |
| ---- | ---- |
| `KIS_ENV` | `mock`(모의, 기본) \| `real`(실전) |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | KIS 발급 키 (미설정 시 stub) |

## 엔드포인트

| 메서드 | 경로 | 설명 |
| ------ | ---- | ---- |
| GET | `/health` | 헬스체크 |
| GET | `/api/kis/status` | KIS 연동 상태 (`env`, `hasKeys`, `source`) |
| GET | `/api/quote/:market/:symbol` | 현재가 (정규화). `market`: `K`(국내) \| `U`(해외), 해외는 `?exchange=NAS\|NYS\|AMS` |

예) `/api/quote/K/005930` · `/api/quote/U/SCHD?exchange=AMS`

응답(정규화):
```json
{ "market":"K","symbol":"005930","price":71500,"prevClose":70800,
  "change":700,"changePct":0.99,"volume":1234567,"currency":"KRW",
  "ts":1750000000000,"source":"stub" }
```

## 구조

```
src/
├─ index.js          # 라우트 (헬스체크 · KIS 상태 · 현재가)
└─ kis/
   ├─ config.js      # 환경/도메인(mock·real)/tr_id
   ├─ token.js       # access_token 발급·캐시 (24h)
   ├─ quote.js       # 현재가 조회 (국내/해외) + 3초 캐시, 키 없으면 stub
   └─ stub.js        # 가상 시세 생성 (키 없이 개발용)
```

## 향후 작업

- WebSocket 실시간 체결가 중계(SSE/WS) — `approval_key` + `H0STCNT0`/`HDFSCNT0`
- 배치 시세 엔드포인트(`/api/quotes?...`), 종목/계좌 마스터 데이터 제공
- 해외 실시간 시세 신청 여부 확인, 거래소코드 검증
