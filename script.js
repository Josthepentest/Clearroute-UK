// =========================
// CLEARROUTE UK — script.js
// =========================
// SECTIONS:
// 1. Map initialisation
// 2. Global state variables
// 3. Status helpers
// 4. Complexity colour
// 5. Pre-drive briefing
// 6. Smart route (main)
// 7. Manual route (debug)
// 8. Render steps
// 9. Navigation controls
// 10. Simulation
// 11. Stop navigation
// 12. Live GPS tracking
// =========================


// =========================
// BACKEND URL
// =========================
const BACKEND_URL = "https://clearroute-uk-production.up.railway.app";


// =========================
// 1. MAP INITIALISATION
// =========================
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-0.09, 51.505],  // [longitude, latitude] — note reversed order
    zoom: 13,
    pitch: 0,      // flat at start, tilts during navigation
    bearing: 0     // north up at start, rotates during navigation
});

// Wait for map to fully load before any operations
map.on('load', () => {
    console.log('MapLibre map loaded successfully');
});

// OpenFreeMap style references icons (bowls, rugby_union, etc.) that aren't
// in the base sprite set. Provide blank placeholders so MapLibre stops warning.
map.on('styleimagemissing', (e) => {
    if (!map.hasImage(e.id)) {
        // 1x1 transparent placeholder
        map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    }
});



map.on("zoomstart", function() {
    if (!simulationInterval) return;
    userManuallyZoomed = true;
    clearTimeout(manualZoomTimeout);
    manualZoomTimeout = setTimeout(() => {
        userManuallyZoomed = false;
    }, 5000);
});

// MapLibre specific — handle pitch and bearing for navigation
map.on('load', () => {
    // Enable 3D buildings when zoomed in
    map.addLayer({
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 15,
        paint: {
            'fill-extrusion-color': '#aaa',
            'fill-extrusion-height': [
                'interpolate', ['linear'], ['zoom'],
                15, 0, 16, ['get', 'render_height']
            ],
            'fill-extrusion-opacity': 0.6
        }
    });
});

// =========================
// 2. GLOBAL STATE VARIABLES
// =========================

// Stores the two route polylines for progressive drawing
let routeLineTravelled = null;   // grey — already driven
let routeLineRemaining = null;   // blue — still to drive

// Stores all route steps from backend
let navigationSteps = [];

// Tracks which step user is currently on
let currentStepIndex = 0;

// Stores the moving simulation marker
let navigationMarker = null;

// Stores the simulation timer ID so we can cancel it
let simulationInterval = null;

// Stores the live GPS marker
let userMarker = null;

// =========================
// 3. MARKER & FEATURE STATE
// =========================

// User selected marker style — arrow / car / cone
let markerStyle = "arrow";

// Prevents lane guidance flickering
let laneGuidanceActive = false;

// Prevents predictive zoom firing twice for same junction
let lastWarnedStepIndex = -1;

// Target speed in mph for each simulation mode
// Slow = 20mph, Normal = 45mph, Fast = 70mph
let simTargetMph = 45;

// Remaining journey time in seconds — counts down during simulation
let remainingSeconds = 0;

// Controls whether voice is enabled
// User can toggle on/off
let voiceEnabled = true;

// Tracks last spoken step to avoid repeating
let lastSpokenStepIndex = -1;

// Tracks which junction we last warned about
// Prevents same warning firing multiple times
let lastWarnedJunctionIndex = -1;

// Tracks whether lane guidance is currently showing
let laneGuidanceVisible = false;

// Tracks if user manually zoomed — pauses auto follow briefly
let userManuallyZoomed = false;
let manualZoomTimeout = null;

// Tracks last position where map was centred
// Prevents setView firing when marker barely moved
let lastMapCentreCoord = null;


// =========================
// MAPLIBRE HELPERS
// =========================

// Convert [lat, lon] array to MapLibre LngLat format
// Leaflet uses [lat, lon] — MapLibre uses [lon, lat]
function toMLCoord(latLon) {
    return [latLon[1], latLon[0]];
}

// Convert array of [lat, lon] to MapLibre coordinates
function toMLCoords(latLonArray) {
    return latLonArray.map(coord => [coord[1], coord[0]]);
}



// =========================
// 3. STATUS HELPERS
// =========================
function showStatus(message, type) {
    const box = document.getElementById("statusBox");

    // Remove all previous type classes
    box.classList.remove("status-error", "status-loading", "status-success");

    // Icon by status type
    const iconMap = {
        error:   '<i class="ti ti-alert-circle"></i>',
        loading: '<i class="ti ti-loader-2 status-spin"></i>',
        success: '<i class="ti ti-circle-check"></i>'
    };
    const icon = iconMap[type] || '';

    // Add the correct class for this type
    if (type === "error")   box.classList.add("status-error");
    if (type === "loading") box.classList.add("status-loading");
    if (type === "success") box.classList.add("status-success");

    box.style.display = "block";
    box.innerHTML = `${icon} ${message}`;
}



// =========================
// TOAST NOTIFICATION
// =========================
// Auto-dismissing notification — replaces alert() for non-blocking UX.
function showToast(message, duration = 3500) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.innerHTML = `<i class="ti ti-circle-check"></i> ${message}`;
    toast.classList.add("show");

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, duration);
}


function hideStatus() {
    document.getElementById("statusBox").style.display = "none";
}




// =========================
// COMPLEXITY SCORE (client-side)
// =========================
// Returns { score, level, levelClass } from route data.
// Weighted: roundabouts 1.5×, sharp turns 1.2×, close junctions 1.0×.
// Normalised by route distance so density matters, not just absolute counts.
function calculateComplexityScore(data) {

    const roundabouts = (data.roundabout_warnings || []).length;
    const warnings = (data.warnings || []).length;
    const steps = data.steps || [];

    // Count sharp turns by parsing instructions
    let sharpTurns = 0;
    steps.forEach(step => {
        const instr = step.instruction.toLowerCase();
        if (instr.includes("sharp left") || instr.includes("sharp right")) {
            sharpTurns++;
        }
    });

    // Distance fallback to 1km if missing — avoids divide-by-zero
    const distanceKm = (data.journey && data.journey.distance_metres)
        ? data.journey.distance_metres / 1000
        : 1;

    // Weighted raw score
    const raw = (roundabouts * 1.5)
              + (sharpTurns * 1.2)
              + (warnings * 1.0);

    // Density per 10km
    const density = (raw / Math.max(distanceKm, 1)) * 10;

    // Clamp to 0-10 and round to one decimal
    const score = Math.round(Math.min(10, Math.max(0, density)) * 10) / 10;

    // Tiered level
    let level, levelClass;
    if (score < 3.5) {
        level = "Low";
        levelClass = "level-low";
    } else if (score < 6.5) {
        level = "Medium";
        levelClass = "level-medium";
    } else {
        level = "High";
        levelClass = "level-high";
    }

    return { score, level, levelClass };
}





