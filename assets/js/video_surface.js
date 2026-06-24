import ImgCtrlPts from "./vendor/ImgCtrlPts.js";
import { poolPointToVideoPoint } from "./pool_geometry.js";

const SURFACE_ID = "imgctrlpts-video-surface";
const MAX_ZOOM = 6.8;

let control = null;
let currentMeta = null;
let transparentImage = null;
let poolControlsVisible = false;
let laneOverlayVisible = false;
let laneOverlay = null;
let laneOverlayOptions = {
    laneCount: 1,
    labels: [],
    poolSize: [50, 20]
};
let resizeObserver = null;
let scaleZoom = 1;
let panLeft = 0;
let panTop = 0;

function positiveNumber(...values) {
    for (const value of values) {
        const number = Number(value);
        if (Number.isFinite(number) && number > 0) {
            return number;
        }
    }
    return NaN;
}

function getContainer() {
    return document.getElementById("video");
}

function getVideoElement() {
    return document.getElementById("vid");
}

function resolveSourceSize(meta = currentMeta, videoElement = getVideoElement()) {
    return {
        width: positiveNumber(meta?.width, videoElement?.videoWidth, videoElement?.width, videoElement?.offsetWidth),
        height: positiveNumber(meta?.height, videoElement?.videoHeight, videoElement?.height, videoElement?.offsetHeight)
    };
}

function resolveViewSize(container = getContainer()) {
    return {
        width: positiveNumber(container?.clientWidth, container?.offsetWidth),
        height: positiveNumber(container?.clientHeight, container?.offsetHeight)
    };
}

