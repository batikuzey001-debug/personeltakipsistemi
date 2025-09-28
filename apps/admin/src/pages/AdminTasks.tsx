// apps/admin/src/pages/AdminTasks.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

/** API task model (tarihsiz, mesai/vardiya odaklı) */
type Task = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  assignee_employee_id: string | null;
  due_ts: string | null;         // ISO
  status: "open" | "late" | "done";
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

const IST_TZ = "Europe/Istanbul";
const fmtIST = (ts: string | null) =>
  ts
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone: IST_TZ,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ts))
    : "—";

export default function AdminTasks() {
  // ---- Filtreler (TARİH YOK) ----
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // ---- Data/UI ----
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const SHIFT_ORDER = ["Gece", "Sabah", "Öğlen", "Akşam", "—"] as const;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    Gece: true,
    Sabah: true,
    Öğlen: true,
    Akşam: true,
    "—": true,
  });

  // ---- YÜKLEME ----
  async function load() {
    setErr(null);
    setMsg("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", "open");           // 🔑 sadece AÇIK/GEÇİKMİŞ (mesai bazlı)
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Task[]>(`/admin-tasks?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Görevler alınamadı");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Otomatik tazeleme (15 sn) + odaklanınca yenile
  useEffect(() => {
    const id = setInterval(load, 15000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift, dept, search]);

  // ---- Arama ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.department || "", r.assignee_employee_id || ""]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search]);

  // ---- Gruplama ----
  const groups = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const r of filtered) (map[r.shift || "—"] = map[r.shift || "—"] || []).push(r);
    return SHIFT_ORDER.filter((k) => map[k]?.length).map((k) => ({
      shift: k,
      items: map[k].slice().sort((a, b) => a.title.localeCompare(b.title, "tr")),
    }));
  }, [filtered]);

  // ---- Tamamla ----
  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "admin").trim();
      const t = await api<Task>(`/admin-tasks/${id}/tick`, {
        method: "PATCH",
        body: JSON.stringify({ who }),
      });
      setRows((prev) => prev.map((x) => (x.id === id ? t : x)));
      setMsg("Görev tamamlandı");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Tamamlama başarısız");
      setTimeout(() => setErr(null), 1800);
    }
  }

  // ---- STYLES ----
  const page: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const surface: React.CSSProperties = { background: "#fff", border: "1px solid #eef0f4", borderRadius: 14, boxShadow: "0 6px 24px rgba(16,24,40,0.04)" };
  const section: React.CSSProperties = { ...surface, padding: 14 };
  const headerRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between" };
  const title: React.CSSProperties = { fontSize: 20, fontWeight: 800, margin: 0 };
  const label: React.CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" };
  const btnPrimary: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "#fff",
    color: active ? "#1d4ed8" : "#111",
    fontWeight: 700,
    cursor: "pointer",
  });
  const groupHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid #eef1f4", cursor: "pointer" };
  const meta: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const cols: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(280px,1fr) 140px 160px 160px 120px", gap: 10, alignItems: "center" };
  const th: React.CSSProperties = { ...meta, fontWeight: 700, textTransform: "uppercase" };
  const badge = (s: Task["status"]) => {
    const map = {
      open: { bg: "#eef3ff", bd: "#c7d2fe", fg: "#1d4ed8", tx: "Açık" },
      late: { bg: "#fff1f2", bd: "#fecdd3", fg: "#b91c1c", tx: "Gecikmiş" },
      done: { bg: "#e7f7ee", bd: "#bfe8d1", fg: "#166534", tx: "Tamamlandı" },
    } as const;
    const c = map[s];
    return {
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 999,
      background: c.bg,
      border: `1px solid ${c.bd}`,
      color: c.fg,
      fontWeight: 800,
      fontSize: 12,
    } as React.CSSProperties;
  };

  // Sayaçlar
  const total = filtered.length;
  const openCnt = filtered.filter((x) => x.status === "open").length;
  const lateCnt = filtered.filter((x) => x.status === "late").length;

  return (
    <div style={page}>
      <div style={headerRow}>
        <h1 style={title}>Admin Görevleri</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn} onClick={load} disabled={loading}>
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div style={section}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 160px 180px 1fr", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>Ara</div>
            <input placeholder="Görev başlığı, kişi…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div>
            <div style={label}>Vardiya</div>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">Tümü</option>
              <option>Gece</option>
              <option>Sabah</option>
              <option>Öğlen</option>
              <option>Akşam</option>
            </select>
          </div>
          <div>
            <div style={label}>Departman</div>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Tümü</option>
              <option>Admin</option>
              <option>Finans</option>
              <option>Bonus</option>
              <option>LC</option>
            </select>
          </div>
          <div style={{ textAlign: "right", color: "#6b7280" }}>
            {total} görev • Açık {openCnt} • Gecikmiş {lateCnt}
          </div>
        </div>
      </div>

      {/* Gruplar */}
      {["Gece", "Sabah", "Öğlen", "Akşam", "—"].map((key) => {
        const items = groups.find((g) => g.shift === key)?.items || [];
        if (!items.length) return null;
        const isOpen = openMap[key];
        const toggle = () => setOpenMap((s) => ({ ...s, [key]: !s[key] }));
        const openG = items.filter((x) => x.status === "open").length;
        const lateG = items.filter((x) => x.status === "late").length;

        return (
          <div key={key} style={{ ...surface }}>
            <div style={groupHead} onClick={toggle}>
              <div>
                <strong>{key} Vardiyası</strong>{" "}
                <span style={meta}>
                  • {items.length} görev • Açık {openG} • Gecikmiş {lateG}
                </span>
              </div>
              <div style={{ fontSize: 18 }}>{isOpen ? "▾" : "▸"}</div>
            </div>

            {isOpen && (
              <div style={{ padding: 12 }}>
                <div style={{ ...cols, marginBottom: 8 }}>
                  <div style={th}>Görev</div>
                  <div style={th}>Durum</div>
                  <div style={th}>Atanan</div>
                  <div style={th}>Bitiş</div>
                  <div style={{ ...th, textAlign: "right" }}>Aksiyon</div>
                </div>

                {items.map((t, i) => (
                  <div
                    key={t.id}
                    style={{
                      ...cols,
                      padding: "10px 10px",
                      borderTop: "1px solid #f2f4f7",
                      background: i % 2 ? "#fafafa" : "#fff",
                    }}
                  >
                    {/* Görev */}
                    <div>
                      <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.title}
                      </div>
                      <div style={meta}>
                        {t.department || "—"} {t.assignee_employee_id ? `• ${t.assignee_employee_id}` : ""}
                      </div>
                    </div>

                    {/* Durum */}
                    <div>
                      <span style={badge(t.status)}>{t.status === "open" ? "Açık" : t.status === "late" ? "Gecikmiş" : "Tamamlandı"}</span>
                      {t.done_at && <div style={{ ...meta, marginTop: 4 }}>İşaretlenme: {fmtIST(t.done_at)}</div>}
                    </div>

                    {/* Atanan */}
                    <div style={meta}>{t.assignee_employee_id || "—"}</div>

                    {/* Bitiş */}
                    <div style={meta}>{fmtIST(t.due_ts)}</div>

                    {/* Aksiyon */}
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      {!t.is_done ? (
                        <button style={btnPrimary} onClick={() => tick(t.id)}>
                          Tamamla
                        </button>
                      ) : (
                        <span style={{ ...meta, fontWeight: 800, color: "#166534" }}>✔ Tamamlandı</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {(err || msg) && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            padding: "10px 12px",
            borderRadius: 12,
            background: err ? "#fee2e2" : "#dcfce7",
            color: err ? "#7f1d1d" : "#065f46",
            boxShadow: "0 6px 20px rgba(16,24,40,0.08)",
            fontSize: 13,
          }}
        >
          {err || msg}
        </div>
      )}
    </div>
  );
}
