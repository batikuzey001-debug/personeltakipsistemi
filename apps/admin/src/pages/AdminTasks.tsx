// apps/admin/src/pages/AdminTasks.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

type Task = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  assignee_employee_id: string | null;
  due_ts: string | null;
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
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts))
    : "—";

export default function AdminTasks() {
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");

  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function materialize(): Promise<void> {
    try {
      const res = await api<{ created: number; skipped: number }>(`/admin-tasks/materialize`, { method: "POST" });
      if (res?.created) {
        setMsg(`Bugün oluşturulan görev: ${res.created}`);
        setTimeout(() => setMsg(""), 1500);
      }
    } catch (e: any) {
      setErr(e?.message || "Günlük görevler oluşturulamadı");
      setTimeout(() => setErr(null), 1800);
    }
  }

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", "open");
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

  async function refreshAll() {
    await materialize();
    await load();
  }

  useEffect(() => {
    (async () => {
      await materialize();
      await load();
    })();
  }, []); // ilk açılış

  useEffect(() => {
    load();
  }, [shift, dept]); // filtre

  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "admin").trim();
      const t = await api<Task>(`/admin-tasks/${id}/tick`, { method: "PATCH", body: JSON.stringify({ who }) });
      setRows((prev) => prev.map((x) => (x.id === id ? t : x)));
      setMsg("Görev tamamlandı");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Tamamlama başarısız");
      setTimeout(() => setErr(null), 1800);
    }
  }

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin Görevleri</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refreshAll} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "160px 180px 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Vardiya</div>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">Tümü</option>
            <option>Gece</option>
            <option>Sabah</option>
            <option>Öğlen</option>
            <option>Akşam</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Departman</div>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Tümü</option>
            <option>Admin</option>
            <option>Finans</option>
            <option>Bonus</option>
            <option>LC</option>
          </select>
        </div>
        <div style={{ textAlign: "right", color: "#6b7280", alignSelf: "end" }}>
          {filtered.filter(x=>x.status==="open").length} açık • {filtered.filter(x=>x.status==="late").length} gecikmiş • {filtered.length} toplam
        </div>
      </div>

      <div style={{ border: "1px solid #eef0f4", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 120px 160px 160px 120px", gap: 8, padding: 10, background: "#f9fafb", fontWeight: 700, fontSize: 12 }}>
          <div>Görev</div><div>Vardiya</div><div>Departman</div><div>Bitiş</div><div style={{ textAlign: "right" }}>Aksiyon</div>
        </div>
        {filtered.map((t, i) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 120px 160px 160px 120px", gap: 8, padding: 10, borderTop: "1px solid #eef0f4", background: i%2 ? "#fff" : "#fcfcfc" }}>
            <div>
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {t.assignee_employee_id ? `Kişi: ${t.assignee_employee_id}` : "Kişi: —"}
              </div>
              {t.done_at && <div style={{ fontSize: 12, color: "#6b7280" }}>İşaretlenme: {fmtIST(t.done_at)}</div>}
            </div>
            <div style={{ fontSize: 12 }}>{t.shift || "—"}</div>
            <div style={{ fontSize: 12 }}>{t.department || "—"}</div>
            <div style={{ fontSize: 12 }}>{fmtIST(t.due_ts)}</div>
            <div style={{ textAlign: "right" }}>
              {!t.is_done ? (
                <button onClick={() => tick(t.id)}>Tamamla</button>
              ) : (
                <span style={{ fontWeight: 700, color: "#166534" }}>✔</span>
              )}
            </div>
          </div>
        ))}
        {!loading && !filtered.length && <div style={{ padding: 16, color: "#6b7280" }}>Kayıt yok.</div>}
      </div>

      {(err || msg) && (
        <div style={{ position: "fixed", right: 16, bottom: 16, padding: "8px 10px", borderRadius: 10, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow: "0 6px 20px rgba(16,24,40,0.08)", fontSize: 13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
