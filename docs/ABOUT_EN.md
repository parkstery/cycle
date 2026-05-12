# About

**Ride the World – Indoor Cycling**  
Last updated: May 2026

---

## 1. App Overview

**Ride the World – Indoor Cycling** lets you plan cycling routes on real maps, check elevation, and simulate the chosen route indoors. Set a route anywhere in the world (excluding certain countries and regions) and experience riding that section as if on an indoor bike.

---

## 2. Main Features

- **Route planning on real maps**  
  Enter or select start, end, and waypoints on the map to search for car, bike, or foot routes.

- **Elevation analysis**  
  View the elevation chart along the route to see climbs and descents in advance.

- **Ride simulation**  
  Simulate the ride indoors along the selected route while adjusting speed.

- **Street-level imagery**  
  Mapillary along the route when coverage is available.

- **AI coaching and background music**  
  (When available) Use coaching and background music during the ride.

---

## 3. Who It’s For

- Cyclists planning new routes  
- Users who want to preview cycling routes in unfamiliar areas  
- Users who want to check elevation before a ride  
- Users who want to simulate routes from around the world indoors  
- Users wishing to explore routes of interest in auto-pilot mode
---

## 4. Map / Route

- **Front end**  
  React 18, TypeScript, Vite, Tailwind CSS

- **Maps and data**  
  Mapbox GL JS for map display; routes, elevation, geocoding, and street-level imagery are provided via external APIs (Mapbox, OSRM, OpenStreetMap/Nominatim, Open-Elevation, OpenTopoData, Mapillary, optional Valhalla/Stadia or custom endpoints).

---

## 5. Data Sources and Credits

| Item | Description |
|------|------|
| **Maps** | Mapbox (styles/tiles and Mapbox GL). Subject to Mapbox terms; on-map attribution may include © Mapbox, © OpenStreetMap, and other sources as applicable. |
| **Routing** | OSRM (Open Source Routing Machine) via public services (e.g. routing.openstreetmap.de, with fallback). Data © OpenStreetMap contributors. |
| **Geocoding** | Mapbox Geocoding when a token is configured; otherwise Nominatim (OpenStreetMap). OSM-based results: © OpenStreetMap contributors. |
| **Elevation data** | Open-Elevation API; OpenTopoData when served via the app elevation proxy; optional Valhalla height API (e.g. Stadia Maps or another HTTPS endpoint) when configured. |
| **Street-level imagery** | Mapillary when used; subject to Mapillary / Meta terms and imagery attribution. |
| **Icons** | Lucide Icons (Lucide React) |

Terms, copyright, and disclaimers of each service follow that provider’s policy.

---

## 6. Disclaimer

This App is provided **only** for **route exploration, simulation, and fitness entertainment**. Map, route, and elevation information are approximate and may differ from actual roads, closures, and construction. **Do not use the App for real outdoor navigation or safety decisions.** Use is at **your own risk**; consult a physician or health/exercise professional before starting exercise if needed. For details, see the **Disclaimer (DISCLAIMER_EN.md)** and **Terms of Service (TERMS_OF_SERVICE_EN.md)**.

---

## 7. Copyright

**Ride the World – Indoor Cycling** © 2026 **LiveOnSoft**
