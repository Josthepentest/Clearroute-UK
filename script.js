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
// 1. MAP INITIALISATION
// =========================
var map = L.map('map').setView([51.505, -0.09], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(map);

// When user manually zooms during simulation
// auto-follow pauses for 5 seconds then resumes
map.on("zoomstart", function() {

    // Only pause if simulation is running
    if (!simulationInterval) return;

    userManuallyZoomed = true;

    // Clear any existing timeout
    clearTimeout(manualZoomTimeout);

    // Resume auto-follow after 5 seconds
    manualZoomTimeout = setTimeout(() => {
        userManuallyZoomed = false;
    }, 5000);
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
// 3. STATUS HELPERS
// =========================
function showStatus(message, type) {
    const box = document.getElementById("statusBox");
    box.style.display = "block";
    box.innerHTML = message;

    if (type === "error") {
        box.style.background = "#ffe0e0";
        box.style.border = "1px solid red";
        box.style.color = "red";
    } else if (type === "loading") {
        box.style.background = "#fff8e0";
        box.style.border = "1px solid orange";
        box.style.color = "orange";
    } else if (type === "success") {
        box.style.background = "#e0ffe0";
        box.style.border = "1px solid green";
        box.style.color = "green";
    }
}

function hideStatus() {
    document.getElementById("statusBox").style.display = "none";
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
        const currentPos = navigationMarker.getLatLng();
        map.removeLayer(navigationMarker);
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


    // popupAnchor keeps any popup above the marker
    const icon = L.divIcon({
        html: `<div style="
            overflow: visible;
            display: flex;
            align-items: center;
            justify-content: center;
            width: ${iconSize[0]}px;
            height: ${iconSize[1]}px;
        ">${iconHtml}</div>`,
        iconSize: iconSize,
        iconAnchor: iconAnchor,
        className: ""
    });

    const marker = L.marker(coord, { icon }).addTo(map);
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
    if (btn) {
        btn.textContent = voiceEnabled ? "🔊 Voice On" : "🔇 Voice Off";
        btn.style.opacity = voiceEnabled ? "1" : "0.5";
    }

    // Confirm the toggle to the user via speech
    if (voiceEnabled) speak("Voice guidance on");
}


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
        ? `<b>🕐 Estimated journey:</b> ${timeText} (${distanceText})<br><br>`
        : "";

    return `
        <b>📋 Pre-Drive Briefing</b><br><br>
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
                    `http://127.0.0.1:8000/reverse-geocode?lat=${lat}&lon=${lon}`
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
            routeUrl = `http://127.0.0.1:8000/route?start_lat=${confirmedUserLat}&start_lon=${confirmedUserLon}&end_lat=0&end_lon=0`;

            // For GPS start, we still need to geocode the destination
            // So use smart-route with confirmed address as start
            routeUrl = `http://127.0.0.1:8000/smart-route?start=${encodeURIComponent(confirmedUserAddress)}&end=${encodeURIComponent(end)}`;
        } else {
            routeUrl = `http://127.0.0.1:8000/smart-route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
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

    // Briefing — populate collapsed card
    const complexity = data.junction_complexity;
    const complexityColour = getComplexityColour(complexity.level);
    const journey = data.journey || {};
    const timeText = journey.duration_seconds
        ? formatDuration(journey.duration_seconds) : "";
    const distText = journey.distance_metres
        ? formatDistance(journey.distance_metres) : "";

    // Summary line shown in collapsed header
    document.getElementById("briefingSummary").innerHTML = `
        <span class="complexity-dot"
            style="background:${complexityColour}">
        </span>
        ${complexity.level} complexity
        ${timeText ? "· " + timeText : ""}
        ${distText ? "· " + distText : ""}
    `;

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

    map.eachLayer(layer => {
        if (layer instanceof L.Polyline || layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Draw initial full route as the remaining line
    // Travelled line starts empty
    routeLineTravelled = L.polyline([], {
        color: "#aaaaaa",
        weight: 4,
        opacity: 0.5,
        dashArray: "6 4"   // dashed = already driven
    }).addTo(map);

    routeLineRemaining = L.polyline(routeCoords, {
        color: "#3399ff",
        weight: 5,
        opacity: 0.9
    }).addTo(map);

    L.marker(routeCoords[0]).addTo(map).bindPopup("Start");
    L.marker(routeCoords[routeCoords.length - 1]).addTo(map)
        .bindPopup("Destination");
    map.fitBounds(routeCoords);

    // Store total journey duration for countdown timer
    // Used by simulation to count down remaining time
    window.routeDuration = data.journey
        ? data.journey.duration_seconds
        : null;

    console.log("SMART ROUTE DATA:", data);
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
        `http://127.0.0.1:8000/route?start_lat=${startLat}&start_lon=${startLon}&end_lat=${endLat}&end_lon=${endLon}`
    );

    const data = await response.json();

    if (data.error) {
        alert("Route error: " + data.error);
        return;
    }

    const routeCoords = data.decoded_geometry;

    map.eachLayer(layer => {
        if (layer instanceof L.Polyline || layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    L.polyline(routeCoords).addTo(map);
    L.marker(routeCoords[0]).addTo(map).bindPopup("Start");
    L.marker(routeCoords[routeCoords.length - 1]).addTo(map)
        .bindPopup("Destination");
    map.fitBounds(routeCoords);

    navigationSteps = data.steps || [];
    window.currentRouteCoords = routeCoords;
    currentStepIndex = 0;
}


// =========================
// 8. RENDER STEPS
// =========================
function renderSteps() {

    const box = document.getElementById("stepsBox");
    box.innerHTML = "<b>🧭 Navigation Steps</b><br><br>";

    navigationSteps.forEach((step, index) => {
        const text = step.enhanced_instruction || step.instruction;

        if (index < currentStepIndex) {
            box.innerHTML +=
                `<span style="color:#aaa">✅ ${text}</span><br>`;
        } else if (index === currentStepIndex) {
            box.innerHTML +=
                `<span style="color:#1a2744; font-weight:bold">🔥 ${text}</span><br>`;
        } else {
            box.innerHTML += `⬜ ${text}<br>`;
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

    const steps = 20; // 20 micro-steps
    const stepTime = duration / steps;

    const latDiff = toCoord[0] - fromCoord[0];
    const lonDiff = toCoord[1] - fromCoord[1];

    let step = 0;

    const moveInterval = setInterval(() => {
        step++;

        if (step >= steps) {
            clearInterval(moveInterval);
            marker.setLatLng(toCoord);
            return;
        }

        // Linear interpolation — moves equal distance each step
        const progress = step / steps;
        const lat = fromCoord[0] + (latDiff * progress);
        const lon = fromCoord[1] + (lonDiff * progress);

        marker.setLatLng([lat, lon]);

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
            title: "🔄 ROUNDABOUT AHEAD — CHOOSE YOUR LANE",
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
            title: "⬅ SHARP LEFT — STAY LEFT",
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
            title: "➡ SHARP RIGHT — STAY RIGHT",
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
            title: "⚠️ TURNS CLOSE TOGETHER — STAY ALERT",
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
        "roundabout":      "🔄 Roundabout ahead",
        "sharp-left":      "⬅ Sharp left turn ahead",
        "sharp-right":     "➡ Sharp right turn ahead",
        "close-junction":  "⚠️ Turns very close together ahead"
    };

    const message = messages[complexityType] || "⚠️ Complex junction ahead";

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

    // Set title
    titleEl.textContent = config.title;

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
    map.setView(routeCoords[0], 18, { animate: false });

    // Reset map centre tracker
    lastMapCentreCoord = null;



    // Switch to navigation mode UI
    document.body.classList.add("nav-mode");
    document.getElementById("navBanner").style.display = "block";
    document.getElementById("stopBtn").style.display = "inline";
    updateNavBanner(0);

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

    simulationInterval = setInterval(() => {

        // -------------------------
        // Route complete check
        // -------------------------
        if (coordIndex >= routeCoords.length - 1) {
            clearInterval(simulationInterval);
            simulationInterval = null;

            navigationMarker.setLatLng(
                routeCoords[routeCoords.length - 1]
            );

            currentStepIndex = navigationSteps.length - 1;
            renderSteps();
            updateNavBanner(currentStepIndex);

            document.getElementById("stopBtn").style.display = "none";

            map.fitBounds(window.currentRouteCoords, {
                animate: true,
                duration: 1
            });

            if (routeLineTravelled) {
                routeLineTravelled.setLatLngs([]);
            }
            if (routeLineRemaining && window.currentRouteCoords) {
                routeLineRemaining.setLatLngs(window.currentRouteCoords);
            }

            document.body.classList.remove("nav-mode");
            document.getElementById("navBanner").style.display = "none";
            
            speak("You have arrived at your destination!");
            alert("🧭 You have arrived at your destination!");
            return;
        }

        // -------------------------
        // Calculate coords to skip
        // based on target mph
        // -------------------------

       // 1.2 second tick, capped at 60 metres max per tick
        // This keeps movement visually smooth regardless of speed setting
        const targetMetresPerTick = Math.min(
            simTargetMph * 0.44704 * 1.2,
            60
        );

        // Walk forward through coordinates until
        // we have covered targetMetresPerTick metres
        let metresToCover = targetMetresPerTick;
        let coordsToSkip = 1;

        for (let i = coordIndex; i < routeCoords.length - 1; i++) {
            const segDist = coordDistanceMetres(
                routeCoords[i],
                routeCoords[i + 1]
            );
            metresToCover -= segDist;
            if (metresToCover <= 0) break;
            coordsToSkip++;
        }

        const nextIndex = Math.min(
            coordIndex + coordsToSkip,
            routeCoords.length - 1
        );

        const currentCoord = routeCoords[coordIndex];
        const nextCoord = routeCoords[nextIndex];

        // -------------------------
        // Move and rotate marker
        // -------------------------
        const bearing = calculateBearing(currentCoord, nextCoord);
        animateMarkerTo(navigationMarker, currentCoord, nextCoord, 700);
        updateMarkerRotation(bearing);

        // -------------------------
        // Progressive route lines
        // -------------------------
        const travelledCoords = routeCoords.slice(0, coordIndex + 1);
        const remainingCoords = routeCoords.slice(coordIndex);

        if (routeLineTravelled) {
            routeLineTravelled.setLatLngs(travelledCoords);
        }
        if (routeLineRemaining) {
            routeLineRemaining.setLatLngs(remainingCoords);
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
        // SESSION B — Predictive zoom and map following
        // Only recentre map if marker moved more than 20 metres
        // Prevents tile thrashing and black gaps
        // -------------------------
        const lookAheadIndex = currentStepIndex + 2;
        const upcomingStep = navigationSteps[lookAheadIndex];
        const upcomingComplexity = getStepComplexity(upcomingStep);

        if (!userManuallyZoomed) {

            // Check how far we have moved since last recentre
            const distMoved = lastMapCentreCoord
                ? coordDistanceMetres(lastMapCentreCoord, currentCoord)
                : 999;

            // Only recentre if moved more than 20 metres
            // This dramatically reduces tile requests
            if (distMoved > 20) {

                const offsetLat = currentCoord[0] + 0.0006;

                map.setView(
                    [offsetLat, currentCoord[1]],
                    18,
                    { animate: false }
                );

                lastMapCentreCoord = currentCoord;
            }

            // Show junction warning regardless of recentre
            if (upcomingComplexity &&
                lookAheadIndex !== lastWarnedJunctionIndex) {
                showJunctionWarning(upcomingComplexity, 2);
                lastWarnedJunctionIndex = lookAheadIndex;
            }
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


        // -------------------------
        // Speed display
        // Show actual calculated speed not target
        // -------------------------
        const actualDist = coordDistanceMetres(currentCoord, nextCoord);
        const actualMph = Math.round(actualDist / 0.8 * 2.237);
        const speedEl = document.getElementById("navSpeed");
        if (speedEl) speedEl.textContent = Math.min(actualMph, 70);

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
                timeEl.textContent = remainingSeconds > 0
                    ? `🕐 ${formatDuration(remainingSeconds)} remaining`
                    : "";
            }
        }

        // -------------------------
        // Advance position
        // -------------------------
        coordIndex = nextIndex;

    }, 1200); // 1.2 seconds per tick — smoother visual pace
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
        map.removeLayer(navigationMarker);
        navigationMarker = null;
    }

    // Zoom back out to show full route overview
    if (window.currentRouteCoords) {
        map.fitBounds(window.currentRouteCoords, {
            animate: true,
            duration: 1
        });
    }

    // Reset route line back to full blue on stop
    if (routeLineTravelled) {
        routeLineTravelled.setLatLngs([]);
    }
    if (routeLineRemaining && window.currentRouteCoords) {
        routeLineRemaining.setLatLngs(window.currentRouteCoords);
    }


    document.getElementById("stopBtn").style.display = "none";
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
                userMarker = L.marker([lat, lon])
                    .addTo(map)
                    .bindPopup("📍 You are here");
            } else {
                userMarker.setLatLng([lat, lon]);
            }

            map.setView([lat, lon]);
        },
        (error) => {
            console.error("GPS error:", error);
            alert("❌ Please allow location access to use tracking");
        },
        { enableHighAccuracy: true }
    );
}