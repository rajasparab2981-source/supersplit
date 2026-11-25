import { describe, expect, it } from 'vitest';
import { toCSV } from './csv';

describe('toCSV', () => {
  it('quotes values, escapes quotes and keeps numbers as numbers', () => {
    const csv = toCSV(['A', 'B'], [['He said "hi"', 12.5], ['x,y', -3]]);
    expect(csv).toBe('﻿"A","B"\r\n"He said ""hi""","12.5"\r\n"x,y","-3"\r\n');
  });
  it('neutralises text a spreadsheet would run as a formula', () => {
    const csv = toCSV(['D'], [['=HYPERLINK("http://x")'], ['+1'], ['@cmd'], ['-oops']]);
    expect(csv.split('\r\n').slice(1, 5)).toEqual([`"'=HYPERLINK(""http://x"")"`, `"'+1"`, `"'@cmd"`, `"'-oops"`]);
  });
});
