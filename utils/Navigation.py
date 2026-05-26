# =========================================================
# CLEARROUTE UK - NAVIGATION INTELLIGENCE MODULE
# =========================================================
# This file contains all "road understanding logic"
# It processes raw route steps into:
# - warnings
# - enhanced instructions
# - complexity scoring
# - roundabout detection
# =========================================================


# =========================================================
# DETECT CONFUSING TURN PATTERNS
# =========================================================
def detect_confusing_turns(steps):

    """
    Detects situations where navigation may confuse drivers,
    especially when multiple turns happen very close together.
    """

    warnings = []

    # loop through all steps except the last one
    for i in range(len(steps) - 1):

        current_step = steps[i]
        next_step = steps[i + 1]

        # distance to next instruction point
        next_distance = next_step["distance"]

        # if turns are too close together, mark as confusing
        if next_distance < 50:

            warnings.append({
                "warning": "Multiple turns close together",
                "current_instruction": current_step["instruction"],
                "next_instruction": next_step["instruction"]
            })

    return warnings


# =========================================================
# IMPROVE RAW NAVIGATION INSTRUCTIONS
# =========================================================
def enhance_instruction(instruction):

    """
    Takes raw navigation instructions from routing API
    and makes them clearer and more human-friendly.
    """

    instruction_lower = instruction.lower()

    # sharp left turn warning
    if "sharp left" in instruction_lower:
        return instruction + ". Be careful not to take the smaller side road."

    # sharp right turn warning
    if "sharp right" in instruction_lower:
        return instruction + ". Stay alert for the correct right turn."

    # lane guidance: right
    if "keep right" in instruction_lower:
        return instruction + ". Stay in the correct lane early."

    # lane guidance: left
    if "keep left" in instruction_lower:
        return instruction + ". Avoid drifting into the right lane."

    # default: no change
    return instruction


# =========================================================
# ROUNDABOUT DETECTION
# =========================================================
def detect_roundabout(step):

    """
    Identifies roundabout instructions and adds warning guidance.
    """

    instruction = step["instruction"].lower()

    if "roundabout" in instruction:
        return {
            "roundabout_warning": (
                "Roundabout ahead. Count exits carefully and stay in the correct lane."
            )
        }

    return None


# =========================================================
# JUNCTION COMPLEXITY SCORING ENGINE
# =========================================================
def calculate_junction_complexity(steps):

    """
    Calculates how difficult a route is to navigate
    based on number of complex road situations.
    
    Higher score = more confusing route.
    """

    score = 0

    for i in range(len(steps)):

        instruction = steps[i]["instruction"].lower()

        # roundabout increases complexity significantly
        if "roundabout" in instruction:
            score += 3

        # sharp turns are moderately complex
        if "sharp left" in instruction or "sharp right" in instruction:
            score += 2

        # lane decisions increase cognitive load
        if "keep left" in instruction or "keep right" in instruction:
            score += 1

        # very close sequential turns increase confusion
        if i < len(steps) - 1:

            next_distance = steps[i + 1]["distance"]

            if next_distance < 50:
                score += 2

    return score


# =========================================================
# CONVERT NUMERIC SCORE TO HUMAN LABEL
# =========================================================
def get_complexity_label(score):

    """
    Converts complexity score into readable category
    for frontend display.
    """

    if score <= 3:
        return "Low"

    if score <= 7:
        return "Medium"

    return "High"