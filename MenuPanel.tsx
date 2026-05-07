import React, { useEffect } from "react";
import { ChevronRight, ChevronLeft, X } from "lucide-react";

const APP_NAME = "Ride the World – Indoor Cycling";
const MAP_ATTRIBUTION_CLEARANCE_PX = 24;

const docTitle = "text-base font-bold text-slate-900 mt-4 mb-2 first:mt-0";
const docSubtitle = "text-sm font-bold text-slate-800 mt-3 mb-1.5";
const docBody = "text-sm text-slate-700 leading-relaxed mb-2";
const docList = "list-disc pl-5 space-y-1 text-sm text-slate-700 mb-2";
const docTable = "w-full text-sm text-slate-700 border-collapse my-2";
const docTableTh = "text-left font-semibold text-slate-800 border border-slate-300 bg-slate-50 px-2 py-1.5";
const docTableTd = "border border-slate-300 px-2 py-1.5";

function SimpleGuideContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Quick Guide</h2>
      <p className={docBody}>1) Select two points on the map to set the start and destination.</p>
      <p className={docBody}>2) Choose the travel mode. (Car / Bike / Foot)</p>
      <p className={docBody}>3) Press the Go! button to start the ride.</p>
    </div>
  );
}

function UserGuideContent() {
  return (
    <div className="pb-6 space-y-1">
      <h2 className={docTitle}>Ride the World -Indoor Cycling <br /> User Guide (English)</h2>
      <p className={docBody}>This guide explains all features of <strong>Ride the World - Indoor Cycling</strong> step by step. You can choose real-world routes anywhere and simulate them indoors with elevation and Street View.</p>

      <h3 className={docTitle}>Table of Contents</h3>
      <ol className={`${docList} list-decimal`}>
        <li>App Overview</li>
        <li>Getting Started</li>
        <li>Route Settings</li>
        <li>Ride Mode and Speed</li>
        <li>Starting a Ride and Controls</li>
        <li>Street View</li>
        <li>Elevation Chart and Position</li>
        <li>Smart Coaching and Music</li>
        <li>Place Search and Favorites</li>
        <li>Map Style</li>
      </ol>

      <h3 className={docTitle}>1. App Overview</h3>
      <p className={docBody}><strong>Ride the World - Indoor Cycling</strong> lets you:</p>
      <ul className={docList}>
        <li>Plan <strong>bike / walk / car</strong> routes on <strong>real maps</strong></li>
        <li>View <strong>elevation</strong> along the route</li>
        <li>Watch <strong>Street View</strong> scenery while you ride</li>
        <li><strong>Simulate</strong> the ride indoors at your chosen speed</li>
      </ul>
      <p className={docBody}>Data sources: OpenStreetMap (maps), OSRM (routing), Open-Elevation API (elevation), and others.</p>

      <h3 className={docTitle}>2. Getting Started</h3>
      <ul className={docList}>
        <li>Open the app to load the <strong>map</strong>.</li>
        <li>The <strong>route panel</strong> is in the <strong>bottom-left</strong>. (If collapsed, tap the <strong>waypoint icon</strong> to expand.)</li>
        <li>Set <strong>Start</strong> and <strong>End</strong> to search for a route.</li>
      </ul>
      <p className={docBody}><strong>Method 1: Type addresses</strong></p>
      <ul className={docList}>
        <li>Enter the start in "Start" and the end in "End"; <strong>autocomplete suggestions</strong> will appear.</li>
        <li>Select from the list or use the keyboard up, down arrow and Enter.</li>
      </ul>
      <p className={docBody}><strong>Method 2: Click on the map</strong></p>
      <ul className={docList}>
        <li>Click <strong>anywhere</strong> on the map or route to see a popup with <strong>address, coordinates, and elevation</strong>.</li>
        <li>Use <strong>START (A)</strong> / <strong>WAYPOINT</strong> / <strong>END (B)</strong> in the popup to set start, waypoints, or destination.</li>
      </ul>

      <h3 className={docTitle}>3. Route Settings</h3>
      <h4 className={docSubtitle}>3.1 Start, End, and Waypoints</h4>
      <table className={docTable}>
        <thead>
          <tr><th className={docTableTh}>Field</th><th className={docTableTh}>Description</th></tr>
        </thead>
        <tbody>
          <tr><td className={docTableTd}><strong>Start (blue marker)</strong></td><td className={docTableTd}>Start. Enter address or click map and choose "START (A)"</td></tr>
          <tr><td className={docTableTd}><strong>End (red marker)</strong></td><td className={docTableTd}>Destination. Enter address or click map and choose "END (B)"</td></tr>
          <tr><td className={docTableTd}><strong>Waypoint</strong></td><td className={docTableTd}>Up to <strong>3</strong> waypoints. Click map and choose "WAYPOINT" to add</td></tr>
        </tbody>
      </table>
      <ul className={docList}>
        <li>Use the <strong>X</strong> next to each field to clear that start/end/waypoint.</li>
        <li>Waypoints are numbered 1, 2, 3. Removing one only removes that number.</li>
      </ul>
      <h4 className={docSubtitle}>3.2 Route Mode (Car / Bike / Foot)</h4>
      <p className={docBody}>After setting start and end, choose one of:</p>
      <ul className={docList}>
        <li><strong>Car</strong> - driving route</li>
        <li><strong>Bike</strong> - cycling route</li>
        <li><strong>Foot</strong> - walking route</li>
      </ul>
      <p className={docBody}>Distance and time depend on the mode. Choose the mode you want <strong>before</strong> pressing <strong>Go</strong>.</p>
      <h4 className={docSubtitle}>3.3 Other Route Buttons</h4>
      <ul className={docList}>
        <li><strong>1. arrows</strong> - <strong>Swap</strong> start and end (A and B).</li>
        <li><strong>2. star</strong> - <strong>Save</strong> the current route to <strong>My Routes</strong>. If already saved, the star appears filled. Up to <strong>5</strong> routes can be saved.</li>
        <li><strong>3. Trash</strong> - <strong>Clear</strong> the current route and markers. Start/end inputs are kept.</li>
      </ul>
      <h4 className={docSubtitle}>3.4 Distance and Time</h4>
      <p className={docBody}>When a route is calculated, <strong>distance (km)</strong> and <strong>estimated time</strong> are shown in the route area. Actual feel of duration depends on the <strong>speed</strong> you use during the ride.</p>

      <h3 className={docTitle}>4. Ride Mode and Speed</h3>
      <h4 className={docSubtitle}>4.1 Speed (10 ~ 70 km/h)</h4>
      <ul className={docList}>
        <li><strong>Numeric field:</strong> Enter a value between 10 and 70.</li>
        <li><strong> - / + buttons:</strong> Decrease or increase by 1 km/h.</li>
        <li><strong>Slider:</strong> Drag to adjust speed.</li>
      </ul>
      <p className={docBody}>This is the <strong>simulation speed</strong>. On an indoor bike, match your pedaling to this speed.</p>

      <h3 className={docTitle}>5. Starting a Ride and Controls</h3>
      <h4 className={docSubtitle}>5.1 Go Button</h4>
      <ul className={docList}>
        <li>Enter start and end so the <strong>route is shown</strong>, then press <strong>Go</strong>.</li>
        <li><strong>First time for a route:</strong> Route is fetched - Street View prepared and <strong>3, 2, 1, Start!</strong> countdown, then the ride starts.</li>
        <li><strong>Same route again:</strong> Only countdown, then the ride starts.</li>
      </ul>
      <h4 className={docSubtitle}>5.2 Controls During the Ride (in the elevation panel)</h4>
      <p className={docBody}>When the elevation panel is open, you can use:</p>
      <table className={docTable}>
        <thead>
          <tr><th className={docTableTh}>Button</th><th className={docTableTh}>Action</th></tr>
        </thead>
        <tbody>
          <tr><td className={docTableTd}><strong>(Play)</strong></td><td className={docTableTd}>Start or resume the ride</td></tr>
          <tr><td className={docTableTd}><strong>(Pause)</strong></td><td className={docTableTd}>Pause the ride</td></tr>
          <tr><td className={docTableTd}><strong>(Restart)</strong></td><td className={docTableTd}>Restart from the beginning of the route</td></tr>
          <tr><td className={docTableTd}><strong>(Stop)</strong></td><td className={docTableTd}>Stop the ride (position and time reset)</td></tr>
        </tbody>
      </table>
      <ul className={docList}>
        <li><strong>Distance</strong> and <strong>elapsed time</strong> are shown at the top of the elevation panel.</li>
        <li>During the ride, a <strong>marker</strong> on the map shows your position; with Street View on, the view updates along the route.</li>
      </ul>

      <h3 className={docTitle}>6. Street View</h3>
      <h4 className={docSubtitle}>6.1 Turn Street View On/Off</h4>
      <ul className={docList}>
        <li>Tap the <strong>Street View icon</strong> (top-right) to turn Street View on or off.</li>
        <li>When on, real Street View along the route is shown at the top (or full screen).</li>
      </ul>
      <h4 className={docSubtitle}>6.2 Full Screen / Minimize</h4>
      <ul className={docList}>
        <li>With Street View on, tap the <strong>expand/collapse icon</strong> to switch between full screen and top half + map below.</li>
        <li>In full screen, a small <strong>mini map</strong> is shown on one side.</li>
      </ul>
      <h4 className={docSubtitle}>6.3 Street View Coverage</h4>
      <ul className={docList}>
        <li>Tap the <strong>route icon</strong> to show streets with Street View on the map.</li>
        <li>Segments in blue have Street View. Some segments may have no coverage; you may see "No Street View available for this section."</li>
      </ul>
      <h4 className={docSubtitle}>6.4 User-Contributed Imagery</h4>
      <p className={docBody}>Where official imagery is not available, <strong>user-contributed panoramas</strong> may be used. In that case, "User-contributed imagery" may be shown.</p>

      <h3 className={docTitle}>7. Elevation Chart and Position</h3>
      <h4 className={docSubtitle}>7.1 Elevation Chart</h4>
      <ul className={docList}>
        <li>When a route exists, the <strong>elevation chart</strong> panel appears in the <strong>bottom-right</strong>.</li>
        <li>Tap the <strong>chart icon</strong> or <strong>arrow</strong> to expand or collapse the panel.</li>
        <li>The chart shows <strong>elevation</strong> along the route; a <strong>white vertical line</strong> indicates your <strong>current position</strong>.</li>
      </ul>
      <h4 className={docSubtitle}>7.2 Jump Along the Route (Step back / Fast forward)</h4>
      <ul className={docList}>
        <li>Use the <strong>◀ / ▶</strong> buttons on the elevation chart to move your position forward or backward along the route by several points.</li>
        <li>Useful after pausing to jump to a different segment and resume.</li>
      </ul>

      <h3 className={docTitle}>8. Smart Coaching and Music</h3>
      <h4 className={docSubtitle}>8.1 Smart Coaching</h4>
      <ul className={docList}>
        <li>When <strong>coaching is on</strong>, tips (posture, resistance, intensity, etc.) are shown based on gradient and speed.</li>
        <li>Use the <strong>microphone icon</strong> to turn coaching on or off.</li>
        <li>Use the <strong>speech bubble icon</strong> to show or hide only the coaching text.</li>
      </ul>
      <h4 className={docSubtitle}>8.2 Background Music</h4>
      <ul className={docList}>
        <li>Use the <strong>music icon</strong> to turn background music on or off.</li>
        <li>Use it during the ride as you prefer.</li>
      </ul>

      <h3 className={docTitle}>9. Place Search and Favorites</h3>
      <h4 className={docSubtitle}>9.1 Place Search</h4>
      <ul className={docList}>
        <li>Tap the <strong>search icon</strong> (top-left) to open the <strong>search bar</strong>.</li>
        <li>Type a place name or address in "Search place..." and press <strong>Enter</strong>; the map moves there and a marker is placed.</li>
        <li>Searches are stored in <strong>Recent</strong> for quick reuse.</li>
      </ul>
      <h4 className={docSubtitle}>9.2 My Routes (Saved Routes)</h4>
      <ul className={docList}>
        <li>With the <strong>route panel</strong> open, widen it to the right to see <strong>My Routes</strong>.</li>
        <li>Up to <strong>5</strong> routes can be saved.</li>
        <li><strong>Save:</strong> Set start and end (and waypoints), create the route, then tap <strong> Add to favorites.</strong>.</li>
        <li><strong>Load:</strong> Tap a route in My Routes to apply its start, end, and waypoints; the route is restored if available.</li>
        <li><strong>Delete:</strong> Tap the <strong>X</strong> next to a route (visible on hover) to remove it from favorites.</li>
      </ul>
      <h4 className={docSubtitle}>9.3 Explore Routes</h4>
      <ul className={docList}>
        <li>With the route panel widened, use the <strong>Explore Routes</strong> tab next to <strong>My Routes</strong> for the curated catalog (cloud sync + local cache).</li>
        <li>When route search fails, use <strong>Pick from Explore</strong> to load a curated route instead.</li>
      </ul>

      <h4 className={docSubtitle}>10 Map Style</h4>
      <p className={docBody}>Tap the <strong>layers icon</strong> (top-right) to switch between <strong>standard map</strong> and <strong>satellite/terrain (hybrid)</strong>.</p>

      <p className={docBody}>Screens and wording may vary by app version. For further questions, use <strong>Contact</strong> in the app or the store/official page.</p>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>About</h2>
      <p className={docBody}>Ride the World – Indoor Cycling. Last updated: March 2026.</p>
      <h3 className={docTitle}>1. App Overview</h3>
      <p className={docBody}>Ride the World – Indoor Cycling lets you plan cycling routes on real maps, check elevation, and simulate the chosen route indoors. Set a route anywhere in the world (excluding certain countries and regions) and experience riding that section as if on an indoor bike.</p>
      <h3 className={docTitle}>2. Main Features</h3>
      <ul className={docList}>
        <li><strong>Route planning on real maps</strong> — Enter or select start, end, and waypoints on the map to search for car, bike, or foot routes.</li>
        <li><strong>Elevation analysis</strong> — View the elevation chart along the route to see climbs and descents in advance.</li>
        <li><strong>Ride simulation</strong> — Simulate the ride indoors along the selected route while adjusting speed.</li>
        <li><strong>Street View</strong> — Play Street View along the route to enhance the riding experience.</li>
        <li><strong>AI coaching and background music</strong> — (When available) Use coaching and background music during the ride.</li>
      </ul>
      <h3 className={docTitle}>3. Who It's For</h3>
      <ul className={docList}>
        <li>Cyclists planning new routes</li>
        <li>Users who want to preview cycling routes in unfamiliar areas</li>
        <li>Users who want to check elevation before a ride</li>
        <li>Users who want to simulate routes from around the world indoors</li>
        <li>Users wishing to explore routes of interest in auto-pilot mode</li>
      </ul>
      <h3 className={docTitle}>4. Map / Route</h3>
      <p className={docBody}><strong>Front end</strong> — React 18, TypeScript, Vite, Tailwind CSS</p>
      <p className={docBody}><strong>Maps and data</strong> — Map rendering (e.g. Leaflet); routes, maps, elevation, and Street View are provided via external APIs.</p>
      <h3 className={docTitle}>5. Data Sources and Credits</h3>
      <p className={docBody}><strong>Map data</strong> — OpenStreetMap. Map data © OpenStreetMap contributors.</p>
      <p className={docBody}><strong>Routing</strong> — OSRM (Open Source Routing Machine). Data © OpenStreetMap contributors.</p>
      <p className={docBody}><strong>Geocoding</strong> — Nominatim (OpenStreetMap). Data © OpenStreetMap contributors.</p>
      <p className={docBody}><strong>Elevation data</strong> — Open-Elevation API</p>
      <p className={docBody}><strong>Street View</strong> — (When used) Subject to the terms and copyright of the respective service (e.g. Google Maps Street View).</p>
      <p className={docBody}><strong>Icons</strong> — Lucide Icons (Lucide React)</p>
      <p className={docBody}>Terms, copyright, and disclaimers of each service follow that provider's policy.</p>
      <h3 className={docTitle}>6. Disclaimer</h3>
      <p className={docBody}>This App is provided only for route exploration, simulation, and fitness entertainment. Map, route, and elevation information are approximate and may differ from actual roads, closures, and construction. Do not use the App for real outdoor navigation or safety decisions. Use is at your own risk; consult a physician or health/exercise professional before starting exercise if needed.</p>
      <h3 className={docTitle}>7. Copyright</h3>
      <p className={`${docBody} font-semibold`}>Ride the World – Indoor Cycling <br /> © 2026 LiveOnSoft</p>
    </div>
  );
}

