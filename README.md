# ClearRoute UK

**Navigation built for clarity — helping drivers understand complex UK roads before they drive them.**

**Live App:** https://clearroute-uk.netlify.app

> Now at **V1.1** — full redesign with MapLibre GL JS, hero complexity scoring, and a polished two-column layout. [View V1.0 here](https://github.com/Josthepentest/Clearroute-UK/tree/v1.0).

---

## The Problem

When I relocated to the UK, I found myself constantly missing roundabouts and getting confused by complex junctions while using standard navigation apps. Google Maps tells you where to go — but not *why* a road is confusing or which lane to be in before you reach it.

ClearRoute UK was built to solve that problem.

## What Makes It Different

Most navigation apps give you turn-by-turn directions. ClearRoute gives you **route intelligence**:

- **Hero Complexity Score** — every route is scored out of 10 with a colour-coded difficulty tier (Low, Medium, High)
- **Pre-Drive Briefing** — plain English summary of what makes your route complex, read aloud
- **Roundabout Detection** — every roundabout flagged with lane guidance
- **Sharp Turn Warnings** — sharp lefts and rights identified in advance
- **Lane Guidance Overlay** — animated arrows show which lane to stay in at complex junctions
- **Predictive Junction Warnings** — alerts you 2 steps before a complex junction
- **Voice Instructions** — briefing and every turn read aloud
- **Use My Location** — GPS start with reverse geocoding
- **Vehicle Styles** — arrow, car, bike or cone marker, configurable in settings

## What's New in V1.1

- **Migrated to MapLibre GL JS** — 3D buildings, smooth bearing rotation, edge-to-edge map
- **Hero Complexity Card** — large numeric score (e.g. "5.7 Medium") as the focal point of the interface
- **Full UI redesign** — two-column sidebar + map layout, Tabler icons throughout, real logo mark
- **Settings panel** — vehicle style and simulation speed live in a clean dropdown behind the gear icon
- **Toast notifications** — replaced blocking browser alerts with auto-dismissing toasts
- **Mobile responsive** — stacks vertically below 768px, fully functional on phones
- **Floating Start button** — Google Maps-style FAB on the map
- **Polished navigation flow** — fixed temporal dead zone bug, proper LngLatBounds usage, clean console

## Tech Stack

### Backend
- Python 3 + FastAPI
- OpenRouteService API (routing)
- Nominatim / OpenStreetMap (geocoding)
- Deployed on Railway

### Frontend
- Vanilla JavaScript
- **MapLibre GL JS** (map engine — open source, no API key required)
- OpenFreeMap (map tiles)
- Tabler Icons
- Web Speech API (text to speech)
- HTML5 Geolocation API
- Deployed on Netlify

## Project Structure

```
clearroute-uk/
├── main.py                # FastAPI backend
├── requirements.txt       # Python dependencies
├── Procfile               # Railway deployment
├── utils/
│   ├── Navigation.py      # Complexity scoring and route intelligence
│   └── geocoding.py       # Geocoding and reverse geocoding
├── index.html             # App structure
├── styles.css             # All styling
└── script.js              # All frontend logic
```

## Running Locally

**Backend:**
```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:** Open `index.html` with Live Server in VS Code.

**Environment variables:** Create a `.env` file with:
```
ORS_API_KEY=your_openrouteservice_api_key
```
Get a free API key at https://openrouteservice.org

## Roadmap

- ✅ **V1.0** — Initial release with Leaflet.js ([archived here](https://github.com/Josthepentest/Clearroute-UK/tree/v1.0))
- ✅ **V1.1** — MapLibre migration + UI redesign *(current)*
- ⏳ **V1.2** — Live UK traffic data and lane data
- ⏳ **V2.0** — Mobile PWA / native app

## Version History

| Version | Highlights |
|---------|------------|
| [V1.1](https://github.com/Josthepentest/Clearroute-UK/tree/v1.1) | MapLibre, hero complexity card, redesigned UI, mobile responsive |
| [V1.0](https://github.com/Josthepentest/Clearroute-UK/tree/v1.0) | Leaflet-based initial release |

## Licence

MIT — © 2026 Ademola Joseph

---

*Built by someone who got lost on a UK roundabout one too many times.*