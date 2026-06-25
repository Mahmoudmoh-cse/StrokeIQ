export const STANDARD_RACE_DISTANCES = [25, 50, 100, 200, 400, 800, 1500];
export const STANDARD_POOL_LENGTHS = [25, 50];
export const DEFAULT_NUMBER_OF_SWIMMERS = 1;
export const MAX_NUMBER_OF_SWIMMERS = 8;

export function normalizeEventMode(mode) {
    if (mode === "end") return "breakout";
    if (mode === "respi") return "breath";
    if (mode === "respi_gauche" || mode === "respi_droite") return "breath";
    if (mode === "cycle_gauche" || mode === "cycle_droite") return "cycle";
    return mode;
}

export function normalizeNumberOfSwimmers(value, fallback = DEFAULT_NUMBER_OF_SWIMMERS) {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.max(1, Math.min(MAX_NUMBER_OF_SWIMMERS, Math.floor(safe)));
}

export function isValidSwimmerId(swimmerId, numberOfSwimmers) {
    const id = Number(swimmerId);
    return Number.isInteger(id) && id >= 0 && id < normalizeNumberOfSwimmers(numberOfSwimmers);
}

export function cleanupExtraSwimmers(events, numberOfSwimmers) {
    const count = normalizeNumberOfSwimmers(numberOfSwimmers);
    return (events || []).filter((event) => {
        const swimmerId = Number(event.swimmerId ?? event.swimmer);
        return Number.isInteger(swimmerId) && swimmerId >= 0 && swimmerId < count;
    });
}

export function validateSwimmerCountEvents(events, numberOfSwimmers) {
    const count = normalizeNumberOfSwimmers(numberOfSwimmers);
    const warnings = [];
    const outOfRange = (events || []).filter(event => !isValidSwimmerId(event.swimmerId ?? event.swimmer, count));
    if (outOfRange.length > 0) {
        warnings.push("CSV contains swimmer rows outside configured swimmer count.");
    }
    const swimmerIds = new Set((events || [])
        .map(event => Number(event.swimmerId ?? event.swimmer))
        .filter(Number.isInteger));
    if (count === 1 && [...swimmerIds].some(id => id > 0)) {
        warnings.push("multiple swimmers found when numberOfSwimmers = 1.");
    }
    return warnings;
}

export function getExpectedTurns(raceDistanceM, poolLengthM) {
    const raceDistance = Number(raceDistanceM);
    const poolLength = Number(poolLengthM);
    if (!Number.isFinite(raceDistance) || !Number.isFinite(poolLength) || raceDistance <= 0 || poolLength <= 0) {
        return 0;
    }
    return Math.max(0, Math.floor(raceDistance / poolLength) - 1);
}

export function getExpectedTurnDistances(raceDistanceM, poolLengthM) {
    const raceDistance = Number(raceDistanceM);
    const poolLength = Number(poolLengthM);
    if (!Number.isFinite(raceDistance) || !Number.isFinite(poolLength) || raceDistance <= 0 || poolLength <= 0) {
        return [];
    }
    const distances = [];
    for (let distance = poolLength; distance < raceDistance; distance += poolLength) {
        distances.push(distance);
    }
    return distances;
}

export function getNextTurnDistance(existingTurns, raceDistanceM, poolLengthM) {
    const expected = getExpectedTurnDistances(raceDistanceM, poolLengthM);
    const usedDistances = Array.isArray(existingTurns)
        ? existingTurns.map(turn => Number(typeof turn === "object" ? turn.cumul : turn))
        : [];
    return expected.find(distance => !usedDistances.some(used => Math.abs(used - distance) < 0.01)) ?? null;
}

export function validateRaceConfig(raceDistanceM, poolLengthM) {
    const raceDistance = Number(raceDistanceM);
    const poolLength = Number(poolLengthM);
    const warnings = [];
    if (!Number.isFinite(raceDistance) || raceDistance <= 0) warnings.push("raceDistanceM must be positive.");
    if (!Number.isFinite(poolLength) || poolLength <= 0) warnings.push("poolLengthM must be positive.");
    if (Number.isFinite(raceDistance) && Number.isFinite(poolLength) && raceDistance < poolLength) {
        warnings.push("raceDistanceM must be greater than or equal to poolLengthM.");
    }
    if (Number.isFinite(raceDistance) && Number.isFinite(poolLength) && poolLength > 0 && raceDistance % poolLength !== 0) {
        warnings.push("raceDistanceM is not divisible by poolLengthM. Use manual distance mode.");
    }
    return warnings;
}

