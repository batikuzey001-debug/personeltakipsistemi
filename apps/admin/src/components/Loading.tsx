// apps/admin/src/components/Loading.tsx
import React from "react";

export default function Loading({ label = "Yükleniyor…" }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <div
        style={{
          width: 16,
          height: 16,
          border: "2px solid #ddd",
          borderTopColor: "#999",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
        }}
      />
      <span>{label}</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
