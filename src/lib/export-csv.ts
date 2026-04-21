/**
 * CSV export utility — converts a list of row objects into a downloadable CSV.
 * Handles quoting, BOM for Excel-friendly UTF-8, and triggers a browser download.
 */
function escapeCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportRowsToCSV(
  filename: string,
  rows: Array<Record<string, unknown>>,
  columns?: string[],
  labels?: Record<string, string>,
): void {
  if (!rows?.length) return;
  const cols = columns && columns.length ? columns : Object.keys(rows[0]);
  const header = cols.map((c) => escapeCell(labels?.[c] ?? c)).join(",");
  const body = rows.map((r) => cols.map((c) => escapeCell(r[c])).join(",")).join("\n");
  // BOM = Excel opens UTF-8 correctly (acentos, R$, etc.)
  const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
