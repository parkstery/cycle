
# Mobile Transition Analysis & Plan

## 1. Current Code Analysis (Legacy Desktop Version)
*   **Architecture:** Single-file Vanilla JavaScript with global variable dependencies.
*   **Layout:** Fixed-width sidebar (`#left-panel`) and absolute-positioned floating bars.
*   **UI/UX:** Designed for mouse-hover interactions (e.g., `contextmenu` for coordinates) which are difficult on mobile.
*   **Responsiveness:** Lacks a flexible grid/flexbox system; UI elements overlap on small screens.
*   **Map Interaction:** Relies on manual input and desktop-centric controls.

## 2. Smartphone Transition Plan (Proposed Architecture)

### A. Layout & UI/UX (Mobile-First)
*   **Bottom Sheet Architecture:** Replace the sidebar with a swipeable bottom drawer (Sheet) to maximize map visibility.
*   **Floating Action Buttons (FAB):** Use FABs for primary actions like "Locate Me" or "Start Simulation".
*   **Touch-Optimized Inputs:** Larger touch targets (min 44x44px) and native mobile keyboard support.
*   **Gestures:** Long-press to drop pins instead of right-click.

### B. Technical Stack Upgrade
*   **React (Functional Components):** Modularize components (Map, Controls, Stats) for better state management.
*   **Tailwind CSS:** Use utility classes for responsive breakpoints (`sm:`, `md:`, `lg:`) and fluid layouts.
*   **Recharts:** Implement a responsive, touch-interactive elevation chart.

### C. Feature Enhancements
*   **AI Cycling Coach (Gemini):** Integrate Gemini API to analyze elevation profiles and provide verbal/text-based strategies (e.g., "Steep climb ahead, save your energy").
*   **Real-time Geolocation:** Integrate `navigator.geolocation` for actual tracking.
*   **Simulation Sync:** Smoother integration between Street View and the 2D Map on split-screens.

## 3. Implementation Roadmap
1.  **Componentization:** Extract Map and Directions logic into React Hooks.
2.  **Responsive Shell:** Build the Bottom Sheet container with Tailwind.
3.  **AI Integration:** Connect Gemini to the elevation service results.
4.  **Performance Tuning:** Optimize Google Maps rendering and simulation frame rates.
