# =========================
# IMPORTS (external + internal modules)
# =========================
import os
# Detect confusing road situations (sharp turns, close junctions, etc.)
from utils.Navigation import detect_confusing_turns

# Detect roundabouts in route steps
from utils.Navigation import detect_roundabout

# Improve raw navigation instructions into clearer human-readable text
from utils.Navigation import enhance_instruction

# Score how complex/confusing a junction or route is
from utils.Navigation import (
    calculate_junction_complexity,
    get_complexity_label
)

# Enable Cross-Origin Resource Sharing (CORS)
# Allows frontend (Live Server) to communicate with backend
from fastapi.middleware.cors import CORSMiddleware

# Convert place names (e.g. "Big Ben") into GPS coordinates
from utils.geocoding import geocode_location, reverse_geocode

# HTTP requests to external APIs (OpenRouteService)
import requests

# Decode encoded route geometry into lat/lon points
import polyline

# FastAPI framework for building backend APIs
from fastapi import FastAPI


# =========================
# APP INITIALISATION
# =========================

app = FastAPI()

# Allow frontend apps to access backend API
# (important for browser-based requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # allow all origins (safe for development only)
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# API KEY (OpenRouteService)
# =========================
API_KEY = os.getenv("ORS_API_KEY")


# =========================
# HOME ENDPOINT
# =========================
@app.get("/")
def home():
    """
    Basic health check endpoint.
    Used to confirm backend is running.
    """

    return {
        "project": "ClearRoute UK",
        "status": "running"
    }


# =========================
# ROUTE GENERATION ENDPOINT
# =========================
@app.get("/route")
def get_route(start_lon: float, start_lat: float, end_lon: float, end_lat: float):

    """
    Main routing function:
    - Sends coordinates to OpenRouteService
    - Receives route data
    - Enhances instructions
    - Detects risks (roundabouts, confusing turns)
    - Calculates route complexity
    """

    # -------------------------
    # 1. API request setup
    # -------------------------
    url = "https://api.openrouteservice.org/v2/directions/driving-car"

    # Coordinates format required by OpenRouteService:
    # [longitude, latitude]
    body = {
        "coordinates": [
            [start_lon, start_lat],
            [end_lon, end_lat]
        ]
    }

    headers = {
        "Authorization": API_KEY,
        "Content-Type": "application/json"
    }

    # -------------------------
    # 2. Call routing API
    # -------------------------
    response = requests.post(
        url,
        json=body,
        headers=headers,
        timeout=10
    )

    print("STATUS CODE:", response.status_code)
    print("RAW RESPONSE:", response.text[:500])

    try:
        data = response.json()
    except Exception:
        return {
            "error": "Invalid JSON response from routing API",
            "raw_response": response.text
        }

    print("PARSED DATA:", data)

    if "routes" not in data:
        return {
            "error": "Routing API failed",
            "response": data
        }


    # -------------------------
    # 3. Extract route geometry
    # -------------------------
    
    geometry = data["routes"][0]["geometry"]

    # Decode compressed polyline into real GPS coordinates
    decoded_coords = polyline.decode(geometry)


    # -------------------------
    # 4. Extract navigation steps
    # -------------------------
    steps = data["routes"][0]["segments"][0]["steps"]


    # -------------------------
    # 5. Route intelligence (ClearRoute logic layer)
    # -------------------------

    # Calculate how complex/confusing the route is
    complexity_score = calculate_junction_complexity(steps)

    # Convert numeric score into human label (Low / Medium / High)
    complexity_label = get_complexity_label(complexity_score)

    # Detect confusing turns in route steps
    warnings = detect_confusing_turns(steps)


    # -------------------------
    # 6. Enhance navigation instructions
    # -------------------------
    for step in steps:
        step["enhanced_instruction"] = enhance_instruction(step["instruction"])


    # -------------------------
    # 7. Detect roundabouts
    # -------------------------
    roundabout_warnings = []

    for step in steps:
        warning = detect_roundabout(step)

        if warning:
            roundabout_warnings.append(warning)


    # -------------------------
    # 8. Extract journey summary
    # -------------------------

    # Summary contains total duration (seconds) and distance (metres)
    summary = data["routes"][0]["segments"][0]

    # Duration in seconds — frontend will convert to minutes
    duration_seconds = summary["duration"]

    # Distance in metres — frontend will convert to km
    distance_metres = summary["distance"]

    # -------------------------
    # 9. Return final structured response
    # -------------------------
    return {
        "steps": steps,
        "warnings": warnings,
        "roundabout_warnings": roundabout_warnings,

        "junction_complexity": {
            "score": complexity_score,
            "level": complexity_label
        },

        # Journey time and distance for frontend display
        "journey": {
            "duration_seconds": duration_seconds,
            "distance_metres": distance_metres
        },

        "decoded_geometry": decoded_coords
    }


# =========================
# GEOCODING ENDPOINT
# =========================
@app.get("/search")
def search_location(location: str):

    """
    Converts place name into GPS coordinates.
    Example:
        "Big Ben" → {lat, lon}
    """

    result = geocode_location(location)

    return result

@app.get("/smart-route")
def smart_route(start: str, end: str):

    # ----------------------------
    # 1. Convert start place → coordinates
    # ----------------------------
    start_coords = geocode_location(start)
    print("START:", start_coords)

    if not start_coords:
        return {"error": f"Could not find start location: {start}"}

    # ----------------------------
    # 2. Convert end place → coordinates
    # ----------------------------
    end_coords = geocode_location(end)
    print("END:", end_coords)

    if not end_coords:
        return {"error": f"Could not find end location: {end}"}

    # ----------------------------
    # 3. Extract coordinates
    # ----------------------------
    start_lon = start_coords["lon"]
    start_lat = start_coords["lat"]

    end_lon = end_coords["lon"]
    end_lat = end_coords["lat"]

    # ----------------------------
    # 4. Reuse  existing route logic
    # ----------------------------
    return get_route(start_lon, start_lat, end_lon, end_lat)

# =========================
# REVERSE GEOCODING ENDPOINT
# =========================
@app.get("/reverse-geocode")
def reverse_geocode_endpoint(lat: float, lon: float):
    """
    Converts GPS coordinates into a readable address.
    Called by frontend when user taps Use My Location.
    """
    result = reverse_geocode(lat, lon)
    return result