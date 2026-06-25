import { describe, expect, it } from 'vitest';
import {
    getSplitBoundaries,
    findBoundaryTime,
    calculateRaceSummary,
    calculateSplitAnalysis,
    calculateUnderwaterPhases,
    calculateBreathingAnalysis,
    calculateDolphinKickAnalysis,
    calculateAdvancedAnalysis
} from '../../../assets/js/advanced_analysis.js';

describe('Advanced Analysis - getSplitBoundaries', () => {
    it('returns 1 split for 50m race in 50m pool', () => {
        expect(getSplitBoundaries(50, 50)).toEqual([
            { index: 1, startDistance: 0, endDistance: 50 }
        ]);
    });
    
    it('returns 4 splits for 100m race in 25m pool', () => {
        expect(getSplitBoundaries(100, 25)).toEqual([
            { index: 1, startDistance: 0, endDistance: 25 },
            { index: 2, startDistance: 25, endDistance: 50 },
            { index: 3, startDistance: 50, endDistance: 75 },
            { index: 4, startDistance: 75, endDistance: 100 }
        ]);
    });

    it('returns 4 splits for 200m race in 50m pool', () => {
        expect(getSplitBoundaries(200, 50)).toEqual([
            { index: 1, startDistance: 0, endDistance: 50 },
            { index: 2, startDistance: 50, endDistance: 100 },
            { index: 3, startDistance: 100, endDistance: 150 },
            { index: 4, startDistance: 150, endDistance: 200 }
        ]);
    });
});

describe('Advanced Analysis - Race Summary & Average Speed', () => {
    it('calculates average speed = raceDistance / totalRaceTime', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 2, cumul: 0 },
            { mode: 'finish', 'Temps (s)': 27, cumul: 50 }
        ];
        const summary = calculateRaceSummary(events, { raceDistanceM: 50 });
        expect(summary.totalRaceTime).toBe(25);
        expect(summary.averageSpeedMps).toBe(2);
        expect(summary.warnings).toEqual([]);
    });
});

describe('Advanced Analysis - Section Speed & Stroke Count', () => {
    it('calculates section speed = splitDistance / splitTime', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 2, cumul: 0 },
            { mode: 'turn', 'Temps (s)': 14.5, cumul: 25 },
            { mode: 'finish', 'Temps (s)': 27, cumul: 50 }
        ];
        const splits = calculateSplitAnalysis(events, { raceDistanceM: 50, poolLengthM: 25 });
        expect(splits[0].splitTime).toBe(12.5); // 14.5 - 2
        expect(splits[0].splitSpeed).toBe(2); // 25 / 12.5
        expect(splits[1].splitTime).toBe(12.5); // 27 - 14.5
        expect(splits[1].splitSpeed).toBe(2);
    });

    it('counts only cycle events for stroke count, and breath for breath count', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 0, cumul: 0 },
            { mode: 'cycle', 'Temps (s)': 5, cumul: 10 },
            { mode: 'cycle', 'Temps (s)': 10, cumul: 20 },
            { mode: 'breath', 'Temps (s)': 11, cumul: 22 },
            { mode: 'dolphin', 'Temps (s)': 12, cumul: 24 },
            { mode: 'finish', 'Temps (s)': 25, cumul: 50 }
        ];
        const splits = calculateSplitAnalysis(events, { raceDistanceM: 50, poolLengthM: 50 });
        expect(splits[0].strokeCount).toBe(2);
        expect(splits[0].breathCount).toBe(1);
    });
});

describe('Advanced Analysis - Underwater Phases', () => {
    it('starts at reaction/turn, ends at breakout', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 2, cumul: 0 },
            { mode: 'breakout', 'Temps (s)': 7, cumul: 10 },
            { mode: 'turn', 'Temps (s)': 27, cumul: 50 },
            { mode: 'breakout', 'Temps (s)': 32, cumul: 60 }
        ];
        const phases = calculateUnderwaterPhases(events, {});
        expect(phases.length).toBe(2);
        expect(phases[0].startEvent).toBe('reaction');
        expect(phases[0].underwaterTime).toBe(5);
        expect(phases[0].underwaterDistance).toBe(10);
        expect(phases[1].startEvent).toBe('turn');
        expect(phases[1].underwaterTime).toBe(5);
        expect(phases[1].underwaterDistance).toBe(10);
    });

    it('creates a warning if missing breakout', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 2, cumul: 0 },
            { mode: 'finish', 'Temps (s)': 27, cumul: 50 }
        ];
        const phases = calculateUnderwaterPhases(events, {});
        expect(phases[0].warning).toContain("missing breakout");
    });
});

