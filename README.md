# 🗺 ClearRoute UK

> Navigation built for clarity — helping drivers understand complex UK roads before they drive them.

**Live App:** https://clearroute-uk.netlify.app

---

## The Problem

When I relocated to the UK, I found myself constantly missing roundabouts and 
getting confused by complex junctions while using standard navigation apps. 
Google Maps tells you where to go — but not why a road is confusing or which 
lane to be in before you reach it.

ClearRoute UK was built to solve that problem.

---

## What Makes It Different

Most navigation apps give you turn-by-turn directions.
ClearRoute gives you **route intelligence**:

- 📋 **Pre-Drive Briefing** — before you set off, hear a plain English summary 
  of what makes your route complex
- 🧠 **Complexity Scoring** — routes are scored and labelled Low, Medium or High
- 🔄 **Roundabout Detection** — every roundabout flagged with lane guidance
- ⬅ **Sharp Turn Warnings** — sharp lefts and rights identified in advance
- 🚦 **Lane Guidance Overlay** — coloured animated arrows show which lane 
  to stay in at complex junctions
- 🔊 **Voice Instructions** — briefing and every turn read aloud
- 📍 **Use My Location** — GPS start with reverse geocoding
- 🚗 **Vehicle Styles** — arrow, car, bike or cone marker

---

## Tech Stack

**Backend**
- Python 3
- FastAPI
- OpenRouteService API (routing)
- Nominatim / OpenStreetMap (geocoding)
- Deployed on Railway

**Frontend**
- Vanilla JavaScript
- Leaflet.js (map engine)
- Web Speech API (text to speech)
- HTML5 Geolocation API
- Deployed on Netlify

---

## Features

- Route calculation with turn-by-turn navigation
- Complexity scoring algorithm
- Roundabout and sharp turn detection
- Close junction warning system
- Pre-drive briefing with voice readout
- Lane guidance overlay at complex junctions
- Predictive zoom before complex junctions
- Progressive route line (grey behind, blue ahead)
- Navigation mode UI with instruction banner
- Travel time countdown
- Use My Location with GPS and reverse geocoding
- Vehicle style selector
- Manual zoom with auto-resume during navigation

---

## Project Structure
clearroute-uk/
├── main.py              # FastAPI backend
├── requirements.txt     # Python dependencies
├── Procfile             # Railway deployment
├── utils/
│   ├── Navigation.py    # Complexity scoring and route intelligence
│   └── geocoding.py     # Geocoding and reverse geocoding
├── index.html           # App structure
├── styles.css           # All styling
└── script.js            # All frontend logic

---

## Running Locally

**Backend:**
```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
Open `index.html` with Live Server in VS Code.

**Environment variables:**
Create a `.env` file with:
ORS_API_KEY=your_openrouteservice_api_key
Get a free API key at https://openrouteservice.org

---

## Roadmap

- **Version 1.1** — Migrate to Mapbox GL JS for 3D map and rotation
- **Version 1.2** — Live traffic integration
- **Version 1.3** — Mobile PWA
- **Version 2.0** — App store submission

---

## Licence

MIT — © 2026 Ademola Joseph

---

Built by someone who got lost on a UK roundabout one too many times.