// =========================
// 4. COMPLEXITY COLOUR
// =========================
function getComplexityColour(level) {
    if (level === "Low") return "green";
    if (level === "Medium") return "orange";
    if (level === "High") return "red";
    return "black";
}



// =========================
// BEARING CALCULATOR
// =========================
// Calculates the direction angle (0-360°) between two coordinates
// This tells us which way the marker should face
// North=0, East=90, South=180, West=270
function calculateBearing(from, to) {

    const lat1 = from[0] * Math.PI / 180;
    const lat2 = to[0] * Math.PI / 180;
    const dLon = (to[1] - from[1]) * Math.PI / 180;

    const x = Math.sin(dLon) * Math.cos(lat2);
    const y = Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const bearing = Math.atan2(x, y) * 180 / Math.PI;

    // Normalise to 0-360
    return (bearing + 360) % 360;
}



// =========================
// MARKER STYLE SELECTOR
// =========================
function setMarkerStyle(style) {

    // Save the choice
    markerStyle = style;

    // Update button active states
    document.querySelectorAll(".marker-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    document.getElementById(`btn-${style}`).classList.add("active");

    // If simulation is running, update marker immediately
    if (navigationMarker) {
        const currentPos = navigationMarker.getLngLat();
        navigationMarker.remove();
        navigationMarker = createDirectionMarker(
            [currentPos.lat, currentPos.lng], 0
        );
    }
}


// =========================
// CREATE DIRECTION MARKER
// =========================
// Builds the correct Leaflet marker based on user choice
// bearing = direction angle in degrees

function createDirectionMarker(coord, bearing) {

    let iconHtml = "";
    let iconSize = [40, 40];
    let iconAnchor = [20, 20];

    if (markerStyle === "arrow") {
        iconHtml = `
            <svg width="40" height="40" viewBox="0 0 40 40"
                style="transform: rotate(${bearing}deg);
                    transform-origin: 20px 20px;
                    filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5));
                    transition: transform 0.3s ease;"
                xmlns="http://www.w3.org/2000/svg">

                <!-- White circle background -->
                <circle cx="20" cy="20" r="19"
                    fill="white" stroke="#3399ff" stroke-width="2"/>

                <!-- Blue arrow pointing up (north) -->
                <polygon points="20,6 30,30 20,24 10,30"
                    fill="#3399ff"/>
            </svg>`;
        iconSize = [40, 40];
        iconAnchor = [20, 20];
    }

    else if (markerStyle === "car") {
        // SVG car — always visible, always correct size
        // Drawn as a proper vehicle shape, not emoji
        iconHtml = `
            <svg width="36" height="56" viewBox="0 0 36 56"
                style="transform: rotate(${bearing}deg);
                    transform-origin: 18px 28px;
                    filter: drop-shadow(0 4px 8px rgba(0,0,0,0.5));
                    transition: transform 0.3s ease;"
                xmlns="http://www.w3.org/2000/svg">

                <!-- Car body -->
                <rect x="4" y="16" width="28" height="30"
                    rx="5" ry="5" fill="#3399ff"/>

                <!-- Car roof -->
                <rect x="8" y="8" width="20" height="16"
                    rx="4" ry="4" fill="#1a6fcc"/>

                <!-- Front windscreen -->
                <rect x="9" y="9" width="18" height="10"
                    rx="2" fill="#cce8ff" opacity="0.8"/>

                <!-- Front lights -->
                <rect x="5" y="42" width="8" height="4"
                    rx="2" fill="#ffffaa"/>
                <rect x="23" y="42" width="8" height="4"
                    rx="2" fill="#ffffaa"/>

                <!-- Rear lights -->
                <rect x="5" y="16" width="8" height="4"
                    rx="2" fill="#ff4444"/>
                <rect x="23" y="16" width="8" height="4"
                    rx="2" fill="#ff4444"/>

                <!-- Direction indicator dot on roof -->
                <circle cx="18" cy="4" r="4"
                    fill="white" opacity="0.9"/>
            </svg>`;
        iconSize = [36, 56];
        iconAnchor = [18, 28];
    }

    else if (markerStyle === "cone") {
        iconHtml = `
            <div class="marker-cone-wrapper">
                <div class="marker-cone-direction"
                    style="transform: translateX(-50%) rotate(${bearing}deg)">
                </div>
                <div class="marker-cone-dot"></div>
            </div>`;
        iconSize = [40, 40];
        iconAnchor = [20, 20];
    }

    else if (markerStyle === "bike") {
        iconHtml = `
            <div class="marker-bike"
                style="transform: rotate(${bearing}deg)">
                🚲
            </div>`;
        iconSize = [48, 48];
        iconAnchor = [24, 24];
    }


    // Create DOM element for MapLibre marker
    const el = document.createElement('div');
    el.className = 'marker-container';
    el.style.width = iconSize[0] + 'px';   // dynamic — changes per marker style
    el.style.height = iconSize[1] + 'px';  // dynamic — changes per marker style
    el.innerHTML = iconHtml;

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat(toMLCoord(coord))
        .addTo(map);

    return marker;
}


// =========================
// UPDATE MARKER ROTATION
// =========================
// Called every simulation step to rotate marker
// to face the direction of travel

function updateMarkerRotation(bearing) {

    if (!navigationMarker) return;

    const el = navigationMarker.getElement();
    if (!el) return;

    // SVG markers — rotate the svg element directly
    if (markerStyle === "arrow" || markerStyle === "car") {
        const svg = el.querySelector("svg");
        if (svg) svg.style.transform =
            `rotate(${bearing}deg)`;
    }

    else if (markerStyle === "cone") {
        const cone = el.querySelector(".marker-cone-direction");
        if (cone) cone.style.transform =
            `translateX(-50%) rotate(${bearing}deg)`;
    }

    else if (markerStyle === "bike") {
        const bike = el.querySelector(".marker-bike");
        if (bike) bike.style.transform =
            `rotate(${bearing}deg)`;
    }
}


// =========================
// JOURNEY TIME FORMATTER
// =========================
function formatDuration(seconds) {

    // Convert raw seconds into human readable time
    // Examples:
    //   600  → "10 minutes"
    //   3661 → "1 hour 1 minute"
    //   7320 → "2 hours 2 minutes"

    const totalMinutes = Math.round(seconds / 60);

    if (totalMinutes < 60) {
        return `${totalMinutes} minute${totalMinutes !== 1 ? "s" : ""}`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    if (mins === 0) {
        return `${hours} hour${hours !== 1 ? "s" : ""}`;
    }

    return `${hours} hour${hours !== 1 ? "s" : ""} ${mins} minute${mins !== 1 ? "s" : ""}`;
}


// =========================
// DISTANCE FORMATTER
// =========================
function formatDistance(metres) {

    // Under 1km — show in metres
    if (metres < 1000) {
        return `${Math.round(metres)}m`;
    }

    // Over 1km — show in km with one decimal place
    const km = (metres / 1000).toFixed(1);
    return `${km} km`;
}


// =========================
// TEXT TO SPEECH
// =========================

function speak(text) {

    // Do nothing if voice is off or browser doesn't support it
    if (!voiceEnabled) return;
    if (!window.speechSynthesis) return;

    // Cancel anything currently being spoken
    // So new instruction immediately replaces old one
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Slightly slower than normal — clearer for driving
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Use UK English voice if available
    // Falls back to browser default if not found
    const voices = window.speechSynthesis.getVoices();
    const ukVoice = voices.find(v =>
        v.lang === "en-GB" || v.lang === "en_GB"
    );
    if (ukVoice) utterance.voice = ukVoice;

    window.speechSynthesis.speak(utterance);
}


function toggleVoice() {
    voiceEnabled = !voiceEnabled;

    const btn = document.getElementById("voiceToggleBtn");
    const icon = document.getElementById("voiceIcon");

    if (icon) {
        icon.className = voiceEnabled
            ? "ti ti-volume"
            : "ti ti-volume-off";
    }
    if (btn) {
        // Toggle off-state class — styled in CSS, no inline opacity
        btn.classList.toggle("voice-off", !voiceEnabled);
    }

    // Confirm the toggle to the user via speech
    if (voiceEnabled) speak("Voice guidance on");
}

// =========================
// SETTINGS PANEL (stub — Phase 5)
// =========================
// Placeholder. Phase 5 will wire this up to a settings panel
// containing vehicle style selector and other preferences.
function toggleSettings() {
    document.body.classList.toggle("settings-open");
}

// Click outside settings to close it
document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("settings-open")) return;

    const panel = document.getElementById("settingsPanel");
    const btn = document.getElementById("settingsBtn");

    // Ignore clicks inside the panel or on the gear button itself
    if (panel && panel.contains(e.target)) return;
    if (btn && btn.contains(e.target)) return;

    document.body.classList.remove("settings-open");
});


