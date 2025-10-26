// apps/admin/src/components/ExportCSVButton.tsx
import React from "react";

function toCSV(rows: any[]): string {
  if (!rows?.length) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export default function ExportCSVButton({
  filename,
  rows,
  label = "CSV İndir",
}: {
  filename: string;
  rows: any[];
  label?: string;
}) {
  const onClick = () => {
    const csv = toCSV(rows || []);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: "1px solid #ddd",
        borderRadius: 8,
        background: "#f7f7f7",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
