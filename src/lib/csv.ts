// CSV export. Values are quoted, and anything a spreadsheet could read as a
// formula (=, +, -, @ at the start) is prefixed with a quote mark so opening
// the file can never run something a group member typed into a description.

const cell = (v: unknown): string => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

export function toCSV(headers: string[], rows: unknown[][]): string {
  // BOM so Excel reads ₹ and names in UTF-8.
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
