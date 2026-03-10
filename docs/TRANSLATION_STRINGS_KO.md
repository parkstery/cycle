# 번역이 필요한 문자열 목록

i18n 적용 시 사용할 키와 문구를 정리한 목록입니다.  
키는 `네임스페이스.키` 또는 `섹션.키` 형태로 정할 수 있습니다.

---

## 1. 앱 공통

| 키 (예시) | EN (현재) | 비고 |
|-----------|-----------|------|
| app.name | Ride the World – Indoor Cycling | 앱 이름 |
| app.version | Version 1.0 | 푸터 등 |
| app.copyright | © 2026 LiveOnSoft | 푸터 |
| map.attribution | © OpenStreetMap contributors | 지도 하단 링크 |

---

## 2. 메뉴 패널 (MenuPanel)

### 2.1 네비게이션

| 키 | EN |
|----|-----|
| menu.title | Menu |
| menu.information | Information |
| menu.backToMenu | Back to Menu |
| menu.backToSimulator | Back to Simulator |
| menu.ariaLabel | Menu |
| menu.about | About |
| menu.help | Help |
| menu.legal | Legal |
| menu.privacyPolicy | Privacy Policy |
| menu.termsOfService | Terms of Service |
| menu.disclaimer | Disclaimer |
| menu.openSourceLicenses | Open Source Licenses |
| menu.contact | Contact |

### 2.2 Help 화면

| 키 | EN |
|----|-----|
| help.howToUse | How to use |
| help.howToUseDesc | Choose a route on the map or search for a destination. Start the ride to begin indoor cycling with elevation and distance based on your selection. |
| help.controls | Controls |
| help.controlsDesc | Use Play/Pause to control the simulation. You can adjust speed, view the elevation chart, and use street view where available. |
| help.moreDetails | For more details, see the About screen from the menu. |

### 2.3 Privacy (개인정보처리방침) — 현재 한국어만 있음

| 키 | EN 번역 필요 | 비고 |
|----|----------------|------|
| privacy.title | Privacy Policy | 제목 |
| privacy.intro | (한국어 본문 전체에 대응하는 EN 문단들) | 1~5절 + 전문 안내 |
| privacy.section1Title | 1. Information we collect and use | |
| privacy.section2Title | 2. Stored data (on device) | |
| privacy.section3Title | 3. Third-party services | |
| privacy.section4Title | 4. Retention, rights, security | |
| privacy.section5Title | 5. Policy changes | |
| privacy.footer | Full text is available in docs/PRIVACY_POLICY_KO.md. For inquiries, please use the app store or official project contact. | |

(개인정보처리방침 본문 각 문장·리스트 항목도 키로 빼면 번역 대상이 많아지므로, v1.0에서는 “전체 블록” 단위로 EN/KO 두 벌만 둘 수도 있음.)

### 2.4 Terms of Service

| 키 | EN |
|----|-----|
| terms.title | Terms of Service |
| terms.paragraph1 | By using Ride the World – Indoor Cycling you agree to use the app for personal, non-commercial indoor training only. You must not misuse the service or attempt to access systems or data you are not authorised to use. |
| terms.paragraph2 | Route and map data are provided by third parties; we do not guarantee accuracy or availability. Use at your own risk, especially when planning outdoor activities. |
| terms.paragraph3 | We may change these terms from time to time. Your continued use of the app after changes constitutes acceptance of the updated terms. |

### 2.5 Disclaimer

| 키 | EN |
|----|-----|
| disclaimer.title | Disclaimer |
| disclaimer.paragraph1 | This app is for indoor cycling simulation and entertainment only. It is not a substitute for professional medical or fitness advice. Consult a doctor before starting or changing any exercise program. |
| disclaimer.paragraph2 | Elevation, distance, and route data are approximate and may differ from real-world conditions. Do not rely on this app for navigation or safety-critical decisions outdoors. |
| disclaimer.paragraph3 | The developers are not liable for any injury, loss, or damage arising from use of this app or the data it displays. |

### 2.6 Open Source Licenses

| 키 | EN |
|----|-----|
| licenses.title | Open Source Licenses |
| licenses.intro | This application uses open source software. Key components may include (depending on build): |
| licenses.react | React – MIT License |
| licenses.lucide | Lucide React (icons) – ISC License |
| licenses.vite | Vite – MIT License |
| licenses.google | Google Maps / APIs – Google Terms of Service |
| licenses.footer | Full license texts are available in the app repository or from the respective projects. We do not claim ownership of third-party open source code; all rights remain with their authors. |

### 2.7 Contact