describe('Advanced Analysis - Breathing Rate', () => {
    it('counts only breath events', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 0, cumul: 0 },
            { mode: 'cycle', 'Temps (s)': 5, cumul: 10 },
            { mode: 'breath', 'Temps (s)': 10, cumul: 20 },
            { mode: 'finish', 'Temps (s)': 20, cumul: 50 }
        ];
        const analysis = calculateBreathingAnalysis(events, { raceDistanceM: 50 });
        expect(analysis.totalBreaths).toBe(1);
        expect(analysis.breathsPerMinute).toBe(3); // 1 breath in 20s = 3 per min
        expect(analysis.cyclesPerBreath).toBe(1);
    });
});

describe('Advanced Analysis - Dolphin Kick', () => {
    it('dolphin speed uses distance diff / time diff, first kick has no speed', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 0, cumul: 0 },
            { mode: 'dolphin', 'Temps (s)': 2, cumul: 5 },
            { mode: 'dolphin', 'Temps (s)': 3, cumul: 8 },
            { mode: 'breakout', 'Temps (s)': 4, cumul: 10 }
        ];
        const phases = calculateUnderwaterPhases(events, {});
        const dolphin = calculateDolphinKickAnalysis(events, phases, {});
        
        expect(dolphin.kickAnalysis[0].speed).toBeNull();
        expect(dolphin.kickAnalysis[1].tempo).toBe(1); // 3 - 2
        expect(dolphin.kickAnalysis[1].distFromPrev).toBe(3); // 8 - 5
        expect(dolphin.kickAnalysis[1].speed).toBe(3);
    });
});

describe('Advanced Analysis - calculateAdvancedAnalysis', () => {
    it('does not mutate input events and splits use Temps (s) not TempsVideo (s)', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 2, 'TempsVideo (s)': 12, cumul: 0 },
            { mode: 'finish', 'Temps (s)': 27, 'TempsVideo (s)': 37, cumul: 50 }
        ];
        const originalEventsStr = JSON.stringify(events);
        
        const analysis = calculateAdvancedAnalysis(events, { raceDistanceM: 50, poolLengthM: 50 });
        
        // Assert no mutation
        expect(JSON.stringify(events)).toBe(originalEventsStr);
        // Assert uses Temps (s)
        expect(analysis.splits[0].startTime).toBe(2);
        expect(analysis.splits[0].endTime).toBe(27);
        expect(analysis.summary.totalRaceTime).toBe(25);
    });

    it('manual acceptance scenario: 50m race with 3 dolphins, 2 breaths', () => {
        const events = [
            { mode: 'reaction', 'Temps (s)': 0, cumul: 0 },
            { mode: 'dolphin', 'Temps (s)': 1, cumul: 2 },
            { mode: 'dolphin', 'Temps (s)': 2, cumul: 4 },
            { mode: 'dolphin', 'Temps (s)': 3, cumul: 6 },
            { mode: 'breakout', 'Temps (s)': 4, cumul: 8 },
            { mode: 'cycle', 'Temps (s)': 5, cumul: 10 },
            { mode: 'breath', 'Temps (s)': 6, cumul: 12 },
            { mode: 'cycle', 'Temps (s)': 7, cumul: 14 },
            { mode: 'breath', 'Temps (s)': 8, cumul: 16 },
            { mode: 'finish', 'Temps (s)': 10, cumul: 50 }
        ];
        
        const analysis = calculateAdvancedAnalysis(events, { raceDistanceM: 50, poolLengthM: 50 });
        
        // 3 dolphins in first phase
        expect(analysis.dolphin.phaseAnalysis[0].dolphinKickCount).toBe(3);
        // 2 breaths
        expect(analysis.breathing.totalBreaths).toBe(2);
        // underwater time = 4, dist = 8
        expect(analysis.underwaterPhases[0].underwaterTime).toBe(4);
        expect(analysis.underwaterPhases[0].underwaterDistance).toBe(8);
        // stroke count = 2
        expect(analysis.strokeCount).toBe(2);
    });

    it('no NaN/undefined in analysis output', () => {
        const events = [{ mode: 'reaction', 'Temps (s)': 0, cumul: 0 }];
        const analysis = calculateAdvancedAnalysis(events, { raceDistanceM: 50, poolLengthM: 50 });
        const analysisStr = JSON.stringify(analysis);
        expect(analysisStr).not.toContain("NaN");
        expect(analysisStr).not.toContain("undefined");
    });
});
