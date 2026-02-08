# Z-Level Hierarchy (App.tsx)

This table documents the z-index stacking order for `App.tsx` components. Higher values appear on top.

| Z-Index | Component / Element | Description |
| :--- | :--- | :--- |
| **z-[200]** | **About (Info) Button** | The button to open the About modal. (Increased for visibility) |
| **z-[100]** | **Countdown Overlay** | "3, 2, 1, Start!" fullscreen overlay when starting simulation. |
| **z-[100]** | **About Modal** | The entire About page (`About.tsx`) when open. |
| **z-[80]** | **Place Search Bar** | Top-left search input and results dropdown. |
| **z-[75]** | **Loading / Measuring Indicator** | "Searching for route..." or "Preparing Street View..." toast. |
| **z-[70]** | **AI Coach Tip** | Top-center floating notification for coaching tips. |
| **z-[60]** | **Route Input Panel** | Bottom-left route planning inputs (Origin, Destination, Waypoints). |
| **z-[50]** | **Map Controls** | Top-right buttons (Layers, Coverage, SV Toggle, Maximize/Minimize). |
| **z-[50]** | **Elevation Chart** | Bottom-right expandable elevation profile. |
| **z-[50]** | **Map Popup** | Info window for clicked location on map (`clickedLocation`). |
| **z-[50]** | **Mini Map (Fullscreen Mode)** | Small floating map when Street View is fullscreen. |
| **z-[45]** | **SV Warning / User Badge** | "No Street View" warning or "User Photo" badge. |
| **z-40** | **Street View Container (Fullscreen)** | When `isSvActive` and `isSvFullScreen` are true. |
| **z-25** | **Map Container (Split View)** | When `isSvActive` is true (bottom half). |
| **z-20** | **Street View Container (Split View)** | When `isSvActive` is true (top half). |
| **z-10** | **Map Container (Default)** | The base Google Map covering the screen when SV is inactive. |
| **z-5** | **Loading Placeholder** | Simple text displayed before map API loads. |
| **z-0** | **Hidden SV Container** | When `isSvActive` is false. |
