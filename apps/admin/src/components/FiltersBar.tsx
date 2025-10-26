// apps/admin/src/components/FiltersBar.tsx
import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

function toDateInput(v: Date) {
  const y = v.getFullYear();
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function FiltersBar() {
  const [params, setParams] = useSearchParams();

  const today = useMemo(() => new Date(), []);
  const firstDayOfMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const sevenDaysAgo = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() - 6); // bugün dahil 7 gün
    return t;
  }, [today]);

  const from = params.get("from") || toDateInput(sevenDaysAgo);
  const to = params.get("to") || toDateInput(today);

  const setRange = (f: string, t: string) => {
    const next = new URLSearchParams(params);
    next.set("from", f);
    next.set("to", t);
    setParams(next, { replace: true });
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        border: "1px solid #eee",
        padding: 8,
        borderRadius: 10,
        marginBottom: 12,
        background: "#fff",
      }}
    >
      <span style={{ fontWeight: 700 }}>Tarih:</span>

      <button onClick={() => setRange(toDateInput(today), toDateInput(today))} style={btnStyle}>
        Bugün
      </button>
      <button onClick={() => setRange(toDateInput(sevenDaysAgo), toDateInput(today))} style={btnStyle}>
        Son 7 Gün
      </button>
      <button onClick={() => setRange(toDateInput(firstDayOfMonth), toDateInput(today))} style={btnStyle}>
        Bu Ay
      </button>

      <div style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <input
          type="date"
          value={from}
          onChange={(e) => setRange(e.target.value, to)}
          style={dateInputStyle}
        />
        <span style={{ opacity: 0.6 }}>—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setRange(from, e.target.value)}
          style={dateInputStyle}
        />
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#f7f7f7",
  cursor: "pointer",
};

const dateInputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
};
