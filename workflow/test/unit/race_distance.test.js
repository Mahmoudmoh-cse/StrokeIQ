import { describe, expect, it } from 'vitest';

import {
  cleanupExtraSwimmers,
  getExpectedTurns,
  getExpectedTurnDistances,
  getNextTurnDistance,
  isValidSwimmerId,
  normalizeEventMode,
  normalizeAnnotations,
  normalizeNumberOfSwimmers,
  recalculateAnalysisMetrics,
  recalculateCycleMetrics,
  validateSwimmerCountEvents,
  validateAnnotationDistances,
} from '../../../assets/js/race_distance.js';

describe('race distance and pool length formulas', () => {
  it.each([
    [25, 25, 0, []],
    [50, 25, 1, [25]],
    [50, 50, 0, []],
    [100, 25, 3, [25, 50, 75]],
    [100, 50, 1, [50]],
    [200, 25, 7, [25, 50, 75, 100, 125, 150, 175]],
    [200, 50, 3, [50, 100, 150]],
    [400, 25, 15, null],
    [400, 50, 7, null],
    [800, 25, 31, null],
    [800, 50, 15, null],
    [1500, 25, 59, null],
    [1500, 50, 29, null],
  ])('%im race in %im pool', (raceDistance, poolLength, expectedTurns, expectedDistances) => {
    expect(getExpectedTurns(raceDistance, poolLength)).toBe(expectedTurns);
    const distances = getExpectedTurnDistances(raceDistance, poolLength);
    expect(distances).toHaveLength(expectedTurns);
    if (expectedDistances) expect(distances).toEqual(expectedDistances);
  });

  it('returns the next unused expected turn distance', () => {
    expect(getNextTurnDistance([], 100, 25)).toBe(25);
    expect(getNextTurnDistance([{ cumul: 25 }, { cumul: 50 }], 100, 25)).toBe(75);
    expect(getNextTurnDistance([{ cumul: 25 }, { cumul: 50 }, { cumul: 75 }], 100, 25)).toBeNull();
  });
});

describe('annotation distance validation', () => {
  it('accepts a valid 50m race in a 25m pool', () => {
    const warnings = validateAnnotationDistances([
      { mode: 'reaction', frameId: 0, cumul: 0 },
      { mode: 'turn', frameId: 500, cumul: 25 },
      { mode: 'finish', frameId: 1000, cumul: 50 },
    ], 50, 25);

    expect(warnings).toEqual([]);
  });

  it('warns when finish distance is not raceDistanceM', () => {
    const warnings = validateAnnotationDistances([
      { mode: 'reaction', frameId: 0, cumul: 0 },
      { mode: 'finish', frameId: 1000, cumul: 48 },
    ], 50, 50);

    expect(warnings).toContain('finish distance must equal 50m.');
  });

  it('warns when distance resets after a turn', () => {
    const warnings = validateAnnotationDistances([
      { mode: 'reaction', frameId: 0, cumul: 0 },
      { mode: 'turn', frameId: 500, cumul: 25 },
      { mode: 'cycle', frameId: 600, cumul: 4 },
      { mode: 'finish', frameId: 1000, cumul: 50 },
    ], 50, 25);

    expect(warnings).toContain('distance decreases over time.');
  });

  it('maps legacy end to breakout', () => {
    expect(normalizeEventMode('end')).toBe('breakout');
  });
});

