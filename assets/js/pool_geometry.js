function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, finiteNumber(value)));
}

function firstFourPoints(points) {
    return Array.isArray(points) && points.length >= 4
        ? points.slice(0, 4).map((point) => [finiteNumber(point[0]), finiteNumber(point[1])])
        : null;
}

function lerpPoint(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
    ];
}

export function poolPointToReferencePoint(point, poolSize, destPts) {
    const quad = firstFourPoints(destPts);
    if (!quad) {
        return null;
    }

    const poolLength = Math.max(1, finiteNumber(poolSize?.[0], 50));
    const poolWidth = Math.max(1, finiteNumber(poolSize?.[1], 20));
    const xRatio = 1 - clamp01(finiteNumber(point?.[0]) / poolLength);
    const yRatio = clamp01(finiteNumber(point?.[1]) / poolWidth);
    const [bottomLeft, bottomRight, topRight, topLeft] = quad;

    const bottomPoint = lerpPoint(bottomLeft, bottomRight, xRatio);
    const topPoint = lerpPoint(topLeft, topRight, xRatio);
    return lerpPoint(bottomPoint, topPoint, yRatio);
}

export function referencePointToVideoPoint(point, meta, TransformCtor = window.PerspT) {
    const sourceQuad = firstFourPoints(meta?.srcPts);
    const destinationQuad = firstFourPoints(meta?.destPts);
    if (!sourceQuad || !destinationQuad || !TransformCtor || !point) {
        return null;
    }

    const transform = new TransformCtor(destinationQuad.flat(), sourceQuad.flat());
    const projected = transform.transform(point[0], point[1]);
    return [projected[0], projected[1]];
}

export function poolPointToVideoPoint(point, poolSize, meta, TransformCtor = window.PerspT) {
    const referencePoint = poolPointToReferencePoint(point, poolSize, meta?.destPts);
    return referencePointToVideoPoint(referencePoint, meta, TransformCtor);
}

export function getPoolLaneSegment(xPosition, laneIndex, laneCount, poolSize, meta, TransformCtor = window.PerspT) {
    const safeLaneCount = Math.max(1, Math.round(finiteNumber(laneCount, 1)));
    const safeLaneIndex = Math.max(0, Math.min(Math.round(finiteNumber(laneIndex, 0)), safeLaneCount - 1));
    const poolWidth = Math.max(1, finiteNumber(poolSize?.[1], 20));
    const laneHeight = poolWidth / safeLaneCount;
    const laneBottom = safeLaneIndex * laneHeight;
    const laneTop = (safeLaneIndex + 1) * laneHeight;

    return [
        poolPointToVideoPoint([xPosition, laneBottom], poolSize, meta, TransformCtor),
        poolPointToVideoPoint([xPosition, laneTop], poolSize, meta, TransformCtor)
    ];
}
