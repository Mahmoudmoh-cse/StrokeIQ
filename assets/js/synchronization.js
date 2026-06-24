import { getLaneCount, megaData, selected_comp, selected_run } from "./loader.js";
import { edit_temp_start } from "./refactor-script.js";
import { getMeta } from "./utils.js";
import { canWriteMetadata, getLocalApiUrl } from "./local_api.js";
import { displayFileLabel } from "./display_labels.js";

const REFRESH_INTERVAL_MS = 250;
const POOL_REFERENCE_WIDTH = 900;
const POOL_REFERENCE_HEIGHT = 361;
const SVG_NS = "http://www.w3.org/2000/svg";

let refreshTimer = null;

function getElement(id) {
    return document.getElementById(id);
}

function roundTime(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 1000) / 1000 : 0;
}

function parseTimeInput(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
        throw new Error("Invalid flash time.");
    }
    return number;
}

function formatSeconds(value) {
    const seconds = roundTime(value);
    return seconds.toFixed(3);
}

function formatTimecode(value) {
    const seconds = roundTime(value);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
}

function formatCoordinate(value) {
    const rounded = Math.round(Number(value) * 10) / 10;
    return Number.isInteger(rounded) ? String(Math.trunc(rounded)) : rounded.toFixed(1);
}

function createSvgElement(tagName, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tagName);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    return element;
}

function normalizePoint(point) {
    const raw = Array.isArray(point) ? { x: point[0], y: point[1] } : point;
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }
    return { x, y };
}

function getFlashRegionPoints(metadata = megaData?.[0]) {
    const points = metadata?.flash?.pts ?? metadata?.flashPts ?? metadata?.flash_points;
    if (!Array.isArray(points)) {
        return [];
    }
    return points.map(normalizePoint).filter(Boolean);
}

function getRegionBounds(points) {
    if (points.length === 0) {
        return null;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
    };
}

function getFlashTimeForDisplay(activeVideo, flashInput) {
    if (flashInput && document.activeElement === flashInput) {
        const typedTime = Number(flashInput.value);
        if (Number.isFinite(typedTime) && typedTime >= 0) {
            return typedTime;
        }
    }
    return getFlashTime(activeVideo);
}

function updateFlashMomentDisplay(activeVideo, flashInput) {
    const momentInput = getElement("sync_flash_moment");
    if (!momentInput || !activeVideo) {
        if (momentInput) {
            momentInput.value = "";
        }
        return;
    }

    const time = getFlashTimeForDisplay(activeVideo, flashInput);
    momentInput.value = `${formatSeconds(time)} s (${formatTimecode(time)})`;
}

function describeFlashRegion(metadata, points) {
    const bounds = getRegionBounds(points);
    if (!bounds) {
        return "No flash region";
    }

    const flashSide = String(metadata?.flash?.side ?? "").trim();
    const side = flashSide ? `side ${flashSide}; ` : "";
    return `${side}center ${formatCoordinate(bounds.centerX)}, ${formatCoordinate(bounds.centerY)}; size ${formatCoordinate(bounds.width)} x ${formatCoordinate(bounds.height)}`;
}

function renderPoolReferenceGrid(svg, laneCount) {
    svg.appendChild(createSvgElement("rect", {
        class: "sync-pool-base",
        x: 0,
        y: 0,
        width: POOL_REFERENCE_WIDTH,
        height: POOL_REFERENCE_HEIGHT
    }));

    for (let i = 1; i < laneCount; i += 1) {
        const y = POOL_REFERENCE_HEIGHT * i / laneCount;
        svg.appendChild(createSvgElement("line", {
            class: "sync-pool-lane",
            x1: 0,
            y1: y,
            x2: POOL_REFERENCE_WIDTH,
            y2: y
        }));
    }

    svg.appendChild(createSvgElement("line", {
        class: "sync-pool-midline",
        x1: POOL_REFERENCE_WIDTH / 2,
        y1: 0,
        x2: POOL_REFERENCE_WIDTH / 2,
        y2: POOL_REFERENCE_HEIGHT
    }));
}

function renderFlashRegion(metadata = megaData?.[0]) {
    const regionInput = getElement("sync_flash_region");
    const pool = getElement("sync_flash_pool");
    const points = getFlashRegionPoints(metadata);
    const bounds = getRegionBounds(points);

    if (regionInput) {
        regionInput.value = describeFlashRegion(metadata, points);
    }
    if (!pool) {
        return;
    }

    pool.classList.toggle("is-empty", !bounds);
    const svg = createSvgElement("svg", {
        viewBox: `0 0 ${POOL_REFERENCE_WIDTH} ${POOL_REFERENCE_HEIGHT}`,
        role: "img",
        focusable: "false"
    });
    renderPoolReferenceGrid(svg, getLaneCount(metadata));

    if (bounds) {
        svg.appendChild(createSvgElement("polygon", {
            class: "sync-flash-region-polygon",
            points: points.map((point) => `${point.x},${point.y}`).join(" ")
        }));
        svg.appendChild(createSvgElement("circle", {
            class: "sync-flash-region-center",
            cx: bounds.centerX,
            cy: bounds.centerY,
            r: 7
        }));
    }

    pool.replaceChildren(svg);
}

