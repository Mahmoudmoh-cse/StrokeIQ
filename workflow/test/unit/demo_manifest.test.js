/**
 * @file demo_manifest.test.js
 * @brief Vitest coverage for demo manifest normalization and alias resolution.
 */

import { describe, it, expect, vi } from 'vitest';

import {
  buildStaticDataFromManifest,
  normalizeFlatManifest,
  resolveRunAlias,
} from '../../../assets/js/demo_manifest.js';

describe('demo_manifest helpers', () => {
  it('normalizes the legacy nested flat.json shape', () => {
    const manifest = normalizeFlatManifest({
      '2025_courses_demo': {
        race_a: {
          data_checked: false,
          espadon: false,
          espadonModifie: false,
        },
      },
    });

    expect(manifest.competitions).toEqual([
      { name: '2025_courses_demo', type: 'directory' },
    ]);
    expect(manifest.runs['2025_courses_demo']).toEqual([
      {
        name: 'race_a',
        type: 'directory',
      },
    ]);
    expect(manifest.entries.race_a).toEqual({
      data_checked: false,
      espadon: false,
      espadonModifie: false,
    });
  });

  it('normalizes the structured flat.json shape', () => {
    const manifest = normalizeFlatManifest({
      competitions: [{ name: '2025_courses_demo', type: 'directory' }],
      runs: {
        '2025_courses_demo': [{ name: 'race_a', type: 'directory' }],
      },
      entries: {
        race_a: { data_checked: false },
      },
    });

    expect(manifest.competitions).toEqual([
      { name: '2025_courses_demo', type: 'directory' },
    ]);
    expect(manifest.runs['2025_courses_demo'][0]).toEqual({
      name: 'race_a',
      type: 'directory',
    });
    expect(manifest.entries.race_a).toEqual({ data_checked: false });
  });

  it('builds static data from a flatdir-style manifest plus metadata JSON', async () => {
    const loadMetadata = vi.fn(async (_competitionName, runName) => ({
      aliases: ['2025_courses_demo_translation_carre_100_finale_10_lanes'],
      csvFiles: ['example.csv'],
      videos: [
        { name: `${runName}_camera_left.mp4` },
        { name: `${runName}_camera_right.mp4` },
      ],
    }));

    const staticData = await buildStaticDataFromManifest(
      {
        competitions: [{ name: '2025_courses_demo', type: 'directory' }],
        runs: {
          '2025_courses_demo': [
            {
              name: '2025_courses_demo_translation_carre_100_finale',
              type: 'directory',
            },
          ],
        },
        entries: {
          '2025_courses_demo_translation_carre_100_finale': {
            data_checked: false,
          },
        },
      },
      loadMetadata
    );

    expect(staticData.competitions).toEqual([
      { name: '2025_courses_demo', type: 'directory' },
    ]);
    expect(staticData.runs['2025_courses_demo']).toEqual([
      {
        name: '2025_courses_demo_translation_carre_100_finale',
        type: 'directory',
      },
    ]);
    expect(staticData.csvFiles['2025_courses_demo_translation_carre_100_finale']).toEqual([
      { name: 'example.csv', type: 'file' },
    ]);
    expect(staticData.videos['2025_courses_demo_translation_carre_100_finale']).toEqual([
      {
        name: '2025_courses_demo_translation_carre_100_finale_camera_left.mp4',
        type: 'file',
      },
      {
        name: '2025_courses_demo_translation_carre_100_finale_camera_right.mp4',
        type: 'file',
      },
    ]);
    expect(staticData.aliases['2025_courses_demo_translation_carre_100_finale']).toBe(
      '2025_courses_demo_translation_carre_100_finale'
    );
    expect(staticData.aliases['2025_courses_demo_translation_carre_100_finale_10_lanes']).toBe(
      '2025_courses_demo_translation_carre_100_finale'
    );
    expect(loadMetadata).toHaveBeenCalledWith(
      '2025_courses_demo',
      '2025_courses_demo_translation_carre_100_finale'
    );
  });

  it('resolves aliases back to the canonical run name', () => {
    expect(
      resolveRunAlias('2025_courses_demo_translation_carre_100_finale_10_lanes', {
        '2025_courses_demo_translation_carre_100_finale_10_lanes':
          '2025_courses_demo_translation_carre_100_finale',
      })
    ).toBe('2025_courses_demo_translation_carre_100_finale');

    expect(resolveRunAlias('race_without_alias', {})).toBe('race_without_alias');
  });
});