export function validateAnnotationDistances(events, raceDistanceM, poolLengthM) {
    const warnings = [...validateRaceConfig(raceDistanceM, poolLengthM)];
    const chronological = (events || []).slice().sort((a, b) => Number(a.frameId) - Number(b.frameId));
    const normalizedEvents = chronological.map(event => ({ ...event, normalizedMode: normalizeEventMode(event.mode) }));
    const expectedTurnDistances = getExpectedTurnDistances(raceDistanceM, poolLengthM);
    const knownModes = new Set(["reaction", "enter", "breakout", "cycle", "section", "turn", "finish", "breath", "dolphin"]);

    if (!normalizedEvents.some(event => event.normalizedMode === "reaction")) warnings.push("reaction missing.");
    if (!normalizedEvents.some(event => event.normalizedMode === "finish")) warnings.push("finish missing.");

    const finish = normalizedEvents.find(event => event.normalizedMode === "finish");
    if (finish && Math.abs(Number(finish.cumul) - Number(raceDistanceM)) > 0.01) {
        warnings.push(`finish distance must equal ${raceDistanceM}m.`);
    }

    const turns = normalizedEvents.filter(event => event.normalizedMode === "turn");
    if (turns.length !== expectedTurnDistances.length) {
        warnings.push(`number of turns should be ${expectedTurnDistances.length}.`);
    }
    turns.forEach((turn, index) => {
        if (expectedTurnDistances[index] !== undefined && Math.abs(Number(turn.cumul) - expectedTurnDistances[index]) > 0.01) {
            warnings.push(`turn ${index + 1} should be at ${expectedTurnDistances[index]}m.`);
        }
    });

    let previousDistance = -Infinity;
    let seenRaceStart = false;
    let seenFinish = false;
    for (const event of normalizedEvents) {
        if (!knownModes.has(event.normalizedMode)) warnings.push(`unknown event type "${event.mode}".`);
        if (Number(event.frameId) < 0) warnings.push("negative raceTime.");
        if (event.normalizedMode === "reaction") seenRaceStart = true;
        if (event.normalizedMode === "finish") seenFinish = true;
        if (event.normalizedMode === "cycle" && !seenRaceStart) warnings.push("cycle before reaction.");
        if (event.normalizedMode === "cycle" && seenFinish) warnings.push("cycle after finish.");
        if (event.normalizedMode === "breakout") {
            const previousAnchor = normalizedEvents
                .filter(anchor => Number(anchor.frameId) < Number(event.frameId))
                .reverse()
                .find(anchor => anchor.normalizedMode === "reaction" || anchor.normalizedMode === "turn");
            if (!previousAnchor) warnings.push("breakout/end without previous reaction or turn.");
        }
        if (!["breath", "breakout", "section", "dolphin"].includes(event.normalizedMode)) {
            const distance = Number(event.cumul);
            if (Number.isFinite(distance) && distance < previousDistance - 0.01) warnings.push("distance decreases over time.");
            if (Number.isFinite(distance)) previousDistance = Math.max(previousDistance, distance);
        }
    }
    return [...new Set(warnings)];
}

export function interpolateDistanceFromAnchors(event, events, raceDistanceM) {
    const frameId = Number(event.frameId);
    const anchors = (events || [])
        .filter(anchor => ["reaction", "turn", "finish"].includes(normalizeEventMode(anchor.mode)))
        .map(anchor => ({ frameId: Number(anchor.frameId), cumul: Number(anchor.cumul) }))
        .filter(anchor => Number.isFinite(anchor.frameId) && Number.isFinite(anchor.cumul))
        .sort((a, b) => a.frameId - b.frameId);
    const previous = anchors.filter(anchor => anchor.frameId <= frameId).pop();
    const next = anchors.find(anchor => anchor.frameId >= frameId && (!previous || anchor.frameId !== previous.frameId));
    if (!previous && !next) return Number(event.cumul) || 0;
    if (!previous) return Math.max(0, Math.min(Number(raceDistanceM), next.cumul));
    if (!next) return Math.max(0, Math.min(Number(raceDistanceM), Number(event.cumul) || previous.cumul));
    const ratio = (frameId - previous.frameId) / Math.max(1, next.frameId - previous.frameId);
    return previous.cumul + ratio * (next.cumul - previous.cumul);
}

function readNumber(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
    }
    return 0;
}

function getRaceTime(event, raceStartVideoTime, frameRate = 1) {
    const videoTime = Number(event["TempsVideo (s)"] ?? event.TempsVideo);
    if (Number.isFinite(videoTime) && Number.isFinite(Number(raceStartVideoTime))) {
        return Math.max(0, videoTime - Number(raceStartVideoTime));
    }
    const raceTime = Number(event["Temps (s)"] ?? event.Temps);
    if (Number.isFinite(raceTime)) return Math.max(0, raceTime);
    return Math.max(0, readNumber(event.frameId, event.frame_number) / frameRate);
}