function setStatus(message, state = "") {
    const status = getElement("sync_status");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.state = state;
}

function getVideos() {
    return Array.isArray(megaData?.[0]?.videos) ? megaData[0].videos : [];
}

function inferVideoSide(video) {
    const name = String(video?.name ?? "").toLowerCase();
    if (name.includes("fixedroite") || name.includes("droite") || name.includes("right")) {
        return "right";
    }
    if (name.includes("fixegauche") || name.includes("gauche") || name.includes("left")) {
        return "left";
    }
    return "";
}

function getRaceStartSide(video) {
    return String(video?.start_side ?? megaData?.[0]?.start_side ?? "").toLowerCase();
}

function getStartFieldForVideo(video) {
    const videos = getVideos();
    if (videos.length < 2) {
        return "start_flash";
    }

    const videoSide = inferVideoSide(video);
    const startSide = getRaceStartSide(video);
    if (videoSide && startSide) {
        return videoSide === startSide ? "start_flash" : "start_synchro_flash";
    }

    if (video?.start_synchro_flash !== undefined && video?.start_flash === undefined) {
        return "start_synchro_flash";
    }
    return "start_flash";
}

function getActiveVideo() {
    try {
        return getMeta();
    } catch {
        return getVideos()[0] ?? null;
    }
}

function getFlashTime(video = getActiveVideo()) {
    if (!video) {
        return 0;
    }
    const field = getStartFieldForVideo(video);
    return roundTime(video[field] ?? video.start_flash ?? video.start_synchro_flash ?? video.start_moment ?? 0);
}

function setSelectOptions(select, videos) {
    if (!select) {
        return;
    }
    select.replaceChildren(...videos.map((video, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = video.name ? displayFileLabel(video.name) : `video ${index + 1}`;
        return option;
    }));
}

function renderVideoList(videos) {
    const list = getElement("sync_video_list");
    if (!list) {
        return;
    }

    list.replaceChildren(...videos.map((video) => {
        const row = document.createElement("div");
        row.className = "sync-video-row";

        const name = document.createElement("span");
        name.textContent = video.name ? displayFileLabel(video.name) : "Video";

        const field = document.createElement("span");
        field.textContent = getStartFieldForVideo(video);

        const time = document.createElement("span");
        time.textContent = formatSeconds(getFlashTime(video));

        row.replaceChildren(name, field, time);
        return row;
    }));
}

function updateCurrentTimeDisplay() {
    const currentTimeInput = getElement("sync_current_time");
    if (currentTimeInput) {
        currentTimeInput.value = formatSeconds(getElement("vid")?.currentTime ?? 0);
    }
}

function renderSynchronizePanel({ preserveFlashInput = false, preserveStatus = false } = {}) {
    const metadata = megaData?.[0];
    const videos = getVideos();
    const activeVideo = getActiveVideo();
    const videoElement = getElement("vid");
    const hasMetadata = Boolean(metadata && activeVideo);
    const field = hasMetadata ? getStartFieldForVideo(activeVideo) : "";

    const currentVideoInput = getElement("sync_current_video");
    const currentTimeInput = getElement("sync_current_time");
    const flashFieldInput = getElement("sync_flash_field");
    if (currentVideoInput) {
        currentVideoInput.value = activeVideo?.name ? displayFileLabel(activeVideo.name) : "";
    }
    if (currentTimeInput) {
        currentTimeInput.value = formatSeconds(videoElement?.currentTime ?? 0);
    }
    if (flashFieldInput) {
        flashFieldInput.value = field;
    }

    const flashInput = getElement("sync_flash_time");
    if (flashInput && (!preserveFlashInput || document.activeElement !== flashInput)) {
        flashInput.value = hasMetadata ? formatSeconds(getFlashTime(activeVideo)) : "";
    }
    updateFlashMomentDisplay(hasMetadata ? activeVideo : null, flashInput);
    renderFlashRegion(metadata);

    const referenceSelect = getElement("sync_reference_video");
    const targetSelect = getElement("sync_target_video");
    setSelectOptions(referenceSelect, videos);
    setSelectOptions(targetSelect, videos);
    if (targetSelect && videos.length > 1 && targetSelect.value === "0") {
        targetSelect.value = "1";
    }
    if (referenceSelect) {
        referenceSelect.disabled = videos.length < 2;
    }
    if (targetSelect) {
        targetSelect.disabled = videos.length < 2;
    }

    const useCurrentButton = getElement("sync_use_current");
    const saveButton = getElement("sync_save");
    const syncVideoButton = getElement("sync_video_sync");
    if (useCurrentButton) {
        useCurrentButton.disabled = !hasMetadata;
    }
    if (saveButton) {
        saveButton.disabled = !hasMetadata || !canWriteMetadata();
        saveButton.title = canWriteMetadata()
            ? ""
            : "Static mode: JSON writing is unavailable.";
    }
    if (syncVideoButton) {
        syncVideoButton.disabled = true;
    }
    renderVideoList(videos);

    if (!hasMetadata) {
        setStatus("No race loaded.", "error");
    } else if (!preserveStatus && videos.length > 1) {
        setStatus("Video synchronization is coming soon.", "pending");
    } else if (!preserveStatus) {
        setStatus("", "");
    }
}

