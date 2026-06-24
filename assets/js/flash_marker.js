import ImgCtrlPts from "./vendor/ImgCtrlPts.js";
import { megaData } from "./loader.js";
import { getMeta } from "./utils.js";
import { getVideoDisplayTransform } from "./video_surface.js";

const SURFACE_ID = "flash_marker_overlay";

let control = null;
let currentMeta = null;
let transparentImage = null;
let showFlashMarker = false;
let redrawFrame = null;
let updatingFromControl = false;

function getElement(id) {
    return document.getElementById(id);
}

function positiveNumber(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
            return number;
        }
    }
    return NaN;
}

function roundCoordinate(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const rounded = Number(value.toFixed(2));
    return Number.isInteger(rounded) ? Math.trunc(rounded) : rounded;
}

function resolveSourceSize(meta = currentMeta) {
    const videoElement = getElement("vid");
    return {
        width: positiveNumber(meta?.width, videoElement?.videoWidth, videoElement?.width, videoElement?.offsetWidth),
        height: positiveNumber(meta?.height, videoElement?.videoHeight, videoElement?.height, videoElement?.offsetHeight)
    };
}

function resolveViewSize(container = getElement("video")) {
    return {
        width: positiveNumber(container?.clientWidth, container?.offsetWidth),
        height: positiveNumber(container?.clientHeight, container?.offsetHeight)
    };
}

function canUseVideoBackground(meta = currentMeta) {
    const videoElement = getElement("vid");
    const source = videoElement?.currentSrc || videoElement?.getAttribute("src") || "";
    return Boolean(
        videoElement &&
        videoElement.readyState >= 2 &&
        (!meta?.name || source.includes(meta.name)) &&
        positiveNumber(videoElement.videoWidth, videoElement.width) > 0 &&
        positiveNumber(videoElement.videoHeight, videoElement.height) > 0
    );
}

