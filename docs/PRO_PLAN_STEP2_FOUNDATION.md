# Ride the World Pro - Step 2 네이티브 Foundation/데이터 모델

## 기술 스택 기준안
- Android: Kotlin + Jetpack Compose
- 인증/기본 데이터: Firebase Auth + Firestore(메타) + Realtime DB(초기 실시간)
- 네트워크: Retrofit/OkHttp
- 로그/크래시: Firebase Crashlytics + Analytics

## 앱 패키지 구조(권장)
- `app`: 진입점, DI, 네비게이션
- `feature_auth`: 로그인/세션 관리
- `feature_room`: 룸 목록/생성/참가
- `feature_race`: 카운트다운/주행/결과
- `data`: Firebase/OSRM/OpenElevation/BLE 리포지토리
- `domain`: 유스케이스, 모델, 계산 로직
- `core`: 공통 유틸, 에러 모델, 로깅

## 핵심 데이터 모델 초안
- `UserProfile`: uid, displayName, photoUrl, createdAt
- `Room`: roomId, hostUid, routeId, startAt, maxRiders, status
- `Participant`: uid, roomId, state, lastSeenAt
- `RaceState`: roomId, riders[], ranking, updatedAt
- `RaceResult`: roomId, uid, elapsedTimeSec, avgSpeedKmh, rank

## 인증 시나리오
- 앱 시작 -> 세션 확인 -> 무세션이면 Google 로그인
- 로그인 성공 -> 프로필 업서트 -> 홈 이동
- 토큰 만료/실패 -> 재로그인 유도 + 안전한 복귀

## 완료 기준
- 패키지 책임 분리가 문서로 확정된다.
- 로그인 성공/실패/재로그인 흐름이 시퀀스 레벨로 명시된다.
