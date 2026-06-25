/**
 * @file advanced_analysis.js
 * @brief Pure functions for advanced swimming analysis: splits, underwater, dolphin kicks, breathing.
 */

// 1. Split Time
export function getSplitBoundaries(raceDistanceM, poolLengthM) {
    if (!Number.isFinite(raceDistanceM) || !Number.isFinite(poolLengthM) || poolLengthM <= 0) return [];
    const splits = [];
    let start = 0;
    let end = poolLengthM;
    let i = 1;
    while (end <= raceDistanceM) {
        splits.push({ index: i, startDistance: start, endDistance: end });
        start = end;
        end += poolLengthM;
        i++;
    }
    if (start < raceDistanceM) {
        splits.push({ index: i, startDistance: start, endDistance: raceDistanceM });
    }
    return splits;
}

export function findBoundaryTime(events, boundaryDistanceM) {
    const exactMatch = events.find(e => 
        ["reaction", "turn", "finish"].includes(e.mode) && Math.abs(e.cumul - boundaryDistanceM) < 0.01
    );
    if (exactMatch) {
        return { time: exactMatch["Temps (s)"], source: "exact" };
    }
    
    const anchors = events.filter(e => ["reaction", "turn", "finish"].includes(e.mode)).sort((a, b) => a["Temps (s)"] - b["Temps (s)"]);
    const prev = anchors.filter(e => e.cumul <= boundaryDistanceM).pop();
    const next = anchors.find(e => e.cumul >= boundaryDistanceM);

    if (prev && next && next.cumul > prev.cumul) {
        const ratio = (boundaryDistanceM - prev.cumul) / (next.cumul - prev.cumul);
        const time = prev["Temps (s)"] + ratio * (next["Temps (s)"] - prev["Temps (s)"]);
        return { time: time, source: "interpolated" };
    }
    return { time: null, source: "missing" };
}

// 2. Race Summary & Average Speed
export function calculateRaceSummary(events, raceConfig) {
    const safeEvents = events.map(e => ({ ...e }));
    const reaction = safeEvents.find(e => e.mode === "reaction");
    const finish = safeEvents.find(e => e.mode === "finish");
    
    const warnings = [];
    if (!reaction) warnings.push("missing reaction");
    if (!finish) warnings.push("missing finish");

    let totalRaceTime = null;
    let averageSpeedMps = null;
    
    if (reaction && finish) {
        totalRaceTime = Math.max(0, finish["Temps (s)"] - reaction["Temps (s)"]);
        if (totalRaceTime > 0) {
            averageSpeedMps = raceConfig.raceDistanceM / totalRaceTime;
        } else {
            warnings.push("invalid race time");
        }
    }
    
    return {
        reactionTime: reaction ? reaction["Temps (s)"] : null,
        finishTime: finish ? finish["Temps (s)"] : null,
        totalRaceTime,
        averageSpeedMps,
        warnings
    };
}

// 3. Section Speed & Splits
export function calculateSplitAnalysis(events, raceConfig) {
    const safeEvents = events.map(e => ({ ...e }));
    const boundaries = getSplitBoundaries(raceConfig.raceDistanceM, raceConfig.poolLengthM);
    const splits = [];

    boundaries.forEach(b => {
        const startBound = findBoundaryTime(safeEvents, b.startDistance);
        const endBound = findBoundaryTime(safeEvents, b.endDistance);
        
        let splitTime = null;
        let splitSpeed = null;
        let warning = null;

        if (startBound.time !== null && endBound.time !== null) {
            splitTime = endBound.time - startBound.time;
            if (splitTime > 0) {
                splitSpeed = (b.endDistance - b.startDistance) / splitTime;
            } else {
                warning = "split time <= 0";
            }
        } else {
            warning = "split boundary cannot be estimated";
        }

        const cyclesInSplit = safeEvents.filter(e => e.mode === "cycle" && e.cumul > b.startDistance && e.cumul <= b.endDistance);
        const strokeCount = cyclesInSplit.length;
        
        const breathsInSplit = safeEvents.filter(e => e.mode === "breath" && e.cumul > b.startDistance && e.cumul <= b.endDistance);
        
        splits.push({
            index: b.index,
            startDistance: b.startDistance,
            endDistance: b.endDistance,
            startTime: startBound.time,
            endTime: endBound.time,
            splitTime,
            splitSpeed,
            strokeCount,
            breathCount: breathsInSplit.length,
            source: endBound.source,
            warning
        });
    });

    return splits;
}

