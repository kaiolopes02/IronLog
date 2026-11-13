import { describe, expect, it } from 'vitest';
import { toCsv } from '@/shared/utils/csv';

interface Row {
  name: string;
  value: number | null;
}

describe('csv', () => {
  it('writes headers and escapes separators, quotes and newlines', () => {
    const csv = toCsv<Row>(
      [
        { name: 'Bench, "flat"', value: 100 },
        { name: 'Line\nbreak', value: null },
      ],
      [
        { header: 'name', value: (row) => row.name },
        { header: 'value', value: (row) => row.value },
      ],
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,value');
    expect(csv).toContain('"Bench, ""flat"""');
    expect(csv).toContain('"Line\nbreak",');
  });

  it('writes an empty body when there are no rows', () => {
    expect(toCsv<Row>([], [{ header: 'name', value: (row) => row.name }])).toBe('name');
  });

  it('neutralizes spreadsheet formulas in text cells and keeps numbers numeric', () => {
    const csv = toCsv<Row>(
      [{ name: '=HYPERLINK("https://evil.test","x")', value: -2 }],
      [
        { header: 'name', value: (row) => row.name },
        { header: 'value', value: (row) => row.value },
      ],
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(',-2');
  });
});