function applyFlashTime(value) {
    const activeVideo = getActiveVideo();
    if (!megaData?.[0] || !activeVideo) {
        throw new Error("No race loaded.");
    }

    const nextTime = roundTime(parseTimeInput(value));
    const field = getStartFieldForVideo(activeVideo);
    activeVideo[field] = nextTime;
    if (field === "start_flash") {
        activeVideo.start_moment = nextTime;
    }

    edit_temp_start(nextTime);
    const startInput = getElement("editStartTime");
    if (startInput) {
        startInput.value = formatTimecode(nextTime);
    }

    window.dispatchEvent(new CustomEvent("metadata-updated", { detail: { metadata: megaData[0] } }));
    window.dispatchEvent(new CustomEvent("synchronization-updated", {
        detail: { video: activeVideo, field, time: nextTime }
    }));
    return { field, time: nextTime };
}

function setCurrentTimeAsFlash() {
    const videoElement = getElement("vid");
    try {
        const result = applyFlashTime(videoElement?.currentTime ?? 0);
        const flashInput = getElement("sync_flash_time");
        if (flashInput) {
            flashInput.value = formatSeconds(result.time);
        }
        renderSynchronizePanel({ preserveFlashInput: true });
        setStatus(`${result.field} = ${formatSeconds(result.time)} s`, "saved");
    } catch (error) {
        setStatus(error.message, "error");
    }
}

async function saveSynchronization() {
    const inputValue = getElement("sync_flash_time")?.value;
    let result;
    try {
        result = applyFlashTime(inputValue);
    } catch (error) {
        setStatus(error.message, "error");
        return null;
    }

    if (!canWriteMetadata()) {
        renderSynchronizePanel();
        setStatus("Synchronization updated in memory; static mode cannot write JSON.", "ready");
        return result;
    }

    try {
        const response = await fetch(getLocalApiUrl("/saveMetadata"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                competition: selected_comp,
                run: selected_run,
                metadata: megaData[0]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `HTTP ${response.status}`);
        }

        const payload = await response.json();
        renderSynchronizePanel();
        setStatus(`Synchronization saved: ${payload.path}`, "saved");
        return result;
    } catch (error) {
        setStatus(`Synchronization updated in memory, but JSON could not be written: ${error.message}`, "error");
        return null;
    }
}

function startRefreshing() {
    stopRefreshing();
    renderSynchronizePanel();
    refreshTimer = setInterval(updateCurrentTimeDisplay, REFRESH_INTERVAL_MS);
}

function stopRefreshing() {
    if (refreshTimer != null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

function bindSynchronizePanel() {
    const delayedRender = () => {
        setTimeout(() => renderSynchronizePanel(), 350);
        setTimeout(() => renderSynchronizePanel(), 900);
    };

    getElement("sync_use_current")?.addEventListener("click", setCurrentTimeAsFlash);
    getElement("sync_save")?.addEventListener("click", saveSynchronization);
    getElement("loadbtn")?.addEventListener("click", delayedRender);
    getElement("vid")?.addEventListener("timeupdate", () => {
        updateCurrentTimeDisplay();
    });
    getElement("vid")?.addEventListener("loadedmetadata", () => {
        renderSynchronizePanel({ preserveFlashInput: true, preserveStatus: true });
    });
    getElement("sync_flash_time")?.addEventListener("input", () => {
        renderSynchronizePanel({ preserveFlashInput: true, preserveStatus: true });
    });
    window.addEventListener("synchronize-view-opened", startRefreshing);
    window.addEventListener("workspace-layout-changed", (event) => {
        if (event.detail?.activeWorkspace !== "synchronize_view") {
            stopRefreshing();
        }
    });
    window.addEventListener("metadata-updated", () => {
        renderSynchronizePanel({ preserveStatus: true });
    });
    window.addEventListener("flash-calibration-updated", () => {
        renderSynchronizePanel({ preserveStatus: true });
    });

    const saveButton = getElement("sync_save");
    if (saveButton) {
        saveButton.disabled = !canWriteMetadata();
        saveButton.title = canWriteMetadata()
            ? ""
            : "Static mode: JSON writing is unavailable.";
    }
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindSynchronizePanel);
} else {
    bindSynchronizePanel();
}
