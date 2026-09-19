/**
 * Minimal CSV helpers for client-side exports.
 *
 * - `csvCell` properly quotes fields containing commas, quotes, or newlines
 *   (RFC 4180) so Excel doesn't split columns.
 * - `downloadCsv` prepends a UTF-8 BOM so Excel opens non-ASCII text
 *   (Indonesian names, "—", etc.) without mojibake.
 */

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}