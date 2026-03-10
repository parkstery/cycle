# 햄버거 메뉴 – docs 영문 문서 적용 점검 보고

**목표:** 메뉴 순서 유지, docs 폴더의 영문 문서를 각 섹션에 적용해 영문으로 통일  
**점검일:** 2026년 3월 (코드 미작성, 점검·보고만 수행)

---

## 1. 목표 메뉴 구조

```
Menu
  About
  Help
    simple
    Detail
  Legal
    Privacy Policy
    Terms of Service
    Disclaimer
    Open Source Licenses
  Contact
```

- **현재와의 차이:** Help가 단일 항목 → **Help 하위에 "simple", "Detail" 두 항목**으로 확장 필요.
- About / Legal / Contact 순서와 Legal 하위 4개 항목은 현재와 동일.

---

## 2. docs 폴더 영문 문서 매핑

| 메뉴 섹션 | 적용할 문서 | 존재 여부 | 비고 |
|-----------|--------------|-----------|------|
| **About** | `docs/ABOUT_EN.md` | ✅ 있음 | 약 76줄, 제목·목록·데이터 출처 등 |
| **Help > simple** | `docs/SIMPLE_GUIDE_EN.md` | ✅ 있음 | 6줄, 짧은 3단계 안내 |
| **Help > Detail** | `docs/USER_GUIDE_EN.md` | ✅ 있음 | 약 245줄, 상세 사용자 가이드 |
| **Legal > Privacy Policy** | `docs/PRIVACY_POLICY_EN.md` | ✅ 있음 | 표·절 구조 |
| **Legal > Terms of Service** | `docs/TERMS_OF_SERVICE_EN.md` | ✅ 있음 | 장·절 구조 |
| **Legal > Disclaimer** | `docs/DISCLAIMER_EN.md` | ✅ 있음 | 절 구조 |
| **Legal > Open Source Licenses** | `docs/OPEN_SOURCE_LICENSES_EN.md` | ✅ 있음 | 표·절 구조 |
| **Contact** | `docs/CONTACT_EN.md` | ✅ 있음 | 표·절 구조 |

**결론:** 위 8개 영문 문서는 모두 존재하며, 각 메뉴 항목에 1:1로 대응 가능합니다.

---

## 3. 구현 시 필요한 변경 사항 (코드 미작성, 체크리스트만)

### 3.1 메뉴 구조·상태

- **MenuPanel**
  - Help를 Legal처럼 **접기/펼치기** 가능한 블록으로 변경.
  - Help 펼침 시 하위에 **"simple"**, **"Detail"** 두 개 버튼 노출.
  - **MenuView 타입**에 `helpSimple`, `helpDetail` 추가 (기존 `help` 제거 또는 유지 시 두 새 뷰와 역할 구분 필요).
- **App.tsx**
  - `menuView` state 타입이 현재 `'list' | 'help' | 'privacy' | ...` 로 되어 있음.
  - **`'about'`가 타입에 없음** (실제로는 메뉴에서 "About" 클릭 시 `setMenuView("about")` 호출 가능). 타입에 `about` 포함 필요.
  - `helpSimple`, `helpDetail` 추가 시 해당 타입에 반영 필요.

### 3.2 콘텐츠 표시 방식 (선택)

- **옵션 A – 문서 내용을 컴포넌트에 반영**
  - 각 `*_EN.md` 내용을 JSX로 옮기거나, 마크다운 → JSX 변환 스크립트로 생성.
  - 표·목록·강조 등은 직접 마크업. **표가 있는 문서**(Privacy, Terms, Open Source Licenses, Contact)는 수동 변환 또는 테이블 컴포넌트 사용 필요.
- **옵션 B – 런타임에 마크다운 로드**
  - `docs/*.md`를 `public/docs/` 등에 두고 `fetch` 후 `react-markdown` 등으로 렌더링.
  - 빌드/배포 시 해당 경로에 EN 문서 복사 필요. CORS/경로 설정 확인 필요.

둘 중 한 방식 정한 뒤, “docs 영문 문서를 각 섹션에 적용”하도록 통일하면 됩니다.

