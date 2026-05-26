import requests


# Convert a place name (e.g. "Big Ben") into GPS coordinates
def geocode_location(location):

    # OpenStreetMap Nominatim geocoding endpoint
    # This service converts human-readable place names into coordinates
    url = "https://nominatim.openstreetmap.org/search"

    # Query parameters sent to the API
    params = {
        "q": location,       # user input (place name)
        "format": "json",    # response format
        "limit": 1 ,          # only return best match
        "countrycodes": "gb" # restrict to UK results
    }

    # Required header for Nominatim API
    # Without this, the API may block or throttle the request
    headers = {
        "User-Agent": "ClearRouteUK/1.0 (learning project)"
    }

    try:
        # Send HTTP request to geocoding API
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=5  # prevents hanging requests
        )

        # Safety check: ensure response is not empty
        if not response.text:
            return {"error": "Empty response from API"}

        # Try converting response into JSON
        # (may fail if API returns HTML or error page)
        try:
            data = response.json()
        except Exception:
            return {
                "error": "API did not return JSON",
                "raw_response": response.text[:200]  # debug info
            }

        # If API returns no results
        if not data:
            return None

        # Extract first result and convert to float
        return {
            "lat": float(data[0]["lat"]),
            "lon": float(data[0]["lon"])
        }

    except Exception as e:
        # Catch network errors, timeout errors, etc.
        return {
            "error": "Request failed",
            "detail": str(e)
        }
    

def reverse_geocode(lat, lon):
    """
    Converts GPS coordinates into a human readable address.
    Example: (51.4837, -3.1681) → "Newport Road, Cardiff"
    """

    url = "https://nominatim.openstreetmap.org/reverse"

    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "zoom": 16  # street level detail
    }

    headers = {
        "User-Agent": "ClearRouteUK/1.0 (learning project)"
    }

    try:
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=5
        )

        if not response.text:
            return {"error": "Empty response from API"}

        try:
            data = response.json()
        except Exception:
            return {"error": "API did not return JSON"}

        if "display_name" not in data:
            return {"error": "Location not found"}

        # Extract readable parts from address
        # We want road + town, not the full long string
        address = data.get("address", {})

        road = address.get("road", "")
        town = (
            address.get("town") or
            address.get("city") or
            address.get("village") or
            address.get("suburb") or
            ""
        )

        # Build clean readable string
        if road and town:
            readable = f"{road}, {town}"
        elif town:
            readable = town
        else:
            # Fall back to full display name trimmed
            readable = data["display_name"].split(",")[0]

        return {
            "address": readable,
            "lat": float(data["lat"]),
            "lon": float(data["lon"])
        }

    except Exception as e:
        return {
            "error": "Request failed",
            "detail": str(e)
        }