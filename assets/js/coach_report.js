/**
 * @file coach_report.js
 * @brief Coach-facing report layer built from existing advanced analysis outputs.
 */

import { normalizeEventMode } from "./race_distance.js";

const SCORE_LABELS = [
    { min: 85, label: "Excellent", className: "score-excellent" },
    { min: 70, label: "Good", className: "score-good" },
    { min: 50, label: "Needs Work", className: "score-needs-work" },
    { min: 0, label: "Weak / Incomplete", className: "score-weak" },
];

function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
    const number = finite(value);
    if (number === null) return min;
    return Math.max(min, Math.min(max, number));
}

function average(values) {
    const safeValues = values.map(finite).filter(value => value !== null);
    if (safeValues.length === 0) return null;
    return safeValues.reduce((sum, value) => sum + value, 0) / safeValues.length;
}

function stdev(values) {
    const safeValues = values.map(finite).filter(value => value !== null);
    if (safeValues.length < 2) return null;
    const avg = average(safeValues);
    return Math.sqrt(average(safeValues.map(value => (value - avg) ** 2)));
}

function fmt(value, decimals = 2) {
    const number = finite(value);
    return number === null ? "Not available" : number.toFixed(decimals);
}

function text(value) {
    const stringValue = String(value ?? "").trim();
    return stringValue || "Not available";
}

