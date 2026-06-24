import { describe, expect, it } from 'vitest';

import {
  validateCsvHeaders,
  validateCsvTextHeaders,
} from '../../../assets/js/sportsdata.js';

const trackingRules = {
  allowExtraColumns: false,
  delimiter: ',',
  columns: [
    { name: 'frameId', type: 'integer', required: true },
    { name: 'swimmerId', type: 'integer', required: true },
    { name: 'swimmerName', type: 'string', required: true },
  ],
};

describe('sportsdata CSV header validation', () => {
  it('accepts headers declared by the rules', () => {
    const issues = validateCsvHeaders(['frameId', 'swimmerId', 'swimmerName'], trackingRules);

    expect(issues).toEqual([]);
  });

  it('reports missing and unknown headers like sportsdata rules', () => {
    const issues = validateCsvHeaders(['frameId', 'swimmerId', 'unexpected'], trackingRules);

    expect(issues.map((issue) => issue.message)).toEqual([
      "missing required column 'swimmerName'",
      "unknown column 'unexpected'",
    ]);
  });

  it('parses the first CSV row before validating headers', () => {
    const result = validateCsvTextHeaders('frameId,swimmerId,swimmerName\n1,2,Ada', trackingRules);

    expect(result.headers).toEqual(['frameId', 'swimmerId', 'swimmerName']);
    expect(result.issues).toEqual([]);
  });

  it('reports wrong column types in CSV rows', () => {
    const result = validateCsvTextHeaders('frameId,swimmerId,swimmerName\nabc,2,Ada', trackingRules);

    expect(result.issues.map((issue) => issue.message)).toContain(
      "wrong type for column 'frameId': expected integer, got 'abc'",
    );
  });
});