// 5. Underwater Time/Distance
export function calculateUnderwaterPhases(events, raceConfig) {
    const safeEvents = events.map(e => ({ ...e }));
    const anchors = safeEvents.filter(e => ["reaction", "turn"].includes(e.mode)).sort((a, b) => a["Temps (s)"] - b["Temps (s)"]);
    const breakouts = safeEvents.filter(e => ["breakout", "end"].includes(e.mode)).sort((a, b) => a["Temps (s)"] - b["Temps (s)"]);
    
    const phases = [];
    
    anchors.forEach((anchor, i) => {
        const nextAnchorTime = (i + 1 < anchors.length) ? anchors[i+1]["Temps (s)"] : Infinity;
        const breakout = breakouts.find(b => b["Temps (s)"] >= anchor["Temps (s)"] && b["Temps (s)"] <= nextAnchorTime);
        
        let warning = null;
        let underwaterTime = null;
        let underwaterDistance = null;

        if (breakout) {
            underwaterTime = breakout["Temps (s)"] - anchor["Temps (s)"];
            underwaterDistance = breakout.cumul - anchor.cumul;
            if (underwaterTime <= 0) warning = "underwater time <= 0";
            if (underwaterDistance < 0) warning = "underwater distance < 0";
        } else {
            warning = "missing breakout after " + anchor.mode;
        }

        phases.push({
            phaseIndex: i + 1,
            startEvent: anchor.mode,
            startTime: anchor["Temps (s)"],
            startDistance: anchor.cumul,
            breakoutTime: breakout ? breakout["Temps (s)"] : null,
            breakoutDistance: breakout ? breakout.cumul : null,
            underwaterTime,
            underwaterDistance,
            warning
        });
    });

    return phases;
}

// 6. Breathing Rate
export function calculateBreathingAnalysis(events, raceConfig) {
    const safeEvents = events.map(e => ({ ...e })).sort((a, b) => a["Temps (s)"] - b["Temps (s)"]);
    const breaths = safeEvents.filter(e => e.mode === "breath");
    const cycles = safeEvents.filter(e => e.mode === "cycle");
    const summary = calculateRaceSummary(safeEvents, raceConfig);
    
    const warnings = [];
    
    breaths.forEach(b => {
        if (summary.reactionTime !== null && b["Temps (s)"] < summary.reactionTime) warnings.push("breath outside race time");
        if (summary.finishTime !== null && b["Temps (s)"] > summary.finishTime) warnings.push("breath outside race time");
    });

    let breathsPerMinute = null;
    if (summary.totalRaceTime > 0) {
        breathsPerMinute = (breaths.length / summary.totalRaceTime) * 60;
    }
    
    let cyclesPerBreath = null;
    if (breaths.length > 0) {
        cyclesPerBreath = cycles.length / breaths.length;
    }

    return {
        totalBreaths: breaths.length,
        breathsPerMinute,
        cyclesPerBreath,
        warnings: [...new Set(warnings)]
    };
}