### 3.3 현재 콘텐츠와의 정합성

- **Privacy:** 현재 메뉴 안 Privacy는 **한국어** 상세 요약(PrivacyContent). 영문 통일 시 `PRIVACY_POLICY_EN.md` 기준으로 교체 필요.
- **Terms / Disclaimer / Licenses / Contact:** 현재는 짧은 영어 요약. 영문 통일 시 각각 `TERMS_OF_SERVICE_EN.md`, `DISCLAIMER_EN.md`, `OPEN_SOURCE_LICENSES_EN.md`, `CONTACT_EN.md` 내용으로 교체.
- **About:** 현재 MenuPanel 내 AboutContent는 영어 요약. `ABOUT_EN.md` 전체 구조·내용으로 맞추면 됨.
- **Help:** 현재 HelpContent는 짧은 영어 안내.  
  - **simple** → `SIMPLE_GUIDE_EN.md`  
  - **Detail** → `USER_GUIDE_EN.md`  
  로 각각 채우면 목표 구조와 일치.

---

## 4. 잠재 문제점 및 주의사항

| # | 구분 | 내용 |
|---|------|------|
| 1 | **타입 불일치** | App.tsx의 `menuView` 타입에 `'about'` 없음. 구현 시 `about`, `helpSimple`, `helpDetail` 반드시 반영 필요. |
| 2 | **Help 하위 뷰** | `help` 하나만 있던 것을 `helpSimple` / `helpDetail` 두 뷰로 나누면, "Back to Menu" 시 list로 갈지, Help 펼친 목록으로 갈지 규칙 정해야 함. (보통 콘텐츠 화면에서 Back = list 복귀로 두면 됨.) |
| 3 | **긴 문서** | `USER_GUIDE_EN.md`(Detail)는 245줄 수준. 패널 안에서 스크롤만으로 처리 가능하나, 매우 길어지면 제목 고정·목차 링크 등 UX 검토 여지 있음. |
| 4 | **마크다운 표** | Privacy, Terms, Open Source Licenses, Contact 등에 Markdown 표 사용. 옵션 A면 JSX 테이블로 변환 필요; 옵션 B면 마크다운 렌더러가 표를 지원하는지 확인 필요. |
| 5 | **About 전용 화면** | 현재 About은 메뉴에서 클릭 시 `setMenuView("about")` 로 패널 안에 보이거나, 별도 `onOpenAbout`으로 전체 화면 About 페이지를 띄우는 구조일 수 있음. “About은 docs 적용”만 목표라면, 패널 안 About 콘텐츠를 `ABOUT_EN.md` 기준으로 통일하면 됨. |
| 6 | **헤더 제목** | 현재 콘텐츠 뷰일 때 헤더가 "Information"으로 통일. simple / Detail 구분 없음. 필요 시 뷰별로 "Simple Guide" / "User Guide" 등으로 바꿀 수 있음. |

---

## 5. 점검 요약

- **영문 문서:** About, Help(simple/Detail), Legal 4종, Contact에 대응하는 **8개 영문 문서 모두 docs에 존재**하며, 순서와 구조에 맞게 적용 가능.
- **메뉴 구조:** Help를 Legal처럼 펼침 가능하게 하고, 하위에 simple / Detail 두 항목을 두는 변경이 필요하며, 이에 따라 **MenuView 확장 및 App.tsx 타입 수정**이 필요함.
- **적용 방식:** docs 내용을 **그대로 패널에 반영**하려면 (A) JSX/컴포넌트로 옮기거나 (B) 마크다운 로드·렌더링 중 하나를 선택해야 하며, **표가 있는 문서**는 선택한 방식에서 표 지원을 반드시 확인해야 함.
- **기타:** `menuView` 타입에 `about` 누락, Help 백 네비게이션 규칙, 긴 가이드 스크롤/UX는 구현 시 정리하면 됨.

위 항목들을 반영하면 “순서 유지 + docs 영문 문서로 각 섹션 영문 통일” 목표에 맞게 실행 가능한 상태입니다.
