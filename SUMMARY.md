# ClearRoute UK — Build Summary

## What I Built

A full stack UK navigation web app that analyses route complexity and 
provides intelligent guidance for drivers unfamiliar with UK roads.

---

## Why I Built It

After relocating to the UK, I experienced first hand how confusing 
UK roads are for new drivers and international visitors. Standard 
navigation apps provide directions but no context about why a road 
is difficult. I identified this gap and built a solution.

---

## What I Learned

### Python / Backend
- Built a REST API using FastAPI
- Integrated OpenRouteService API for routing
- Integrated Nominatim for geocoding and reverse geocoding
- Designed a complexity scoring algorithm from scratch
- Handled environment variables and production deployment

### JavaScript / Frontend
- Built a full navigation simulation engine
- Integrated Leaflet.js for interactive maps
- Used Web Speech API for text to speech
- Used HTML5 Geolocation API for GPS
- Managed complex application state
- Built progressive route line rendering
- Implemented bearing calculation for rotating markers

### Deployment
- Deployed Python backend to Railway
- Deployed frontend to Netlify
- Managed environment variables in production
- Used Git and GitHub for version control

---

## Technical Challenges Solved

| Challenge | Solution |
|---|---|
| Map tracking marker smoothly | Removed animated setView, used snap only |
| Preventing repeated junction warnings | Tracked last warned index |
| Voice reading HTML tags | Used innerText instead of innerHTML |
| CORS between Netlify and Railway | Added allow_credentials to FastAPI middleware |
| venv uploading to GitHub | Added venv/ to .gitignore |

---

## Architecture
User Browser (Netlify)
↓ fetch()
FastAPI Backend (Railway)
↓ HTTP
OpenRouteService API
↓
Route + Steps + Duration
↓
Complexity Scoring (Navigation.py)
↓
JSON Response
↓
Leaflet Map + Voice + Lane Guidance

---

## Unique Features

1. **Pre-drive briefing** — plain English route summary read aloud
2. **Complexity scoring** — proprietary algorithm scoring route difficulty
3. **Lane guidance overlay** — animated arrows at complex junctions
4. **Predictive warnings** — alerts 2 steps before complex junctions
5. **Voice navigation** — full turn by turn audio guidance

---

## Live URLs

- **App:** https://clearroute-uk.netlify.app
- **Backend:** https://clearroute-uk-production.up.railway.app
- **GitHub:** https://github.com/Josthepentest/Clearroute-UK