// 7. Dolphin Kick Analysis
export function calculateDolphinKickAnalysis(events, underwaterPhases, raceConfig) {
    const safeEvents = events.map(e => ({ ...e })).sort((a, b) => a["Temps (s)"] - b["Temps (s)"]);
    const dolphins = safeEvents.filter(e => e.mode === "dolphin");
    const warnings = [];
    
    const phaseAnalysis = [];
    const kickAnalysis = [];

    for (let i = 1; i < dolphins.length; i++) {
        if (dolphins[i]["Temps (s)"] === dolphins[i-1]["Temps (s)"]) {
            warnings.push("duplicate dolphin kicks at the same time");
        }
    }

    underwaterPhases.forEach(phase => {
        let phaseDolphins = [];
        if (phase.breakoutTime !== null) {
            phaseDolphins = dolphins.filter(d => d["Temps (s)"] >= phase.startTime && d["Temps (s)"] <= phase.breakoutTime);
        } else {
            phaseDolphins = dolphins.filter(d => d["Temps (s)"] >= phase.startTime);
        }

        let totalDist = 0;
        let avgSpeed = null;
        let avgDistPerKick = null;

        phaseDolphins.forEach((d, i) => {
            let tempo = null;
            let distFromPrev = null;
            let speed = null;
            if (i > 0) {
                const prevD = phaseDolphins[i-1];
                tempo = d["Temps (s)"] - prevD["Temps (s)"];
                distFromPrev = d.cumul - prevD.cumul;
                if (tempo > 0) {
                    speed = distFromPrev / tempo;
                    if (speed < 0) warnings.push("negative dolphin speed");
                }
                totalDist += distFromPrev;
            }
            kickAnalysis.push({
                phaseIndex: phase.phaseIndex,
                kickIndex: i + 1,
                time: d["Temps (s)"],
                distance: d.cumul,
                tempo,
                distFromPrev,
                speed
            });
        });

        if (phaseDolphins.length > 1) {
            const timeDiff = phaseDolphins[phaseDolphins.length - 1]["Temps (s)"] - phaseDolphins[0]["Temps (s)"];
            if (timeDiff > 0) {
                avgSpeed = totalDist / timeDiff;
            }
            avgDistPerKick = totalDist / (phaseDolphins.length - 1);
        }

        phaseAnalysis.push({
            phaseIndex: phase.phaseIndex,
            dolphinKickCount: phaseDolphins.length,
            dolphinKickFrequencyPerMinute: phase.underwaterTime > 0 ? (phaseDolphins.length / phase.underwaterTime) * 60 : null,
            avgDistPerKick,
            avgUnderwaterSpeed: avgSpeed,
            warning: phase.warning
        });
    });

    dolphins.forEach(d => {
        const inPhase = underwaterPhases.some(p => p.breakoutTime !== null && d["Temps (s)"] >= p.startTime && d["Temps (s)"] <= p.breakoutTime);
        if (!inPhase) {
            warnings.push("dolphin outside underwater phase");
        }
    });

    return {
        phaseAnalysis,
        kickAnalysis,
        warnings: [...new Set(warnings)]
    };
}

export function calculateAdvancedAnalysis(events, raceConfig) {
    const safeEvents = events.map(e => ({ ...e }));
    const summary = calculateRaceSummary(safeEvents, raceConfig);
    const splits = calculateSplitAnalysis(safeEvents, raceConfig);
    const underwaterPhases = calculateUnderwaterPhases(safeEvents, raceConfig);
    const breathing = calculateBreathingAnalysis(safeEvents, raceConfig);
    const dolphin = calculateDolphinKickAnalysis(safeEvents, underwaterPhases, raceConfig);
    
    const cycleEvents = safeEvents.filter(e => e.mode === "cycle");
    const dolphinEvents = safeEvents.filter(e => e.mode === "dolphin");
    if (dolphinEvents.length > 0 && cycleEvents.some(c => dolphinEvents.some(d => c.frameId === d.frameId))) {
        dolphin.warnings.push("dolphin accidentally included in cycle metrics");
    }

    return {
        summary,
        splits,
        underwaterPhases,
        breathing,
        dolphin,
        strokeCount: cycleEvents.length
    };
}