describe('analysis metric recalculation', () => {
  it('uses only cycle events and cumulative distance', () => {
    const cycle1 = { mode: 'cycle', frameId: 100, cumul: 10 };
    const cycle2 = { mode: 'cycle', frameId: 150, cumul: 16 };
    const metrics = recalculateAnalysisMetrics([
      { mode: 'reaction', frameId: 0, cumul: 0 },
      cycle1,
      { mode: 'breath', frameId: 120, cumul: 12 },
      { mode: 'breakout', frameId: 130, cumul: 13 },
      { mode: 'section', frameId: 140, cumul: 14 },
      cycle2,
    ], 50);

    expect(metrics.get(cycle2)).toEqual({
      tempoRow: '1.00',
      frequenceRow: '60.00',
      amplitudeRow: '6.00',
      vitesseRow: '6.00',
    });
  });

  it('uses race time and distance columns without dividing by race distance', () => {
    const cycle1 = { mode: 'cycle', 'Temps (s)': 5.7667, 'distance (m)': 9.66, cumul: 9.66, eventX: 0.1 };
    const cycle2 = { mode: 'cycle', 'Temps (s)': 8.0333, 'distance (m)': 13.46, cumul: 13.46, eventX: 0.2 };
    const cycle3 = { mode: 'cycle', 'Temps (s)': 10.2667, 'distance (m)': 17.21, cumul: 17.21, eventX: 0.24 };
    const metrics = recalculateCycleMetrics([cycle1, cycle2, cycle3], 30);

    expect(metrics.get(cycle1)).toEqual({ tempoRow: '', frequenceRow: '', amplitudeRow: '', vitesseRow: '' });
    expect(metrics.get(cycle2)).toEqual({
      tempoRow: '2.27',
      frequenceRow: '26.47',
      amplitudeRow: '3.80',
      vitesseRow: '1.68',
    });
    expect(metrics.get(cycle3)).toEqual({
      tempoRow: '2.23',
      frequenceRow: '26.87',
      amplitudeRow: '3.75',
      vitesseRow: '1.68',
    });
  });

  it('ignores turn, breakout, and finish events for cycle metrics', () => {
    const cycle1 = { mode: 'cycle', 'Temps (s)': 1, 'distance (m)': 2, cumul: 2 };
    const cycle2 = { mode: 'cycle', 'Temps (s)': 3, 'distance (m)': 7, cumul: 7 };
    recalculateCycleMetrics([
      { mode: 'turn', 'Temps (s)': 1.5, 'distance (m)': 25, cumul: 25 },
      { mode: 'breakout', 'Temps (s)': 2, 'distance (m)': 4, cumul: 4 },
      { mode: 'finish', 'Temps (s)': 4, 'distance (m)': 50, cumul: 50 },
      cycle1,
      cycle2,
    ], 30);

    expect(cycle2['amplitude (m)']).toBe('5.00');
    expect(cycle2['vitesse (m/s)']).toBe('2.50');
  });
});

