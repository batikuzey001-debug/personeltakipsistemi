// apps/admin/src/components/ColumnVisibility.tsx
import React, { useEffect, useMemo, useState } from "react";

export type VisibleMap = Record<string, boolean>;

function readLS(key: string): VisibleMap | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as VisibleMap) : null;
  } catch {
    return null;
  }
}

function writeLS(key: string, value: VisibleMap) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function useColumnVisibility(allKeys: string[], storageKey: string) {
  const initial = useMemo<VisibleMap>(() => {
    const fromLS = readLS(storageKey);
    if (fromLS) {
      // LS'te olmayan yeni sütunları varsayılan true ekle
      const merged: VisibleMap = {};
      allKeys.forEach((k) => (merged[k] = fromLS[k] ?? true));
      return merged;
    }
    const m: VisibleMap = {};
    allKeys.forEach((k) => (m[k] = true));
    return m;
  }, [allKeys, storageKey]);

  const [visible, setVisible] = useState<VisibleMap>(initial);

  useEffect(() => {
    writeLS(storageKey, visible);
  }, [storageKey, visible]);

  // allKeys değişirse yeni gelenleri açık ekle
  useEffect(() => {
    setVisible((prev) => {
      const next: VisibleMap = { ...prev };
      let changed = false;
      allKeys.forEach((k) => {
        if (!(k in next)) {
          next[k] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allKeys]);

  const toggle = (key: string) =>
    setVisible((v) => ({ ...v, [key]: !v[key] }));

  const showAll = () =>
    setVisible(Object.fromEntries(allKeys.map((k) => [k, true])));

  const hideAll = () =>
    setVisible(Object.fromEntries(allKeys.map((k) => [k, false])));

  return { visible, toggle, showAll, hideAll };
}

export function ColumnVisibilityControls({
  columns,
  visible,
  toggle,
  showAll,
  hideAll,
}: {
  columns: { key: string; header: string }[];
  visible: VisibleMap;
  toggle: (key: string) => void;
  showAll: () => void;
  hideAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: "6px 10px",
          border: "1px solid #ddd",
          borderRadius: 8,
          background: "#f7f7f7",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Sütunlar
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            right: 0,
            marginTop: 6,
            background: "#fff",
            border: "1px solid #eee",
            borderRadius: 10,
            padding: 10,
            boxShadow: "0 6px 20px rgba(0,0,0,.08)",
            zIndex: 20,
            minWidth: 220,
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button onClick={showAll} style={miniBtn}>Tümü</button>
            <button onClick={hideAll} style={miniBtn}>Hiçbiri</button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", paddingRight: 6 }}>
            {columns.map((c) => (
              <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={visible[c.key] !== false}
                  onChange={() => toggle(c.key)}
                />
                <span>{c.header}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: "4px 8px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#f7f7f7",
  cursor: "pointer",
};