function escapeHtml(value) {
    return String(value ?? "Not available")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function scoreBand(score) {
    const safeScore = clamp(score);
    return SCORE_LABELS.find(band => safeScore >= band.min) || SCORE_LABELS[SCORE_LABELS.length - 1];
}

function modeOf(event) {
    return normalizeEventMode(event?.mode ?? event?.event ?? event?.eventId);
}

function raceEvents(events) {
    return (events || []).map(event => ({ ...event }));
}

function eventTime(event) {
    return finite(event?.["Temps (s)"] ?? event?.Temps ?? event?.frameId ?? event?.frame_number);
}

function eventDistance(event) {
    return finite(event?.["distance (m)"] ?? event?.distance ?? event?.cumul);
}

function hasNaNLike(value) {
    if (value === undefined) return true;
    if (typeof value === "number") return !Number.isFinite(value);
    if (typeof value === "string") return value === "NaN" || value === "undefined";
    if (Array.isArray(value)) return value.some(hasNaNLike);
    if (value && typeof value === "object") return Object.values(value).some(hasNaNLike);
    return false;
}

function isDistanceMonotonic(events) {
    let previous = -Infinity;
    for (const event of [...events].sort((a, b) => (eventTime(a) ?? 0) - (eventTime(b) ?? 0))) {
        const distance = eventDistance(event);
        if (distance === null) continue;
        if (distance < previous - 0.01) return false;
        previous = Math.max(previous, distance);
    }
    return true;
}

function splitConsistencyScore(splits) {
    const speeds = (splits || []).map(split => split.splitSpeed).filter(value => finite(value) !== null);
    if (speeds.length <= 1) return 75;
    const avg = average(speeds);
    const variation = stdev(speeds);
    if (!avg || variation === null) return 65;
    return clamp(100 - (variation / avg) * 180);
}

function scoreUnderwater(analysis, raceConfig) {
    const distances = analysis.underwaterPhases.map(phase => phase.underwaterDistance).filter(value => finite(value) !== null);
    const speeds = analysis.dolphin.phaseAnalysis.map(phase => phase.avgUnderwaterSpeed).filter(value => finite(value) !== null);
    const distance = average(distances);
    const speed = average(speeds);
    if (distance === null) return 35;
    let distanceScore = 35;
    if (distance >= 7 && distance <= 12) distanceScore = 90;
    else if (distance >= 4 && distance < 7) distanceScore = 68;
    else if (distance < 4) distanceScore = 42;
    else if (distance > 15) distanceScore = 62;
    else distanceScore = 78;

    const speedScore = speed === null ? 65 : clamp((speed / Math.max(1, analysis.summary.averageSpeedMps || 1)) * 75, 35, 95);
    return clamp(distanceScore * 0.7 + speedScore * 0.3);
}

function scoreStrokeEfficiency(events) {
    const cycles = events.filter(event => modeOf(event) === "cycle");
    const amplitudes = cycles.map(event => finite(event["amplitude (m)"])).filter(value => value !== null && value > 0);
    const frequencies = cycles.map(event => finite(event["frequence (cylce/min)"])).filter(value => value !== null && value > 0);
    const avgAmplitude = average(amplitudes);
    const freqVariation = stdev(frequencies);
    if (avgAmplitude === null) return 45;
    const amplitudeScore = clamp((avgAmplitude / 3.5) * 85, 35, 95);
    const consistencyScore = freqVariation === null ? 75 : clamp(100 - freqVariation * 2, 35, 95);
    return clamp(amplitudeScore * 0.75 + consistencyScore * 0.25);
}

function scoreBreathing(analysis) {
    const breaths = analysis.breathing.totalBreaths;
    const bpm = finite(analysis.breathing.breathsPerMinute);
    const cyclesPerBreath = finite(analysis.breathing.cyclesPerBreath);
    if (!breaths) return 65;
    const bpmScore = bpm === null ? 60 : clamp(100 - Math.max(0, bpm - 18) * 3, 35, 95);
    const rhythmScore = cyclesPerBreath === null ? 60 : clamp(cyclesPerBreath * 35, 35, 95);
    return clamp(bpmScore * 0.65 + rhythmScore * 0.35);
}

function scoreSpeed(analysis) {
    const avgSpeed = finite(analysis.summary.averageSpeedMps);
    if (avgSpeed === null) return 45;
    const base = clamp((avgSpeed / 1.6) * 78, 35, 95);
    return clamp(base * 0.65 + splitConsistencyScore(analysis.splits) * 0.35);
}

function validationItem(label, status, detail = "") {
    return { label, status, detail };
}

export function generateValidationChecklist(analysis, events, raceConfig = {}) {
    const safeEvents = raceEvents(events);
    const modes = safeEvents.map(modeOf);
    const reaction = modes.includes("reaction");
    const finish = modes.includes("finish");
    const breakout = modes.includes("breakout");
    const monotonic = isDistanceMonotonic(safeEvents);
    const dolphins = safeEvents.filter(event => modeOf(event) === "dolphin");
    const invalidCycleMetric = safeEvents.some(event => modeOf(event) === "cycle" && ["tempo (s)", "amplitude (m)", "vitesse (m/s)"].some(key => {
        const value = event[key];
        return value !== "" && value !== undefined && !Number.isFinite(Number(value));
    }));
    const breaths = safeEvents.filter(event => modeOf(event) === "breath");
    const invalidBreaths = breaths.some(event => eventTime(event) === null || eventDistance(event) === null);
    const noNan = !hasNaNLike({ analysis, raceConfig });
    const dolphinWarning = (analysis.dolphin.warnings || []).some(warning => String(warning).includes("outside underwater"));

    return [
        validationItem("Reaction exists", reaction ? "pass" : "fail"),
        validationItem("Finish exists", finish ? "pass" : "fail"),
        validationItem("Breakout exists", breakout ? "pass" : "warning"),
        validationItem("Distance monotonic", monotonic ? "pass" : "fail"),
        validationItem("Dolphin kicks before breakout", dolphins.length === 0 ? "warning" : (dolphinWarning ? "warning" : "pass")),
        validationItem("Cycle metrics valid", invalidCycleMetric ? "warning" : "pass"),
        validationItem("Breath events valid", invalidBreaths ? "warning" : "pass"),
        validationItem("No NaN/undefined", noNan ? "pass" : "fail"),
        validationItem("Original CSV valid", reaction && finish && noNan ? "pass" : "warning"),
        validationItem("Advanced analysis valid", analysis.summary.totalRaceTime ? "pass" : "warning"),
    ];
}

function scoreDataQuality(checklist) {
    const total = checklist.reduce((score, item) => {
        if (item.status === "pass") return score + 10;
        if (item.status === "warning") return score + 5;
        return score;
    }, 0);
    return clamp(total);
}

export function calculatePerformanceScores(analysis, events, raceConfig = {}) {
    const safeEvents = raceEvents(events);
    const checklist = generateValidationChecklist(analysis, safeEvents, raceConfig);
    const scores = {
        underwater: Math.round(scoreUnderwater(analysis, raceConfig)),
        strokeEfficiency: Math.round(scoreStrokeEfficiency(safeEvents)),
        breathingControl: Math.round(scoreBreathing(analysis)),
        speedSplit: Math.round(scoreSpeed(analysis)),
        dataQuality: Math.round(scoreDataQuality(checklist)),
    };
    scores.overall = Math.round(
        scores.underwater * 0.2
        + scores.strokeEfficiency * 0.22
        + scores.breathingControl * 0.18
        + scores.speedSplit * 0.22
        + scores.dataQuality * 0.18
    );
    return { ...scores, checklist };
}

function strokeEfficiencyMetrics(events) {
    const cycles = events.filter(event => modeOf(event) === "cycle");
    return {
        averageAmplitude: average(cycles.map(event => event["amplitude (m)"]).filter(value => finite(value) !== null && Number(value) > 0)),
        averageFrequency: average(cycles.map(event => event["frequence (cylce/min)"]).filter(value => finite(value) !== null && Number(value) > 0)),
        estimatedCycleSpeed: average(cycles.map(event => event["vitesse (m/s)"]).filter(value => finite(value) !== null && Number(value) > 0)),
    };
}

export function generateStrengths(analysis, scores, metrics = {}) {
    const strengths = [];
    const underwaterDistance = average(analysis.underwaterPhases.map(phase => phase.underwaterDistance));
    if (underwaterDistance !== null && underwaterDistance >= 7) strengths.push("Strong underwater phase distance.");
    if (finite(analysis.summary.averageSpeedMps) !== null && analysis.summary.averageSpeedMps >= 1.55) strengths.push("Good average race speed.");
    if (metrics.averageAmplitude !== null && metrics.averageAmplitude >= 2.8) strengths.push("Efficient distance per stroke.");
    if (scores.strokeEfficiency >= 70) strengths.push("Stable stroke efficiency profile.");
    if (strengths.length === 0) strengths.push("Baseline race data is available for review.");
    return strengths;
}

export function generateWeaknesses(analysis, scores, events = []) {
    const warnings = new Set();
    const modes = events.map(modeOf);
    const underwaterDistance = average(analysis.underwaterPhases.map(phase => phase.underwaterDistance));
    if (!modes.includes("breakout")) warnings.add("No breakout annotated.");
    if (!analysis.breathing.totalBreaths) warnings.add("No breath events annotated.");
    if (finite(analysis.breathing.breathsPerMinute) !== null && analysis.breathing.breathsPerMinute > 20) warnings.add("High breathing frequency.");
    if (underwaterDistance !== null && underwaterDistance < 7) warnings.add("Short underwater distance.");
    if (analysis.breathing.totalBreaths > 10 && finite(analysis.summary.totalRaceTime) !== null && analysis.summary.totalRaceTime <= 35) warnings.add("High breath count for a short race.");
    if (analysis.dolphin.kickAnalysis.length === 0) warnings.add("Dolphin kicks missing.");
    if ((analysis.summary.warnings || []).some(warning => String(warning).includes("interpolated"))) warnings.add("Speed is estimated from interpolated distance.");
    if (scores.strokeEfficiency < 55) warnings.add("Stroke efficiency needs work.");
    return [...warnings];
}

export function generateRecommendations(analysis, scores, warnings = []) {
    const recommendations = new Set();
    const underwaterDistance = average(analysis.underwaterPhases.map(phase => phase.underwaterDistance));
    if (underwaterDistance !== null && underwaterDistance < 7) recommendations.add("Improve streamline and underwater dolphin kick distance.");
    if (finite(analysis.breathing.breathsPerMinute) !== null && analysis.breathing.breathsPerMinute > 20) recommendations.add("Reduce breathing frequency and improve breathing rhythm.");
    if (scores.strokeEfficiency < 60 || analysis.strokeCount > 12) recommendations.add("Improve distance per stroke and body position.");
    if (analysis.dolphin.kickAnalysis.length < 3) recommendations.add("Add stronger underwater dolphin kicks before breakout.");
    if (scores.speedSplit < 65) recommendations.add("Work on maintaining speed after breakout.");
    if (warnings.some(warning => String(warning).includes("interpolated"))) recommendations.add("Use calibrated distance for more realistic instantaneous speed.");
    if (recommendations.size === 0) recommendations.add("Maintain current race structure and monitor consistency across attempts.");
    return [...recommendations];
}

export function generateCoachInsights(analysis, events, raceConfig = {}) {
    const safeEvents = raceEvents(events);
    const scores = calculatePerformanceScores(analysis, safeEvents, raceConfig);
    const efficiency = strokeEfficiencyMetrics(safeEvents);
    const warnings = generateWeaknesses(analysis, scores, safeEvents);
    const report = {
        generatedAt: new Date().toISOString(),
        swimmerName: text(raceConfig.swimmerName),
        lane: text(raceConfig.lane),
        raceConfig: {
            raceDistanceM: finite(raceConfig.raceDistanceM),
            poolLengthM: finite(raceConfig.poolLengthM),
            distanceMode: text(raceConfig.distanceMode),
        },
        raceSummary: {
            totalRaceTime: analysis.summary.totalRaceTime,
            averageSpeedMps: analysis.summary.averageSpeedMps,
            strokeCount: analysis.strokeCount,
            totalBreaths: analysis.breathing.totalBreaths,
            totalDolphinKicks: analysis.dolphin.kickAnalysis.length,
            splitCount: analysis.splits.length,
        },
        splitAnalysis: analysis.splits,
        underwaterAnalysis: analysis.underwaterPhases,
        dolphinAnalysis: analysis.dolphin,
        breathingAnalysis: analysis.breathing,
        strokeEfficiency: efficiency,
        performanceScores: scores,
        strengths: generateStrengths(analysis, scores, efficiency),
        warnings,
        recommendations: generateRecommendations(analysis, scores, warnings),
        validationChecklist: scores.checklist,
    };
    return report;
}

function metricCard(label, value) {
    return `<div class="coach-card coach-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function scoreCard(label, score) {
    const band = scoreBand(score);
    return `<div class="score-card ${band.className}">
        <span>${escapeHtml(label)}</span>
        <strong>${Math.round(clamp(score))}</strong>
        <em>${escapeHtml(band.label)}</em>
    </div>`;
}

function list(items, className) {
    return `<ul class="${className}">${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function checklist(items) {
    return `<div class="validation-checklist">${items.map(item => `
        <div class="validation-item validation-${item.status}">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.status)}</strong>
        </div>`).join("")}</div>`;
}

function splitRows(report) {
    return report.splitAnalysis.map(split => `<tr>
        <td>${split.index}</td>
        <td>${fmt(split.splitTime)}</td>
        <td>${fmt(split.splitSpeed)}</td>
        <td>${split.strokeCount ?? 0}</td>
        <td>${split.breathCount ?? 0}</td>
    </tr>`).join("");
}

function itemCards(items, className, emptyText) {
    const safeItems = (items || []).length ? items : [emptyText];
    return `<div class="${className}">${safeItems.map(item => `<article class="coach-insight-card"><p>${escapeHtml(item)}</p></article>`).join("")}</div>`;
}

function recommendationPriority(item, index) {
    const lower = String(item || "").toLowerCase();
    if (lower.includes("maintain")) return { label: "Low", className: "priority-low" };
    if (index < 2 || lower.includes("improve") || lower.includes("reduce") || lower.includes("missing")) {
        return { label: "High", className: "priority-high" };
    }
    return { label: "Medium", className: "priority-medium" };
}

function recommendationReason(item) {
    const lower = String(item || "").toLowerCase();
    if (lower.includes("underwater") || lower.includes("dolphin")) return "This affects breakout speed and the first meters after the start or turn.";
    if (lower.includes("breath")) return "This helps the swimmer keep rhythm, body line, and forward momentum.";
    if (lower.includes("stroke") || lower.includes("distance per stroke")) return "This improves efficiency so each cycle moves the swimmer farther.";
    if (lower.includes("speed") || lower.includes("split")) return "This supports steadier pacing and less speed loss across the race.";
    if (lower.includes("calibrated")) return "This improves confidence in speed and distance-based feedback.";
    return "This keeps the race pattern consistent and easier to compare over time.";
}

function recommendationTitle(item) {
    const lower = String(item || "").toLowerCase();
    if (lower.includes("underwater") || lower.includes("dolphin")) return "Underwater Phase";
    if (lower.includes("breath")) return "Breathing Rhythm";
    if (lower.includes("stroke") || lower.includes("distance per stroke")) return "Stroke Efficiency";
    if (lower.includes("speed") || lower.includes("split")) return "Speed Control";
    if (lower.includes("calibrated")) return "Data Calibration";
    return "Race Consistency";
}

function recommendationCards(items) {
    const safeItems = (items || []).length ? items : ["No recommendations available."];
    return `<div class="coach-recommendation-grid">${safeItems.map((item, index) => {
        const priority = recommendationPriority(item, index);
        return `<article class="coach-recommendation-card">
            <div class="coach-recommendation-head">
                <h5>${escapeHtml(recommendationTitle(item))}</h5>
                <span class="priority-badge ${priority.className}">${priority.label}</span>
            </div>
            <p>${escapeHtml(item)}</p>
            <small>Why it matters: ${escapeHtml(recommendationReason(item))}</small>
        </article>`;
    }).join("")}</div>`;
}

export function renderCoachReport(report, container) {
    if (!container) return;
    container.innerHTML = coachReportMarkup(report);
}

export function coachReportMarkup(report) {
    const generatedAt = new Date(report.generatedAt).toLocaleString();
    const underwaterPhases = report.underwaterAnalysis || [];
    const underwaterDistance = average(underwaterPhases.map(phase => phase.underwaterDistance));
    const underwaterTime = average(underwaterPhases.map(phase => phase.underwaterTime));
    return `<section class="coach-report">
        <header class="coach-report-header">
            <div>
                <p class="coach-report-kicker">Generated Insights</p>
                <h3>StrokeIQ Coach Report</h3>
                <p class="coach-report-meta">${escapeHtml(report.swimmerName)} - ${escapeHtml(report.lane)} - ${fmt(report.raceConfig.raceDistanceM, 0)}m</p>
            </div>
            <div class="coach-report-summary">
                <span>Total Time <strong>${fmt(report.raceSummary.totalRaceTime)}s</strong></span>
                <span>Generated <strong>${escapeHtml(generatedAt)}</strong></span>
            </div>
        </header>
        <div class="score-card score-overall ${scoreBand(report.performanceScores.overall).className}">
            <span>Overall Race Score</span>
            <strong>${report.performanceScores.overall}</strong>
            <em>${escapeHtml(scoreBand(report.performanceScores.overall).label)}</em>
        </div>
        <div class="coach-score-grid">
            ${scoreCard("Underwater", report.performanceScores.underwater)}
            ${scoreCard("Stroke Efficiency", report.performanceScores.strokeEfficiency)}
            ${scoreCard("Breathing Control", report.performanceScores.breathingControl)}
            ${scoreCard("Speed / Split", report.performanceScores.speedSplit)}
            ${scoreCard("Data Quality", report.performanceScores.dataQuality)}
        </div>
        <div class="coach-metrics-grid">
            ${metricCard("Total Time", `${fmt(report.raceSummary.totalRaceTime)}s`)}
            ${metricCard("Average Speed", `${fmt(report.raceSummary.averageSpeedMps)} m/s`)}
            ${metricCard("Stroke Count", report.raceSummary.strokeCount)}
            ${metricCard("Breaths", report.raceSummary.totalBreaths)}
            ${metricCard("Dolphin Kicks", report.raceSummary.totalDolphinKicks)}
            ${metricCard("Underwater Distance", `${fmt(underwaterDistance)} m`)}
            ${metricCard("Underwater Time", `${fmt(underwaterTime)} s`)}
            ${metricCard("Splits", report.raceSummary.splitCount)}
            ${metricCard("Avg Amplitude", `${fmt(report.strokeEfficiency.averageAmplitude)} m`)}
            ${metricCard("Avg Frequency", `${fmt(report.strokeEfficiency.averageFrequency)} cyc/min`)}
        </div>
        <div class="coach-card coach-table-card">
            <h4>Split Summary</h4>
            <table class="coach-table">
                <thead><tr><th>Split</th><th>Time</th><th>Speed</th><th>Strokes</th><th>Breaths</th></tr></thead>
                <tbody>${splitRows(report)}</tbody>
            </table>
        </div>
        <div class="coach-card">
            <h4>Key Strengths</h4>
            ${itemCards(report.strengths, "coach-insight-grid coach-success", "No strengths available.")}
        </div>
        <div class="coach-card">
            <h4>Warnings</h4>
            ${itemCards(report.warnings, "coach-insight-grid coach-warning", "No warnings found.")}
        </div>
        <div class="coach-card">
            <h4>Coach Recommendations</h4>
            ${recommendationCards(report.recommendations)}
        </div>
        <div class="coach-card">
            <h4>Validation Checklist</h4>
            ${checklist(report.validationChecklist)}
        </div>
    </section>`;
}

function sanitizeFilePart(value) {
    return String(value || "swimmer").trim().replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "") || "swimmer";
}

