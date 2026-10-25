export function buildCsv(headers: readonly string[], records: readonly (readonly (string | number)[])[]): string {
  const escapeCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  return `\uFEFF${[headers, ...records].map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
}

export function downloadCsv(
  filename: string,
  headers: readonly string[],
  records: readonly (readonly (string | number)[])[],
): void {
  const blob = new Blob([buildCsv(headers, records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