// =========================
// 5. PRE-DRIVE BRIEFING
// =========================
function generateBriefing(data) {

    const complexity = data.junction_complexity;
    const warnings = data.warnings || [];
    const roundabouts = data.roundabout_warnings || [];
    const steps = data.steps || [];

    // Extract journey time and distance
    // Use fallback object in case backend doesn't send it
    const journey = data.journey || {};
    const timeText = journey.duration_seconds
        ? formatDuration(journey.duration_seconds)
        : null;
    const distanceText = journey.distance_metres
        ? formatDistance(journey.distance_metres)
        : null;


    const roundaboutCount = roundabouts.length;

    let sharpTurnCount = 0;
    steps.forEach(step => {
        const instruction = step.instruction.toLowerCase();
        if (instruction.includes("sharp left") ||
            instruction.includes("sharp right")) {
            sharpTurnCount++;
        }
    });

    const closeJunctionCount = warnings.length;
    let parts = [];

    if (roundaboutCount > 0) {
        parts.push(
            `${roundaboutCount} roundabout${roundaboutCount > 1 ? "s" : ""}`
        );
    }
    if (sharpTurnCount > 0) {
        parts.push(
            `${sharpTurnCount} sharp turn${sharpTurnCount > 1 ? "s" : ""}`
        );
    }
    if (closeJunctionCount > 0) {
        parts.push(
            `${closeJunctionCount} section${closeJunctionCount > 1 ? "s" : ""} where turns are very close together`
        );
    }

    let routeDescription;

    if (parts.length === 0) {
        routeDescription = "This looks like a straightforward route with no major complications.";
    } else {
        let partsSentence;
        if (parts.length === 1) {
            partsSentence = parts[0];
        } else {
            const allButLast = parts.slice(0, -1).join(", ");
            const last = parts[parts.length - 1];
            partsSentence = `${allButLast} and ${last}`;
        }
        routeDescription = `Your route includes ${partsSentence}.`;
    }

    let advice = "";
    if (complexity.level === "Low") {
        advice = "This is a low complexity route — suitable for most drivers.";
    } else if (complexity.level === "Medium") {
        advice = "This is a medium complexity route — read the steps before setting off.";
    } else if (complexity.level === "High") {
        advice = "This is a high complexity route — take your time and review each step carefully before driving.";
    }

    // Build journey line if data exists
    const journeyLine = (timeText && distanceText)
    ? `<b><i class="ti ti-clock"></i> Estimated journey:</b> ${timeText} (${distanceText})<br><br>`
    : "";

    return `
        <b><i class="ti ti-clipboard-list"></i> Pre-Drive Briefing</b><br><br>
        ${journeyLine}
        ${routeDescription}<br><br>
        ${advice}
    `;
}


// =========================
// LOCATION INPUT MANAGEMENT
// =========================

// Stores confirmed GPS coordinates for routing
let confirmedUserLat = null;
let confirmedUserLon = null;
let confirmedUserAddress = null;


function useMyLocation() {

    // Show spinner, hide manual input
    document.getElementById("startManualInput").style.display = "none";
    document.getElementById("startLoadingInput").style.display = "block";
    document.getElementById("startConfirmedInput").style.display = "none";

    // Request GPS from browser
    navigator.geolocation.getCurrentPosition(

        // SUCCESS — got GPS coordinates
        async (position) => {

            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            try {
                // Call backend to reverse geocode coordinates
                const response = await fetch(
                    `${BACKEND_URL}/reverse-geocode?lat=${lat}&lon=${lon}`
                );
                const data = await response.json();

                if (data.error) {
                    // Reverse geocode failed — fall back to manual
                    resetStartInput();
                    showStatus(
                        "❌ Could not find your address. Please type it manually.",
                        "error"
                    );
                    return;
                }

                // Store confirmed location
                confirmedUserLat = lat;
                confirmedUserLon = lon;
                confirmedUserAddress = data.address;

                // Hide spinner, show confirmed location
                document.getElementById("startLoadingInput")
                    .style.display = "none";
                document.getElementById("startConfirmedInput")
                    .style.display = "block";
                document.getElementById("confirmedLocationText")
                    .textContent = data.address;

                // Show Get Route button now location is confirmed
                document.getElementById("getRouteBtn")
                    .style.display = "block";

            } catch (err) {
                // Network error calling backend
                resetStartInput();
                showStatus(
                    "❌ Could not get your location. Please type it manually.",
                    "error"
                );
            }
        },

        // ERROR — GPS denied or failed
        (error) => {
            console.error("GPS error:", error);

            // Fall back to manual input silently
            resetStartInput();

            // Show error message so user knows what happened
            showStatus(
                "❌ Location access denied. Please type your start location.",
                "error"
            );
        },

        // GPS options — high accuracy
        { enableHighAccuracy: true, timeout: 10000 }
    );
}


