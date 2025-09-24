// apps/admin/src/pages/AdminTasks.tsx
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type Task = {
  id: number;
  date: string;
  shift: string | null;
  title: string;
  department: string | null;
  assignee_employee_id: string | null;
  due_ts: string | null;
  status: "open" | "done" | "late";
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

function ymdIST() {
  // Sadelik: tarayıcı yerel günü gönderme, sunucu zaten IST'ye göre defaultluyor.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AdminTasks() {
  // Filtreler
  const [date, setDate] = useState<string>(ymdIST());
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");

  // Data
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setErr(null);
    setMsg("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      // Tarihi göndermesen de olur; default IST bugün. Yine de UI’dan değişebilmesi için gönderiyoruz.
      if (date) qs.set("d", date);
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Task[]>(`/admin-tasks?${qs.toString()}`);
      setRows(data);
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

  // Vardiyaya gruplama
  const groups = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const r of rows) {
      const key = r.shift || "—";
      (map[key] = map[key] || []).push(r);
    }
    // Gece→Sabah→Öğlen→Akşam sırası
    const order = ["Gece", "Sabah", "Öğlen", "Akşam", "—"];
    return order
      .filter((k) => map[k]?.length)
      .map((k) => ({ shift: k, items: map[k].slice().sort((a, b) => a.title.localeCompare(b.title, "tr")) }));
  }, [rows]);

  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "").trim() || "admin";
      const t = await api<Task>(`/admin-tasks/${id}/tick`, {
        method: "PATCH",
        body: JSON.stringify({ who }),
      });
      // sadece ilgili satırı güncelle
      setRows((prev) => prev.map((r) => (r.id === id ? t : r)));
      setMsg("Görev tamamlandı.");
    } catch (e: any) {
      setErr(e?.message || "Tamamlama başarısız");
    }
  }

  async function generateToday() {
    await api(`/admin-tasks/generate`, { method: "POST" });
    await load();
  }

  async function scanOverdue() {
    const r = await api<{ alerts: number }>(`/admin-tasks/scan-overdue`, { method: "POST" });
    setMsg(`Gecikme tarandı: ${r.alerts} uyarı gönderildi.`);
    await load();
  }

  // styles
  const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 12, display: "grid", gap: 12 };
  const bar: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
  const card: React.CSSProperties = { border: "1px solid #e9e9e9", borderRadius: 12, background: "#fff", padding: 12 };
  const chip = (type: "open" | "done" | "late") => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background:
      type === "done" ? "#e7f7ee" : type === "late" ? "#ffecec" : "#eef3ff",
    color: type === "done" ? "#177245" : type === "late" ? "#a20000" : "#1b3a7a",
    border:
      type === "done"
        ? "1px solid #bfe8d1"
        : type === "late"
        ? "1px solid #ffb3b3"
        : "1px solid #cfdaf8",
  });

  const btn = (kind: "primary" | "ghost"): React.CSSProperties => ({
    padding: "8px 12px",
    borderRadius: 8,
    border: kind === "primary" ? "1px solid #3b82f6" : "1px solid #e5e7eb",
    background: kind === "primary" ? "#3b82f6" : "#fff",
    color: kind === "primary" ? "#fff" : "#111",
    cursor: "pointer",
  });

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Admin Görevleri</h1>

      {/* Filtre/aksiyon barı */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        style={bar}
      >
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="Tarih" />
        <select value={shift} onChange={(e) => setShift(e.target.value)} title="Vardiya">
          <option value="">Tüm vardiyalar</option>
          <option>Gece</option>
          <option>Sabah</option>
          <option>Öğlen</option>
          <option>Akşam</option>
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} title="Departman">
          <option value="">Tüm departmanlar</option>
          <option>Admin</option>
          <option>Finans</option>
          <option>Bonus</option>
          <option>LC</option>
        </select>

        <button type="submit" style={btn("ghost")} disabled={loading}>
          {loading ? "Yükleniyor…" : "Listele"}
        </button>
        <button type="button" style={btn("ghost")} onClick={generateToday}>
          Bugünü Oluştur
        </button>
        <button type="button" style={btn("ghost")} onClick={scanOverdue}>
          Gecikmeleri Tara
        </button>
        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
        {msg && <span style={{ color: "#1b6f1b", fontSize: 12 }}>{msg}</span>}
      </form>

      {/* Gruplar */}
      {!groups.length && !loading && (
        <div style={{ ...card, color: "#777" }}>Kayıt yok.</div>
      )}

      {groups.map((g) => (
        <div key={g.shift} style={card}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <h3 style={{ margin: 0 }}>{g.shift} Vardiyası</h3>
            <span style={{ fontSize: 12, color: "#666" }}>{g.items.length} görev</span>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {g.items.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 160px 120px 120px",
                  gap: 8,
                  alignItems: "center",
                  padding: "8px 10px",
                  border: "1px solid #eef0f4",
                  borderRadius: 10,
                  background: r.status === "late" ? "#fff7f7" : "#fafafa",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {r.department || "-"} • {r.assignee_employee_id || "atanmamış"}
                  </div>
                </div>

                <div style={{ fontSize: 12 }}>
                  <div style={chip(r.status)}>{r.status === "done" ? "Tamamlandı" : r.status === "late" ? "Gecikmiş" : "Açık"}</div>
                  {r.done_at && (
                    <div style={{ marginTop: 4, color: "#666" }}>
                      İşaretlenme: {new Date(r.done_at).toLocaleTimeString()}
                    </div>
                  )}
                </div>

                <div style={{ fontSize: 12, color: "#666" }}>
                  Bitiş: {r.due_ts ? new Date(r.due_ts).toLocaleTimeString() : "—"}
                </div>

                <div style={{ display: "flex", justifyContent: "end" }}>
                  {!r.is_done ? (
                    <button style={btn("primary")} onClick={() => tick(r.id)}>
                      Tamamla
                    </button>
                  ) : (
                    <span style={{ fontSize: 12, color: "#177245", fontWeight: 600 }}>✔</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