function writeDerivedMetric(event, metric = {}) {
    event["tempo (s)"] = metric.tempoRow ?? "";
    event["frequence (cylce/min)"] = metric.frequenceRow ?? "";
    event["amplitude (m)"] = metric.amplitudeRow ?? "";
    event["vitesse (m/s)"] = metric.vitesseRow ?? "";
}

function readDistanceMeters(event) {
    const csvDistance = event?.["distance (m)"];
    if (csvDistance !== "" && csvDistance !== undefined && csvDistance !== null && Number.isFinite(Number(csvDistance))) {
        return Number(csvDistance);
    }
    return readNumber(event?.cumul);
}

function readRaceTimeSeconds(event, frameRate = 1) {
    const raceTime = Number(event?.["Temps (s)"] ?? event?.Temps);
    if ((event?.["Temps (s)"] ?? event?.Temps) !== "" && Number.isFinite(raceTime)) return raceTime;
    return readNumber(event?.frameId, event?.frame_number) / frameRate;
}

export function hasValidCalibration(calibration) {
    if (!calibration || typeof calibration !== "object") return false;
    if (Array.isArray(calibration.points)) return calibration.points.length >= 4;
    if (Array.isArray(calibration.imagePoints) && Array.isArray(calibration.poolPoints)) {
        return calibration.imagePoints.length >= 4 && calibration.poolPoints.length >= 4;
    }
    if (Array.isArray(calibration.homography) && calibration.homography.length >= 9) return true;
    return false;
}

