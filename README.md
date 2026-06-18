# KDS Web

React + TypeScript web client for kitchen display workflows.

## Initial Scope

- Vite app shell
- 로그인 / 가입 신청 / 승인 대기 / KDS 화면 분리
- polling `GET /api/kds/orders`
- `Authorization: Bearer <accessToken>` 기반 인증
- `refreshToken` 기반 자동 세션 복구
- `자동 로그인` 체크 시 localStorage 기반 세션 유지
- `자동 로그인` 미체크 시 sessionStorage 기반 세션 유지
- NEW, COOKING, DONE order columns
- status transition actions
- AI cooking request action cards with original customer request for verification
- allergy/exclude/cooking request color treatment and human-check start flow

## Local Run

```bash
cd kds-web
npm install
npm run dev
```

## Environment

```bash
VITE_DEEPORDER_API_URL=http://127.0.0.1:8000
```

`kds-web`은 더 이상 `VITE_STORE_ID`를 사용하지 않습니다.
주문 조회 / 상태 변경 매장 컨텍스트는 로그인한 계정의 `store_id`를 backend가 결정합니다.

주소 검색 팝업을 쓰려면 backend에 `JUSO_CONFIRM_KEY`, `JUSO_RETURN_URL`이 설정되어 있어야 합니다.

## Auth Flow

```text
로그인 화면
→ /api/auth/login
→ autoLogin 여부에 따라 accessToken + refreshToken 저장
→ /api/auth/me
→ APPROVED: KDS 진입
→ PENDING_APPROVAL / REJECTED: 승인 대기 화면
```

KDS 주문 조회와 상태 변경은 이제 사용자가 `storeId`를 직접 넘기지 않습니다.
백엔드가 access token 기준으로 현재 사용자와 연결된 `store_id`를 결정합니다.

## Validation

- 비로그인 상태: `AuthPage`
- 승인 대기 / 거절 상태: `AuthPage` 내부 pending view
- 승인 완료 상태: `KdsPage`
- access token 만료 시: `refreshToken`으로 자동 복구 시도
- refresh 실패 시: 로그아웃 + 저장 토큰 삭제
