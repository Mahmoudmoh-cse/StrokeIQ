const DEFAULT_POINTS = [
  { x: 20, y: 10 },
  { x: 80, y: 10 },
  { x: 95, y: 90 },
  { x: 5, y: 90 }
];

const DEFAULT_DESTINATION_POINTS = [
  { x: 8, y: 88 },
  { x: 92, y: 88 },
  { x: 92, y: 12 },
  { x: 8, y: 12 }
];

const DEFAULT_THEME = {
  imageOverlay: "rgba(255, 255, 255, 0.38)",
  polygon: "#111827",
  point: "#111827",
  selectedPoint: "#dc2626",
  pointLabel: "#ffffff",
  tooltipFill: "rgba(17, 24, 39, 0.92)",
  tooltipText: "#ffffff",
  annotationFill: "rgba(17, 24, 39, 0.84)",
  annotationText: "#ffffff",
  grid: "rgba(0, 145, 201, 0.42)",
  background: "#ffffff"
};

export function createImageControlPoints(config = {}) {
  assertBrowser("createImageControlPoints");

  if (config.image == null) {
    throw new Error("ImgCtrlPts requires an image.");
  }

  const image = config.image;
  const imageSize = imageSizeFrom(image);
  const viewWidth = finiteOr(config.width, Math.min(imageSize.width, 760));
  const viewHeight = finiteOr(config.height, viewWidth * imageSize.height / imageSize.width);
  const pixelRatio = finiteOr(config.pixelRatio, browserPixelRatio());
  const configuredPointDisplay = normalizePointDisplay(
    config.pointDisplay ?? config.handleDisplay ?? config.handleStyle ?? config.pointStyle
  );
  const radius = finiteOr(config.radius, configuredPointDisplay === "dots" ? 4 : 7);
  const dotRadius = finiteOr(config.dotRadius ?? config.compactRadius ?? config.smallRadius, Math.min(radius, 4));
  const hitRadius = finiteOr(config.hitRadius, Math.max(radius + 4, 11));
  const padding = clamp(finiteOr(config.padding, 0.1), 0, 0.45);
  const theme = { ...DEFAULT_THEME, ...(config.theme ?? {}) };
  const label = normalizeLabel(config.label);
  const tooltip = normalizeTooltip(config.tooltip);
  const segments = normalizeSegments(config.segments ?? config.links ?? config.bones);
  const mode = config.mode;
  const modeInteraction = interactionModeFromMode(mode);
  const drawMode = config.drawMode ?? (modeInteraction == null ? mode : undefined);
  const zoomEnabled = config.zoom !== false;
  const optimized = config.optimize ?? config.optmize ?? true;
  const backgroundEnabled = config.background !== false;
  const polygonEnabled = drawMode === "polygon"
    ? true
    : drawMode === "points" || drawMode === "segments"
      ? false
      : config.polygon !== false && segments.length === 0;
  const segmentsEnabled = drawMode === "points" ? false : segments.length > 0;
  const maskEnabled = config.mask ?? polygonEnabled;
  const segmentColor = config.segmentColor ?? config.strokeColor ?? theme.polygon;
  const segmentWidth = finiteOr(config.segmentWidth ?? config.strokeWidth, 2.5);
  const addPointOnDoubleClick = config.addPointOnDoubleClick !== false;
  const clampToImage = config.clampToImage !== false;
  const minPoints = finiteOr(config.minPoints, 0);
  const maxPoints = config.maxPoints == null ? Infinity : finiteOr(config.maxPoints, Infinity);
  const state = {
    points: normalizePoints(config.value, DEFAULT_POINTS),
    annotations: normalizeAnnotations(config.annotations),
    selectedIndex: -1,
    hoverIndex: -1,
    locked: Boolean(config.locked ?? config.frozen ?? config.readonly ?? false),
    interactionMode: normalizeInteractionMode(
      config.interactionMode ?? config.editMode ?? config.dragMode ?? modeInteraction ?? "points"
    ),
    pointDisplay: configuredPointDisplay,
    pointRadius: configuredPointDisplay === "dots" ? dotRadius : radius,
    pointLabel: configuredPointDisplay === "dots" ? false : label,
    interaction: null,
    transform: initialTransform(imageSize, viewWidth, viewHeight, padding),
    drawFrame: null,
    animationFrame: null
  };
  state.minScale = finiteOr(config.minScale, Math.min(state.transform.k, 1 / 8));
  state.maxScale = finiteOr(config.maxScale, 8);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  canvas.width = Math.max(1, Math.round(viewWidth * pixelRatio));
  canvas.height = Math.max(1, Math.round(viewHeight * pixelRatio));
  canvas.style.width = `${viewWidth}px`;
  canvas.style.height = `${viewHeight}px`;
  canvas.style.maxWidth = "100%";
  canvas.style.touchAction = "none";
  canvas.style.display = "block";
  canvas.tabIndex = config.tabIndex ?? 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", config.ariaLabel ?? "Image control points");
  canvas.value = state.points;
  canvas.annotations = state.annotations;

  function draw() {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    drawImageWithMask(context, image, state, imageSize, theme, viewWidth, viewHeight, maskEnabled);
    if (backgroundEnabled) {
      drawGrid(context, state.transform, viewWidth, viewHeight, theme.grid);
    }
    drawBackground(context, viewWidth, viewHeight, theme.background);
    context.globalCompositeOperation = "source-over";
    drawPolygonAndPoints(
      context,
      state,
      imageSize,
      state.pointRadius,
      state.pointLabel,
      tooltip,
      theme,
      polygonEnabled,
      segmentsEnabled ? segments : [],
      segmentColor,
      segmentWidth,
      viewWidth,
      viewHeight
    );
    drawAnnotations(context, state.annotations, imageSize, state.transform, theme);
  }

  function requestDraw() {
    if (!optimized || typeof requestAnimationFrame !== "function") {
      draw();
      return;
    }

    if (state.drawFrame == null) {
      state.drawFrame = requestAnimationFrame(() => {
        state.drawFrame = null;
        draw();
      });
    }
  }

  function emitInput() {
    canvas.value = state.points;
    canvas.annotations = state.annotations;
    canvas.dispatchEvent(new CustomEvent("input", { bubbles: true }));
  }

  function emitChange() {
    canvas.dispatchEvent(new CustomEvent("change", { bubbles: true }));
  }

  function setValue(value, options = {}) {
    state.points.length = 0;
    for (const point of normalizePoints(value, [])) {
      state.points.push(point);
    }
    state.selectedIndex = state.points.length === 0
      ? -1
      : clamp(Math.min(state.selectedIndex, state.points.length - 1), 0, state.points.length - 1);
    draw();
    if (!options.silent) {
      emitInput();
      emitChange();
    }
    return canvas;
  }

  function setAnnotations(value, options = {}) {
    state.annotations.length = 0;
    for (const annotation of normalizeAnnotations(value)) {
      state.annotations.push(annotation);
    }
    draw();
    if (!options.silent) {
      emitInput();
      emitChange();
    }
    return canvas;
  }

  function addPoint(point, options = {}) {
    if (state.points.length >= maxPoints) {
      return null;
    }

    const next = normalizePoint(point, "point");
    if (options.percent !== true) {
      const pct = pxToPct(next, imageSize);
      next.x = pct.x;
      next.y = pct.y;
    }

    state.points.push(clampToImage ? clampPercentPoint(next) : next);
    state.selectedIndex = state.points.length - 1;
    draw();
    if (!options.silent) {
      emitInput();
      emitChange();
    }
    return state.points[state.selectedIndex];
  }

  function removePoint(index = state.selectedIndex, options = {}) {
    if (state.points.length <= minPoints || index < 0 || index >= state.points.length) {
      return null;
    }

    const [removed] = state.points.splice(index, 1);
    state.selectedIndex = Math.min(index, state.points.length - 1);
    draw();
    if (!options.silent) {
      emitInput();
      emitChange();
    }
    return removed;
  }

  function setTransform(transform, options = {}) {
    state.transform = normalizeTransform(transform, state.transform);
    draw();
    if (!options.silent) {
      canvas.dispatchEvent(new CustomEvent("transform", {
        bubbles: true,
        detail: { transform: { ...state.transform } }
      }));
    }
    return canvas;
  }

  function resetTransform() {
    return setTransform(initialTransform(imageSize, viewWidth, viewHeight, padding));
  }

  function updateHover(local) {
    const nextHover = nearestPointIndex(local, state.points, imageSize, state.transform, hitRadius);
    if (nextHover !== state.hoverIndex) {
      state.hoverIndex = nextHover;
      canvas.title = nextHover >= 0 && tooltip
        ? tooltip(nextHover, state.points[nextHover])
        : "";
      requestDraw();
    }
  }

  function getPointsPx() {
    return state.points.map((point) => pctToPx(point, imageSize));
  }

  function getAnnotations() {
    return state.annotations.map((annotation) => ({ ...annotation }));
  }

  function canEditPoints() {
    return !state.locked && (state.interactionMode === "points" || state.interactionMode === "hybrid");
  }

  function canDragShape() {
    return !state.locked && (
      state.interactionMode === "shape" ||
      state.interactionMode === "hybrid" ||
      state.interactionMode === "scale"
    ) && state.points.length > 0;
  }

  function canScaleShape() {
    return !state.locked && state.interactionMode === "scale" && state.points.length > 1;
  }

  function toJSON() {
    return {
      points: state.points.map((point) => ({ ...point })),
      annotations: getAnnotations()
    };
  }

  canvas.setValue = setValue;
  canvas.getValue = () => state.points.map((point) => ({ ...point }));
  canvas.addPoint = addPoint;
  canvas.removePoint = removePoint;
  canvas.setAnnotations = setAnnotations;
  canvas.getAnnotations = getAnnotations;
  canvas.getPointsPx = getPointsPx;
  canvas.getTransform = () => ({ ...state.transform });
  canvas.setTransform = setTransform;
  canvas.resetTransform = resetTransform;
  canvas.redraw = draw;
  canvas.toJSON = toJSON;
  canvas.locked = state.locked;
  canvas.interactionMode = state.interactionMode;
  canvas.pointDisplay = state.pointDisplay;
  canvas.setLocked = (value = true) => {
    state.locked = Boolean(value);
    canvas.locked = state.locked;
    state.interaction = null;
    draw();
    return canvas;
  };
  canvas.setPointDisplay = (value = "numbered") => {
    state.pointDisplay = normalizePointDisplay(value);
    state.pointRadius = state.pointDisplay === "dots" ? dotRadius : radius;
    state.pointLabel = state.pointDisplay === "dots" ? false : label;
    canvas.pointDisplay = state.pointDisplay;
    draw();
    return canvas;
  };
  canvas.setHandleDisplay = canvas.setPointDisplay;
  canvas.setInteractionMode = (value = "points") => {
    state.interactionMode = normalizeInteractionMode(value);
    canvas.interactionMode = state.interactionMode;
    state.interaction = null;
    draw();
    return canvas;
  };

  canvas.addEventListener("pointerdown", (event) => {
    canvas.focus({ preventScroll: true });
    const local = eventPoint(event, canvas, pixelRatio);
    const hitIndex = nearestPointIndex(local, state.points, imageSize, state.transform, hitRadius);
    const hitShape = canDragShape() &&
      shapeHit(local, state.points, imageSize, state.transform, hitRadius, polygonEnabled, segmentsEnabled ? segments : []);

    if (hitIndex >= 0 && canScaleShape()) {
      state.selectedIndex = hitIndex;
      state.interaction = createScaleInteraction(local, hitIndex, state.points, imageSize, state.transform);
    } else if (hitIndex >= 0 && state.interactionMode === "shape" && canDragShape()) {
      state.selectedIndex = hitIndex;
      state.interaction = createShapeInteraction(local, state.points, imageSize, state.transform);
    } else if (hitIndex >= 0) {
      state.selectedIndex = hitIndex;
      state.interaction = canEditPoints() ? { type: "point", index: hitIndex } : null;
    } else if (hitShape) {
      state.interaction = createShapeInteraction(local, state.points, imageSize, state.transform);
    } else if (zoomEnabled) {
      state.interaction = {
        type: "pan",
        x: local.x,
        y: local.y,
        transform: { ...state.transform }
      };
    } else {
      state.interaction = null;
    }

    if (state.interaction != null) {
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      draw();
    } else if (hitIndex >= 0) {
      updateHover(local);
      draw();
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    const local = eventPoint(event, canvas, pixelRatio);

    if (state.interaction == null) {
      updateHover(local);
      return;
    }

    if (state.interaction.type === "point") {
      const imagePoint = viewToImage(local, state.transform);
      const percentPoint = pxToPct(imagePoint, imageSize);
      const nextPoint = clampToImage
        ? clampPercentPoint(percentPoint)
        : percentPoint;
      state.points[state.interaction.index] = {
        ...state.points[state.interaction.index],
        ...nextPoint
      };
      canvas.value = state.points;
      requestDraw();
      emitInput();
    } else if (state.interaction.type === "shape") {
      const nextPoints = translatedShapePoints(state.interaction, local, imageSize, clampToImage);
      state.points.length = 0;
      state.points.push(...nextPoints);
      canvas.value = state.points;
      requestDraw();
      emitInput();
    } else if (state.interaction.type === "scale") {
      const nextPoints = scaledShapePoints(state.interaction, local, imageSize, clampToImage);
      state.points.length = 0;
      state.points.push(...nextPoints);
      canvas.value = state.points;
      requestDraw();
      emitInput();
    } else if (state.interaction.type === "pan") {
      state.transform = {
        ...state.interaction.transform,
        x: state.interaction.transform.x + local.x - state.interaction.x,
        y: state.interaction.transform.y + local.y - state.interaction.y
      };
      requestDraw();
    }

    event.preventDefault();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (state.interaction != null) {
      canvas.releasePointerCapture?.(event.pointerId);
      state.interaction = null;
      emitChange();
      event.preventDefault();
    }
  });

  canvas.addEventListener("pointercancel", () => {
    state.interaction = null;
    state.hoverIndex = -1;
    canvas.title = "";
    requestDraw();
  });

  canvas.addEventListener("pointerleave", () => {
    if (state.interaction == null && state.hoverIndex !== -1) {
      state.hoverIndex = -1;
      canvas.title = "";
      requestDraw();
    }
  });

  canvas.addEventListener("dblclick", (event) => {
    if (!canEditPoints() || !addPointOnDoubleClick || state.points.length >= maxPoints) {
      return;
    }

    const local = eventPoint(event, canvas, pixelRatio);
    const imagePoint = viewToImage(local, state.transform);
    if (!pointWithinImage(imagePoint, imageSize) && !clampToImage) {
      return;
    }

    addPoint(clampImagePoint(imagePoint, imageSize), { percent: false });
    event.preventDefault();
  });

  canvas.addEventListener("wheel", (event) => {
    if (!zoomEnabled) {
      return;
    }

    const local = eventPoint(event, canvas, pixelRatio);
    const nextScale = clamp(
      state.transform.k * Math.exp(-event.deltaY * 0.001),
      state.minScale,
      state.maxScale
    );

    if (nextScale === state.transform.k) {
      return;
    }

    const imagePoint = viewToImage(local, state.transform);
    state.transform = {
      k: nextScale,
      x: local.x - imagePoint.x * nextScale,
      y: local.y - imagePoint.y * nextScale
    };
    requestDraw();
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    if (!canEditPoints()) {
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      const removed = removePoint();
      if (removed != null) {
        event.preventDefault();
      }
    }
  });

  draw();

  if (config.animate ?? isVideoLike(image)) {
    const tick = () => {
      draw();
      state.animationFrame = requestAnimationFrame(tick);
    };
    state.animationFrame = requestAnimationFrame(tick);
    canvas.stopAnimation = () => {
      if (state.animationFrame != null) {
        cancelAnimationFrame(state.animationFrame);
        state.animationFrame = null;
      }
      if (state.drawFrame != null) {
        cancelAnimationFrame(state.drawFrame);
        state.drawFrame = null;
      }
    };
  }

  return canvas;
}

export const drawBoxOnImage = createImageControlPoints;

export function createWarpingWorkspace(config = {}) {
  assertBrowser("createWarpingWorkspace");

  const sourceImage = config.sourceImage ?? config.image;
  const referenceImage = config.referenceImage ?? config.destinationImage ?? config.targetImage;

  if (sourceImage == null || referenceImage == null) {
    throw new Error("createWarpingWorkspace requires sourceImage and referenceImage.");
  }

  const sourceSize = imageSizeFrom(sourceImage);
  const referenceSize = imageSizeFrom(referenceImage);
  const sourcePoints = normalizePoints(config.sourcePoints ?? config.value, DEFAULT_POINTS);
  const destinationPoints = normalizePoints(config.destinationPoints, DEFAULT_DESTINATION_POINTS);
  const controlWidth = finiteOr(config.controlWidth ?? config.width, 420);
  const optimized = config.optimize ?? config.optmize ?? true;
  const previewScale = clamp(
    finiteOr(
      config.previewScale ?? config.warpScale ?? config.renderScale,
      optimized ? Math.min(1, controlWidth / referenceSize.width) : 1
    ),
    0.01,
    1
  );
  const previewSize = {
    width: Math.max(1, Math.round(referenceSize.width * previewScale)),
    height: Math.max(1, Math.round(referenceSize.height * previewScale))
  };
  const sourceImageData = optimized && !isVideoLike(sourceImage)
    ? maybeImageDataFromImage(sourceImage, sourceSize)
    : null;
  const root = document.createElement("div");
  root.className = config.className ?? "ImgCtrlPts-workspace img-control-points-workspace";
  root.style.display = "grid";
  root.style.gridTemplateColumns = config.columns ?? "repeat(auto-fit, minmax(260px, 1fr))";
  root.style.gap = config.gap ?? "16px";
  root.style.alignItems = "start";

  const sourceControl = createImageControlPoints({
    image: sourceImage,
    width: controlWidth,
    value: sourcePoints,
    label: config.label ?? true,
    radius: config.radius ?? 7,
    padding: config.padding ?? 0.08,
    background: config.background,
    optimize: optimized,
    minPoints: config.minPoints ?? 4,
    maxPoints: config.maxPoints,
    theme: config.theme,
    ariaLabel: config.sourceAriaLabel ?? "Source image control points"
  });
  const destinationControl = createImageControlPoints({
    image: referenceImage,
    width: controlWidth,
    value: destinationPoints,
    label: config.label ?? true,
    radius: config.radius ?? 7,
    padding: config.padding ?? 0.08,
    background: config.background,
    optimize: optimized,
    minPoints: config.minPoints ?? 4,
    maxPoints: config.maxPoints,
    theme: config.theme,
    ariaLabel: config.destinationAriaLabel ?? "Destination image control points"
  });
  const warpedCanvas = document.createElement("canvas");
  warpedCanvas.style.width = `${controlWidth}px`;
  warpedCanvas.style.maxWidth = "100%";
  warpedCanvas.style.display = "block";
  warpedCanvas.setAttribute("role", "img");
  warpedCanvas.setAttribute("aria-label", config.warpedAriaLabel ?? "Warped image preview");

  const sourcePanel = panel(sourceControl, "source");
  const destinationPanel = panel(destinationControl, "destination");
  const warpedPanel = panel(warpedCanvas, "warped");
  root.append(sourcePanel, destinationPanel, warpedPanel);
  let updateFrame = null;

  function update(options = {}) {
    const srcPct = sourceControl.value.map((point) => ({ ...point }));
    const dstPct = destinationControl.value.map((point) => ({ ...point }));
    const srcPx = srcPct.map((point) => pctToPx(point, sourceSize));
    const dstPx = dstPct.map((point) => pctToPx(point, referenceSize));
    const pairCount = Math.min(srcPx.length, dstPx.length);
    let homography = null;

    if (pairCount >= 4) {
      const sourceFit = srcPx.slice(0, pairCount);
      const destinationFit = dstPx.slice(0, pairCount);
      const destinationPreview = destinationFit.map((point) => scalePoint(point, previewScale));
      homography = computeHomography(sourceFit, destinationFit);
      warpImageToCanvas({
        sourceImage,
        sourceImageData,
        referenceImage,
        destinationSize: previewSize,
        sourcePoints: sourceFit,
        destinationPoints: destinationPreview,
        canvas: warpedCanvas,
        alpha: config.alpha ?? 0.82,
        backgroundColor: config.backgroundColor,
        width: controlWidth,
        optimize: optimized,
        sampling: config.sampling
      });
    } else {
      drawReferencePreview(warpedCanvas, referenceImage, previewSize, controlWidth, config.backgroundColor);
    }

    root.value = {
      sourcePoints: srcPct,
      destinationPoints: dstPct,
      sourcePointsPx: srcPx,
      destinationPointsPx: dstPx,
      previewScale,
      homography
    };

    if (!options.silent) {
      root.dispatchEvent(new CustomEvent("input", { bubbles: true }));
    }

    return root.value;
  }

  function requestUpdate(options = {}) {
    if (!optimized || typeof requestAnimationFrame !== "function") {
      return update(options);
    }

    if (updateFrame == null) {
      updateFrame = requestAnimationFrame(() => {
        updateFrame = null;
        update(options);
      });
    }

    return root.value;
  }

  function setValue(value, options = {}) {
    if (value?.sourcePoints != null) {
      sourceControl.setValue(value.sourcePoints, { silent: true });
    }
    if (value?.destinationPoints != null) {
      destinationControl.setValue(value.destinationPoints, { silent: true });
    }
    update(options);
    if (!options.silent) {
      root.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    }
    return root;
  }

  function addPointPair(options = {}) {
    const index = Math.min(sourceControl.value.length, destinationControl.value.length);
    sourceControl.addPoint(options.sourcePoint ?? suggestedPercentPoint(sourceControl.value, index), {
      percent: true,
      silent: true
    });
    destinationControl.addPoint(options.destinationPoint ?? suggestedPercentPoint(destinationControl.value, index), {
      percent: true,
      silent: true
    });
    update(options);
    if (!options.silent) {
      root.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    }
    return root;
  }

  function removePointPair(index = Math.min(sourceControl.value.length, destinationControl.value.length) - 1, options = {}) {
    sourceControl.removePoint(index, { silent: true });
    destinationControl.removePoint(index, { silent: true });
    update(options);
    if (!options.silent) {
      root.dispatchEvent(new CustomEvent("change", { bubbles: true }));
    }
    return root;
  }

  sourceControl.addEventListener("input", () => requestUpdate());
  destinationControl.addEventListener("input", () => requestUpdate());
  sourceControl.addEventListener("change", () => root.dispatchEvent(new CustomEvent("change", { bubbles: true })));
  destinationControl.addEventListener("change", () => root.dispatchEvent(new CustomEvent("change", { bubbles: true })));

  root.controls = {
    source: sourceControl,
    destination: destinationControl,
    warped: warpedCanvas
  };
  root.setValue = setValue;
  root.addPointPair = addPointPair;
  root.removePointPair = removePointPair;
  root.redraw = () => update({ silent: true });
  update({ silent: true });

  return root;
}

export function warpImageToCanvas(options = {}) {
  assertBrowser("warpImageToCanvas");

  const sourceImage = options.sourceImage ?? options.image;
  if (sourceImage == null) {
    throw new Error("warpImageToCanvas requires sourceImage.");
  }

  const sourceSize = imageSizeFrom(sourceImage);
  const referenceImage = options.referenceImage ?? options.destinationImage ?? null;
  const destinationSize = options.destinationSize != null
    ? imageSizeFrom(options.destinationSize)
    : referenceImage == null
      ? imageSizeFrom(options.size)
      : imageSizeFrom(referenceImage);
  const sourcePoints = normalizePoints(options.sourcePoints, []);
  const destinationPoints = normalizePoints(options.destinationPoints, []);

  if (sourcePoints.length < 4 || destinationPoints.length < 4) {
    throw new Error("warpImageToCanvas requires at least four source and destination points.");
  }

  const canvas = options.canvas ?? document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const width = Math.max(1, Math.round(destinationSize.width));
  const height = Math.max(1, Math.round(destinationSize.height));
  const opacity = clamp(finiteOr(options.alpha, 1), 0, 1);
  canvas.width = width;
  canvas.height = height;
  canvas.style.maxWidth = "100%";
  canvas.style.display = "block";
  if (options.width != null) {
    canvas.style.width = `${finiteOr(options.width, width)}px`;
  }

  if (referenceImage != null) {
    context.drawImage(referenceImage, 0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
    if (options.backgroundColor != null) {
      context.fillStyle = options.backgroundColor;
      context.fillRect(0, 0, width, height);
    }
  }

  const sourceData = options.sourceImageData ?? imageDataFromImage(sourceImage, sourceSize);
  const outputData = context.getImageData(0, 0, width, height);
  const pointCount = Math.min(sourcePoints.length, destinationPoints.length);
  const destinationPolygon = destinationPoints.slice(0, pointCount);
  const bounds = polygonBounds(destinationPolygon, width, height);
  const matrix = computeHomography(
    destinationPoints.slice(0, pointCount),
    sourcePoints.slice(0, pointCount)
  );
  const sourceWidth = sourceData.width;
  const sourceHeight = sourceData.height;
  const sourcePixels = sourceData.data;
  const outputPixels = outputData.data;
  const useNearest = options.sampling == null
    ? (options.optimize ?? options.optmize ?? false)
    : options.sampling === "nearest";
  const a = matrix[0][0];
  const b = matrix[0][1];
  const c = matrix[0][2];
  const d = matrix[1][0];
  const e = matrix[1][1];
  const f = matrix[1][2];
  const g = matrix[2][0];
  const h = matrix[2][1];
  const i = matrix[2][2];

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const py = y + 0.5;
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const px = x + 0.5;
      if (!pointInPolygonXY(px, py, destinationPolygon)) {
        continue;
      }

      const denominator = g * px + h * py + i;
      if (Math.abs(denominator) < 1e-12) {
        continue;
      }

      const sourceX = (a * px + b * py + c) / denominator;
      const sourceY = (d * px + e * py + f) / denominator;
      if (
        sourceX < 0 ||
        sourceY < 0 ||
        sourceX > sourceWidth - 1 ||
        sourceY > sourceHeight - 1
      ) {
        continue;
      }

      const index = (y * width + x) * 4;
      if (useNearest) {
        blendNearestPixel(sourcePixels, sourceWidth, sourceHeight, sourceX, sourceY, outputPixels, index, opacity);
      } else {
        blendBilinearPixel(sourcePixels, sourceWidth, sourceHeight, sourceX, sourceY, outputPixels, index, opacity);
      }
    }
  }

  context.putImageData(outputData, 0, 0);
  return canvas;
}