// 8. Export CSV
export function exportAdvancedAnalysisCsv(analysis, swimmerName, lane) {
    let csvRows = [];
    const headers = ["metricType", "swimmerName", "lane", "phase_or_split_index", "kick_index", "start_time", "end_time", "start_distance", "end_distance", "value1", "value2", "value3", "warning"];
    csvRows.push(headers.join(","));

    function addRow(type, idx, kIdx, st, et, sd, ed, v1, v2, v3, warn) {
        const row = [
            type, swimmerName, lane, 
            idx !== null ? idx : "", 
            kIdx !== null ? kIdx : "", 
            st !== null && st !== undefined && !isNaN(st) ? Number(st).toFixed(3) : "", 
            et !== null && et !== undefined && !isNaN(et) ? Number(et).toFixed(3) : "", 
            sd !== null && sd !== undefined && !isNaN(sd) ? Number(sd).toFixed(2) : "", 
            ed !== null && ed !== undefined && !isNaN(ed) ? Number(ed).toFixed(2) : "", 
            v1 !== null && v1 !== undefined && !isNaN(v1) ? Number(v1).toFixed(3) : "", 
            v2 !== null && v2 !== undefined && !isNaN(v2) ? Number(v2).toFixed(3) : "", 
            v3 !== null && v3 !== undefined && !isNaN(v3) ? Number(v3).toFixed(3) : "", 
            warn || ""
        ];
        csvRows.push(row.map(r => '"' + r + '"').join(","));
    }

    addRow("race_summary", null, null, analysis.summary.reactionTime, analysis.summary.finishTime, 0, null, analysis.summary.totalRaceTime, analysis.summary.averageSpeedMps, analysis.strokeCount, analysis.summary.warnings.join("; "));

    analysis.splits.forEach(s => {
        addRow("split", s.index, null, s.startTime, s.endTime, s.startDistance, s.endDistance, s.splitTime, s.splitSpeed, s.strokeCount, s.warning);
    });

    analysis.underwaterPhases.forEach(u => {
        addRow("underwater", u.phaseIndex, null, u.startTime, u.breakoutTime, u.startDistance, u.breakoutDistance, u.underwaterTime, u.underwaterDistance, null, u.warning);
    });

    analysis.dolphin.phaseAnalysis.forEach(p => {
        addRow("dolphin_phase", p.phaseIndex, null, null, null, null, null, p.dolphinKickCount, p.dolphinKickFrequencyPerMinute, p.avgUnderwaterSpeed, p.warning);
    });
    analysis.dolphin.kickAnalysis.forEach(k => {
        addRow("dolphin_kick", k.phaseIndex, k.kickIndex, k.time, null, k.distance, null, k.tempo, k.distFromPrev, k.speed, null);
    });

    addRow("breathing", null, null, null, null, null, null, analysis.breathing.totalBreaths, analysis.breathing.breathsPerMinute, analysis.breathing.cyclesPerBreath, analysis.breathing.warnings.join("; "));

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "advanced_analysis_lane" + lane + ".csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function fN(num, decimals = 2) {
    if (num === null || num === undefined || isNaN(num)) return "-";
    return Number(num).toFixed(decimals);
}

