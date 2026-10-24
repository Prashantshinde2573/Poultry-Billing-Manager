import { describe, expect, it } from 'vitest';
import { escapeCsvCell, safeFilename, toCsv } from '../../src/utils/csv';

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(escapeCsvCell('Rahul, Pune')).toBe('"Rahul, Pune"');
    expect(escapeCsvCell('6" crate')).toBe('"6"" crate"');
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(15481.2)).toBe('15481.2');
  });

  it('neutralises spreadsheet formula injection', () => {
    expect(escapeCsvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(escapeCsvCell('+91 98765')).toBe("'+91 98765");
    expect(escapeCsvCell(-500)).toBe('-500'); // real numbers untouched
  });

  it('builds rows with CRLF line endings', () => {
    expect(toCsv(['A', 'B'], [[1, 'x'], [2, 'y']])).toBe('A,B\r\n1,x\r\n2,y\r\n');
  });

  it('makes safe filenames', () => {
    expect(safeFilename('Statement Rahul/Shop: 2026')).toBe('Statement_Rahul_Shop_2026');
  });
});
