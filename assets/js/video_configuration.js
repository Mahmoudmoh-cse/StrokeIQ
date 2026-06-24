import ImgCtrlPts from "./vendor/ImgCtrlPts.js";
import { megaData, pool_size, selected_comp, selected_run } from "./loader.js";
import { getMeta } from "./utils.js";
import { refreshVideoSurface } from "./video_surface.js";
import { canWriteMetadata, getLocalApiUrl, isStaticDataSource } from "./local_api.js";
import { dataProvider } from "./aquanote-providers.js";
import { displayFileLabel, displayVideoType } from "./display_labels.js";

const APP_ROOT_URL = new URL("../../", import.meta.url);
const DEFAULT_POOL_IMAGE = {
    name: "Swimming pool 50m above",
    path: "videos/Swimming_pool_50m_above.png"
};
const FALLBACK_POOL_IMAGES = [
    DEFAULT_POOL_IMAGE,
    {
        name: "swimmingpool",
        path: "videos/swimmingpool.jpg"
    }
];
const JSON_POOL_SIZE = { width: 900, height: 361 };
const CONTROL_WIDTH = 390;
const scheduleFrame = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame
    : (callback) => setTimeout(callback, 0);

let workspace = null;
let calibrationWorkspaces = [];
let activeMeta = null;
let activeSourceImage = null;
let activeReferenceImage = null;
let activeReferenceSize = null;
let activePoolImage = DEFAULT_POOL_IMAGE;
let poolImages = FALLBACK_POOL_IMAGES;
const referenceImagePromises = new Map();
const videoSnapshotPromises = new Map();
let updateFrame = null;
let flashControl = null;

function positiveNumber(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
            return number;
        }
    }
    return NaN;
}

function getElement(id) {
    return document.getElementById(id);
}

function setStatus(message, state = "") {
    const status = getElement("config_status");
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.state = state;
}

function getSourceSize(meta) {
    const video = getElement("vid");
    const width = positiveNumber(meta?.width, video?.videoWidth, video?.width, 1920);
    const height = positiveNumber(meta?.height, video?.videoHeight, video?.height, 1080);
    return { width, height };
}

function sourcePointToPct(point, size) {
    return {
        x: Number(point?.[0] ?? point?.x ?? 0) * 100 / size.width,
        y: Number(point?.[1] ?? point?.y ?? 0) * 100 / size.height
    };
}

function getImageSize(image) {
    return {
        width: positiveNumber(image?.naturalWidth, image?.videoWidth, image?.width, JSON_POOL_SIZE.width),
        height: positiveNumber(image?.naturalHeight, image?.videoHeight, image?.height, JSON_POOL_SIZE.height)
    };
}

function poolImageUrl(poolImage = activePoolImage) {
    return new URL(poolImage?.path || DEFAULT_POOL_IMAGE.path, APP_ROOT_URL).href;
}

function normalizePoolImage(entry) {
    if (!entry || typeof entry !== "object") {
        return null;
    }
    const path = String(entry.path || "").trim();
    if (!path) {
        return null;
    }
    return {
        name: String(entry.name || path.split("/").pop() || path),
        path
    };
}

function uniquePoolImages(entries) {
    const seen = new Set();
    const result = [];

    for (const item of entries) {
        const normalized = normalizePoolImage(item);
        if (!normalized || seen.has(normalized.path)) {
            continue;
        }
        seen.add(normalized.path);
        result.push(normalized);
    }

    return result.length > 0 ? result : FALLBACK_POOL_IMAGES;
}

async function loadPoolImages() {
    if (isStaticDataSource()) {
        poolImages = uniquePoolImages(FALLBACK_POOL_IMAGES);
        return poolImages;
    }

    try {
        const response = await fetch(getLocalApiUrl("/getPoolImages"));
        if (response.ok) {
            const payload = await response.json();
            if (Array.isArray(payload)) {
                poolImages = uniquePoolImages([...payload, ...FALLBACK_POOL_IMAGES]);
                return poolImages;
            }
        }
    } catch {
        // Static mode falls back to the known bundled pool images.
    }

    poolImages = uniquePoolImages(FALLBACK_POOL_IMAGES);
    return poolImages;
}

function syncPoolImageSelect(metadata = megaData?.[0]) {
    const select = getElement("config_pool_select");
    const configuredPath = select?.value || metadata?.poolImage || metadata?.piscineImage || activePoolImage?.path;
    const selected = poolImages.find((image) => image.path === configuredPath)
        || poolImages.find((image) => image.path === DEFAULT_POOL_IMAGE.path)
        || poolImages[0]
        || DEFAULT_POOL_IMAGE;

    activePoolImage = selected;

    if (!select) {
        return selected;
    }

    select.replaceChildren(...poolImages.map((image) => {
        const option = document.createElement("option");
        option.value = image.path;
        option.textContent = image.name;
        return option;
    }));
    select.value = selected.path;
    return selected;
}