const PRIVACY_POLICY_URL = "https://liveonsoft.github.io/ridetheworld/policy/";

function PrivacyContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Privacy Policy</h2>
      <p className={docBody}>The Privacy Policy is available at the link below. It opens in a new tab.</p>
      <a
        href={PRIVACY_POLICY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 mt-3 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium rounded-lg transition-colors"
      >
        View Privacy Policy
        {/* <ChevronRight size={16} /> */}
      </a>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Terms of Service</h2>
      <p className={docBody}>Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Application and Acceptance</h3>
      <p className={docBody}>These Terms govern the relationship between LiveOnSoft (Operator) and users of Ride the World -Indoor Cycling. Using the App constitutes acceptance. No registration or login required.</p>
      <h3 className={docTitle}>2. Definition of the Service</h3>
      <p className={docBody}>The App provides indoor cycling route simulation and map and route exploration (route search, elevation, ride simulation, Street View, saved routes, AI coaching, etc.). Content and scope may change without notice. The Operator does not guarantee continuity, completeness, or accuracy.</p>
      <h3 className={docTitle}>3. Eligibility and Use Restrictions</h3>
      <p className={docBody}>Use only for personal, non-commercial purposes. Commercial use, reverse engineering, crawling, and use that violates laws or rights of others are prohibited.</p>
      <h3 className={docTitle}>4. Third-Party Data and Liability</h3>
      <p className={docBody}>Route, map, and elevation data are provided by third parties; we do not guarantee accuracy. Do not use for real outdoor navigation or safety. The Operator disclaims liability for injury, loss, or damage from use of the App or its data, to the extent permitted by law.</p>
      <h3 className={docTitle}>5. Changes</h3>
      <p className={docBody}>Terms may be amended. Continued use after changes constitutes acceptance of the updated terms.</p>
    </div>
  );
}

function DisclaimerContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Disclaimer</h2>
      <p className={docBody}>Ride the World - Indoor Cycling. Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Purpose and Nature of the App</h3>
      <p className={docBody}>1.1 Ride the World - Indoor Cycling (the "App") is provided only for indoor cycling route simulation and entertainment.</p>
      <p className={docBody}>1.2 Maps, routes, elevation, Street View, ride simulation, and other content in the App are for reference, experience, and motivation. They must not be used as an official basis or recommendation for real-road riding, racing, or training plans.</p>
      <h3 className={docTitle}>2. Medical and Health Disclaimer</h3>
      <p className={docBody}>2.1 The App is not a substitute for professional medical, health, or exercise advice. Coaching, resistance, intensity, and similar content in the App are for general reference only and are not exercise prescriptions tailored to your health, conditions, age, or fitness.</p>
      <p className={docBody}>2.2 Before starting a new exercise program or changing intensity or method, consult a physician or qualified health or exercise professional. This is especially important if you have cardiovascular, respiratory, or musculoskeletal conditions, are pregnant or nursing, or are on medication.</p>
      <p className={docBody}>2.3 If you experience dizziness, difficulty breathing, chest pain, or muscle or joint pain while using the App, stop exercising immediately and seek medical care if needed. The developers and operators accept no responsibility for such symptoms or any resulting harm.</p>
      <h3 className={docTitle}>3. Accuracy of Data</h3>
      <p className={docBody}>3.1 Routes, distance, elevation, and estimated time shown in the App are approximations and may differ from actual roads, terrain, closures, construction, and traffic.</p>
      <p className={docBody}>3.2 This data is based on information from third parties (map, route, elevation APIs, etc.) and may contain errors, delays, or be outdated. Do not rely on this App alone for real outdoor riding, climbing, hiking plans, or distance/elevation measurement.</p>
      <h3 className={docTitle}>4. Outdoor Use and Safety</h3>
      <p className={docBody}>4.1 The App is designed for indoor simulation. Do not use it for navigation, route guidance, or safety-related decisions on real roads, trails, or cycle paths.</p>
      <p className={docBody}>4.2 When cycling or walking outdoors, use official navigation, maps, local signage, and traffic rules first, and ensure your own and others' safety. The developers and operators are not responsible for accidents, injury, or damage from following the App's routes outdoors.</p>
      <h3 className={docTitle}>5. Limitation of Liability</h3>
      <p className={docBody}>5.1 The developers, Operator (LiveOnSoft), and related parties disclaim all liability, to the extent permitted by law, for bodily injury, death, property loss, mental harm, indirect, incidental, special, or consequential damage resulting from use or inability to use the App or reliance on data, coaching, music, or other content in the App.</p>
      <p className={docBody}>5.2 Use of the App is at your own risk. By using the App, you are deemed to have read and agreed to the above disclaimers.</p>
      <h3 className={docTitle}>6. Other</h3>
      <p className={docBody}>6.1 This Disclaimer applies together with the Terms of Service and Privacy Policy. If it conflicts with them, the provision more favorable to the user may prevail.</p>
      <p className={docBody}>6.2 This Disclaimer may be amended; changes will be reflected and announced in the App or documentation. Continued use of the App after changes constitutes acceptance of the updated Disclaimer.</p>
      <p className={`${docBody} font-semibold`}>Ride the World - Indoor Cycling <br /> © 2026 LiveOnSoft</p>
    </div>
  );
}

function LicensesContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>1. Open Source Licenses</h2>
      <p className={docBody}>Last updated: March 2026. This App is built using open source software and map/data services. Below we list map, routing, and elevation data services and software packages with their applicable licenses and terms.</p>

      <h3 className={docTitle}>2. Map & Data Services</h3>
      <p className={docBody}>Map display, route search, elevation data, and Street View in the App rely on the following services. We comply with each service's terms, copyright, and attribution requirements.</p>
      <table className={docTable}>
        <thead>
          <tr><th className={docTableTh}>Service</th><th className={docTableTh}>Purpose</th><th className={docTableTh}>License / Terms</th></tr>
        </thead>
        <tbody>
          <tr><td className={docTableTd}><strong>OpenStreetMap (OSM)</strong></td><td className={docTableTd}>Map tiles, geographic data</td><td className={docTableTd}>© OpenStreetMap contributors. ODbL and other OSM policies apply.</td></tr>
          <tr><td className={docTableTd}><strong>Nominatim</strong></td><td className={docTableTd}>Address and place search (geocoding)</td><td className={docTableTd}>OSM-based. See Nominatim usage policy.</td></tr>
          <tr><td className={docTableTd}><strong>OSRM</strong></td><td className={docTableTd}>Car / bike / foot route calculation</td><td className={docTableTd}>OSM-based. Subject to the deployment or service terms.</td></tr>
          <tr><td className={docTableTd}><strong>Open-Elevation</strong></td><td className={docTableTd}>Elevation data along the route</td><td className={docTableTd}>Subject to the API provider's terms and attribution.</td></tr>
          <tr><td className={docTableTd}><strong>Google Maps / Street View</strong></td><td className={docTableTd}>Map display, Street View imagery (when used)</td><td className={docTableTd}>© Google. Google Maps Platform Terms, Google Privacy Policy. Acknowledged here in addition to any on-map attribution.</td></tr>
        </tbody>
      </table>
      <ul className={docList}>
        <li><strong>Accuracy and availability</strong> of map, route, and elevation data are the responsibility of the respective providers; the App operator does not guarantee them.</li>
        <li>For full license text and current policies, check please the official websites for each service.</li>
      </ul>

      <h3 className={docTitle}>3. Open Source Software Used (Packages)</h3>
      <p className={docBody}>Runtime: react, react-dom (MIT), lucide-react (ISC), recharts (MIT). Development: typescript (Apache-2.0), vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer (MIT), @types/node (MIT).</p>
      <h3 className={docTitle}>4. Summary of Main Licenses</h3>
      
      <p className={docBody}>MIT: Use, copy, modify, distribute with license and copyright notice. Apache-2.0: Similar with change notice and license text. ISC: Similarly permissive with notice. This App complies with the above terms. For exact text, please refer to the official repository for each package or npm.</p>
    </div>
  );
}

