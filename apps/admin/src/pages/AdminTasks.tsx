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
  due_ts: string | null;          // UTC gelir; IST'ye çevireceğiz
  status: "open" | "done" | "late";
  is_done: boolean;
  done_at: string | null;          // UTC gelir; IST'ye çevireceğiz
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

// IST format yardımcıları (tüm saatler Europe/Istanbul'a zorlanır)
const IST_TZ = "Europe/Istanbul";
const fmtISTTime = (ts?: string | null) =>
  ts
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone: IST_TZ,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(ts))
    : "—";

function ymdIST() {
  // Görsel filtre için tarayıcı günü yeterli; API d yoksa IST bugünü defaultluyor
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

  // Grupları aç/kapa state
  const SHIFT_ORDER = ["Gece", "Sabah", "Öğlen", "Akşam", "—"] as const;
  const [open, setOpen] = useState<Record<string, boolean>>({
    Gece: true,
    Sabah: true,
    Öğlen: true,
    Akşam: true,
    "—": true,
  });

  async function load() {
    setErr(null);
    setMsg("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("d", date);      // göndermesen de API IST bugünü kullanır
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
    return SHIFT_ORDER.filter((k) => map[k]?.length).map((k) => ({
      shift: k,
      items: map[k].slice().sort((a, b) => a.title.localeCompare(b.title, "tr")),
    }));
  }, [rows]);

  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "").trim() || "admin";
      const t = await api<Task>(`/admin-tasks/${id}/tick`, {
        method: "PATCH",
        body: JSON.stringify({ who }),
      });
      setRows((prev) => prev.map((r) => (r.id === id ? t : r)));
      setMsg("Görev tamamlandı.");
    } catch (e: any) {
      setErr(e?.message || "Tamamlama başarısız");
    }
  }

  // styles
  const container: React.CSSProperties = { maxWidth: 1100, margin: "0 auto", padding: 12, display: "grid", gap: 12 };
  const bar: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
  const card: React.CSSProperties = { border: "1px solid #e9e9e9", borderRadius: 12, background: "#fff", padding: 12 };
  const section: React.CSSProperties = { border: "1px solid #e9e9e9", borderRadius: 12, background: "#fff", overflow: "hidden" };
  const head: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "10px 12px",
    cursor: "pointer",
    background: "#f9fafb",
    borderBottom: "1px solid #edf0f3",
  };
  const rowBox: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 120px 110px 120px",
    gap: 8,
    alignItems: "center",
    padding: "8px 12px",
    borderTop: "1px solid #f3f4f6",
  };
  const chip = (type: "open" | "done" | "late") => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: type === "done" ? "#e7f7ee" : type === "late" ? "#ffecec" : "#eef3ff",
    color: type === "done" ? "#177245" : type === "late" ? "#a20000" : "#1b3a7a",
    border: type === "done" ? "1px solid #bfe8d1" : type === "late" ? "1px solid #ffb3b3" : "1px solid #cfdaf8",
  });
  const btnPrimary: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #3b82f6",
    background: "#3b82f6",
    color: "#fff",
    cursor: "pointer",
  };
  const btnGhost: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#111",
    cursor: "pointer",
  };
  const muted: React.CSSProperties = { fontSize: 12, color: "#666" };

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Admin Görevleri</h1>

      {/* Filtre barı — sade */}
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

        <button type="submit" style={btnGhost} disabled={loading}>
          {loading ? "Yükleniyor…" : "Listele"}
        </button>
        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
        {msg && <span style={{ color: "#1b6f1b", fontSize: 12 }}>{msg}</span>}
      </form>

      {/* Gruplar — açılır/kapanır listeler */}
      {!groups.length && !loading && <div style={{ ...card, color: "#777" }}>Kayıt yok.</div>}

      {groups.map((g) => {
        const isOpen = open[g.shift];
        const toggle = () => setOpen((s) => ({ ...s, [g.shift]: !s[g.shift] }));
        const total = g.items.length;
        const done = g.items.filter((x) => x.status === "done").length;
        const late = g.items.filter((x) => x.status === "late").length;

        return (
          <section key={g.shift} style={section}>
            <div style={head} onClick={toggle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 700 }}>{g.shift} Vardiyası</span>
                <span style={muted}>
                  {total} görev • <span style={{ color: "#177245" }}>✅ {done}</span> •{" "}
                  <span style={{ color: "#a20000" }}>⏰ {late}</span>
                </span>
              </div>
              <div style={{ fontSize: 18 }}>{isOpen ? "▾" : "▸"}</div>
            </div>

            {isOpen && (
              <div>
                {g.items.map((r, i) => (
                  <div key={r.id} style={{ ...rowBox, background: i % 2 ? "#fafafa" : "#fff" }}>
                    {/* Sol: Başlık + kişi */}
                    <div>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={muted}>
                        {r.department || "-"} • {r.assignee_employee_id || "atanmamış"}
                      </div>
                    </div>

                    {/* Durum + zamanlar (IST) */}
                    <div>
                      <div style={chip(r.status)}>
                        {r.status === "done" ? "Tamamlandı" : r.status === "late" ? "Gecikmiş" : "Açık"}
                      </div>
                      {r.done_at && (
                        <div style={{ marginTop: 4, ...muted }}>
                          İşaretlenme: {fmtISTTime(r.done_at)}
                        </div>
                      )}
                    </div>

                    <div style={muted}>Bitiş: {fmtISTTime(r.due_ts)}</div>

                    {/* Aksiyon */}
                    <div style={{ display: "flex", justifyContent: "end" }}>
                      {!r.is_done ? (
                        <button style={btnPrimary} onClick={() => tick(r.id)}>
                          Tamamla
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#177245", fontWeight: 600 }}>✔</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