| 키 | EN |
|----|-----|
| contact.title | Contact |
| contact.paragraph1 | For support, feedback, or legal inquiries regarding Ride the World – Indoor Cycling, please use the contact method provided in the app store listing or the official project page. |
| contact.paragraph2 | We aim to respond to reasonable requests in a timely manner. Please include a clear subject and description so we can help you effectively. |

### 2.8 About (MenuPanel 내 AboutContent)

| 키 | EN |
|----|-----|
| about.title | Ride the World – Indoor Cycling |
| about.subtitle | Cycling route planner and map-based ride simulator with elevation analysis. |
| about.keyFeatures | Key Features |
| about.feature1 | Cycling route planner on real-world maps |
| about.feature2 | Bike route exploration with interactive map |
| about.feature3 | Elevation profile for climbs and descents |
| about.feature4 | Ride simulation along selected routes |
| about.whoFor | Who This App Is For |
| about.who1 | Cyclists planning new bike routes |
| about.who2 | Riders exploring unfamiliar cycling areas |
| about.who3 | Users checking elevation before a ride |
| about.who4 | Anyone interested in cycling route maps |
| about.dataSources | Data Sources |
| about.mapData | Map Data |
| about.mapDataValue | OpenStreetMap contributors |
| about.routingEngine | Routing Engine |
| about.routingEngineValue | OSRM (Open Source Routing Machine) |
| about.elevationData | Elevation Data |
| about.elevationDataValue | Open-Elevation API |
| about.mapRendering | Map Rendering |
| about.mapRenderingValue | Leaflet JS |
| about.icons | Icons |
| about.iconsValue | Lucide Icons |
| about.disclaimerTitle | Disclaimer |
| about.disclaimerText | Ride the World – Indoor Cycling is provided for route exploration and simulation purposes only. Map data, routes, and elevation may contain inaccuracies. Users must follow local traffic laws and ensure their own safety. The developer assumes no responsibility for any loss, damage, or injury resulting from the use of this application. |

---

## 3. About 페이지 (About.tsx)

| 키 | EN |
|----|-----|
| aboutPage.backToMenu | Back to Menu |
| aboutPage.backToSimulator | Back to Simulator |
| aboutPage.title | Ride the World – Indoor Cycling |
| aboutPage.subtitle | Cycling route planner and map-based ride simulator with elevation analysis. |
| aboutPage.keyFeatures | Key Features |
| aboutPage.feature1 | Cycling route planner on real-world maps |
| aboutPage.feature2 | Bike route exploration with interactive map |
| aboutPage.feature3 | Elevation profile for climbs and descents |
| aboutPage.feature4 | Ride simulation along selected routes |
| aboutPage.whoFor | Who This App Is For |
| aboutPage.who1 | Cyclists planning new bike routes |
| aboutPage.who2 | Riders exploring unfamiliar cycling areas |
| aboutPage.who3 | Users checking elevation before a ride |
| aboutPage.who4 | Anyone interested in cycling route maps |
| aboutPage.dataSources | Data Sources |
| aboutPage.mapData | Map Data |
| aboutPage.mapDataValue | OpenStreetMap contributors |
| aboutPage.routingEngine | Routing Engine |
| aboutPage.routingEngineValue | OSRM (Open Source Routing Machine) |
| aboutPage.elevationData | Elevation Data |
| aboutPage.elevationDataValue | Open-Elevation API |
| aboutPage.mapRendering | Map Rendering |
| aboutPage.mapRenderingValue | Leaflet JS |
| aboutPage.icons | Icons |
| aboutPage.iconsValue | Lucide Icons |
| aboutPage.disclaimer | Disclaimer |
| aboutPage.disclaimerP1 | Ride the World – Indoor Cycling is provided for route exploration and simulation purposes only. |
| aboutPage.disclaimerP2 | Map data, routes, and elevation information may contain inaccuracies and may not reflect real-world conditions such as road closures, construction, or traffic restrictions. |
| aboutPage.disclaimerP3 | Users must follow local traffic laws and ensure their own safety when cycling. The developer assumes no responsibility for any loss, damage, or injury resulting from the use of this application. |
| aboutPage.footer | © 2026 LiveOnSoft |

---

## 4. 메인 화면 (App.tsx) — 로딩·스플래시·힌트

| 키 | EN |
|----|-----|
| loading.alt | Ride the World – Indoor Cycling |
| loading.splashTitle | Ride the World – Indoor Cycling |
| intro.clickTwoPoints | Please click 2 points on the road |
| countdown.start | Start! |
| loading.searchingRoute | Searching for route... |
| loading.preparingStreetView | Preparing Street View... ({k}/{n}) |
| streetView.noAvailable | No Street View available for this section. |
| streetView.userImage | 사용자 제작 이미지 (또는 User-contributed image) |

---

## 5. 검색·경로 설정 패널

