import React, { useState, ReactNode } from "react";

type Tab = { key: string; label: string; content: ReactNode };

export default function Tabs({ tabs, initialKey }: { tabs: Tab[]; initialKey?: string }) {
  const [active, setActive] = useState<string>(initialKey || tabs[0]?.key || "");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #eee", marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderBottom: active === t.key ? "2px solid #111" : "1px solid #ddd",
              background: active === t.key ? "#f9f9f9" : "#fff",
              fontWeight: active === t.key ? 700 : 500,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>{tabs.find((t) => t.key === active)?.content}</div>
    </div>
  );
}
