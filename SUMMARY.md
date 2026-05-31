# ClearRoute UK — Build Summary

## What I Built

A full stack UK navigation web app that analyses route complexity and provides intelligent guidance for drivers unfamiliar with UK roads. Now at V1.1 with a fully redesigned UI built on MapLibre GL JS.

## Why I Built It

After relocating to the UK, I experienced first hand how confusing UK roads are for new drivers and international visitors. Standard navigation apps provide directions but no context about *why* a road is difficult. I identified this gap and built a solution.

## Version History

- **V1.0** — Initial Leaflet-based release. Core complexity scoring, voice guidance, and navigation simulation. [View V1.0 tag](https://github.com/Josthepentest/Clearroute-UK/tree/v1.0).
- **V1.1** — Full UI redesign with MapLibre GL JS, hero complexity card, two-column layout, mobile responsive. *(current)*

## What I Learned

### Python / Backend
- Built a REST API using FastAPI
- Integrated OpenRouteService API for routing
- Integrated Nominatim for geocoding and reverse geocoding
- Designed a complexity scoring algorithm from scratch
- Handled environment variables and production deployment
- Resolved CORS configuration conflicts (`allow_origins=["*"]` cannot combine with `allow_credentials=True`)

### JavaScript / Frontend
- Built a full navigation simulation engine from scratch
- **Migrated a working app from Leaflet to MapLibre GL JS** — different coordinate formats, layer/source management, LngLatBounds
- Integrated Web Speech API for text to speech
- Used HTML5 Geolocation API for GPS with reverse geocoding
- Managed complex application state across pre-nav and nav modes
- Built progressive route line rendering (travelled vs remaining)
- Implemented bearing calculation for rotating directional markers
- Implemented a client-side weighted complexity scoring algorithm

### Design / UX (V1.1)
- Designed and built a two-column responsive layout from scratch
- Replaced emoji-heavy UI with a professional Tabler icon system
- Built a custom toast notification system to replace blocking browser alerts
- Designed a settings panel with click-outside-to-close behaviour
- Built a hero complexity score card as a visual focal point
- Applied CSS Grid and Flexbox for layout
- Built mobile-responsive breakpoints (sidebar stacks below 768px)

### Deployment
- Deployed Python backend to Railway with proper environment variable handling
- Deployed frontend to Netlify
- Used Git and GitHub for version control
- Maintained version history with annotated git tags and GitHub Releases

### Debugging Production Issues
- Diagnosed and fixed a **temporal dead zone** error caused by `const` declarations referenced before their initialization
- Diagnosed and fixed a **MapLibre fitBounds** bug — the API requires `LngLatBounds` objects, not raw coordinate arrays like Leaflet
- Diagnosed and fixed missing `map.resize()` calls after CSS layout changes
- Cleaned up console warnings from third-party tile service quirks

## Technical Challenges Solved

| Challenge | Solution |
|-----------|----------|
| Map tracking marker smoothly | Removed animated setView, used snap with bearing-based rotation |
| Preventing repeated junction warnings | Tracked last warned step index |
| Voice reading HTML tags | Used `innerText` instead of `innerHTML` for speech input |
| CORS between Netlify and Railway | Replaced `allow_origins=["*"]` with explicit origins list |
| `venv` uploading to GitHub | Added `venv/` to `.gitignore` |
| MapLibre coord format vs Leaflet | Wrote `toMLCoord()` helpers — Leaflet `[lat,lng]` vs MapLibre `[lng,lat]` |
| `fitBounds` zooming to wrong area | Built `LngLatBounds` with `.extend()` per coord instead of passing arrays |
| Map not repainting on layout change | Called `map.resize()` after toggling nav-mode CSS class |
| Temporal Dead Zone on route arrival | Replaced forward-referenced `const` with direct values |
| Browser `alert()` breaking UX | Custom toast notification with auto-dismiss |
| Navigation marker overlapping destination pin | Remove navigation marker on arrival |
| Vehicle style buttons overflowing sidebar | CSS Grid 2x2 instead of flex row |
| Horizontal page scrollbar leak | `overflow-x: hidden` on sidebar as safety |
| Glyph 404 errors from OpenFreeMap | `styleimagemissing` handler for missing sprite icons |

## Architecture
User Browser (Netlify)
↓ fetch()
FastAPI Backend (Railway)
↓ HTTP
OpenRouteService API
↓ Route + Steps + Duration
Complexity Scoring (Navigation.py + client-side scoring)
↓ JSON Response
MapLibre GL JS + Voice + Lane Guidance

## Unique Features

- **Hero complexity score** — numeric 0-10 score with colour-coded tier as the visual centrepiece
- **Pre-drive briefing** — plain English route summary read aloud before driving
- **Lane guidance overlay** — animated arrows at complex junctions
- **Predictive warnings** — alerts 2 steps before complex junctions
- **Voice navigation** — full turn-by-turn audio guidance
- **Vehicle style selector** — arrow, car, bike, or cone marker
- **Progressive route rendering** — travelled portion turns grey, remaining stays blue

## Live URLs

- **App:** https://clearroute-uk.netlify.app
- **Backend:** https://clearroute-uk-production.up.railway.app
- **GitHub:** https://github.com/Josthepentest/Clearroute-UK

## Licence

MIT — © 2026 Ademola Joseph