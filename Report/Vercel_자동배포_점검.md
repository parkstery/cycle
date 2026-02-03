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

---

## 4. Cursor AI로 수정·푸시 후 자동 배포가 “어느 순간” 깨지는 이유

Cursor에서 코드 수정 후 GitHub push를 반복하다 보면, **Vercel ↔ GitHub 연결이 끊긴 것처럼** 자동 배포가 안 되는 상황이 생길 수 있다. 원인 후보는 아래와 같다.

### 4.1 실제로 “연결이 끊긴” 경우 (드묾)

| 원인 | 설명 |
|------|------|
| **GitHub 앱 권한** | GitHub에서 Vercel 앱이 해당 레포 접근을 잃은 경우(권한 변경·재설치·레포 전환 등). 푸시는 되지만 Vercel이 웹훅을 못 받음. |
| **Vercel 프로젝트에서 레포 연결 해제** | 실수로 Vercel 프로젝트 설정에서 Git 연결을 제거한 경우. |
| **브랜치 불일치** | Cursor가 푸시하는 브랜치와 Vercel Production Branch가 다름(예: `main` vs `master`). |

→ **확인:** Vercel → 프로젝트 → **Settings → Git** 에서 연결된 Repository·Production Branch 확인. GitHub → **Settings → Applications → Vercel** 에서 해당 레포 체크 여부 확인.

### 4.2 연결은 있는데 “배포가 안 뜨거나 실패”하는 경우 (많음)

| 원인 | 설명 |
|------|------|
| **빌드 실패** | 푸시할 때마다 Vercel이 배포는 **생성**하지만, **빌드가 실패**해서 “배포가 안 된다”고 느낌. 연결이 깨진 게 아니라 매번 빌드 에러. |
| **vercel.json 등 설정 변경** | `vercel.json`에 build/output을 덮어쓰는 값을 넣었다가, Vercel 자동 감지가 바뀌어 빌드 방식이 달라지거나 실패할 수 있음. |
| **환경 변수** | Vercel에만 필요한 환경 변수가 없어서 빌드/런타임이 실패. 로컬에선 `.env`로 되므로 “Cursor로 푸시한 뒤에만 안 됨”처럼 보일 수 있음. |

→ **확인:** Vercel **Deployments** 탭에서 최근 푸시 이후 **배포가 하나라도 생성됐는지**, 생성됐다면 **상태가 Failed인지** 확인. Failed면 **Build Logs**에서 에러 메시지 확인.

### 4.3 Cursor에서 push할 때 지키면 좋은 것

- **force push 하지 않기** — `git push --force` / `--force-with-lease` 는 하지 않기. 히스토리 변경 시 Vercel이 이전 커밋 기준으로 깨졌다고 인식할 수 있음.
- **푸시 브랜치 통일** — 자동 배포를 쓰는 브랜치(보통 `main`)에만 푸시. 다른 브랜치에만 푸시하면 Production에는 반영 안 됨.
- **vercel.json 은 최소로** — 빌드 방식을 바꾸지 말고, **rewrites만** 두고 나머지(buildCommand, outputDirectory, framework 등)는 비우기. 그래야 Vercel이 Vite를 그대로 자동 감지.
- **배포가 “안 된다”고 느낄 때** — “연결이 끊겼다”고 가정하기 전에, **Deployments에 새 배포가 생겼는지 / 그 배포가 Failed인지**를 먼저 확인하는 습관이 좋음.

### 4.4 한 줄 요약

**“연결이 깨진다”기보다는, 푸시할 때마다 빌드가 실패하거나 설정이 꼬여서 자동 배포가 안 되는 경우가 많다.**  
Vercel **Deployments**에서 최근 푸시 후 배포 생성 여부·빌드 로그를 먼저 보면 원인을 빠르게 좁힐 수 있다.