function selectedPoolImage() {
    const select = getElement("config_pool_select");
    const selected = poolImages.find((image) => image.path === select?.value) || activePoolImage || DEFAULT_POOL_IMAGE;
    activePoolImage = selected;
    return selected;
}

function destinationPointToReferencePx(point, referenceSize = activeReferenceSize ?? JSON_POOL_SIZE) {
    return {
        x: Number(point?.[0] ?? point?.x ?? 0) * referenceSize.width / JSON_POOL_SIZE.width,
        y: Number(point?.[1] ?? point?.y ?? 0) * referenceSize.height / JSON_POOL_SIZE.height
    };
}

function destinationPointsLookMetric(points) {
    if (!Array.isArray(points) || points.length < 4) {
        return false;
    }

    const xs = points.map((point) => Number(point?.[0] ?? point?.x));
    const ys = points.map((point) => Number(point?.[1] ?? point?.y));
    if (!xs.every(Number.isFinite) || !ys.every(Number.isFinite)) {
        return false;
    }

    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const poolLength = positiveNumber(pool_size?.[0], 50);
    const poolWidth = positiveNumber(pool_size?.[1], 20);
    return maxX <= poolLength * 1.25 && maxY <= poolWidth * 1.25;
}

function metricDestinationPointToReferencePx(point, referenceSize = activeReferenceSize ?? JSON_POOL_SIZE) {
    const poolLength = positiveNumber(pool_size?.[0], 50);
    const poolWidth = positiveNumber(pool_size?.[1], 20);
    const x = Number(point?.[0] ?? point?.x ?? 0);
    const y = Number(point?.[1] ?? point?.y ?? 0);
    return {
        x: x * referenceSize.width / poolLength,
        y: y * referenceSize.height / poolWidth
    };
}

function referencePointToJson(point, referenceSize = activeReferenceSize ?? JSON_POOL_SIZE) {
    return [
        roundCoordinate(Number(point.x) * JSON_POOL_SIZE.width / referenceSize.width),
        roundCoordinate(Number(point.y) * JSON_POOL_SIZE.height / referenceSize.height)
    ];
}

function referencePointToPct(point, referenceSize = activeReferenceSize ?? JSON_POOL_SIZE) {
    return {
        x: point.x * 100 / referenceSize.width,
        y: point.y * 100 / referenceSize.height
    };
}

function roundCoordinate(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? Math.trunc(rounded) : rounded;
}

function pointsToArrays(points) {
    return points.map((point) => [
        roundCoordinate(point.x),
        roundCoordinate(point.y)
    ]);
}

function setFlashActionState(hasFlash, canAdd = Boolean(activeMeta && activeSourceImage)) {
    const saveButton = getElement("config_flash_save");
    if (saveButton) {
        saveButton.disabled = !hasFlash || !canWriteMetadata();
        saveButton.title = canWriteMetadata()
            ? ""
            : "Static mode: JSON writing is unavailable.";
    }

    const addButton = getElement("config_flash_add");
    if (addButton) {
        addButton.hidden = hasFlash;
        addButton.disabled = hasFlash || !canAdd;
    }
}

function clearFlashControl(canAdd = Boolean(activeMeta && activeSourceImage)) {
    flashControl?.remove?.();
    flashControl = null;
    getElement("config_flash_workspace")?.replaceChildren();
    setFlashActionState(false, canAdd);
}

function getFlashPoints(metadata = megaData?.[0]) {
    const points = metadata?.flash?.pts ?? metadata?.flashPts ?? metadata?.flash_points;
    if (!Array.isArray(points)) {
        return [];
    }
    return points.filter((point) => {
        const x = Number(point?.[0] ?? point?.x);
        const y = Number(point?.[1] ?? point?.y);
        return Number.isFinite(x) && Number.isFinite(y);
    });
}

function createReferenceSourcePerspective(meta = activeMeta, fromReference = true) {
    const transformer = window.PerspT;
    const sourcePoints = Array.isArray(meta?.srcPts) ? meta.srcPts : [];
    const destinationPoints = Array.isArray(meta?.destPts) ? meta.destPts : [];
    const pointCount = Math.min(sourcePoints.length, destinationPoints.length);
    if (!transformer || pointCount < 4) {
        return null;
    }

    const referenceCorners = destinationPoints.slice(0, pointCount).flatMap((point) => [
        Number(point?.[0]),
        Number(point?.[1])
    ]);
    const sourceCorners = sourcePoints.slice(0, pointCount).flatMap((point) => [
        Number(point?.[0]),
        Number(point?.[1])
    ]);

    return fromReference
        ? new transformer(referenceCorners, sourceCorners)
        : new transformer(sourceCorners, referenceCorners);
}