| 키 | EN |
|----|-----|
| search.placeholder | Search place... |
| search.title | Search Places |
| search.clear | Clear Search |
| search.recent | Recent |
| route.placeholderStart | Start |
| route.placeholderEnd | End |
| route.removeStart | Remove Start |
| route.removeEnd | Remove End |
| route.removeWaypoint | Remove Waypoint |
| route.speed | Speed |
| route.swapEndpoints | Swap Origin & Destination |
| route.addToFavorites | Add to Favorites |
| route.myRoutes | My Routes |
| route.deleteRoute | Delete Route |
| route.routeSettings | Route Settings |
| route.collapseDetails | Collapse Route Details |
| route.expandDetails | Expand Route Details |
| route.collapseMyRoutes | Collapse My Routes |
| route.expandMyRoutes | Expand My Routes |
| route.deleteRouteAria | Delete route |
| route.noSavedRoutes | No saved routes |
| route.to | to |
| route.go | Go |
| route.modeCar | Car |
| route.modeBike | Bike |
| route.modeFoot | Foot |
| route.decreaseSpeed | Decrease speed |
| route.increaseSpeed | Increase speed |
| route.distanceDuration | (예: "0.0 km", "0:00" — 포맷 문자열이면 키 2개: distanceFormat, durationFormat) |

---

## 6. 지도 클릭 팝업 (Set Start / Waypoint / End)

| 키 | EN |
|----|-----|
| mapPopup.close | Close |
| mapPopup.elevation | Elevation |
| mapPopup.elevationNone | — |
| mapPopup.setStart | Set as Start |
| mapPopup.startLabel | START (A) |
| mapPopup.addWaypoint | Add Waypoint |
| mapPopup.waypointCount | WAYPOINT ({n}/3) |
| mapPopup.setEnd | Set as Destination |
| mapPopup.endLabel | END (B) |

---

## 7. 고도·시뮬레이션 컨트롤

| 키 | EN |
|----|-----|
| elevation.title | Elevation Profile |
| elevation.collapse | Collapse Elevation |
| elevation.coachingShow | Show coaching text |
| elevation.coachingHide | Hide coaching text |
| elevation.coachingShowTitle | 코칭 멘트 텍스트 표시 |
| elevation.coachingHideTitle | 코칭 멘트 텍스트 숨기기 |
| simulation.restart | Restart Simulation |
| simulation.pause | Pause Simulation |
| simulation.start | Start Simulation |
| simulation.stop | Stop Simulation |
| simulation.coachingOn | Enable coaching |
| simulation.coachingOff | Disable coaching |
| simulation.musicOn | Unmute music |
| simulation.musicOff | Mute music |
| simulation.stepBack | Step back |
| simulation.fastForward | Fast Forward |

---

## 8. 지도·거리뷰 버튼 (title / aria-label)

| 키 | EN |
|----|-----|
| map.changeStyle | Change Map Style |
| map.showCoverage | Show Street View Coverage |
| map.hideCoverage | Hide Street View Coverage |
| map.showStreetView | Show Street View |
| map.hideStreetView | Hide Street View |
| map.streetViewAlt | Street View |
| map.maximizeView | Maximize View |
| map.minimizeView | Minimize View |
| menu.openAria | Open menu |

---

## 9. 알림·에러 메시지 (alert / 사용자 facing)

| 키 | EN | KO (현재) |
|----|-----|-----------|
| alert.maxRoutes | Maximum 5 routes can be saved. Please remove a route to save a new one. | (번역 필요) |
| alert.routeNotFound | Route not found. | 경로를 찾을 수 없습니다. |

---

## 10. 기타 (지도 타일 등)

| 키 | EN |
|----|-----|
| map.loading | Loading... |

---

## 요약

- **대략 개수**: 위 표 기준으로 **120~150개** 수준의 키(문장/구 단위)가 나올 수 있습니다.
- **Privacy**: 한국어 본문이 길어서, v1.0에서는 “Privacy Policy” 제목 + 요약 문단만 번역하고 본문은 링크(docs)로 안내하는 방식도 가능합니다.
- **중복**: MenuPanel의 AboutContent와 About.tsx 문구가 겹치므로, 키를 공통화(예: `about.*`)하면 한 번만 번역하면 됩니다.
- **단위**: Settings에서 Units(km/mile)를 넣으면, "0.0 km", "Speed", "Elevation 123m" 등 단위/라벨이 언어와 단위 둘 다에 따라 바뀌어야 하므로, 포맷 문자열(`distanceKm`, `distanceMile`, `speedKmH` 등)을 키로 두는 것이 좋습니다.

이 목록을 기준으로 `en.json` / `ko.json` 키를 채우면 됩니다.