export function normalizeAnnotations(events, raceConfig = {}) {
    const warnings = [];
    const raceDistanceM = Number(raceConfig.raceDistanceM);
    const poolLengthM = Number(raceConfig.poolLengthM);
    const frameRate = Number(raceConfig.frameRate) || 1;
    const numberOfSwimmers = normalizeNumberOfSwimmers(raceConfig.numberOfSwimmers);
    const distanceMode = raceConfig.distanceMode || "interpolated";
    const effectiveDistanceMode = distanceMode === "calibrated" && !hasValidCalibration(raceConfig.distanceCalibration)
        ? "interpolated"
        : distanceMode;
    const expectedTurnDistances = getExpectedTurnDistances(raceDistanceM, poolLengthM);
    const filtered = cleanupExtraSwimmers(events || [], numberOfSwimmers);
    const debugRows = [];

    console.info("[Aquanote normalize] config", {
        distanceMode: effectiveDistanceMode,
        requestedDistanceMode: distanceMode,
        raceDistanceM,
        poolLengthM,
        numberOfSwimmers,
        expectedTurnDistances,
    });

    validateSwimmerCountEvents(events || [], numberOfSwimmers).forEach(warning => warnings.push(warning));
    validateRaceConfig(raceDistanceM, poolLengthM).forEach(warning => warnings.push(warning));
    if (distanceMode === "calibrated" && effectiveDistanceMode === "interpolated") {
        warnings.push("Calibrated mode requires valid calibration. Falling back to interpolated mode.");
    }

    const reactionWithVideoTime = filtered
        .map(event => Number(event["TempsVideo (s)"] ?? event.TempsVideo))
        .find((videoTime, index) => Number.isFinite(videoTime) && normalizeEventMode(filtered[index].mode ?? filtered[index].event) === "reaction");
    const raceStartVideoTime = Number.isFinite(Number(raceConfig.raceStartVideoTime))
        ? Number(raceConfig.raceStartVideoTime)
        : (Number.isFinite(reactionWithVideoTime) ? reactionWithVideoTime : 0);
    if (!Number.isFinite(Number(raceConfig.raceStartVideoTime)) && !Number.isFinite(reactionWithVideoTime)) {
        warnings.push("missing raceStartVideoTime.");
    }

    const grouped = new Map();
    for (const original of filtered) {
        const swimmerId = Number(original.swimmerId ?? original.swimmer);
        const event = { ...original };
        event.swimmerId = swimmerId;
        event.swimmer = swimmerId;
        event.mode = normalizeEventMode(event.mode ?? event.event);
        event.event = event.mode;
        if (original.mode === "end" || original.event === "end") warnings.push("legacy end detected and mapped to breakout.");
        const raceTime = getRaceTime(event, raceStartVideoTime, frameRate);
        event["Temps (s)"] = raceTime;
        event["TempsVideo (s)"] = raceStartVideoTime + raceTime;
        event.frameId = Math.round(raceTime * frameRate);
        event.frame_number = event.frameId;
        if (!grouped.has(swimmerId)) grouped.set(swimmerId, []);
        grouped.get(swimmerId).push(event);
    }

    const normalized = [];
    for (const [swimmerId, swimmerEvents] of grouped.entries()) {
        swimmerEvents.sort((a, b) => Number(a["Temps (s)"]) - Number(b["Temps (s)"]));
        const reactions = swimmerEvents.filter(event => event.mode === "reaction");
        const turns = swimmerEvents.filter(event => event.mode === "turn");
        const finishes = swimmerEvents.filter(event => event.mode === "finish");
        if (reactions.length === 0) warnings.push(`Swimmer ${swimmerId + 1}: missing reaction.`);
        if (finishes.length === 0) warnings.push(`Swimmer ${swimmerId + 1}: missing finish.`);
        if (turns.length !== expectedTurnDistances.length) {
            warnings.push(`Swimmer ${swimmerId + 1}: number of turns does not match expectedTurns (${expectedTurnDistances.length}).`);
        }

        const reaction = reactions[0];
        if (reaction) {
            reaction["Temps (s)"] = 0;
            reaction.frameId = 0;
            reaction.frame_number = 0;
            reaction.cumul = 0;
            reaction["distance (m)"] = 0;
        }

        turns.forEach((turn, index) => {
            const fallbackTurnDistance = Math.min((index + 1) * poolLengthM, raceDistanceM);
            const snappedTurnDistance = expectedTurnDistances[index] ?? fallbackTurnDistance;
            if (expectedTurnDistances[index] === undefined) {
                warnings.push(`Swimmer ${swimmerId + 1}: extra turn at ${turn["Temps (s)"]}s; using ${snappedTurnDistance}m as interpolation anchor.`);
            }
            turn.invalid = snappedTurnDistance >= raceDistanceM;
            turn.cumul = snappedTurnDistance;
            turn["distance (m)"] = snappedTurnDistance;
        });

        finishes.forEach((finish, index) => {
            finish.cumul = raceDistanceM;
            finish["distance (m)"] = raceDistanceM;
            if (index > 0) warnings.push(`Swimmer ${swimmerId + 1}: duplicate finish at ${finish["Temps (s)"]}s.`);
        });

        const anchors = swimmerEvents
            .filter(event => ["reaction", "turn", "finish"].includes(event.mode) && !event.invalid)
            .sort((a, b) => Number(a["Temps (s)"]) - Number(b["Temps (s)"]));
        console.info(`[Aquanote normalize] swimmer ${swimmerId + 1} anchors`, anchors.map(anchor => ({
            mode: anchor.mode,
            raceTime: anchor["Temps (s)"],
            distance: anchor.cumul,
        })));
        if (effectiveDistanceMode === "interpolated" && (anchors.length < 2 || !reaction || finishes.length === 0)) {
            warnings.push(`Swimmer ${swimmerId + 1}: interpolation cannot run because anchors are missing.`);
        }

        for (const event of swimmerEvents) {
            if (["reaction", "turn", "finish"].includes(event.mode)) continue;
            const beforeDistance = Number(event.cumul ?? event["distance (m)"]);
            if (effectiveDistanceMode === "interpolated" && anchors.length >= 2) {
                const previous = anchors.filter(anchor => Number(anchor["Temps (s)"]) <= Number(event["Temps (s)"])).pop();
                const next = anchors.find(anchor => Number(anchor["Temps (s)"]) >= Number(event["Temps (s)"]) && anchor !== previous);
                if (previous && next) {
                    const denominator = Math.max(0.000001, Number(next["Temps (s)"]) - Number(previous["Temps (s)"]));
                    const ratio = (Number(event["Temps (s)"]) - Number(previous["Temps (s)"])) / denominator;
                    event.cumul = Number(previous.cumul) + ratio * (Number(next.cumul) - Number(previous.cumul));
                    event.distanceSource = "interpolated";
                } else if (previous) {
                    event.cumul = Math.min(raceDistanceM, Math.max(Number(previous.cumul), readNumber(event.cumul, event["distance (m)"])));
                    event.distanceSource = "interpolated-after-last-anchor";
                    warnings.push(`Swimmer ${swimmerId + 1}: ${event.mode} at ${event["Temps (s)"]}s is outside anchor range.`);
                } else if (next) {
                    event.cumul = Math.max(0, Math.min(Number(next.cumul), readNumber(event.cumul, event["distance (m)"])));
                    event.distanceSource = "interpolated-before-first-anchor";
                    warnings.push(`Swimmer ${swimmerId + 1}: ${event.mode} at ${event["Temps (s)"]}s is before first anchor.`);
                }
            } else {
                event.cumul = Math.max(0, Math.min(raceDistanceM, readNumber(event.cumul, event["distance (m)"])));
            }
            event["distance (m)"] = event.cumul;
            debugRows.push({
                swimmerId,
                mode: event.mode,
                raceTime: Number(event["Temps (s)"]).toFixed(2),
                before: Number.isFinite(beforeDistance) ? beforeDistance.toFixed(2) : "",
                after: Number(event.cumul).toFixed(2),
                source: event.distanceSource || effectiveDistanceMode,
            });
        }

        let previousDistance = -Infinity;
        for (const event of swimmerEvents) {
            if (Number(event.cumul) < previousDistance - 0.01) {
                warnings.push(`Swimmer ${swimmerId + 1}: distance decreases at ${event.mode} ${event["Temps (s)"]}s.`);
            }
            previousDistance = Math.max(previousDistance, Number(event.cumul));
        }

        const metrics = recalculateCycleMetrics(swimmerEvents, frameRate);
        const cycles = swimmerEvents.filter(event => event.mode === "cycle").sort((a, b) => Number(a["Temps (s)"]) - Number(b["Temps (s)"]));
        for (let index = 1; index < cycles.length; index++) {
            const previous = cycles[index - 1];
            const current = cycles[index];
            if (Math.abs(Number(current.cumul) - Number(previous.cumul)) < 0.01) {
                warnings.push(`Swimmer ${swimmerId + 1}: duplicate or repeated cycle distance at ${current["Temps (s)"]}s.`);
            }
            if (Number(current["Temps (s)"]) - Number(previous["Temps (s)"]) <= 0) {
                warnings.push(`Swimmer ${swimmerId + 1}: tempo <= 0 at cycle ${current["Temps (s)"]}s.`);
            }
        }
        for (const event of swimmerEvents) writeDerivedMetric(event, metrics.get(event));
        normalized.push(...swimmerEvents);
    }

    validateAnnotationDistances(normalized, raceDistanceM, poolLengthM).forEach(warning => warnings.push(warning));
    if (debugRows.length > 0) {
        console.table(debugRows);
    }
    return {
        events: normalized.sort((a, b) => Number(a.swimmerId) - Number(b.swimmerId) || Number(a["Temps (s)"]) - Number(b["Temps (s)"])),
        warnings: [...new Set(warnings)],
        raceStartVideoTime,
    };
}