function canUseVideoImage(meta = currentMeta, videoElement = getVideoElement()) {
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

function getPoolControlPoints(meta = currentMeta) {
    const size = resolveSourceSize(meta);
    if (!meta?.srcPts || meta.srcPts.length === 0 || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
        return [];
    }

    return meta.srcPts.map(([x, y]) => ({
        x: (Number(x) / size.width) * 100,
        y: (Number(y) / size.height) * 100
    }));
}

export function getVideoDisplayTransform(meta = currentMeta) {
    const videoElement = getVideoElement();
    const size = resolveSourceSize(meta, videoElement);

    if (!videoElement || !Number.isFinite(size.width) || !Number.isFinite(size.height)) {
        return null;
    }

    const displayWidth = positiveNumber(videoElement.clientWidth, videoElement.offsetWidth);
    const displayHeight = positiveNumber(videoElement.clientHeight, videoElement.offsetHeight);

    if (displayWidth <= 0 || displayHeight <= 0) {
        return null;
    }

    const sourceRatio = size.width / size.height;
    const displayRatio = displayWidth / displayHeight;
    let contentWidth = displayWidth;
    let contentHeight = displayHeight;
    let contentLeft = Number(videoElement.offsetLeft || 0);
    let contentTop = Number(videoElement.offsetTop || 0);

    if (displayRatio > sourceRatio) {
        contentWidth = displayHeight * sourceRatio;
        contentLeft += (displayWidth - contentWidth) / 2;
    } else if (displayRatio < sourceRatio) {
        contentHeight = displayWidth / sourceRatio;
        contentTop += (displayHeight - contentHeight) / 2;
    }

    return {
        k: contentWidth / size.width,
        x: contentLeft,
        y: contentTop
    };
}

function sourcePointToDisplay(point, meta = currentMeta) {
    const transform = getVideoDisplayTransform(meta);
    if (!transform || !Array.isArray(point)) {
        return null;
    }

    return {
        x: transform.x + Number(point[0]) * transform.k,
        y: transform.y + Number(point[1]) * transform.k
    };
}

function ensureLaneOverlay() {
    const container = getContainer();
    if (!container) {
        return null;
    }

    if (!laneOverlay) {
        laneOverlay = document.createElement("canvas");
        laneOverlay.id = "pool-lane-overlay";
        laneOverlay.className = "pool-lane-overlay";
        laneOverlay.style.position = "absolute";
        laneOverlay.style.inset = "0";
        laneOverlay.style.width = "100%";
        laneOverlay.style.height = "100%";
        laneOverlay.style.pointerEvents = "none";
        laneOverlay.style.zIndex = "999";
    }

    if (laneOverlay.parentElement !== container) {
        container.append(laneOverlay);
    }

    return laneOverlay;
}

function drawPoolLaneOverlay() {
    if (!laneOverlayVisible || !currentMeta) {
        laneOverlay?.remove();
        laneOverlay = null;
        return;
    }

    const container = getContainer();
    const canvas = ensureLaneOverlay();
    if (!container || !canvas || container.clientWidth <= 0 || container.clientHeight <= 0) {
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(container.clientWidth));
    const height = Math.max(1, Math.round(container.clientHeight));
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const poolSize = laneOverlayOptions.poolSize || [50, 20];
    const poolLength = Number(poolSize[0]) || 50;
    const poolWidth = Number(poolSize[1]) || 20;
    const laneCount = Math.max(1, Math.round(Number(laneOverlayOptions.laneCount) || 1));
    const laneHeight = poolWidth / laneCount;

    context.save();
    context.lineWidth = 2;
    context.strokeStyle = "rgba(255, 166, 0, 0.95)";
    context.font = "600 13px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let i = 0; i <= laneCount; i += 1) {
        const y = i * laneHeight;
        const start = sourcePointToDisplay(poolPointToVideoPoint([0, y], poolSize, currentMeta), currentMeta);
        const end = sourcePointToDisplay(poolPointToVideoPoint([poolLength, y], poolSize, currentMeta), currentMeta);
        if (!start || !end) {
            continue;
        }
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
    }

    const corners = [
        [0, 0],
        [0, poolWidth],
        [poolLength, poolWidth],
        [poolLength, 0]
    ].map((point) => sourcePointToDisplay(poolPointToVideoPoint(point, poolSize, currentMeta), currentMeta));

    if (corners.every(Boolean)) {
        context.beginPath();
        context.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i += 1) {
            context.lineTo(corners[i].x, corners[i].y);
        }
        context.closePath();
        context.stroke();
    }

    for (const item of laneOverlayOptions.labels || []) {
        const laneIndex = Math.max(0, Math.min(Number(item.laneIndex) || 0, laneCount - 1));
        const center = sourcePointToDisplay(
            poolPointToVideoPoint([poolLength * 0.5, (laneIndex + 0.5) * laneHeight], poolSize, currentMeta),
            currentMeta
        );
        if (!center) {
            continue;
        }

        const text = String(item.label ?? "");
        const metrics = context.measureText(text);
        const boxWidth = metrics.width + 12;
        const boxHeight = 20;
        context.fillStyle = "rgba(255, 255, 255, 0.78)";
        context.fillRect(center.x - boxWidth / 2, center.y - boxHeight / 2, boxWidth, boxHeight);
        context.fillStyle = "rgba(35, 33, 87, 0.92)";
        context.fillText(text, center.x, center.y);
    }

    context.restore();
}

function syncPoolSurfaceTransform() {
    if (!control) {
        drawPoolLaneOverlay();
        return;
    }

    const transform = getVideoDisplayTransform();
    if (transform) {
        control.setTransform(transform, { silent: true });
    } else {
        control.redraw();
    }
    drawPoolLaneOverlay();
}

function applyContainerTransform() {
    const container = getContainer();
    if (!container) {
        return;
    }

    container.style.left = `${panLeft}px`;
    container.style.top = `${panTop}px`;
    container.style.transform = `scale(${scaleZoom})`;
    syncPoolSurfaceTransform();
}