describe('swimmer count handling', () => {
  const rows = Array.from({ length: 8 }, (_, swimmerId) => ({
    swimmerId,
    swimmer: swimmerId,
    mode: 'cycle',
    frameId: swimmerId + 1,
    cumul: swimmerId + 1,
  }));

  it('numberOfSwimmers = 1 keeps only swimmerId 0', () => {
    expect(cleanupExtraSwimmers(rows, 1).map(row => row.swimmerId)).toEqual([0]);
  });

  it('numberOfSwimmers = 8 keeps swimmers 0-7', () => {
    expect(cleanupExtraSwimmers(rows, 8).map(row => row.swimmerId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('warns when one-swimmer CSV contains swimmerId 1-7', () => {
    expect(validateSwimmerCountEvents(rows, 1)).toContain('CSV contains swimmer rows outside configured swimmer count.');
  });

  it('validates swimmer id range', () => {
    expect(isValidSwimmerId(0, 1)).toBe(true);
    expect(isValidSwimmerId(1, 1)).toBe(false);
    expect(normalizeNumberOfSwimmers(99)).toBe(8);
  });
});

describe('CSV annotation normalization', () => {
  const config100x25 = {
    raceDistanceM: 100,
    poolLengthM: 25,
    numberOfSwimmers: 1,
    raceStartVideoTime: 4.3,
    distanceMode: 'interpolated',
    frameRate: 10,
  };

  it('snaps reaction, 100m/25m turns, and finish distances', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3, cumul: 7 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 14.3, cumul: 22 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 24.3, cumul: 44 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 34.3, cumul: 80 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 44.3, cumul: 93 },
    ], config100x25);

    expect(result.events.map(event => event.cumul)).toEqual([0, 25, 50, 75, 100]);
    expect(result.events[0]['Temps (s)']).toBe(0);
  });

  it('interpolates cycles between each anchor range', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 9.3, cumul: 99 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 14.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 19.3, cumul: 1 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 24.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 29.3, cumul: 1 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 34.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 39.3, cumul: 1 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 44.3 },
    ], config100x25);

    const cycles = result.events.filter(event => event.mode === 'cycle').map(event => event.cumul);
    expect(cycles[0]).toBeGreaterThan(0);
    expect(cycles[0]).toBeLessThan(25);
    expect(cycles[1]).toBeGreaterThan(25);
    expect(cycles[1]).toBeLessThan(50);
    expect(cycles[2]).toBeGreaterThan(50);
    expect(cycles[2]).toBeLessThan(75);
    expect(cycles[3]).toBeGreaterThan(75);
    expect(cycles[3]).toBeLessThan(100);
  });

  it('keeps distance cumulative across turns when raw cycle distances reset each length', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3, cumul: 0 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 9.3, cumul: 10 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 14.3, cumul: 25 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 19.3, cumul: 5 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 24.3, cumul: 50 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 29.3, cumul: 8 },
      { swimmerId: 0, mode: 'turn', 'TempsVideo (s)': 34.3, cumul: 75 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 39.3, cumul: 12 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 44.3, cumul: 100 },
    ], config100x25);

    const distances = result.events.map(event => event.cumul);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));

    const cycles = result.events.filter(event => event.mode === 'cycle');
    expect(cycles.map(event => event.cumul)).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(cycles[1]['amplitude (m)']).toBe('25.00');
    expect(cycles[1]['vitesse (m/s)']).toBe('2.50');
  });

  it('filters extra swimmers during normalization', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3 },
      { swimmerId: 1, mode: 'cycle', 'TempsVideo (s)': 5.3 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 14.3 },
    ], { ...config100x25, raceDistanceM: 25, poolLengthM: 25 });

    expect(result.events.map(event => event.swimmerId)).toEqual([0, 0]);
    expect(result.warnings).toContain('CSV contains swimmer rows outside configured swimmer count.');
  });

  it('keeps normalized distances nondecreasing and metrics nonnegative', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 5.3, cumul: 20 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 6.3, cumul: 1 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 14.3 },
    ], { ...config100x25, raceDistanceM: 25, poolLengthM: 25 });

    const distances = result.events.map(event => event.cumul);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
    const cycles = result.events.filter(event => event.mode === 'cycle');
    expect(Number(cycles[1]['amplitude (m)'])).toBeGreaterThanOrEqual(0);
    expect(Number(cycles[1]['vitesse (m/s)'])).toBeGreaterThanOrEqual(0);
  });

  it('maps legacy end to breakout and excludes it from cycle metrics', () => {
    const result = normalizeAnnotations([
      { swimmerId: 0, mode: 'reaction', 'TempsVideo (s)': 4.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 5.3 },
      { swimmerId: 0, mode: 'end', 'TempsVideo (s)': 6.3 },
      { swimmerId: 0, mode: 'breath', 'TempsVideo (s)': 7.3 },
      { swimmerId: 0, mode: 'section', 'TempsVideo (s)': 8.3 },
      { swimmerId: 0, mode: 'cycle', 'TempsVideo (s)': 9.3 },
      { swimmerId: 0, mode: 'finish', 'TempsVideo (s)': 14.3 },
    ], { ...config100x25, raceDistanceM: 25, poolLengthM: 25 });

    expect(result.events.some(event => event.mode === 'breakout')).toBe(true);
    const cycleWithMetrics = result.events.filter(event => event.mode === 'cycle')[1];
    expect(cycleWithMetrics['tempo (s)']).toBe('4.00');
  });
});