function ContactContent() {
  return (
    <div className="pb-6">
      <h2 className={docTitle}>Contact</h2>
      <p className={docBody}><strong>Ride the World - Indoor Cycling</strong> Last updated: March 2026.</p>
      <h3 className={docTitle}>1. Overview</h3>
      <p className={docBody}><strong>LiveOnSoft</strong> develops and operates <strong>Ride the World - Indoor Cycling</strong> (the "App"). For inquiries about using the App, privacy, terms of service, open source licenses, bugs, or suggestions, please follow the guidance below.</p>
      <h3 className={docTitle}>2. Contact Information</h3>
      <p className={docBody}><strong>Contact</strong> For app-related inquiries, please contact us at the email address below. <br /> liveonsoft@gmail.com</p>
      <h3 className={docTitle}>3. Response Policy</h3>
      <p className={docBody}>We will respond to inquiries <strong>to the extent possible</strong>; we do not guarantee response time, method, or that a response will be provided. Requests related to personal information (access, correction, deletion, etc.) are handled in accordance with applicable laws and our Privacy Policy. The App <strong>does not require registration or login</strong> and does not store account information on our servers. For account-related inquiries, please refer to the relevant store (e.g. Google Play, App Store) policy.</p>
      <p className={`${docBody} font-semibold`}><strong>LiveOnSoft</strong> Developer and operator of Ride the World - Indoor Cycling <br />© 2026 LiveOnSoft</p>
    </div>
  );
}

