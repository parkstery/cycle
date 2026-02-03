# Vercel 자동 배포가 안 될 때 점검 사항

**작성:** 2025-02-03

---

## 1. 저장소에 없었던 설정 추가

- **`vercel.json`** 이 레포에 없었습니다. 문서에는 “SPA rewrites 설정 완료”로 되어 있었으나 실제 파일이 없어, 다음을 추가했습니다.
  - `buildCommand`: `npm run build`
  - `outputDirectory`: `dist`
  - `framework`: `vite`
  - `rewrites`: 모든 경로 → `/index.html` (SPA 라우팅)

이제 **이 파일을 커밋·푸시**하면 Vercel이 이 설정으로 빌드·배포합니다.

---

## 2. 자동 배포가 “안 된다”고 할 때 확인할 것

### 2.1 푸시해도 배포가 아예 안 뜨는 경우

| 확인 항목 | 조치 |
|-----------|------|
| **Vercel 프로젝트가 이 GitHub 레포와 연결돼 있는지** | Vercel 대시보드 → 프로젝트 → Settings → Git → Connected Git Repository 에서 `parkstery/cycle`(또는 사용 중인 레포) 연결 여부 확인 |
| **배포 브랜치** | Settings → Git → Production Branch 가 `main`(또는 푸시하는 브랜치)인지 확인 |
| **Vercel GitHub 앱 권한** | GitHub → Settings → Applications → Vercel 에서 해당 레포 접근 허용 여부 확인 |

### 2.2 배포는 뜨는데 “실패”하는 경우

| 가능 원인 | 조치 |
|-----------|------|
| **빌드 실패** | Vercel 대시보드 → Deployments → 실패한 배포 클릭 → Build Logs 에서 에러 메시지 확인 |
| **환경 변수** | Street View용 `GOOGLE_MAPS_API_KEY` 가 없어도 빌드 자체는 통과할 수 있음. 빌드 로그에 `process.env.GOOGLE_MAPS_API_KEY` 관련 에러가 있으면, Vercel → Settings → Environment Variables 에서 `GOOGLE_MAPS_API_KEY` 추가 (Production 등 원하는 환경에) |
| **Node 버전** | Vite 5 / React 18 은 보통 Node 18+ 사용. Vercel은 기본이 18.x. 빌드 로그에 Node 관련 에러가 있으면 프로젝트 루트에 `.nvmrc` 에 `18` 또는 `20` 지정 후 재배포 |

### 2.3 배포는 “성공”인데 사이트가 동작 안 하는 경우

| 가능 원인 | 조치 |
|-----------|------|
| **SPA 라우팅** | `vercel.json` 의 `rewrites` 로 `/(.*)` → `/index.html` 적용됐는지 확인(위 설정으로 해결) |
| **API 키 없음** | 배포된 사이트에서 Street View만 안 되고 나머지는 되면, Vercel 환경 변수에 `GOOGLE_MAPS_API_KEY` 가 설정돼 있는지 확인 |

---

## 3. 지금 할 일 요약

1. **`vercel.json` 커밋 후 푸시**  
   - `git add vercel.json` → `git commit` → `git push origin main`
2. **Vercel 대시보드**  
   - Deployments 에 새 배포가 생성되는지 확인  
   - 실패 시 Build Logs 에서 원인 확인  
3. **환경 변수**  
   - Street View를 쓰려면 Vercel 프로젝트에 `GOOGLE_MAPS_API_KEY` 설정

이후에도 자동 배포가 안 되면, “푸시해도 배포가 아예 안 뜨는지 / 배포는 뜨는데 실패하는지 / 성공인데 사이트가 안 되는지”를 알려주면 원인을 더 좁혀서 안내할 수 있습니다.