function referencePointsToSourcePoints(points, meta = activeMeta) {
    const perspective = createReferenceSourcePerspective(meta, true);
    if (!perspective) {
        return [];
    }

    try {
        return points.map((point) => {
            const [x, y] = perspective.transform(
                Number(point?.[0] ?? point?.x),
                Number(point?.[1] ?? point?.y)
            );
            return { x: Number(x), y: Number(y) };
        }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    } catch {
        return [];
    }
}

function sourcePointsToReferenceJson(points, meta = activeMeta) {
    const perspective = createReferenceSourcePerspective(meta, false);
    if (!perspective) {
        return [];
    }

    try {
        return points.map((point) => {
            const [x, y] = perspective.transform(Number(point.x), Number(point.y));
            return [roundCoordinate(Number(x)), roundCoordinate(Number(y))];
        }).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    } catch {
        return [];
    }
}

function percentPointToSourcePx(point, sourceSize = getSourceSize(activeMeta)) {
    return {
        x: Number(point.x) * sourceSize.width / 100,
        y: Number(point.y) * sourceSize.height / 100
    };
}

function ensureFlashMetadata(metadata = megaData?.[0]) {
    if (!metadata) {
        return null;
    }
    if (!metadata.flash || typeof metadata.flash !== "object" || Array.isArray(metadata.flash)) {
        metadata.flash = {};
    }
    return metadata.flash;
}

function extractFlashValue() {
    if (!flashControl) {
        return null;
    }
    const sourceSize = getSourceSize(activeMeta);
    const sourcePoints = flashControl.value.map((point) => percentPointToSourcePx(point, sourceSize));
    return sourcePointsToReferenceJson(sourcePoints, activeMeta);
}

function applyFlashToMetadata() {
    const points = extractFlashValue();
    const flash = ensureFlashMetadata();
    if (!flash || !points) {
        return;
    }

    flash.pts = points;
    window.dispatchEvent(new CustomEvent("flash-calibration-updated", {
        detail: { flash }
    }));
}

function currentVideoMatches(meta) {
    const src = getElement("vid")?.currentSrc || getElement("vid")?.getAttribute("src") || "";
    return Boolean(meta?.name && src.includes(meta.name));
}

function videoUrlForMeta(meta) {
    const currentSource = getElement("vid")?.currentSrc || getElement("vid")?.getAttribute("src") || "";
    if (currentVideoMatches(meta)) {
        return currentSource;
    }

    if (selected_comp && selected_run && meta?.name) {
        return dataProvider.getVideoUrl(selected_comp, selected_run, meta.name);
    }

    return currentSource;
}

function waitForVideoFrame(video, timeout = 5000) {
    return new Promise((resolve, reject) => {
        if (video.readyState >= 2) {
            resolve();
            return;
        }

        const cleanup = () => {
            video.removeEventListener("loadeddata", handleReady);
            video.removeEventListener("canplay", handleReady);
            video.removeEventListener("error", handleError);
            clearTimeout(timer);
        };
        const handleReady = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(new Error("The first video frame is unavailable."));
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error("Loading the first frame took too long."));
        }, timeout);

        video.addEventListener("loadeddata", handleReady, { once: true });
        video.addEventListener("canplay", handleReady, { once: true });
        video.addEventListener("error", handleError, { once: true });
    });
}