export function computeHomography(sourcePoints, destinationPoints) {
  const source = normalizePoints(sourcePoints, []);
  const destination = normalizePoints(destinationPoints, []);
  const count = Math.min(source.length, destination.length);

  if (count < 4) {
    throw new Error("computeHomography requires at least four point pairs.");
  }

  const rows = [];
  const rhs = [];
  for (let index = 0; index < count; index += 1) {
    const { x, y } = source[index];
    const { x: u, y: v } = destination[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }

  const solution = solveLeastSquares(rows, rhs);
  return [
    [solution[0], solution[1], solution[2]],
    [solution[3], solution[4], solution[5]],
    [solution[6], solution[7], 1]
  ];
}

export function applyHomography(matrix, point) {
  const { x, y } = normalizePoint(point, "point");
  const m = normalizeMatrix(matrix);
  const denominator = m[2][0] * x + m[2][1] * y + m[2][2];

  if (Math.abs(denominator) < 1e-12) {
    throw new Error("Cannot apply a homography with a zero homogeneous coordinate.");
  }

  return {
    x: (m[0][0] * x + m[0][1] * y + m[0][2]) / denominator,
    y: (m[1][0] * x + m[1][1] * y + m[1][2]) / denominator
  };
}

export function invertHomography(matrix) {
  const m = normalizeMatrix(matrix);
  const a = m[0][0];
  const b = m[0][1];
  const c = m[0][2];
  const d = m[1][0];
  const e = m[1][1];
  const f = m[1][2];
  const g = m[2][0];
  const h = m[2][1];
  const i = m[2][2];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(determinant) < 1e-12) {
    throw new Error("Cannot invert a singular homography.");
  }

  return [
    [(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant],
    [(f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant],
    [(d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant]
  ];
}

export function pctToPx(value, imageOrSize) {
  const size = imageSizeFrom(imageOrSize);
  return mapPointValue(value, (point) => ({
    x: point.x * size.width / 100,
    y: point.y * size.height / 100
  }));
}

export function pxToPct(value, imageOrSize) {
  const size = imageSizeFrom(imageOrSize);
  return mapPointValue(value, (point) => ({
    x: point.x * 100 / size.width,
    y: point.y * 100 / size.height
  }));
}

export function intrinsicWidth(imageOrSize) {
  return imageSizeFrom(imageOrSize).width;
}

export function intrinsicHeight(imageOrSize) {
  return imageSizeFrom(imageOrSize).height;
}

export const ImgCtrlPts = Object.freeze({
  applyHomography,
  computeHomography,
  createImageControlPoints,
  createWarpingWorkspace,
  drawBoxOnImage,
  intrinsicHeight,
  intrinsicWidth,
  invertHomography,
  pctToPx,
  pxToPct,
  warpImageToCanvas
});

export default ImgCtrlPts;

function panel(child, name) {
  const wrapper = document.createElement("div");
  wrapper.dataset.panel = name;
  wrapper.style.minWidth = "0";
  wrapper.append(child);
  return wrapper;
}

function drawImageWithMask(context, image, state, imageSize, theme, width, height, maskEnabled) {
  const imagePoints = state.points.map((point) => pctToPx(point, imageSize));

  context.save();
  context.translate(state.transform.x, state.transform.y);
  context.scale(state.transform.k, state.transform.k);

  if (maskEnabled && imagePoints.length >= 3) {
    context.restore();
    context.save();
    context.globalCompositeOperation = "source-over";
    context.fillStyle = theme.imageOverlay;
    context.fillRect(0, 0, width, height);
    context.translate(state.transform.x, state.transform.y);
    context.scale(state.transform.k, state.transform.k);

    context.globalCompositeOperation = "destination-out";
    context.beginPath();
    for (const [index, point] of imagePoints.entries()) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    context.closePath();
    context.fillStyle = "#ffffff";
    context.fill();
  }

  context.globalCompositeOperation = "destination-over";
  context.drawImage(image, 0, 0, imageSize.width, imageSize.height);
  context.restore();
}

function drawBackground(context, width, height, color) {
  if (color == null) {
    return;
  }

  context.save();
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function drawGrid(context, transform, width, height, color) {
  const bigStep = 100 * transform.k;
  const smallStep = 10 * transform.k;
  if (bigStep <= 0 || smallStep <= 0) {
    return;
  }
  const xOffset = (transform.x % bigStep) - bigStep;
  const yOffset = (transform.y % bigStep) - bigStep;

  context.save();
  context.globalCompositeOperation = "destination-over";
  context.strokeStyle = color;

  context.lineWidth = 0.25 * transform.k;
  for (let x = xOffset - smallStep, y = yOffset - smallStep; x < width + smallStep || y < height + smallStep;) {
    x += smallStep;
    y += smallStep;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.lineWidth = transform.k;
  for (let x = xOffset - bigStep, y = yOffset - bigStep; x < width + bigStep || y < height + bigStep;) {
    x += bigStep;
    y += bigStep;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.restore();
}

function drawPolygonAndPoints(
  context,
  state,
  imageSize,
  radius,
  label,
  tooltip,
  theme,
  polygonEnabled,
  segments,
  segmentColor,
  segmentWidth,
  viewportWidth,
  viewportHeight
) {
  const viewPoints = state.points.map((point) => imageToView(pctToPx(point, imageSize), state.transform));

  context.save();
  context.lineWidth = 1.5;
  context.strokeStyle = theme.polygon;
  context.fillStyle = theme.point;

  if (segments.length > 0) {
    context.strokeStyle = segmentColor;
    context.lineWidth = segmentWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const [source, target] of segments) {
      const a = viewPoints[source];
      const b = viewPoints[target];
      if (a == null || b == null) {
        continue;
      }
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  if (polygonEnabled && viewPoints.length >= 2) {
    context.strokeStyle = theme.polygon;
    context.lineWidth = 1.5;
    context.beginPath();
    for (const [index, point] of viewPoints.entries()) {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    }
    if (viewPoints.length >= 3) {
      context.closePath();
    }
    context.stroke();
  }

  for (const [index, point] of viewPoints.entries()) {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = index === state.selectedIndex ? theme.selectedPoint : theme.point;
    context.fill();
    context.strokeStyle = "#ffffff";
    context.lineWidth = 1;
    context.stroke();
  }

  if (label) {
    context.fillStyle = theme.pointLabel;
    context.font = `600 ${Math.max(10, radius + 2)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    for (const [index, point] of viewPoints.entries()) {
      context.fillText(String(label(index, state.points[index])), point.x, point.y);
    }
  }

  if (tooltip && state.hoverIndex >= 0 && viewPoints[state.hoverIndex]) {
    drawTooltip(
      context,
      viewPoints[state.hoverIndex],
      tooltip(state.hoverIndex, state.points[state.hoverIndex]),
      theme,
      viewportWidth,
      viewportHeight
    );
  }

  context.restore();
}

function drawTooltip(context, point, text, theme, viewportWidth, viewportHeight) {
  const lines = String(text ?? "").split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return;
  }

  const paddingX = 8;
  const paddingY = 6;
  const lineHeight = 16;
  context.save();
  context.font = "12px system-ui, sans-serif";
  const width = Math.max(...lines.map((line) => context.measureText(line).width)) + paddingX * 2;
  const height = lines.length * lineHeight + paddingY * 2;
  const maxX = Math.max(8, viewportWidth - width - 8);
  const x = clamp(point.x + 12, 8, maxX);
  const preferredY = point.y - height - 12;
  const fallbackY = point.y + 12;
  const maxY = Math.max(8, viewportHeight - height - 8);
  const y = preferredY >= 8
    ? preferredY
    : clamp(fallbackY, 8, maxY);
  roundRect(context, x, y, width, height, 5);
  context.fillStyle = theme.tooltipFill;
  context.fill();
  context.fillStyle = theme.tooltipText;
  context.textAlign = "left";
  context.textBaseline = "top";
  for (const [index, line] of lines.entries()) {
    context.fillText(line, x + paddingX, y + paddingY + index * lineHeight);
  }
  context.restore();
}

function drawAnnotations(context, annotations, imageSize, transform, theme) {
  if (annotations.length === 0) {
    return;
  }

  context.save();
  context.font = "12px system-ui, sans-serif";
  context.textBaseline = "top";

  for (const annotation of annotations) {
    const point = imageToView(pctToPx(annotation, imageSize), transform);
    const text = annotation.text ?? annotation.label ?? "";

    context.beginPath();
    context.arc(point.x, point.y, annotation.radius ?? 4, 0, Math.PI * 2);
    context.fillStyle = annotation.color ?? theme.selectedPoint;
    context.fill();

    if (text !== "") {
      const paddingX = 6;
      const paddingY = 4;
      const metrics = context.measureText(String(text));
      const boxWidth = metrics.width + paddingX * 2;
      const boxHeight = 20;
      const boxX = point.x + 8;
      const boxY = point.y - boxHeight / 2;
      roundRect(context, boxX, boxY, boxWidth, boxHeight, 4);
      context.fillStyle = annotation.background ?? theme.annotationFill;
      context.fill();
      context.fillStyle = annotation.textColor ?? theme.annotationText;
      context.fillText(String(text), boxX + paddingX, boxY + paddingY);
    }
  }

  context.restore();
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function initialTransform(imageSize, viewWidth, viewHeight, padding) {
  const availableWidth = viewWidth * (1 - 2 * padding);
  const availableHeight = viewHeight * (1 - 2 * padding);
  const scale = Math.min(availableWidth / imageSize.width, availableHeight / imageSize.height);
  return {
    k: scale,
    x: (viewWidth - imageSize.width * scale) / 2,
    y: (viewHeight - imageSize.height * scale) / 2
  };
}

function normalizeTransform(transform, fallback) {
  return {
    x: finiteOr(transform?.x, fallback.x),
    y: finiteOr(transform?.y, fallback.y),
    k: finiteOr(transform?.k, fallback.k)
  };
}

function nearestPointIndex(local, points, imageSize, transform, hitRadius) {
  let bestIndex = -1;
  let bestDistance = hitRadius;

  for (let index = points.length - 1; index >= 0; index -= 1) {
    const viewPoint = imageToView(pctToPx(points[index], imageSize), transform);
    const distance = Math.hypot(local.x - viewPoint.x, local.y - viewPoint.y);
    if (distance <= bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function shapeHit(local, points, imageSize, transform, hitRadius, polygonEnabled, segments) {
  const viewPoints = points.map((point) => imageToView(pctToPx(point, imageSize), transform));

  if (polygonEnabled && viewPoints.length >= 3 && pointInPolygonXY(local.x, local.y, viewPoints)) {
    return true;
  }

  if (polygonEnabled && viewPoints.length >= 2) {
    for (let index = 0; index < viewPoints.length - 1; index += 1) {
      if (pointToSegmentDistance(local, viewPoints[index], viewPoints[index + 1]) <= hitRadius) {
        return true;
      }
    }
    if (
      viewPoints.length >= 3 &&
      pointToSegmentDistance(local, viewPoints[viewPoints.length - 1], viewPoints[0]) <= hitRadius
    ) {
      return true;
    }
  }

  for (const [source, target] of segments) {
    const a = viewPoints[source];
    const b = viewPoints[target];
    if (a != null && b != null && pointToSegmentDistance(local, a, b) <= hitRadius) {
      return true;
    }
  }

  return false;
}

function createShapeInteraction(local, points, imageSize, transform) {
  const imagePoints = points.map((point) => pctToPx(point, imageSize));

  return {
    type: "shape",
    x: local.x,
    y: local.y,
    transform: { ...transform },
    points: points.map((point) => ({ ...point })),
    imagePoints,
    bounds: pointsBounds(imagePoints)
  };
}

function createScaleInteraction(local, index, points, imageSize, transform) {
  const imagePoints = points.map((point) => pctToPx(point, imageSize));
  const center = pointsCenter(imagePoints);
  const handle = imagePoints[index];

  return {
    type: "scale",
    x: local.x,
    y: local.y,
    transform: { ...transform },
    index,
    points: points.map((point) => ({ ...point })),
    imagePoints,
    center,
    handleDistance: Math.hypot(handle.x - center.x, handle.y - center.y),
    maxScale: maxCenteredScale(center, imagePoints, imageSize)
  };
}

function translatedShapePoints(interaction, local, imageSize, clampToImage) {
  let dx = (local.x - interaction.x) / interaction.transform.k;
  let dy = (local.y - interaction.y) / interaction.transform.k;

  if (clampToImage) {
    dx = clampPossibleDelta(dx, -interaction.bounds.minX, imageSize.width - interaction.bounds.maxX);
    dy = clampPossibleDelta(dy, -interaction.bounds.minY, imageSize.height - interaction.bounds.maxY);
  }

  return interaction.points.map((point, index) => {
    const imagePoint = interaction.imagePoints[index];
    const percentPoint = pxToPct({
      x: imagePoint.x + dx,
      y: imagePoint.y + dy
    }, imageSize);

    return {
      ...point,
      x: percentPoint.x,
      y: percentPoint.y
    };
  });
}

function scaledShapePoints(interaction, local, imageSize, clampToImage) {
  if (interaction.handleDistance <= 1e-9) {
    return interaction.points.map((point) => ({ ...point }));
  }

  const imagePoint = viewToImage(local, interaction.transform);
  const distance = Math.hypot(imagePoint.x - interaction.center.x, imagePoint.y - interaction.center.y);
  let scale = distance / interaction.handleDistance;

  if (!Number.isFinite(scale)) {
    scale = 1;
  }

  scale = Math.max(0, scale);
  if (clampToImage && Number.isFinite(interaction.maxScale)) {
    scale = Math.min(scale, Math.max(0, interaction.maxScale));
  }

  return interaction.points.map((point, index) => {
    const imagePoint = interaction.imagePoints[index];
    const percentPoint = pxToPct({
      x: interaction.center.x + (imagePoint.x - interaction.center.x) * scale,
      y: interaction.center.y + (imagePoint.y - interaction.center.y) * scale
    }, imageSize);

    return {
      ...point,
      x: percentPoint.x,
      y: percentPoint.y
    };
  });
}

function pointsCenter(points) {
  const total = points.reduce((sum, point) => ({
    x: sum.x + point.x,
    y: sum.y + point.y
  }), { x: 0, y: 0 });

  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

function maxCenteredScale(center, points, imageSize) {
  let maxScale = Infinity;

  for (const point of points) {
    const dx = point.x - center.x;
    const dy = point.y - center.y;

    if (dx > 0) {
      maxScale = Math.min(maxScale, (imageSize.width - center.x) / dx);
    } else if (dx < 0) {
      maxScale = Math.min(maxScale, center.x / -dx);
    }

    if (dy > 0) {
      maxScale = Math.min(maxScale, (imageSize.height - center.y) / dy);
    } else if (dy < 0) {
      maxScale = Math.min(maxScale, center.y / -dy);
    }
  }

  return maxScale;
}

function pointsBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys)
  };
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function clampPossibleDelta(delta, min, max) {
  if (min > max) {
    return delta;
  }

  return clamp(delta, min, max);
}

function eventPoint(event, canvas, pixelRatio) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / pixelRatio) / rect.width,
    y: (event.clientY - rect.top) * (canvas.height / pixelRatio) / rect.height
  };
}

function imageToView(point, transform) {
  return {
    x: transform.x + point.x * transform.k,
    y: transform.y + point.y * transform.k
  };
}

function viewToImage(point, transform) {
  return {
    x: (point.x - transform.x) / transform.k,
    y: (point.y - transform.y) / transform.k
  };
}

function pointWithinImage(point, imageSize) {
  return point.x >= 0 && point.y >= 0 && point.x <= imageSize.width && point.y <= imageSize.height;
}

function clampImagePoint(point, imageSize) {
  return {
    x: clamp(point.x, 0, imageSize.width),
    y: clamp(point.y, 0, imageSize.height)
  };
}

function clampPercentPoint(point) {
  return {
    ...point,
    x: clamp(point.x, 0, 100),
    y: clamp(point.y, 0, 100)
  };
}

function normalizeLabel(label) {
  if (label === false) {
    return false;
  }

  if (typeof label === "function") {
    return label;
  }

  if (Array.isArray(label)) {
    return (index) => label[index] ?? index + 1;
  }

  return (index) => index + 1;
}

function normalizeTooltip(tooltip) {
  if (tooltip === false || tooltip == null) {
    return false;
  }

  if (typeof tooltip === "function") {
    return tooltip;
  }

  if (Array.isArray(tooltip)) {
    return (index) => tooltip[index] ?? String(index + 1);
  }

  if (tooltip === true) {
    return (index) => String(index + 1);
  }

  return () => String(tooltip);
}

function normalizePointDisplay(value) {
  const display = String(value ?? "numbered").toLowerCase().replace(/[\s_]+/g, "-");

  if (["number", "numbers", "numbered", "label", "labels", "labeled"].includes(display)) {
    return "numbered";
  }

  if (["dot", "dots", "compact", "small", "small-circles", "circles", "handles"].includes(display)) {
    return "dots";
  }

  throw new TypeError('pointDisplay must be "numbered" or "dots".');
}

function interactionModeFromMode(value) {
  if (value == null) {
    return null;
  }

  const mode = interactionModeToken(value);
  if ([
    "shape",
    "drag",
    "drag-shape",
    "shape-drag",
    "move",
    "move-shape",
    "translate",
    "hybrid",
    "both",
    "combined",
    "move-and-edit",
    "edit-and-move",
    "shape-and-points",
    "points-and-shape",
    "scale",
    "resize",
    "center-scale",
    "scale-center",
    "scale-from-center",
    "uniform-scale"
  ].includes(mode)) {
    return normalizeInteractionMode(value);
  }

  return null;
}

function normalizeInteractionMode(value) {
  const mode = interactionModeToken(value);

  if (["point", "points", "control-points", "edit-points"].includes(mode)) {
    return "points";
  }

  if (["shape", "drag", "drag-shape", "shape-drag", "move", "move-shape", "translate"].includes(mode)) {
    return "shape";
  }

  if ([
    "hybrid",
    "both",
    "combined",
    "move-and-edit",
    "edit-and-move",
    "shape-and-points",
    "points-and-shape"
  ].includes(mode)) {
    return "hybrid";
  }

  if (["scale", "resize", "center-scale", "scale-center", "scale-from-center", "uniform-scale"].includes(mode)) {
    return "scale";
  }

  throw new TypeError('interactionMode must be "points", "shape", "hybrid", or "scale".');
}

function interactionModeToken(value) {
  return String(value ?? "points").toLowerCase().replace(/[\s_]+/g, "-");
}

function normalizeSegments(value) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError("segments must be an array.");
  }

  return value.map((segment, index) => {
    const source = Number(
      Array.isArray(segment)
        ? segment[0]
        : segment.source ?? segment.from ?? segment.a ?? segment.start
    );
    const target = Number(
      Array.isArray(segment)
        ? segment[1]
        : segment.target ?? segment.to ?? segment.b ?? segment.end
    );

    if (!Number.isInteger(source) || source < 0 || !Number.isInteger(target) || target < 0) {
      throw new TypeError(`segments[${index}] must contain non-negative integer endpoints.`);
    }

    return [source, target];
  });
}

function normalizeAnnotations(value) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError("annotations must be an array.");
  }

  return value.map((annotation, index) => ({
    ...annotation,
    ...normalizePoint(annotation, `annotations[${index}]`)
  }));
}

function normalizePoints(value, fallback) {
  const raw = value == null ? fallback : value;
  if (!Array.isArray(raw)) {
    throw new TypeError("points must be an array.");
  }

  return raw.map((point, index) => normalizePoint(point, `points[${index}]`));
}

function normalizePoint(point, name) {
  const value = Array.isArray(point)
    ? { x: point[0], y: point[1] }
    : point;

  const x = Number(value?.x);
  const y = Number(value?.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError(`${name} must contain finite x and y values.`);
  }

  return { ...value, x, y };
}

function imageSizeFrom(imageOrSize) {
  const width = firstPositiveNumber(
    imageOrSize?.naturalWidth,
    imageOrSize?.videoWidth,
    imageOrSize?.width
  );
  const height = firstPositiveNumber(
    imageOrSize?.naturalHeight,
    imageOrSize?.videoHeight,
    imageOrSize?.height
  );

  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new Error("Cannot read a positive image width and height.");
  }

  return { width, height };
}

function firstPositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }
  return NaN;
}

function mapPointValue(value, mapper) {
  if (Array.isArray(value)) {
    return value.map((point, index) => mapper(normalizePoint(point, `points[${index}]`)));
  }

  return mapper(normalizePoint(value, "point"));
}

function solveLeastSquares(rows, rhs) {
  const size = rows[0].length;
  const normal = Array.from({ length: size }, () => Array(size).fill(0));
  const target = Array(size).fill(0);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let i = 0; i < size; i += 1) {
      target[i] += row[i] * rhs[rowIndex];
      for (let j = 0; j < size; j += 1) {
        normal[i][j] += row[i] * row[j];
      }
    }
  }

  return solveLinearSystem(normal, target);
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(augmented[pivot][column]) < 1e-12) {
      throw new Error("Cannot solve a degenerate homography.");
    }

    if (pivot !== column) {
      [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];
    }

    const divisor = augmented[column][column];
    for (let col = column; col <= n; col += 1) {
      augmented[column][col] /= divisor;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];
      for (let col = column; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

function normalizeMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length !== 3) {
    throw new TypeError("homography must be a 3x3 matrix.");
  }

  return matrix.map((row) => {
    if (!Array.isArray(row) || row.length !== 3) {
      throw new TypeError("homography must be a 3x3 matrix.");
    }

    return row.map((value) => {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        throw new TypeError("homography values must be finite numbers.");
      }
      return number;
    });
  });
}

function imageDataFromImage(image, imageSize) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imageSize.width));
  canvas.height = Math.max(1, Math.round(imageSize.height));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function maybeImageDataFromImage(image, imageSize) {
  try {
    return imageDataFromImage(image, imageSize);
  } catch {
    return null;
  }
}

function drawReferencePreview(canvas, referenceImage, size, displayWidth, backgroundColor) {
  const context = canvas.getContext("2d");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.style.width = `${displayWidth}px`;
  canvas.style.maxWidth = "100%";
  canvas.style.display = "block";

  if (backgroundColor != null) {
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, size.width, size.height);
  } else {
    context.clearRect(0, 0, size.width, size.height);
  }
  context.drawImage(referenceImage, 0, 0, size.width, size.height);
}

function scalePoint(point, scale) {
  return {
    ...point,
    x: point.x * scale,
    y: point.y * scale
  };
}

function suggestedPercentPoint(points, index) {
  const offset = ((index % 5) - 2) * 4;
  return {
    x: clamp(50 + offset, 8, 92),
    y: clamp(50 - offset, 8, 92)
  };
}

function polygonBounds(points, width, height) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: clamp(Math.floor(Math.min(...xs)), 0, width - 1),
    maxX: clamp(Math.ceil(Math.max(...xs)), 0, width - 1),
    minY: clamp(Math.floor(Math.min(...ys)), 0, height - 1),
    maxY: clamp(Math.ceil(Math.max(...ys)), 0, height - 1)
  };
}

function pointInPolygonXY(x, y, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = (pi.y > y) !== (pj.y > y) &&
      x < (pj.x - pi.x) * (y - pi.y) / (pj.y - pi.y) + pi.x;
    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function blendNearestPixel(source, width, height, x, y, target, index, opacity) {
  const sx = clamp(Math.round(x), 0, width - 1);
  const sy = clamp(Math.round(y), 0, height - 1);
  const sourceIndex = (sy * width + sx) * 4;
  blendChannels(
    target,
    index,
    source[sourceIndex],
    source[sourceIndex + 1],
    source[sourceIndex + 2],
    source[sourceIndex + 3],
    opacity
  );
}

function blendBilinearPixel(source, width, height, x, y, target, index, opacity) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  blendChannels(
    target,
    index,
    source[i00] * w00 + source[i10] * w10 + source[i01] * w01 + source[i11] * w11,
    source[i00 + 1] * w00 + source[i10 + 1] * w10 + source[i01 + 1] * w01 + source[i11 + 1] * w11,
    source[i00 + 2] * w00 + source[i10 + 2] * w10 + source[i01 + 2] * w01 + source[i11 + 2] * w11,
    source[i00 + 3] * w00 + source[i10 + 3] * w10 + source[i01 + 3] * w01 + source[i11 + 3] * w11,
    opacity
  );
}

function blendChannels(target, index, r, g, b, a, opacity) {
  const alpha = a / 255 * opacity;
  const inverse = 1 - alpha;
  target[index] = Math.round(r * alpha + target[index] * inverse);
  target[index + 1] = Math.round(g * alpha + target[index + 1] * inverse);
  target[index + 2] = Math.round(b * alpha + target[index + 2] * inverse);
  target[index + 3] = Math.round((alpha + target[index + 3] / 255 * inverse) * 255);
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function browserPixelRatio() {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

function assertBrowser(name) {
  if (typeof document === "undefined") {
    throw new Error(`${name} requires a browser document.`);
  }
}

function isVideoLike(value) {
  return value?.tagName === "VIDEO" || ("videoWidth" in Object(value) && "videoHeight" in Object(value));
}