function downloadText(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function exportCoachReportHtml(report) {
    const filename = `coach_report_${sanitizeFilePart(report.swimmerName)}_${fmt(report.raceConfig.raceDistanceM, 0)}m.html`;
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>StrokeIQ Coach Report</title>
<style>
body{font-family:Arial,sans-serif;margin:0;color:#10243a;background:#eef5fb;font-size:16px;line-height:1.5}
.coach-report{max-width:1100px;margin:24px auto;background:#f8fbff;padding:30px;border:1px solid #d9e3ec;border-radius:16px}
.coach-report-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:22px}
.coach-report-kicker{margin:0 0 6px;color:#087ea4;font-weight:800;text-transform:uppercase;font-size:13px;letter-spacing:.08em}
h3{margin:0;color:#06213f;font-size:34px;line-height:1.1}h4{margin:0 0 14px;color:#06213f;font-size:22px}.coach-report-meta{margin:8px 0 0;color:#52677d}
.coach-report-summary{display:grid;gap:10px;min-width:240px}.coach-report-summary span{display:block;background:#fff;border:1px solid #d9e3ec;border-radius:12px;padding:10px 12px;color:#52677d}.coach-report-summary strong{display:block;color:#06213f}
.coach-score-grid,.coach-metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;margin-bottom:18px}
.score-card,.coach-card{border:1px solid #d9e3ec;border-radius:14px;padding:18px;margin:18px 0;background:#fff;box-shadow:0 10px 24px rgba(16,36,58,.08)}
.score-card{border-left:6px solid #66788a}.score-card span,.coach-metric span{display:block;color:#52677d;font-size:13px;font-weight:800;text-transform:uppercase}.score-card strong{display:block;margin-top:6px;font-size:38px;line-height:1}.score-card em{display:inline-block;margin-top:10px;border-radius:999px;padding:5px 10px;background:#edf5ff;color:#10243a;font-style:normal;font-weight:800}
.score-overall strong{font-size:54px}.score-excellent{border-left-color:#16a66a}.score-good{border-left-color:#0b63ce}.score-needs-work{border-left-color:#f59e0b}.score-weak{border-left-color:#d94b4b}
.coach-metric strong{display:block;margin-top:6px;font-size:28px;color:#06213f}
table{width:100%;border-collapse:collapse;font-size:15px}th,td{border:1px solid #d9e3ec;padding:12px;text-align:left}th{background:#eaf4ff;color:#06213f}tr:nth-child(even) td{background:#f8fbff}
.coach-insight-grid,.coach-recommendation-grid{display:grid;gap:12px}.coach-insight-card,.coach-recommendation-card{border:1px solid #d9e3ec;border-radius:12px;padding:14px;background:#f8fbff}.coach-insight-card p,.coach-recommendation-card p{margin:0}.coach-success .coach-insight-card{border-color:#a8dfc2;background:#f0fdf6;color:#14532d}.coach-warning .coach-insight-card{border-color:#f8d28b;background:#fff8e8;color:#8a3b0b}
.coach-recommendation-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.coach-recommendation-card h5{margin:0;font-size:17px;color:#06213f}.coach-recommendation-card p{margin-top:8px}.coach-recommendation-card small{display:block;margin-top:10px;color:#52677d}.priority-badge{border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.priority-high{background:#ffe9e9;color:#b91c1c}.priority-medium{background:#fff2cd;color:#92400e}.priority-low{background:#e8f8ee;color:#166534}
.validation-checklist{display:grid;gap:10px}.validation-item{display:flex;justify-content:space-between;gap:14px;border:1px solid #d9e3ec;border-radius:12px;padding:12px 14px;background:#f8fbff}.validation-pass strong{color:#15803d}.validation-warning strong{color:#b45309}.validation-fail strong{color:#b91c1c}
@media print{body{background:#fff}.coach-report{margin:0;border:none;box-shadow:none}.advanced-analysis-actions,button{display:none}.coach-card,.score-card{break-inside:avoid;box-shadow:none}}
</style>
</head>
<body>${coachReportMarkup(report)}</body>
</html>`;
    downloadText(filename, html, "text/html;charset=utf-8");
}

export function exportSummaryJson(report) {
    downloadText(`summary_${sanitizeFilePart(report.swimmerName)}.json`, JSON.stringify(report, null, 2), "application/json;charset=utf-8");
}

export function exportFullRacePackage(report) {
    exportCoachReportHtml(report);
    setTimeout(() => exportSummaryJson(report), 250);
}
