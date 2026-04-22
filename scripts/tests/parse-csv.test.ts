import { describe, it, expect } from 'vitest';
import { parseSwimCsv } from '../parse-csv';

describe('parseSwimCsv', () => {
  it('parses header + rows', () => {
    const csv = `Name,Number,Group1
Adelia Biello,+15303836379,Sprint
Alex Schwartz,+14243865499,Mid D
`;
    expect(parseSwimCsv(csv)).toEqual([
      { name: 'Adelia Biello', phone_e164: '+15303836379', group: 'Sprint' },
      { name: 'Alex Schwartz', phone_e164: '+14243865499', group: 'Mid D' },
    ]);
  });

  it('skips empty trailing lines', () => {
    const csv = `Name,Number,Group1
A,+1,G

`;
    expect(parseSwimCsv(csv)).toHaveLength(1);
  });

  it('throws on malformed row', () => {
    expect(() => parseSwimCsv('Name,Number,Group1\nOnlyName')).toThrow(/malformed/i);
  });
});