function ensureTransparentImage(size) {
    if (
        transparentImage &&
        transparentImage.width === Math.round(size.width) &&
        transparentImage.height === Math.round(size.height)
    ) {
        return transparentImage;
    }

    transparentImage = document.createElement("canvas");
    transparentImage.width = Math.max(1, Math.round(size.width));
    transparentImage.height = Math.max(1, Math.round(size.height));
    return transparentImage;
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

function getFlashReferencePoints(metadata = megaData?.[0]) {
    const points = metadata?.flash?.pts ?? metadata?.flashPts ?? metadata?.flash_points;
    if (!Array.isArray(points)) {
        return [];
    }
    return points.map(normalizePoint).filter(Boolean);
}

function canTransformFlash(meta = currentMeta) {
    const sourcePoints = Array.isArray(meta?.srcPts) ? meta.srcPts : [];
    const destinationPoints = Array.isArray(meta?.destPts) ? meta.destPts : [];
    return Boolean(window.PerspT) && Math.min(sourcePoints.length, destinationPoints.length) >= 4;
}

function createPerspective(meta, fromReference = true) {
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

function mapReferencePointsToSource(points, meta) {
    const perspective = createPerspective(meta, true);
    if (!perspective) {
        return [];
    }

    try {
        return points.map((point) => {
            const [x, y] = perspective.transform(point.x, point.y);
            return { x: Number(x), y: Number(y) };
        }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    } catch {
        return [];
    }
}

function mapSourcePointsToReference(points, meta) {
    const perspective = createPerspective(meta, false);
    if (!perspective) {
        return [];
    }

    try {
        return points.map((point) => {
            const [x, y] = perspective.transform(point.x, point.y);
            return [roundCoordinate(Number(x)), roundCoordinate(Number(y))];
        }).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    } catch {
        return [];
    }
}

function sourcePointToPct(point, size) {
    return {
        x: Number(point.x) * 100 / size.width,
        y: Number(point.y) * 100 / size.height
    };
}

function pctPointToSource(point, size) {
    return {
        x: Number(point.x) * size.width / 100,
        y: Number(point.y) * size.height / 100
    };
}

function hasDisplayableFlash(meta = currentMeta) {
    return getFlashReferencePoints().length >= 2 && canTransformFlash(meta);
}

function setFlashToggleState(hasFlash) {
    const toggle = getElement("show_flash_marker");
    const wrapper = toggle?.closest(".checkbox-option");
    if (!toggle) {
        return;
    }

    toggle.disabled = !hasFlash;
    wrapper?.classList.toggle("is-disabled", !hasFlash);
    if (!hasFlash) {
        toggle.checked = false;
        showFlashMarker = false;
    }
}

function removeFlashControl() {
    control?.stopAnimation?.();
    control?.remove?.();
    control = null;
}

function syncFlashControlTransform() {
    if (!control) {
        return;
    }

    const transform = getVideoDisplayTransform(currentMeta);
    if (transform) {
        control.setTransform(transform, { silent: true });
    } else {
        control.redraw?.();
    }
}

function updateFlashMetadataFromControl() {
    if (!control || !currentMeta || updatingFromControl) {
        return;
    }

    const metadata = megaData?.[0];
    if (!metadata?.flash || typeof metadata.flash !== "object" || Array.isArray(metadata.flash)) {
        return;
    }

    const sourceSize = resolveSourceSize(currentMeta);
    if (!Number.isFinite(sourceSize.width) || !Number.isFinite(sourceSize.height)) {
        return;
    }

    const sourcePoints = control.value.map((point) => pctPointToSource(point, sourceSize));
    const referencePoints = mapSourcePointsToReference(sourcePoints, currentMeta);
    if (referencePoints.length < 2) {
        return;
    }

    updatingFromControl = true;
    metadata.flash.pts = referencePoints;
    window.dispatchEvent(new CustomEvent("flash-calibration-updated", {
        detail: { flash: metadata.flash, source: "annotate" }
    }));
    updatingFromControl = false;
}

function createFlashControl(meta, sourcePoints, sourceSize, viewSize) {
    const container = getElement("video");
    const videoElement = getElement("vid");
    const useVideoBackground = canUseVideoBackground(meta);
    const value = sourcePoints.map((point) => sourcePointToPct(point, sourceSize));
    const pointCount = value.length;

    removeFlashControl();
    control = ImgCtrlPts.createImageControlPoints({
        image: useVideoBackground ? videoElement : ensureTransparentImage(sourceSize),
        width: viewSize.width,
        height: viewSize.height,
        value,
        zoom: false,
        animate: useVideoBackground,
        label: false,
        locked: true,
        readonly: true,
        pointDisplay: "dots",
        polygon: true,
        mask: false,
        background: false,
        padding: 0,
        radius: 0,
        dotRadius: 0,
        hitRadius: 0,
        minPoints: pointCount,
        maxPoints: pointCount,
        clampToImage: false,
        addPointOnDoubleClick: false,
        ariaLabel: "Flash marker",
        theme: {
            polygon: "rgba(255, 201, 71, 0.98)",
            point: "rgba(255, 201, 71, 0.98)",
            selectedPoint: "rgba(249, 56, 56, 0.95)",
            background: null,
            grid: "rgba(255, 201, 71, 0)"
        }
    });

    control.id = SURFACE_ID;
    control.dataset.pointCount = String(pointCount);
    control.dataset.videoBackground = String(useVideoBackground);
    control.classList.add("flash-marker-overlay");
    control.style.position = "absolute";
    control.style.inset = "0";
    control.style.width = "100%";
    control.style.height = "100%";
    control.style.zIndex = "1000";
    control.style.pointerEvents = "none";

    container.append(control);
    syncFlashControlTransform();
}

export function renderFlashMarker() {
    const annotateView = getElement("annotate_view");
    const container = getElement("video");
    let meta = null;
    try {
        meta = getMeta();
    } catch {
        setFlashToggleState(false);
        removeFlashControl();
        return;
    }

    currentMeta = meta;
    const hasFlash = hasDisplayableFlash(meta);
    setFlashToggleState(hasFlash);

    if (!showFlashMarker || !hasFlash || annotateView?.hidden || !container || container.offsetWidth <= 0 || container.offsetHeight <= 0) {
        removeFlashControl();
        return;
    }

    const sourceSize = resolveSourceSize(meta);
    const viewSize = resolveViewSize(container);
    if (
        !Number.isFinite(sourceSize.width) ||
        !Number.isFinite(sourceSize.height) ||
        !Number.isFinite(viewSize.width) ||
        !Number.isFinite(viewSize.height)
    ) {
        removeFlashControl();
        return;
    }

    const sourcePoints = mapReferencePointsToSource(getFlashReferencePoints(), meta);
    if (sourcePoints.length < 2) {
        removeFlashControl();
        return;
    }

    const value = sourcePoints.map((point) => sourcePointToPct(point, sourceSize));
    const useVideoBackground = canUseVideoBackground(meta);
    if (
        !control ||
        control.dataset.pointCount !== String(value.length) ||
        control.dataset.videoBackground !== String(useVideoBackground)
    ) {
        createFlashControl(meta, sourcePoints, sourceSize, viewSize);
        return;
    }

    if (!updatingFromControl) {
        control.setValue(value, { silent: true });
    }
    syncFlashControlTransform();
}

function scheduleFlashMarkerRender(event) {
    if (updatingFromControl || event?.detail?.source === "annotate") {
        return;
    }
    if (redrawFrame != null) {
        return;
    }
    const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => setTimeout(callback, 0);
    redrawFrame = schedule(() => {
        redrawFrame = null;
        renderFlashMarker();
    });
}

function setFlashMarkerVisible(visible) {
    showFlashMarker = Boolean(visible);
    renderFlashMarker();
}

function bindFlashMarker() {
    const toggle = getElement("show_flash_marker");
    showFlashMarker = Boolean(toggle?.checked);
    toggle?.addEventListener("change", (event) => setFlashMarkerVisible(event.target.checked));

    const delayedRefresh = () => {
        scheduleFlashMarkerRender();
        setTimeout(renderFlashMarker, 350);
        setTimeout(renderFlashMarker, 900);
    };

    getElement("loadbtn")?.addEventListener("click", delayedRefresh);
    for (const id of ["competition", "run_part1", "run_part2", "run_part3", "run_part4"]) {
        getElement(id)?.addEventListener("change", delayedRefresh);
    }

    getElement("vid")?.addEventListener("loadedmetadata", scheduleFlashMarkerRender);
    getElement("vid")?.addEventListener("loadeddata", scheduleFlashMarkerRender);
    getElement("vid")?.addEventListener("canplay", scheduleFlashMarkerRender);
    getElement("vid")?.addEventListener("loadstart", () => {
        removeFlashControl();
        scheduleFlashMarkerRender();
    });
    window.addEventListener("resize", scheduleFlashMarkerRender);
    window.addEventListener("workspace-layout-changed", scheduleFlashMarkerRender);
    window.addEventListener("pool-calibration-updated", scheduleFlashMarkerRender);
    window.addEventListener("flash-calibration-updated", scheduleFlashMarkerRender);
    window.addEventListener("metadata-updated", scheduleFlashMarkerRender);
    renderFlashMarker();
}

if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", bindFlashMarker);
} else {
    bindFlashMarker();
}