export function renderAdvancedAnalysis(analysis, container) {
    container.innerHTML = "";

    const formatWarnings = (warns) => {
        if (!warns) return "";
        let wArray = Array.isArray(warns) ? warns : [warns];
        wArray = wArray.filter(w => w);
        if (wArray.length === 0) return "";
        return wArray.map(w => '<span class="advanced-badge advanced-badge-warning">' + w + '</span>').join(" ");
    };

    let html = '<div class="advanced-dashboard">';

    html += `
        <div class="advanced-card">
            <h3>Race Summary</h3>
            <div class="advanced-stats-grid">
                <div class="stat-box"><span>Total Time</span><strong>${fN(analysis.summary.totalRaceTime)}s</strong></div>
                <div class="stat-box"><span>Avg Speed</span><strong>${fN(analysis.summary.averageSpeedMps)} m/s</strong></div>
                <div class="stat-box"><span>Total Strokes</span><strong>${analysis.strokeCount}</strong></div>
            </div>
            ${formatWarnings(analysis.summary.warnings)}
        </div>
    `;

    html += `
        <div class="advanced-card advanced-section">
            <h3>Split Analysis</h3>
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Split</th>
                        <th>Range (m)</th>
                        <th>Time (s)</th>
                        <th>Speed (m/s)</th>
                        <th>Strokes</th>
                        <th>Breaths</th>
                        <th>Warning</th>
                    </tr>
                </thead>
                <tbody>
                    ${analysis.splits.map(s => `
                        <tr>
                            <td>${s.index}</td>
                            <td>${s.startDistance} - ${s.endDistance}</td>
                            <td>${fN(s.splitTime)}</td>
                            <td>${fN(s.splitSpeed)}</td>
                            <td>${s.strokeCount}</td>
                            <td>${s.breathCount}</td>
                            <td>${formatWarnings(s.warning)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;

    html += `
        <div class="advanced-card advanced-section">
            <h3>Underwater Phases</h3>
            ${analysis.underwaterPhases.length === 0 ? '<p class="advanced-empty">No underwater phases found.</p>' : `
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Phase</th>
                        <th>Start Event</th>
                        <th>Time (s)</th>
                        <th>Distance (m)</th>
                        <th>Warning</th>
                    </tr>
                </thead>
                <tbody>
                    ${analysis.underwaterPhases.map(u => `
                        <tr>
                            <td>${u.phaseIndex}</td>
                            <td>${u.startEvent}</td>
                            <td>${fN(u.underwaterTime)}</td>
                            <td>${fN(u.underwaterDistance)}</td>
                            <td>${formatWarnings(u.warning)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
            `}
        </div>
    `;

    html += `
        <div class="advanced-card advanced-section">
            <h3>Dolphin Kicks</h3>
            ${formatWarnings(analysis.dolphin.warnings)}
            ${analysis.dolphin.phaseAnalysis.length === 0 ? '<p class="advanced-empty">No dolphin kicks found.</p>' : `
            <table class="advanced-table">
                <thead>
                    <tr>
                        <th>Phase</th>
                        <th>Kicks</th>
                        <th>Freq (kicks/min)</th>
                        <th>Avg Dist/Kick (m)</th>
                        <th>Avg Speed (m/s)</th>
                    </tr>
                </thead>
                <tbody>
                    ${analysis.dolphin.phaseAnalysis.map(p => `
                        <tr>
                            <td>${p.phaseIndex}</td>
                            <td>${p.dolphinKickCount}</td>
                            <td>${fN(p.dolphinKickFrequencyPerMinute)}</td>
                            <td>${fN(p.avgDistPerKick)}</td>
                            <td>${fN(p.avgUnderwaterSpeed)}</td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
            `}
        </div>
    `;

    if (analysis.dolphin.kickAnalysis.length > 0) {
        html += `
            <div class="advanced-card advanced-section">
                <details>
                    <summary>Dolphin Kick Details</summary>
                    <table class="advanced-table mt-2">
                        <thead>
                            <tr>
                                <th>Phase</th>
                                <th>Kick #</th>
                                <th>Time (s)</th>
                                <th>Dist (m)</th>
                                <th>Tempo (s)</th>
                                <th>Speed (m/s)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${analysis.dolphin.kickAnalysis.map(k => `
                                <tr>
                                    <td>${k.phaseIndex}</td>
                                    <td>${k.kickIndex}</td>
                                    <td>${fN(k.time)}</td>
                                    <td>${fN(k.distance)}</td>
                                    <td>${fN(k.tempo)}</td>
                                    <td>${fN(k.speed)}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </details>
            </div>
        `;
    }

    html += `
        <div class="advanced-card advanced-section">
            <h3>Breathing</h3>
            ${formatWarnings(analysis.breathing.warnings)}
            ${analysis.breathing.totalBreaths === 0 ? '<p class="advanced-empty">No breath events annotated.</p>' : `
            <div class="advanced-stats-grid">
                <div class="stat-box"><span>Total Breaths</span><strong>${analysis.breathing.totalBreaths}</strong></div>
                <div class="stat-box"><span>Breaths / Min</span><strong>${fN(analysis.breathing.breathsPerMinute)}</strong></div>
                <div class="stat-box"><span>Cycles / Breath</span><strong>${fN(analysis.breathing.cyclesPerBreath)}</strong></div>
            </div>
            `}
        </div>
    `;

    html += '</div>';
    container.innerHTML = html;
}