function createPoolSurface(meta = currentMeta) {
    const container = getContainer();
    const sourceSize = resolveSourceSize(meta);
    const viewSize = resolveViewSize(container);

    if (
        !container ||
        !meta ||
        !Number.isFinite(sourceSize.width) ||
        !Number.isFinite(sourceSize.height) ||
        !Number.isFinite(viewSize.width) ||
        !Number.isFinite(viewSize.height)
    ) {
        return null;
    }

    currentMeta = meta;

    if (control) {
        control.stopAnimation?.();
        control.remove();
        control = null;
    }

    const videoElement = getVideoElement();
    const useVideoBackground = poolControlsVisible && canUseVideoImage(meta, videoElement);

    control = ImgCtrlPts.createImageControlPoints({
        image: useVideoBackground ? videoElement : ensureTransparentImage(sourceSize),
        width: viewSize.width,
        height: viewSize.height,
        value: poolControlsVisible ? getPoolControlPoints(meta) : [],
        zoom: false,
        animate: useVideoBackground,
        label: false,
        polygon: true,
        mask: false,
        background: useVideoBackground,
        padding: 0,
        radius: 7,
        hitRadius: 11,
        minPoints: 0,
        maxPoints: 4,
        clampToImage: false,
        addPointOnDoubleClick: false,
        ariaLabel: "Video pool boundary surface",
        theme: {
            polygon: "rgba(46, 163, 221, 0.95)",
            point: "rgba(46, 163, 221, 0.95)",
            selectedPoint: "rgba(249, 56, 56, 0.95)",
            background: null,
            grid: "rgba(46, 163, 221, 0)"
        }
    });

    control.id = SURFACE_ID;
    control.dataset.videoBackground = String(useVideoBackground);
    control.classList.add("imgctrlpts-pool-surface");
    control.style.position = "absolute";
    control.style.inset = "0";
    control.style.width = "100%";
    control.style.height = "100%";
    control.style.zIndex = "998";
    control.style.pointerEvents = "none";
    container.classList.add("imgctrlpts-pool-enabled");
    container.append(control);

    syncPoolSurfaceTransform();

    if (!resizeObserver && typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
            if (!currentMeta) {
                return;
            }
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(() => refreshVideoSurface(currentMeta));
            } else {
                refreshVideoSurface(currentMeta);
            }
        });
        resizeObserver.observe(container);
    }

    return control;
}

export function refreshVideoSurface(meta = currentMeta) {
    currentMeta = meta ?? currentMeta;
    const surface = createPoolSurface(currentMeta);
    drawPoolLaneOverlay();
    return surface;
}

export function redrawVideoSurface() {
    if (
        poolControlsVisible &&
        currentMeta &&
        control?.dataset.videoBackground !== "true" &&
        canUseVideoImage(currentMeta)
    ) {
        createPoolSurface(currentMeta);
        return;
    }
    syncPoolSurfaceTransform();
    control?.redraw();
    drawPoolLaneOverlay();
}

export function setPoolControlsVisible(visible, meta = currentMeta) {
    poolControlsVisible = Boolean(visible);
    currentMeta = meta ?? currentMeta;

    createPoolSurface(currentMeta);

    if (!control) {
        return;
    }

    control.setValue(poolControlsVisible ? getPoolControlPoints(currentMeta) : [], { silent: true });
    syncPoolSurfaceTransform();
}

export function setPoolLaneOverlayVisible(visible, meta = currentMeta, options = {}) {
    laneOverlayVisible = Boolean(visible);
    currentMeta = meta ?? currentMeta;
    laneOverlayOptions = {
        ...laneOverlayOptions,
        ...options
    };
    drawPoolLaneOverlay();
}

export function moveVideoSurfaceTo(x, y) {
    panLeft = Number.isFinite(Number(x)) ? Number(x) : panLeft;
    panTop = Number.isFinite(Number(y)) ? Number(y) : panTop;
    applyContainerTransform();
}

export function zoomVideoSurface(deltaZoom, center = null) {
    const nextScaleZoom = Math.min(Math.max(1, scaleZoom + Number(deltaZoom || 0)), MAX_ZOOM);
    const container = getContainer();

    if (center && container) {
        panLeft -= Number(center.x || 0) * (1 - scaleZoom / nextScaleZoom);
        panTop -= Number(center.y || 0) * (1 - scaleZoom / nextScaleZoom);
    }

    scaleZoom = nextScaleZoom;
    applyContainerTransform();
    return scaleZoom;
}

export function resetVideoSurfaceTransform() {
    panLeft = 0;
    panTop = 0;
    scaleZoom = 1;
    applyContainerTransform();
}

export function getVideoSurfaceZoomRatio() {
    return scaleZoom;
}
