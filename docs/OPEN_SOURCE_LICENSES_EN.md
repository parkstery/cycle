# Open Source Licenses

**Ride the World – Indoor Cycling**  
Last updated: May 2026

---

## 1. Overview

This App (**Ride the World – Indoor Cycling**) is built using several open source software components and map/data services. Below we list **map, geocoding, routing, elevation, street-level imagery**, and **software packages** with their applicable licenses and terms.

---

## 2. Map & Data Services

Map display, geocoding, route search, elevation, and street-level imagery in the App rely on the following services. We comply with each provider’s terms, copyright, and attribution requirements (including on-map notices).

| Service | Purpose | License / Terms |
|--------|------|---------------------|
| **Mapbox** | Interactive maps (Mapbox GL), styles/tiles; Mapbox Geocoding when a token is configured | [Mapbox Terms of Service](https://www.mapbox.com/legal/tos). Attribution may include © Mapbox and third-party data (e.g. OpenStreetMap) as shown in-app. |
| **OpenStreetMap (OSM)** | Underlying geographic data (via Mapbox, OSRM, and related services) | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright). ODbL and OSM attribution guidelines apply where OSM data is used. |
| **Nominatim** | Geocoding fallback (search / reverse) when Mapbox is unavailable | OSM-based. See [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). |
| **OSRM** (Open Source Routing Machine) | Car / bike / foot route calculation (public instances, e.g. routing.openstreetmap.de with fallback) | OSM-based. Subject to the respective public instance’s terms. |
| **Open-Elevation** | Elevation lookup along the route | Subject to the API provider’s terms and attribution. |
| **OpenTopoData** | Elevation via server/app proxy when used | Subject to OpenTopoData and underlying dataset licenses (see provider site). |
| **Valhalla / Stadia Maps** (optional) | Alternative elevation (height along route) when a Valhalla endpoint (e.g. Stadia) is configured | Subject to the operator you configure (e.g. [Stadia Maps](https://stadiamaps.com/terms/) terms) and Valhalla/OSM data notices. |
| **Mapillary** | Street-level sequences and 360° imagery in the viewer when coverage exists | Subject to Mapillary / Meta terms, API rules, and imagery attribution. |

- **Accuracy and availability** of map, route, and elevation data are the responsibility of the respective providers; the App operator does not guarantee them.
- For full license text and current policies, see each service’s official site.

---

## 3. Open Source Software Used (Packages)

### 3.1 Runtime Dependencies (dependencies)

| Package | Description | License |
|---------|------|----------|
| react | User interface library | MIT |
| react-dom | DOM renderer for React | MIT |
| mapbox-gl | Interactive map rendering (WebGL) | See `LICENSE.txt` in the package (Mapbox GL JS) |
| mapillary-js | Street-level imagery viewer | MIT |
| lucide-react | Icon component library | ISC |
| recharts | Chart and data visualization library | MIT |
| @capacitor/*, firebase, community plugins | Native bridges, analytics/ads as configured | See each package on [npm](https://www.npmjs.com) |

### 3.2 Development Dependencies (devDependencies)

| Package | Description | License |
|---------|------|----------|
| typescript | TypeScript language and compiler | Apache-2.0 |
| vite | Front-end build tool | MIT |
| @vitejs/plugin-react | Vite React plugin | MIT |
| react (types), react-dom (types) | React type definitions | MIT (per type package policy) |
| @types/node | Node.js type definitions | MIT |
| tailwindcss | Utility-first CSS framework | MIT |
| postcss | CSS transformation tool | MIT |
| autoprefixer | CSS vendor prefix automation | MIT |

---

## 4. Summary of Main Licenses

- **MIT**  
  Use, copy, modify, distribute, and use commercially are allowed, provided the license text and copyright notice are retained. Most of the React ecosystem uses this license.

- **Apache-2.0**  
  Use, copy, modify, distribute, and patent grant are permitted. You must state changes and include the Apache-2.0 license text and notices. TypeScript and others use this license.

- **ISC**  
  Similarly permissive; copyright notice and license text must be retained. lucide-react and others use this license.

---

## 5. Notice and Compliance

- This App complies with the above open source license terms.
- Copyright notices and license text required by each license are satisfied as included in the respective package’s distribution or source.
- For the exact license text and current information, see each package’s official repository (e.g. GitHub) or [npm](https://www.npmjs.com) package page.

---

## 6. Contact

For questions about open source licenses, please contact **LiveOnSoft** or use the channels indicated in the App.