function resetStartInput() {

    // Clear stored GPS data
    confirmedUserLat = null;
    confirmedUserLon = null;
    confirmedUserAddress = null;

    // Return to manual input state
    document.getElementById("startManualInput").style.display = "block";
    document.getElementById("startLoadingInput").style.display = "none";
    document.getElementById("startConfirmedInput").style.display = "none";

    // Hide Get Route button until location confirmed again
    document.getElementById("getRouteBtn").style.display = "none";

    // Clear the text input
    document.getElementById("start").value = "";
}


function showGetRouteIfReady() {

    // Show Get Route only when destination has text
    const end = document.getElementById("end").value.trim();
    const hasStart = confirmedUserLat !== null ||
                     document.getElementById("start").value.trim() !== "";

    if (hasStart && end.length > 0) {
        document.getElementById("getRouteBtn").style.display = "block";
    } else {
        document.getElementById("getRouteBtn").style.display = "none";
    }
}



// =========================
// TOGGLE INFO CARD
// =========================
// Expands or collapses briefing and warnings cards
function toggleInfoCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) card.classList.toggle("expanded");
}


// =========================
// 6. SMART ROUTE (MAIN)
// =========================
async function getSmartRoute() {

    // Use confirmed GPS address if available
    // Otherwise use manual text input
    const start = confirmedUserAddress ||
                  document.getElementById("start").value;
    const end = document.getElementById("end").value;


    if (!start || !end) {
        showStatus("⚠️ Please enter both a start and destination.", "error");
        return;
    }

    showStatus("⏳ Finding your route...", "loading");

    let data;

    try {

        let routeUrl;

        // If user confirmed GPS location, use coordinates directly
        // This skips geocoding and is more accurate
        if (confirmedUserLat !== null && confirmedUserLon !== null) {
            routeUrl = `${BACKEND_URL}/route?start_lat=${confirmedUserLat}&start_lon=${confirmedUserLon}&end_lat=0&end_lon=0`;

            // For GPS start, we still need to geocode the destination
            // So use smart-route with confirmed address as start
            routeUrl = `${BACKEND_URL}/smart-route?start=${encodeURIComponent(confirmedUserAddress)}&end=${encodeURIComponent(end)}`;
        } else {
            routeUrl = `${BACKEND_URL}/smart-route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
        }

        const response = await fetch(routeUrl);

        if (!response.ok) {
            showStatus("❌ Server error. Is your backend running?", "error");
            return;
        }

        data = await response.json();

        if (data.error) {
            showStatus(`❌ ${data.error}`, "error");
            return;
        }

        if (!data.decoded_geometry || !data.decoded_geometry.length) {
            showStatus("❌ Could not calculate a route.", "error");
            return;
        }

        hideStatus();

    } catch (error) {
        showStatus("❌ Could not connect. Check your internet or backend.", "error");
        console.error("Route fetch error:", error);
        return;
    }

   // Complexity — derive score, level, level-class from client-side calc
    const complexity = calculateComplexityScore(data);
    const complexityColour = getComplexityColour(complexity.level);
    const journey = data.journey || {};
    const timeText = journey.duration_seconds
        ? formatDuration(journey.duration_seconds) : "";
    const distText = journey.distance_metres
        ? formatDistance(journey.distance_metres) : "";

    // --- HERO CARD ---
    document.getElementById("heroScore").textContent =
        complexity.score.toFixed(1);
    document.getElementById("heroLevel").textContent = complexity.level;
    document.getElementById("heroLevel").className =
        "hero-level " + complexity.levelClass;
    document.getElementById("heroTime").textContent = timeText || "—";
    document.getElementById("heroDistance").textContent = distText || "—";
    document.getElementById("heroCard").style.display = "block";

    // --- MAP OVERLAYS — show FAB Start and Preview pill ---
    document.getElementById("fabStart").style.display = "flex";
    document.getElementById("previewPill").style.display = "flex";

    // --- BRIEFING SUMMARY — describe contents, not duplicate hero ---
    const roundaboutCount = (data.roundabout_warnings || []).length;
    let sharpTurnCount = 0;
    (data.steps || []).forEach(step => {
        const i = step.instruction.toLowerCase();
        if (i.includes("sharp left") || i.includes("sharp right")) {
            sharpTurnCount++;
        }
    });

    let summaryParts = [];
    if (roundaboutCount > 0) {
        summaryParts.push(
            `${roundaboutCount} roundabout${roundaboutCount > 1 ? "s" : ""}`
        );
    }
    if (sharpTurnCount > 0) {
        summaryParts.push(
            `${sharpTurnCount} sharp turn${sharpTurnCount > 1 ? "s" : ""}`
        );
    }

    document.getElementById("briefingSummary").textContent =
        summaryParts.length > 0
            ? summaryParts.join(" · ")
            : "Straightforward route";

    // Full content shown when expanded
    document.getElementById("briefingBody").innerHTML =
        generateBriefing(data);

    // Show the card
    const briefingCard = document.getElementById("briefingCard");
    briefingCard.style.display = "block";

    // Read the briefing aloud when route loads
    // Strip HTML tags before speaking — speechSynthesis
    // reads raw text only
    const briefingText = `
        ${complexity.level} complexity route.
        ${timeText ? "Estimated journey time: " + timeText + "." : ""}
        ${distText ? "Distance: " + distText + "." : ""}
    `;
    speak(briefingText);


    // Warnings — populate collapsed card
    const warnings = data.warnings || [];
    const roundabouts = data.roundabout_warnings || [];
    let allWarnings = [];
    warnings.forEach(w => { allWarnings.push(w.warning); });
    roundabouts.forEach(r => { allWarnings.push(r.roundabout_warning); });

    // Summary line shown in collapsed header
    document.getElementById("warningsSummary").textContent =
        allWarnings.length > 0
            ? `${allWarnings.length} warning${allWarnings.length > 1 ? "s" : ""} on this route`
            : "No warnings on this route";

    // Full list shown when expanded
    document.getElementById("warningsBody").innerHTML =
        allWarnings.length > 0
            ? allWarnings.map(w => `
                <div class="warning-item">
                    <div class="warning-dot"></div>
                    <span>${w}</span>
                </div>`).join("")
            : "<p style='color:#aaa; font-size:13px;'>No warnings found.</p>";

    // Show the card
    const warningsCard = document.getElementById("warningsCard");
    warningsCard.style.display = "block";

    // Also remove the old complexity block since it
    // is now shown in the briefing summary
    document.getElementById("complexityBox").innerHTML = "";

    // Steps
    navigationSteps = data.steps || [];
    currentStepIndex = 0;
    renderSteps();

    // Map
    const routeCoords = data.decoded_geometry;
    window.currentRouteCoords = routeCoords;

    // Remove existing markers if they exist
    if (window.startMarker) window.startMarker.remove();
    if (window.endMarker) window.endMarker.remove();

    // Draw route when map style is fully loaded
    // MapLibre cannot add sources/layers before style loads
    const drawRoute = () => {
    try {

        // Remove existing layers if they exist from previous route
        if (map.getSource('route-remaining')) {
            map.removeLayer('route-arrows');
            map.removeLayer('route-remaining-layer');
            map.removeSource('route-remaining');
        }
        if (map.getSource('route-travelled')) {
            map.removeLayer('route-travelled-layer');
            map.removeSource('route-travelled');
        }

        // Remove existing markers
        if (window.startMarker) window.startMarker.remove();
        if (window.endMarker) window.endMarker.remove();

        // Blue line — remaining route
        map.addSource('route-remaining', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: toMLCoords(routeCoords)
                }
            }
        });

        map.addLayer({
            id: 'route-remaining-layer',
            type: 'line',
            source: 'route-remaining',
            paint: {
                'line-color': '#3399ff',
                'line-width': 6,
                'line-opacity': 0.9
            }
        });

        // Grey dashed line — already travelled
        map.addSource('route-travelled', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: []
                }
            }
        });

        map.addLayer({
            id: 'route-travelled-layer',
            type: 'line',
            source: 'route-travelled',
            paint: {
                'line-color': '#aaaaaa',
                'line-width': 4,
                'line-opacity': 0.5,
                'line-dasharray': [2, 2]
            }
        });

        // Direction arrows on blue line
        map.addLayer({
            id: 'route-arrows',
            type: 'symbol',
            source: 'route-remaining',
            layout: {
                'symbol-placement': 'line',
                'symbol-spacing': 100,
                'text-field': '>',
                'text-size': 14,
                'text-rotation-alignment': 'map',
                'text-keep-upright': false,
                'text-allow-overlap': true,
                'text-ignore-placement': true
            },
            paint: {
                'text-color': '#ffffff',
                'text-opacity': 0.8
            }
        });

        // Store references for simulation updates
        routeLineRemaining = map.getSource('route-remaining');
        routeLineTravelled = map.getSource('route-travelled');

        // Green start marker
        window.startMarker = new maplibregl.Marker({ color: '#22cc22' })
            .setLngLat(toMLCoord(routeCoords[0]))
            .setPopup(new maplibregl.Popup().setHTML('Start'))
            .addTo(map);

        // Red end marker
        window.endMarker = new maplibregl.Marker({ color: '#ff4444' })
            .setLngLat(toMLCoord(routeCoords[routeCoords.length - 1]))
            .setPopup(new maplibregl.Popup().setHTML('Destination'))
            .addTo(map);

        // Reset pitch and bearing to flat north-facing view first
        // fitBounds does not work correctly when map is tilted
        setTimeout(() => {
            // Calculate proper bounds from ALL route coordinates
            // MapLibre fitBounds needs [[swLng, swLat], [neLng, neLat]]
            // not an array of all coords like Leaflet
            const bounds = new maplibregl.LngLatBounds();
            toMLCoords(routeCoords).forEach(coord => {
                bounds.extend(coord);
            });

            map.fitBounds(bounds, {
                padding: { top: 60, bottom: 60, left: 40, right: 40 },
                duration: 1200,
                maxZoom: 13,
                pitch: 0,
                bearing: 0
            });
        }, 100);

        // Store journey duration for countdown timer
        window.routeDuration = data.journey
            ? data.journey.duration_seconds
            : null;

        console.log("SMART ROUTE DATA:", data);
    } catch (err) {
    console.error("drawRoute error:", err);
    }

    };

    // If map style already loaded — draw immediately
    // Wait for map to be fully idle before drawing
    // 'idle' fires after all tiles rendered — more reliable than 'load'
    if (map.isStyleLoaded()) {
        drawRoute();
    } else {
        map.once('idle', drawRoute);
    }
}


// =========================
// 7. MANUAL ROUTE (DEBUG)
// =========================
async function loadRoute() {

    const startLat = document.getElementById("startLat").value;
    const startLon = document.getElementById("startLon").value;
    const endLat = document.getElementById("endLat").value;
    const endLon = document.getElementById("endLon").value;

    const response = await fetch(
        `${BACKEND_URL}/route?start_lat=${startLat}&start_lon=${startLon}&end_lat=${endLat}&end_lon=${endLon}`
    );

    const data = await response.json();

    if (data.error) {
        alert("Route error: " + data.error);
        return;
    }

    const routeCoords = data.decoded_geometry;

    // Remove existing markers if they exist
    if (window.startMarker) window.startMarker.remove();
    if (window.endMarker) window.endMarker.remove();

    
    // Start marker
    window.startMarker = new maplibregl.Marker({ color: '#22cc22' })
        .setLngLat(toMLCoord(routeCoords[0]))
        .setPopup(new maplibregl.Popup().setHTML('Start'))
        .addTo(map);

    // End marker
    window.endMarker = new maplibregl.Marker({ color: '#ff4444' })
        .setLngLat(toMLCoord(routeCoords[routeCoords.length - 1]))
        .setPopup(new maplibregl.Popup().setHTML('Destination'))
        .addTo(map);
        // Small delay ensures tiles are rendered before fitting bounds
        // Without this fitBounds sometimes fails silently
        setTimeout(() => {
            const bounds = new maplibregl.LngLatBounds();
            toMLCoords(routeCoords).forEach(coord => {
                bounds.extend(coord);
            });

            map.fitBounds(bounds, {
                padding: { top: 80, bottom: 80, left: 60, right: 60 },
                duration: 800,
                maxZoom: 14
            });
        }, 200);

    navigationSteps = data.steps || [];
    window.currentRouteCoords = routeCoords;
    currentStepIndex = 0;
}


// =========================
// 8. RENDER STEPS
// =========================
function renderSteps() {

    const box = document.getElementById("stepsBox");
    box.innerHTML = `<b><i class="ti ti-compass"></i> Navigation Steps</b><br><br>`;

    navigationSteps.forEach((step, index) => {
        const text = step.enhanced_instruction || step.instruction;

        if (index < currentStepIndex) {
            box.innerHTML +=
                `<span style="color:#aaa"><i class="ti ti-circle-check"></i> ${text}</span><br>`;
        } else if (index === currentStepIndex) {
            box.innerHTML +=
                `<span style="color:#1a2744; font-weight:600"><i class="ti ti-arrow-big-right"></i> ${text}</span><br>`;
        } else {
            box.innerHTML += `<i class="ti ti-circle"></i> ${text}<br>`;
        }
    });
}

renderSteps();


// =========================
// 9. NAVIGATION CONTROLS
// =========================
function nextStep() {
    if (!navigationSteps.length) {
        alert("Please load a route first");
        return;
    }
    currentStepIndex = Math.min(
        currentStepIndex + 1,
        navigationSteps.length - 1
    );
    renderSteps();
    const box = document.getElementById("stepsBox");
    box.scrollTop = box.scrollHeight;
}

function previousStep() {
    if (!navigationSteps.length) {
        alert("Please load a route first");
        return;
    }
    currentStepIndex = Math.max(currentStepIndex - 1, 0);
    renderSteps();
}


// =========================
// SMOOTH MARKER MOVEMENT
// =========================
// Instead of jumping between coords, glide smoothly
// steps = how many micro-movements to break journey into
// duration = total time in ms for the full movement

function animateMarkerTo(marker, fromCoord, toCoord, duration) {

    const steps = 20;
    const stepTime = duration / steps;

    const latDiff = toCoord[0] - fromCoord[0];
    const lonDiff = toCoord[1] - fromCoord[1];

    let step = 0;

    const moveInterval = setInterval(() => {
        step++;

        if (step >= steps) {
            clearInterval(moveInterval);
            marker.setLngLat(toMLCoord(toCoord));
            return;
        }

        const progress = step / steps;
        const lat = fromCoord[0] + (latDiff * progress);
        const lon = fromCoord[1] + (lonDiff * progress);

        marker.setLngLat([lon, lat]);

    }, stepTime);
}


// =========================
// NAVIGATION BANNER UPDATER
// =========================
function updateNavBanner(stepIndex) {

    if (!navigationSteps.length) return;

    const step = navigationSteps[stepIndex];
    if (!step) return;

    const instruction = step.enhanced_instruction || step.instruction;

    // Extract turn arrow from instruction text
    const arrowMap = {
        "left":       "←",
        "right":      "→",
        "straight":   "↑",
        "roundabout": "↻",
        "sharp left": "↙",
        "sharp right":"↘",
        "arrive":     "📍"
    };

    let arrow = "↑"; // default straight
    const lower = instruction.toLowerCase();
    for (const [key, symbol] of Object.entries(arrowMap)) {
        if (lower.includes(key)) {
            arrow = symbol;
            break;
        }
    }

    document.getElementById("navBannerArrow").textContent = arrow;
    document.getElementById("navBannerStreet").textContent = instruction;
    document.getElementById("navBannerDistance").textContent =
        `Step ${stepIndex + 1} of ${navigationSteps.length}`;

    // Show next step preview
    const nextStep = navigationSteps[stepIndex + 1];
    if (nextStep) {
        const nextText = nextStep.enhanced_instruction
            || nextStep.instruction;
        document.getElementById("navBannerNext").innerHTML =
            `<span>Then:</span> <b>${nextText}</b>`;
    } else {
        document.getElementById("navBannerNext").innerHTML =
            `<b>📍 Destination ahead</b>`;
    }

    // Update step counter
    document.getElementById("navStepCounter").textContent =
        `Step ${stepIndex + 1} of ${navigationSteps.length}`;
}

// =========================
// SIMULATION SPEED CONTROL
// =========================
function updateSimSpeed() {
    const select = document.getElementById("simSpeed");
    const val = select.value;
    if (val === "slow")   simTargetMph = 20;
    if (val === "normal") simTargetMph = 45;
    if (val === "fast")   simTargetMph = 70;
}

// =========================
// STEP COMPLEXITY ANALYSER
// =========================
// Returns the complexity type of a navigation step
// Returns null if the step is not complex

function getStepComplexity(step) {

    if (!step) return null;

    const instruction = step.instruction.toLowerCase();

    if (instruction.includes("roundabout")) {
        return "roundabout";
    }

    if (instruction.includes("sharp left")) {
        return "sharp-left";
    }

    if (instruction.includes("sharp right")) {
        return "sharp-right";
    }

    // Close junction warning — distance under 50m to next step
    if (step.distance && step.distance < 50) {
        return "close-junction";
    }

    return null;
}

// =========================
// LANE CONFIGURATION
// =========================
// Returns the correct lane arrows based on junction type
// Roundabout = 3 lanes, sharp turn = 2 lanes

function getLaneConfig(complexityType) {

    if (complexityType === "roundabout") {
        return {
            title: '<i class="ti ti-rotate-clockwise-2"></i> ROUNDABOUT AHEAD — CHOOSE YOUR LANE',
            lanes: [
                {
                    arrow: "↖",
                    label: "EXIT 1",
                    type: "wrong"
                },
                {
                    arrow: "↑",
                    label: "STAY ON",
                    type: "correct"
                },
                {
                    arrow: "↗",
                    label: "EXIT 3",
                    type: "wrong"
                }
            ]
        };
    }

    if (complexityType === "sharp-left") {
        return {
            title: '<i class="ti ti-arrow-back"></i> SHARP LEFT — STAY LEFT',
            lanes: [
                {
                    arrow: "↙",
                    label: "YOUR LANE",
                    type: "correct"
                },
                {
                    arrow: "↑",
                    label: "WRONG",
                    type: "wrong"
                }
            ]
        };
    }

    if (complexityType === "sharp-right") {
        return {
            title: '<i class="ti ti-arrow-forward"></i> SHARP RIGHT — STAY RIGHT',
            lanes: [
                {
                    arrow: "↑",
                    label: "WRONG",
                    type: "wrong"
                },
                {
                    arrow: "↘",
                    label: "YOUR LANE",
                    type: "correct"
                }
            ]
        };
    }

    if (complexityType === "close-junction") {
        return {
            title: '<i class="ti ti-alert-triangle"></i> TURNS CLOSE TOGETHER — STAY ALERT',
            lanes: [
                {
                    arrow: "↑",
                    label: "FOLLOW ROUTE",
                    type: "correct"
                },
                {
                    arrow: "↗",
                    label: "WRONG",
                    type: "wrong"
                }
            ]
        };
    }

    return null;
}

// =========================
// JUNCTION WARNING BANNER
// =========================

function showJunctionWarning(complexityType, stepsAway) {

    const box = document.getElementById("junctionWarning");
    if (!box) return;

    const messages = {
    "roundabout":      '<i class="ti ti-rotate-clockwise-2"></i> Roundabout ahead',
    "sharp-left":      '<i class="ti ti-arrow-back"></i> Sharp left turn ahead',
    "sharp-right":     '<i class="ti ti-arrow-forward"></i> Sharp right turn ahead',
    "close-junction":  '<i class="ti ti-alert-triangle"></i> Turns very close together ahead'
    };

    const message = messages[complexityType] || '<i class="ti ti-alert-triangle"></i> Complex junction ahead';

    box.innerHTML = `
        ${message}
        <span style="font-weight:normal; opacity:0.8;">
            — prepare now
        </span>
    `;
    box.style.display = "block";
}

function hideJunctionWarning() {
    const box = document.getElementById("junctionWarning");
    if (box) box.style.display = "none";
}


// =========================
// LANE GUIDANCE OVERLAY
// =========================

function showLaneGuidance(complexityType) {

    if (laneGuidanceVisible) return;

    const config = getLaneConfig(complexityType);
    if (!config) return;

    const titleEl = document.getElementById("laneTitle");
    const arrowsEl = document.getElementById("laneArrows");
    const box = document.getElementById("laneGuidance");

    if (!titleEl || !arrowsEl || !box) return;

    // Set title — innerHTML allowed (config.title is internal, not user input)
    titleEl.innerHTML = config.title;

    // Build lane arrows
    arrowsEl.innerHTML = config.lanes.map(lane => `
        <div class="lane-arrow lane-${lane.type}">
            <span>${lane.arrow}</span>
            <span class="lane-label">${lane.label}</span>
        </div>
    `).join("");

    box.style.display = "block";
    laneGuidanceVisible = true;

    // Speak the lane instruction
    const voiceMessages = {
        "roundabout":     "Roundabout ahead. Stay in the middle lane and count the exits.",
        "sharp-left":     "Sharp left turn ahead. Move to the left lane now.",
        "sharp-right":    "Sharp right turn ahead. Move to the right lane now.",
        "close-junction": "Caution. Two turns coming up very close together. Stay alert."
    };

    const voiceMsg = voiceMessages[complexityType];
    if (voiceMsg) speak(voiceMsg);
}

function hideLaneGuidance() {
    const box = document.getElementById("laneGuidance");
    if (box) box.style.display = "none";
    laneGuidanceVisible = false;
}


// =========================
// COORDINATE DISTANCE CALCULATOR
// =========================
// Returns distance in metres between two GPS coordinates
// Used to calculate how far apart route points are

function coordDistanceMetres(coordA, coordB) {
    const R = 6371000;
    const dLat = (coordB[0] - coordA[0]) * Math.PI / 180;
    const dLon = (coordB[1] - coordA[1]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(coordA[0] * Math.PI / 180) *
              Math.cos(coordB[0] * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// =========================
// 10. SIMULATION
// =========================
function startNavigationSimulation() {

    if (!navigationSteps.length) {
        alert("Please load a route first");
        return;
    }

    if (simulationInterval) {
        clearInterval(simulationInterval);
    }

    const routeCoords = window.currentRouteCoords;
    let coordIndex = 0;

    if (navigationMarker) {
        map.removeLayer(navigationMarker);
    }

    // Create direction marker in chosen style
    navigationMarker = createDirectionMarker(routeCoords[0], 0);

    // Snap map immediately to marker
   map.easeTo({
        center: toMLCoord(routeCoords[0]),
        zoom: 16,
        pitch: 30,
        bearing: 0,
        duration: 800,
        padding: { top: 400, bottom: 80, left: 50, right: 50 }
    });

    // Reset map centre tracker
    lastMapCentreCoord = null;



    // Switch to navigation mode UI
    document.body.classList.add("nav-mode");
    document.body.classList.remove("settings-open");
    document.getElementById("navBanner").style.display = "block";
    updateNavBanner(0);

    // Map container resized when sidebar is hidden — tell MapLibre to repaint
    // 50ms delay lets the CSS class apply before we measure
    setTimeout(() => map.resize(), 50);

    // Speak the first instruction immediately
    lastSpokenStepIndex = 0;
    if (navigationSteps[0]) {
        const firstInstruction = navigationSteps[0].enhanced_instruction
            || navigationSteps[0].instruction;
        speak("Starting navigation. " + firstInstruction);
    }

    // Store total route duration for countdown
    // Set when route loads — we add this next
    remainingSeconds = window.routeDuration || 0;

    // Slower tick speeds for realistic movement
    const tickSpeed = simTargetMph <= 20 ? 800
                    : simTargetMph <= 45 ? 400
                    : 150;

    simulationInterval = setInterval(() => {

        // -------------------------
        // Route complete check
        // -------------------------
        if (coordIndex >= routeCoords.length - 1) {
            clearInterval(simulationInterval);
            simulationInterval = null;

           // Remove the moving marker entirely — red destination pin stays as the end indicator
            if (navigationMarker) {
                navigationMarker.remove();
                navigationMarker = null;
            }

            currentStepIndex = navigationSteps.length - 1;
            renderSteps();
            updateNavBanner(currentStepIndex);

            // Fit map to entire route — use LngLatBounds (NOT raw array)
            const arrivalBounds = new maplibregl.LngLatBounds();
            toMLCoords(routeCoords).forEach(coord => {
                arrivalBounds.extend(coord);
            });
            map.fitBounds(arrivalBounds, {
                padding: { top: 60, bottom: 80, left: 40, right: 60 },
                duration: 1000,
                pitch: 0,
                bearing: 0
            });

            // Mark entire route as travelled; nothing remaining.
            // (Use routeCoords directly — travelledCoords/remainingCoords are declared
            //  later in this same callback, so accessing them here = temporal dead zone)
            if (routeLineTravelled) {
                routeLineTravelled.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: toMLCoords(routeCoords)
                    }
                });
            }
            if (routeLineRemaining) {
                routeLineRemaining.setData({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: []
                    }
                });
            }

            document.body.classList.remove("nav-mode");
            document.getElementById("navBanner").style.display = "none";

            // Tell MapLibre to repaint after sidebar comes back
            setTimeout(() => map.resize(), 50);

            speak("You have arrived at your destination!");
            showToast("You have arrived at your destination!");
            return;
        }

        // -------------------------
        // Calculate coords to skip
        // based on target mph
        // -------------------------

        // Simple fixed step — move 1 coordinate per tick
            // Speed selector controls tick interval not coords skipped
            // This gives smooth consistent visual movement
            const nextIndex = Math.min(
                coordIndex + 1,
                routeCoords.length - 1
            );

        const currentCoord = routeCoords[coordIndex];
        const nextCoord = routeCoords[nextIndex];

        // -------------------------
        // Move and rotate marker
        // -------------------------
        const bearing = calculateBearing(currentCoord, nextCoord);
        animateMarkerTo(navigationMarker, currentCoord, nextCoord, tickSpeed * 0.9);
        updateMarkerRotation(bearing);

        // -------------------------
        // Progressive route lines
        // -------------------------
        const travelledCoords = routeCoords.slice(0, coordIndex + 1);
        const remainingCoords = routeCoords.slice(coordIndex);

        if (routeLineTravelled) {
        routeLineTravelled.setData({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: toMLCoords(travelledCoords)
            }
        });
        }
        if (routeLineRemaining) {
            routeLineRemaining.setData({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: toMLCoords(remainingCoords)
                }
            });
        }

      
        // -------------------------
        // Step update
        // Only re-renders when step changes
        // -------------------------
        const stepProgress = Math.floor(
            (coordIndex / routeCoords.length) * navigationSteps.length
        );

        if (stepProgress !== currentStepIndex) {
            currentStepIndex = stepProgress;
            renderSteps();
            updateNavBanner(currentStepIndex);

            // Speak the new instruction
            if (currentStepIndex !== lastSpokenStepIndex) {
                lastSpokenStepIndex = currentStepIndex;
                const step = navigationSteps[currentStepIndex];
                if (step) {
                    const instruction = step.enhanced_instruction
                        || step.instruction;
                    speak(instruction);
                }
            }

            // Hide lane guidance when step changes
            // Junction has been passed
            hideLaneGuidance();
            hideJunctionWarning();
        }

// -------------------------
        // SESSION B — Map following and junction warnings
        // -------------------------
        const lookAheadIndex = currentStepIndex + 2;
        const upcomingStep = navigationSteps[lookAheadIndex];
        const upcomingComplexity = getStepComplexity(upcomingStep);

        // Only recentre map if user has not manually zoomed
        // and marker has moved more than 20 metres
        if (!userManuallyZoomed) {

            const distMoved = lastMapCentreCoord
                ? coordDistanceMetres(lastMapCentreCoord, currentCoord)
                : 999;

            if (distMoved > 20) {
                    // Calculate offset in direction of travel
                    // Convert bearing to radians for offset calculation
                    const bearingRad = bearing * Math.PI / 180;
                    const offsetDistance = 0.003; // degrees — pushes view ahead

                    // Offset center in direction marker is facing
                    // This keeps marker in lower portion of screen
                    const centerLon = currentCoord[1] + Math.sin(bearingRad) * offsetDistance;
                    const centerLat = currentCoord[0] + Math.cos(bearingRad) * offsetDistance;

                    map.easeTo({
                        center: [currentCoord[1], currentCoord[0]],
                        zoom: 16,
                        bearing: bearing,
                        pitch: 30,
                        duration: tickSpeed * 0.9,
                        padding: {
                            top: 400,
                            bottom: 80,
                            left: 50,
                            right: 50
                        }
                    });
                        lastMapCentreCoord = currentCoord;
                }
        }

        // Junction warning fires regardless of zoom state
        // This is your unique feature — always warn driver
        if (upcomingComplexity &&
            lookAheadIndex !== lastWarnedJunctionIndex) {
            showJunctionWarning(upcomingComplexity, 2);
            lastWarnedJunctionIndex = lookAheadIndex;
        }

        // -------------------------
        // SESSION C — Lane guidance
        // Check if current step IS a complex junction
        // -------------------------
        const currentStepData = navigationSteps[currentStepIndex];
        const currentComplexity = getStepComplexity(currentStepData);

        if (currentComplexity && !laneGuidanceVisible) {
            showLaneGuidance(currentComplexity);
        }


        // Speed display — show simulated speed based on tick setting
        const speedEl = document.getElementById("navSpeed");
        if (speedEl) speedEl.textContent = simTargetMph;

        // -------------------------
        // Travel time countdown
        // Reduce remaining time proportionally
        // -------------------------
        if (window.routeDuration) {
            const progress = coordIndex / routeCoords.length;
            remainingSeconds = Math.round(
                window.routeDuration * (1 - progress)
            );
            const timeEl = document.getElementById("navBannerTime");
            if (timeEl) {
                timeEl.innerHTML = remainingSeconds > 0
                    ? `<i class="ti ti-clock"></i> ${formatDuration(remainingSeconds)} remaining`
                    : "";
            }
        }

        // -------------------------
        // Advance position
        // -------------------------
        coordIndex = nextIndex;

    }, tickSpeed);
}


// =========================
// 11. STOP NAVIGATION
// =========================
function stopNavigation() {

    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }

    if (navigationMarker) {
        navigationMarker.remove();
        navigationMarker = null;
    }

    // Zoom back out to show full route overview
    if (window.currentRouteCoords) {
        const stopBounds = new maplibregl.LngLatBounds();
        toMLCoords(window.currentRouteCoords).forEach(coord => {
            stopBounds.extend(coord);
        });

        map.fitBounds(stopBounds, {
            padding: { top: 80, bottom: 80, left: 60, right: 60 },
            duration: 800,
            pitch: 0,
            bearing: 0
        });
    }

    // Reset route line back to full blue on stop
    if (routeLineTravelled) {
    routeLineTravelled.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [] }
    });
    }
    if (routeLineRemaining && window.currentRouteCoords) {
        routeLineRemaining.setData({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: toMLCoords(window.currentRouteCoords)
            }
        });
    }

    currentStepIndex = 0;
    renderSteps();

    // Reset spoken step tracker
    lastSpokenStepIndex = -1;

    // Reset junction tracking
    lastWarnedJunctionIndex = -1;
    lastMapCentreCoord = null;
    
    hideLaneGuidance();
    hideJunctionWarning();

    // Stop any speech still playing
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }

    // Exit navigation mode — restore normal UI
    document.body.classList.remove("nav-mode");
    document.getElementById("navBanner").style.display = "none";

    // Map container shrunk again — tell MapLibre to repaint
    setTimeout(() => map.resize(), 50);

    // Reset location input so user can start a new route
    resetStartInput();
}


// =========================
// 12. LIVE GPS TRACKING
// =========================
function startLiveTracking() {
    navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            if (!userMarker) {
                const el = document.createElement('div');
                el.innerHTML = '📍';
                el.style.fontSize = '24px';
                userMarker = new maplibregl.Marker({ element: el })
                    .setLngLat([lon, lat])
                    .addTo(map);
            } else {
                userMarker.setLngLat([lon, lat]);
            }
            map.easeTo({ center: [lon, lat], duration: 500 });
        },
        (error) => {
            console.error("GPS error:", error);
            alert("❌ Please allow location access to use tracking");
        },
        { enableHighAccuracy: true }
    );
}

// =========================
// PREVIEW ROUTE — refit map to full route
// =========================
// Called when user taps the "Preview route" pill on the map.
// Useful after they've zoomed/panned and want to see the whole route again.
function previewRoute() {
    if (!window.currentRouteCoords || !window.currentRouteCoords.length) return;

    const bounds = new maplibregl.LngLatBounds();
    toMLCoords(window.currentRouteCoords).forEach(coord => {
        bounds.extend(coord);
    });

    map.fitBounds(bounds, {
        padding: { top: 60, bottom: 80, left: 40, right: 60 },
        duration: 800,
        maxZoom: 13,
        pitch: 0,
        bearing: 0
    });
}