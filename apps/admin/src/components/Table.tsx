// apps/admin/src/components/Table.tsx
import React from "react";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  width?: number | string;
  render?: (row: T) => React.ReactNode;
};

export default function Table<T extends Record<string, any>>({
  columns,
  data,
  emptyText = "Kayıt yok.",
}: {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
}) {
  if (!data?.length) {
    return <div style={{ opacity: 0.6, marginTop: 8 }}>{emptyText}</div>;
  }

  return (
    <div style={{ overflowX: "auto", border: "1px solid #eee", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={String(c.key)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderBottom: "1px solid #eee",
                  width: c.width,
                  whiteSpace: "nowrap",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td
                  key={String(c.key)}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid #f5f5f5",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.render ? c.render(row) : String(row[c.key as keyof typeof row] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
