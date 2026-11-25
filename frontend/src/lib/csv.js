export function downloadCsv(filename, columns, rows) {
  const cell = (v) => {
    const text = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(","));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