export type MenuView =
  | "list"
  | "about"
  | "guideSimple"
  | "guideDetail"
  | "privacy"
  | "terms"
  | "disclaimer"
  | "licenses"
  | "contact";

interface MenuPanelProps {
  open: boolean;
  onClose: () => void;
  menuView: MenuView;
  setMenuView: (v: MenuView) => void;
}

const appInfoBottomStyle = () =>
  ({
    bottom: `calc(${MAP_ATTRIBUTION_CLEARANCE_PX}px + env(safe-area-inset-bottom, 0px))`,
  }) as const;

export default function MenuPanel({
  open,
  onClose,
  menuView,
  setMenuView,
}: MenuPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const isList = menuView === "list";

  const backToMenu = () => {
    setMenuView("list");
  };

  const viewMap: Record<Exclude<MenuView, "list">, React.ReactNode> = {
    about: <AboutContent />,
    guideSimple: <SimpleGuideContent />,
    guideDetail: <UserGuideContent />,
    privacy: <PrivacyContent />,
    terms: <TermsContent />,
    disclaimer: <DisclaimerContent />,
    licenses: <LicensesContent />,
    contact: <ContactContent />,
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed left-0 right-0 top-0 z-[10001] bg-black/40"
        style={appInfoBottomStyle()}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* panel — same vertical extent as map (above banner strip) */}
      <div
        className="fixed left-0 top-0 z-[10002] w-[88%] max-w-[360px] bg-white shadow-2xl flex flex-col min-h-0 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          ...appInfoBottomStyle(),
        }}
      >
        {/* navigation */}
        <header className="border-b border-slate-200">

          <div className={`flex items-center px-4 h-10 text-sm ${isList ? "justify-end" : "justify-between"}`}>

            {!isList && (
              <button
                onClick={backToMenu}
                className="flex items-center gap-1 text-slate-700"
              >
                <ChevronLeft size={18} />
                Back
              </button>
            )}

            <button
              onClick={onClose}
              className="flex items-center gap-1 text-slate-700"
            >
              {/* Rrturn */}
              <X size={18} />
            </button>

          </div>

          <div className="h-12 flex items-center px-2 font-semibold text-slate-900">
          {/* <div className="h-12 flex items-center pl-2 pr-4 font-semibold text-slate-900"> */}
            {/* {isList ? "Menu" : "Information"} */}
            {/* {isList ? "Menu" : ""} */}
            {isList ? "Contents" : ""}            
          </div>
{/* empty div */}
        </header>

        {/* content — min-h-0 so flex child can shrink and scroll */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">

          {isList ? (
            <ul
              className="py-2 text-slate-800 list-none"
              style={{ paddingInlineStart: "1ch" }}
            >
              <li>
                <button
                  onClick={() => setMenuView("about")}
                  className="w-full text-left ps-4 pe-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li className="ps-4 pe-4 py-1.5 pt-2 text-base font-medium text-slate-800 uppercase tracking-wider">
                Guide
              </li>
              <li>
                <ul
                  className="border-s-2 border-slate-200 my-0.5 list-none"
                  style={{
                    marginInlineStart: "1rem",
                    // paddingInlineStart: "calc(1.5rem + 1ch)",
                    // paddingInlineStart: "calc(1ch)",
                  }}
                >
                  <li>
                    <button
                      onClick={() => setMenuView("guideSimple")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Quick Guide
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("guideDetail")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Detailed Guide
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                </ul>
              </li>

              <li className="ps-4 pe-4 py-1.5 pt-2 text-base font-medium text-slate-800 uppercase tracking-wider">
                Legal
              </li>
              <li>
                <ul
                  className="border-s-2 border-slate-200 my-0.5 list-none"
                  style={{
                    marginInlineStart: "1rem",
                    // paddingInlineStart: "calc(1.5rem + 1ch)",
                    // paddingInlineStart: "calc(1ch)",
                  }}
                >
                  <li>
                    <button
                      onClick={() => setMenuView("privacy")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Privacy Policy
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("terms")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Terms of Service
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("disclaimer")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Disclaimer
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                  <li>
                    <button
                      onClick={() => setMenuView("licenses")}
                      className="w-full text-left ps-4 pe-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
                    >
                      Open Source Licenses
                      <ChevronRight size={18} className="text-slate-400" />
                    </button>
                  </li>
                </ul>
              </li>

              <li>
                <button
                  onClick={() => setMenuView("contact")}
                  className="w-full text-left ps-4 pe-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Contact
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>
            </ul>
          ) : (
            <div className="px-4 py-4 pb-8 text-slate-800 leading-relaxed overflow-y-auto">
              {viewMap[menuView]}
            </div>
          )}

        </div>

        {/* footer */}

        <div className="px-4 py-3 border-t text-xs text-slate-500 text-center">
          {APP_NAME}
          <br />
          Version 1.0
        </div>

      </div>
    </>
  );
}