async function drawFirstVideoFrame(context, canvas, meta) {
    const sourceUrl = videoUrlForMeta(meta);
    if (!sourceUrl) {
        return false;
    }

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = sourceUrl;
    video.load?.();

    await waitForVideoFrame(video);
    const width = positiveNumber(meta?.width, video.videoWidth, canvas.width);
    const height = positiveNumber(meta?.height, video.videoHeight, canvas.height);
    if (Math.round(width) !== canvas.width || Math.round(height) !== canvas.height) {
        canvas.width = Math.max(1, Math.round(width));
        canvas.height = Math.max(1, Math.round(height));
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return isCanvasReadable(canvas);
}

function drawCenteredText(context, text, width, height) {
    context.save();
    context.fillStyle = "rgba(255, 255, 255, 0.84)";
    context.font = `${Math.max(28, Math.round(width / 46))}px Raleway, system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, height / 2);
    context.restore();
}

function isCanvasReadable(canvas) {
    try {
        canvas.getContext("2d")?.getImageData(0, 0, 1, 1);
        return true;
    } catch {
        return false;
    }
}

function drawSnapshotFallback(context, meta, width, height) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#111827";
    context.fillRect(0, 0, width, height);
    drawCenteredText(context, meta?.name || "video", width, height);
}

function createFallbackSnapshot(meta, size) {
    const fallback = document.createElement("canvas");
    fallback.width = Math.max(1, Math.round(size.width));
    fallback.height = Math.max(1, Math.round(size.height));
    const context = fallback.getContext("2d", { willReadFrequently: true });
    drawSnapshotFallback(context, meta, fallback.width, fallback.height);
    return fallback;
}

async function createVideoSnapshot(meta) {
    const size = getSourceSize(meta);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(size.width));
    canvas.height = Math.max(1, Math.round(size.height));

    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#111827";
    context.fillRect(0, 0, canvas.width, canvas.height);

    try {
        const drewVideo = await drawFirstVideoFrame(context, canvas, meta);
        if (!drewVideo) {
            setStatus("The first video frame cannot be read by the canvas; reload the race to enable the CORS video preview.", "error");
            return createFallbackSnapshot(meta, size);
        }
    } catch {
        drawSnapshotFallback(context, meta, canvas.width, canvas.height);
    }

    return canvas;
}

function videoSnapshotKey(meta) {
    return `${selected_comp}/${selected_run}/${meta?.name || ""}`;
}

function getCachedVideoSnapshot(meta) {
    const key = videoSnapshotKey(meta);
    if (!videoSnapshotPromises.has(key)) {
        videoSnapshotPromises.set(key, createVideoSnapshot(meta));
    }
    return videoSnapshotPromises.get(key);
}

function createDefaultFlashSourcePoints(meta = activeMeta) {
    const sourceSize = getSourceSize(meta);
    const sourcePoints = Array.isArray(meta?.srcPts) ? meta.srcPts : [];
    const center = sourcePoints.length > 0
        ? {
            x: sourcePoints.reduce((sum, point) => sum + Number(point?.[0] ?? 0), 0) / sourcePoints.length,
            y: sourcePoints.reduce((sum, point) => sum + Number(point?.[1] ?? 0), 0) / sourcePoints.length
        }
        : { x: sourceSize.width / 2, y: sourceSize.height / 2 };
    const width = Math.max(24, sourceSize.width * 0.04);
    const height = Math.max(24, sourceSize.height * 0.04);

    return [
        { x: center.x - width / 2, y: center.y - height / 2 },
        { x: center.x + width / 2, y: center.y - height / 2 },
        { x: center.x + width / 2, y: center.y + height / 2 },
        { x: center.x - width / 2, y: center.y + height / 2 }
    ];
}

function addFlashConfiguration() {
    const flash = ensureFlashMetadata();
    if (!flash || !activeMeta) {
        setStatus("Load a race before adding a flash.", "empty");
        return;
    }

    const referencePoints = sourcePointsToReferenceJson(createDefaultFlashSourcePoints(activeMeta), activeMeta);
    if (referencePoints.length < 2) {
        setStatus("Video calibration is required before adding a flash.", "error");
        return;
    }

    flash.pts = referencePoints;
    window.dispatchEvent(new CustomEvent("flash-calibration-updated", {
        detail: { flash }
    }));
    renderFlashControl();
    updatePreview();
    setStatus("Flash added. Move the shape, then save.", "ready");
}

function getPoolReferenceImage() {
    const poolImage = selectedPoolImage();
    const key = poolImage.path;
    if (referenceImagePromises.has(key)) {
        return referenceImagePromises.get(key);
    }

    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
            referenceImagePromises.delete(key);
            reject(new Error(`Could not load ${poolImage.path}.`));
        };
        image.src = poolImageUrl(poolImage);
    });
    referenceImagePromises.set(key, promise);

    return promise;
}

function averagePoint(points) {
    if (!Array.isArray(points) || points.length === 0) {
        return { x: 50, y: 50 };
    }
    return {
        x: points.reduce((sum, point) => sum + Number(point.x || 0), 0) / points.length,
        y: points.reduce((sum, point) => sum + Number(point.y || 0), 0) / points.length
    };
}

function activeWorkspaceRecord() {
    return calibrationWorkspaces.find((record) => record.video === activeMeta) || calibrationWorkspaces[0] || null;
}

function applyPoolLabels() {
    const record = activeWorkspaceRecord();
    if (!record?.workspace?.controls) {
        return;
    }
    const sourceCenter = averagePoint(record.workspace.value?.sourcePoints ?? []);
    const destinationCenter = averagePoint(record.workspace.value?.destinationPoints ?? []);
    const annotation = {
        label: "pool",
        radius: 5,
        color: "#2ea3dd",
        background: "rgba(35, 33, 87, 0.88)"
    };
    record.workspace.controls.source.setAnnotations([{ ...annotation, ...sourceCenter }], { silent: true });
    record.workspace.controls.destination.setAnnotations([{ ...annotation, ...destinationCenter }], { silent: true });
}

function renderFlashControl() {
    const container = getElement("config_flash_workspace");
    if (!container || !activeSourceImage || !activeMeta) {
        clearFlashControl(false);
        return;
    }

    const flashPoints = getFlashPoints();
    const hasFlash = flashPoints.length >= 2;
    setFlashActionState(hasFlash);
    if (!hasFlash) {
        clearFlashControl();
        return;
    }

    const sourceSize = getSourceSize(activeMeta);
    const sourcePoints = referencePointsToSourcePoints(flashPoints, activeMeta);
    if (sourcePoints.length < 2) {
        clearFlashControl();
        return;
    }
    const value = sourcePoints.map((point) => sourcePointToPct(point, sourceSize));

    flashControl?.remove?.();
    flashControl = ImgCtrlPts.createImageControlPoints({
        image: activeSourceImage,
        width: CONTROL_WIDTH,
        value,
        label: false,
        mode: "drag-shape",
        interactionMode: "shape",
        pointDisplay: "dots",
        polygon: true,
        background: true,
        optimize: true,
        minPoints: value.length,
        maxPoints: value.length,
        addPointOnDoubleClick: false,
        radius: 0,
        dotRadius: 0,
        hitRadius: 14,
        ariaLabel: "Flash control points",
        theme: {
            polygon: "rgba(255, 201, 71, 0.95)",
            point: "rgba(255, 201, 71, 0.95)",
            selectedPoint: "rgba(249, 56, 56, 0.95)",
            grid: "rgba(255, 201, 71, 0.22)"
        }
    });
    flashControl.addEventListener("input", () => {
        applyFlashToMetadata();
        updatePreview();
    });
    flashControl.addEventListener("change", () => {
        applyFlashToMetadata();
        updatePreview();
    });

    container.replaceChildren(flashControl);
    setFlashActionState(true);
    applyFlashToMetadata();
}

function getActiveMetaFromPage() {
    try {
        return getMeta();
    } catch {
        return null;
    }
}

function getActiveVideoIndex(videos) {
    const currentMeta = getActiveMetaFromPage();
    const byName = videos.findIndex((video) => video === currentMeta || video.name === currentMeta?.name);
    if (byName >= 0) {
        return byName;
    }

    const currentSrc = getElement("vid")?.currentSrc || getElement("vid")?.getAttribute("src") || "";
    const bySource = videos.findIndex((video) => video.name && currentSrc.includes(video.name));
    return bySource >= 0 ? bySource : 0;
}

function syncVideoSelect(videos) {
    const select = getElement("config_video_select");
    if (!select) {
        return 0;
    }

    const hasPrevious = select.options.length > 0 && select.value !== "";
    const previous = Number(select.value);
    select.replaceChildren(...videos.map((video, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        const type = video.type_video ? `${displayVideoType(video.type_video)} - ` : "";
        option.textContent = `${type}${video.name ? displayFileLabel(video.name) : `video ${index + 1}`}`;
        return option;
    }));

    if (hasPrevious && Number.isInteger(previous) && previous >= 0 && previous < videos.length) {
        select.value = String(previous);
        return previous;
    }

    const activeIndex = getActiveVideoIndex(videos);
    select.value = String(activeIndex);
    return activeIndex;
}

function selectedVideoIndex(videos) {
    const select = getElement("config_video_select");
    const index = Number(select?.value);
    if (Number.isInteger(index) && index >= 0 && index < videos.length) {
        return index;
    }
    return syncVideoSelect(videos);
}

function videosForCalibration(videos) {
    if (!Array.isArray(videos) || videos.length <= 1) {
        return videos || [];
    }
    const sideVideos = videos.filter((video) => {
        const type = String(video?.type_video || video?.name || "").toLowerCase();
        return type.includes("fixegauche") || type.includes("fixedroite");
    });
    return sideVideos.length >= 2 ? sideVideos : videos;
}

function clearCalibrationWorkspaces(container) {
    for (const record of calibrationWorkspaces) {
        record.workspace?.remove?.();
        record.element?.remove?.();
    }
    calibrationWorkspaces = [];
    workspace?.remove?.();
    workspace = null;
    activeSourceImage = null;
    if (container) {
        container.replaceChildren();
    }
}

function extractCalibrationValue(record = activeWorkspaceRecord()) {
    const value = record?.workspace?.value;
    if (!value) {
        return null;
    }

    const pointCount = Math.min(value.sourcePointsPx.length, value.destinationPointsPx.length);
    return {
        pointCount,
        srcPts: pointsToArrays(value.sourcePointsPx.slice(0, pointCount)),
        destPts: value.destinationPointsPx.slice(0, pointCount).map((point) => referencePointToJson(point, activeReferenceSize)),
        poolImage: activePoolImage?.path || DEFAULT_POOL_IMAGE.path,
        homography: value.homography?.map((row) => row.map((number) => roundCoordinate(number))) ?? null
    };
}

function workspaceInputFromMeta(meta) {
    const sourceSize = getSourceSize(meta);
    const sourcePoints = meta.srcPts.map((point) => sourcePointToPct(point, sourceSize));
    const destinationPointMapper = destinationPointsLookMetric(meta.destPts)
        ? metricDestinationPointToReferencePx
        : destinationPointToReferencePx;
    const destinationPoints = meta.destPts
        .map((point) => destinationPointMapper(point, activeReferenceSize))
        .map((point) => referencePointToPct(point, activeReferenceSize));
    return { sourcePoints, destinationPoints };
}

function videoCalibrationTitle(video, index) {
    const type = video.type_video ? `${displayVideoType(video.type_video)} - ` : "";
    return `${type}${video.name ? displayFileLabel(video.name) : `video ${index + 1}`}`;
}

async function createCalibrationWorkspaceRecord(video, index) {
    const sourceImage = await getCachedVideoSnapshot(video);
    const { sourcePoints, destinationPoints } = workspaceInputFromMeta(video);
    const wrapper = document.createElement("section");
    wrapper.className = "video-calibration-item";
    wrapper.dataset.active = video === activeMeta ? "true" : "false";

    const title = document.createElement("h3");
    title.textContent = videoCalibrationTitle(video, index);

    const itemWorkspace = ImgCtrlPts.createWarpingWorkspace({
        sourceImage,
        referenceImage: activeReferenceImage,
        width: CONTROL_WIDTH,
        columns: "repeat(2, minmax(360px, 1fr))",
        gap: "16px",
        sourcePoints,
        destinationPoints,
        alpha: 0.64,
        background: true,
        optimize: true,
        minPoints: 4,
        maxPoints: 8,
        label: true,
        theme: {
            polygon: video === activeMeta ? "rgba(46, 163, 221, 0.95)" : "rgba(61, 137, 94, 0.95)",
            point: video === activeMeta ? "rgba(46, 163, 221, 0.95)" : "rgba(61, 137, 94, 0.95)",
            selectedPoint: "rgba(249, 56, 56, 0.95)",
            grid: video === activeMeta ? "rgba(46, 163, 221, 0.22)" : "rgba(61, 137, 94, 0.22)"
        }
    });
    itemWorkspace.classList.add("video-calibration-workspace");
    itemWorkspace.controls?.warped?.parentElement?.remove();
    itemWorkspace.addEventListener("input", schedulePreviewUpdate);
    itemWorkspace.addEventListener("change", schedulePreviewUpdate);
    wrapper.append(title, itemWorkspace);
    return { video, workspace: itemWorkspace, sourceImage, element: wrapper };
}

function applyCalibrationToMetadata(calibration, meta = activeMeta) {
    if (!calibration || !meta) {
        return;
    }

    meta.srcPts = calibration.srcPts;
    meta.destPts = calibration.destPts;
    if (megaData?.[0]) {
        megaData[0].poolImage = calibration.poolImage;
    }

    refreshVideoSurface(getActiveMetaFromPage());
    window.dispatchEvent(new CustomEvent("pool-calibration-updated", {
        detail: { meta, poolImage: calibration.poolImage }
    }));
}

function applyVisibleCalibrationsToMetadata() {
    for (const record of calibrationWorkspaces) {
        const calibration = extractCalibrationValue(record);
        if (calibration) {
            applyCalibrationToMetadata(calibration, record.video);
        }
    }
}

function drawWarpResult(canvas, sourceImage, points, alpha = 0.6) {
    if (!canvas || !points || !sourceImage || !activeReferenceImage) {
        return;
    }

    const referenceSize = activeReferenceSize ?? getImageSize(activeReferenceImage);
    if (points.pointCount < 4) {
        const context = canvas.getContext("2d");
        canvas.width = referenceSize.width;
        canvas.height = referenceSize.height;
        context.drawImage(activeReferenceImage, 0, 0, canvas.width, canvas.height);
        return;
    }

    try {
        ImgCtrlPts.warpImageToCanvas({
            sourceImage,
            referenceImage: activeReferenceImage,
            destinationSize: referenceSize,
            sourcePoints: points.sourcePointsPx,
            destinationPoints: points.destinationPointsPx,
            canvas,
            width: CONTROL_WIDTH,
            alpha,
            optimize: true,
            sampling: "nearest"
        });
    } catch (error) {
        setStatus(`Warping unavailable: ${error.message}`, "error");
    }
}

function renderWarpResult() {
    const canvas = getElement("config_warp_result");
    const record = activeWorkspaceRecord();
    const value = record?.workspace?.value;
    if (!canvas || !value || !record.sourceImage || !activeReferenceImage) {
        return;
    }

    const pointCount = Math.min(value.sourcePointsPx.length, value.destinationPointsPx.length);
    drawWarpResult(canvas, record.sourceImage, {
        pointCount,
        sourcePointsPx: value.sourcePointsPx.slice(0, pointCount),
        destinationPointsPx: value.destinationPointsPx.slice(0, pointCount)
    });
}

function snapshotCanvasFromImage(image, size) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(size.width));
    canvas.height = Math.max(1, Math.round(size.height));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
}

function blendChangedPixels(targetContext, targetImageData, referenceImageData, warpedImageData, opacity = 0.72) {
    const target = targetImageData.data;
    const reference = referenceImageData.data;
    const warped = warpedImageData.data;
    for (let index = 0; index < target.length; index += 4) {
        const difference = Math.abs(warped[index] - reference[index])
            + Math.abs(warped[index + 1] - reference[index + 1])
            + Math.abs(warped[index + 2] - reference[index + 2]);
        if (difference < 18) {
            continue;
        }
        target[index] = Math.round(target[index] * (1 - opacity) + warped[index] * opacity);
        target[index + 1] = Math.round(target[index + 1] * (1 - opacity) + warped[index + 1] * opacity);
        target[index + 2] = Math.round(target[index + 2] * (1 - opacity) + warped[index + 2] * opacity);
        target[index + 3] = 255;
    }
    targetContext.putImageData(targetImageData, 0, 0);
}

function drawMergedWarpResult() {
    const canvas = getElement("config_warp_result");
    if (!canvas || !activeReferenceImage) {
        return;
    }

    const records = calibrationWorkspaces.filter((record) => record?.workspace?.value && record.sourceImage);
    if (records.length === 0) {
        return;
    }

    if (records.length === 1) {
        renderWarpResult();
        return;
    }

    const referenceSize = activeReferenceSize ?? getImageSize(activeReferenceImage);
    canvas.width = referenceSize.width;
    canvas.height = referenceSize.height;
    canvas.style.width = `${CONTROL_WIDTH}px`;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(activeReferenceImage, 0, 0, canvas.width, canvas.height);

    const referenceCanvas = snapshotCanvasFromImage(activeReferenceImage, referenceSize);
    const referenceImageData = referenceCanvas.getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height);

    for (const record of records) {
        const value = record.workspace.value;
        const pointCount = Math.min(value.sourcePointsPx.length, value.destinationPointsPx.length);
        if (pointCount < 4) {
            continue;
        }

        const offscreen = document.createElement("canvas");
        drawWarpResult(offscreen, record.sourceImage, {
            pointCount,
            sourcePointsPx: value.sourcePointsPx.slice(0, pointCount),
            destinationPointsPx: value.destinationPointsPx.slice(0, pointCount)
        }, 0.78);
        const targetImageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const warpedImageData = offscreen.getContext("2d", { willReadFrequently: true })
            .getImageData(0, 0, canvas.width, canvas.height);
        blendChangedPixels(context, targetImageData, referenceImageData, warpedImageData);
    }
}

function updatePreview() {
    const preview = getElement("config_json_preview");
    const calibration = extractCalibrationValue();
    if (!preview || !calibration || !activeMeta) {
        return;
    }

    applyVisibleCalibrationsToMetadata();
    preview.textContent = JSON.stringify({
        selectedVideo: activeMeta.name,
        poolImage: calibration.poolImage,
        videos: (megaData?.[0]?.videos || []).map((video) => ({
            name: video.name,
            type_video: video.type_video,
            srcPts: video.srcPts,
            destPts: video.destPts
        })),
        flash: megaData?.[0]?.flash ?? null,
        homography: calibration.homography
    }, null, 2);

    applyPoolLabels();
    drawMergedWarpResult();
}

function schedulePreviewUpdate() {
    if (updateFrame != null) {
        return;
    }
    updateFrame = scheduleFrame(() => {
        updateFrame = null;
        updatePreview();
    });
}

async function renderConfiguration() {
    const container = getElement("config_warp_workspace");
    if (!container) {
        return;
    }

    const metadata = megaData?.[0];
    const videos = Array.isArray(metadata?.videos) ? metadata.videos : [];
    if (!metadata || videos.length === 0) {
        clearCalibrationWorkspaces(container);
        clearFlashControl();
        const preview = getElement("config_json_preview");
        if (preview) {
            preview.textContent = "";
        }
        setStatus("Load a race to show video configuration.", "empty");
        return;
    }

    await loadPoolImages();
    syncPoolImageSelect(metadata);
    selectedPoolImage();
    syncVideoSelect(videos);
    activeMeta = videos[selectedVideoIndex(videos)];
    if (!activeMeta?.srcPts || !activeMeta?.destPts) {
        clearCalibrationWorkspaces(container);
        clearFlashControl();
        const preview = getElement("config_json_preview");
        if (preview) {
            preview.textContent = "";
        }
        setStatus("This video does not contain calibration points.", "error");
        return;
    }

    setStatus("Loading the reference pool image...", "ready");

    try {
        activeReferenceImage = await getPoolReferenceImage();
        activeReferenceSize = getImageSize(activeReferenceImage);
    } catch (error) {
        clearCalibrationWorkspaces(container);
        clearFlashControl();
        setStatus(error.message, "error");
        return;
    }

    clearCalibrationWorkspaces(container);
    const calibrationVideos = videosForCalibration(videos).filter((video) => video?.srcPts && video?.destPts);
    calibrationWorkspaces = await Promise.all(calibrationVideos.map(createCalibrationWorkspaceRecord));
    const activeRecord = activeWorkspaceRecord();
    if (activeRecord && activeRecord.video !== activeMeta) {
        activeMeta = activeRecord.video;
    }
    for (const record of calibrationWorkspaces) {
        record.element.dataset.active = record.video === activeMeta ? "true" : "false";
    }
    workspace = activeRecord?.workspace || null;
    activeSourceImage = activeRecord?.sourceImage || null;
    container.replaceChildren(...calibrationWorkspaces.map((record) => record.element));
    renderFlashControl();

    const statusMessage = calibrationWorkspaces.length > 1
        ? "Left and right calibrations are visible. The result merges the calibrated videos."
        : currentVideoMatches(activeMeta)
            ? "Current video image used for calibration."
            : "The selected video is not the current image; points remain editable.";
    setStatus(statusMessage, "ready");
    updatePreview();
}

async function saveConfiguration() {
    if (calibrationWorkspaces.length === 0 || !activeMeta) {
        await renderConfiguration();
    }

    const invalidRecord = calibrationWorkspaces.find((record) => {
        const calibration = extractCalibrationValue(record);
        return !calibration || calibration.pointCount < 4;
    });
    if (invalidRecord) {
        setStatus("At least 4 point pairs are required.", "error");
        return;
    }

    applyVisibleCalibrationsToMetadata();
    updatePreview();

    try {
        const payload = await writeMetadataToJson();
        setStatus(`Coordinates saved: ${payload.path}`, "saved");
    } catch (error) {
        setStatus(`Coordinates updated in memory, but JSON could not be written: ${error.message}`, "error");
    }
}

async function writeMetadataToJson() {
    if (!canWriteMetadata()) {
        throw new Error("static mode: no server write is available");
    }

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

    return response.json();
}

async function saveFlashConfiguration() {
    if (getFlashPoints().length < 2) {
        setStatus("No flash to save for this race.", "empty");
        return;
    }

    if (!flashControl) {
        await renderConfiguration();
    }

    applyFlashToMetadata();
    updatePreview();

    try {
        const payload = await writeMetadataToJson();
        setStatus(`Flash saved: ${payload.path}`, "saved");
    } catch (error) {
        setStatus(`Flash updated in memory, but JSON could not be written: ${error.message}`, "error");
    }
}

function bindControls() {
    getElement("config_refresh")?.addEventListener("click", renderConfiguration);
    getElement("config_save")?.addEventListener("click", saveConfiguration);
    getElement("config_flash_add")?.addEventListener("click", addFlashConfiguration);
    getElement("config_flash_save")?.addEventListener("click", saveFlashConfiguration);
    getElement("config_video_select")?.addEventListener("change", renderConfiguration);
    getElement("config_pool_select")?.addEventListener("change", renderConfiguration);
    window.addEventListener("calibration-view-opened", renderConfiguration);

    for (const buttonId of ["config_save", "config_flash_save"]) {
        const button = getElement(buttonId);
        if (button) {
            button.disabled = !canWriteMetadata();
            button.title = canWriteMetadata()
                ? ""
                : "Static mode: JSON writing is unavailable.";
        }
    }
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindControls);
} else {
    bindControls();
}