export function recalculateCycleMetrics(events, frameRate = 1) {
    const metrics = new Map();
    const grouped = new Map();
    for (const event of events || []) {
        const swimmerId = Number(event?.swimmerId ?? event?.swimmer ?? 0);
        if (!grouped.has(swimmerId)) grouped.set(swimmerId, []);
        writeDerivedMetric(event);
        if (normalizeEventMode(event?.mode ?? event?.event) === "cycle") {
            grouped.get(swimmerId).push(event);
        }
    }

    for (const cycles of grouped.values()) {
        cycles.sort((a, b) => readRaceTimeSeconds(a, frameRate) - readRaceTimeSeconds(b, frameRate));
        if (cycles.length > 0) {
            metrics.set(cycles[0], { tempoRow: "", frequenceRow: "", amplitudeRow: "", vitesseRow: "" });
        }
    for (let index = 1; index < cycles.length; index++) {
        const previous = cycles[index - 1];
        const current = cycles[index];
            const currentTime = readRaceTimeSeconds(current, frameRate);
            const previousTime = readRaceTimeSeconds(previous, frameRate);
        const tempo = currentTime - previousTime;
            const distanceDiff = readDistanceMeters(current) - readDistanceMeters(previous);
            if (tempo <= 0 || distanceDiff < 0) {
            metrics.set(current, { tempoRow: "", frequenceRow: "", amplitudeRow: "", vitesseRow: "" });
                writeDerivedMetric(current, metrics.get(current));
            continue;
        }
        metrics.set(current, {
            tempoRow: tempo.toFixed(2),
            frequenceRow: (60 / tempo).toFixed(2),
            amplitudeRow: distanceDiff.toFixed(2),
            vitesseRow: (distanceDiff / tempo).toFixed(2),
        });
            writeDerivedMetric(current, metrics.get(current));
        }
    }
    return metrics;
}

export function recalculateAnalysisMetrics(events, frameRate = 1) {
    return recalculateCycleMetrics(events, frameRate);
}
