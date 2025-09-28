// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

type Template = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  default_assignee: string | null;
  is_active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

export default function AdminTaskTemplates() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Basit ekleme formu
  const [title, setTitle] = useState("");
  const [shift, setShift] = useState("");
  const [dept, setDept] = useState("");
  const [assignee, setAssignee] = useState("");
  const [active, setActive] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      // yalnız aktif şablonlar (backend zaten filtreliyor)
      const data = await api<Template[]>(`/admin-tasks/templates?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Şablonlar alınamadı");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createOne() {
    if (!title.trim()) { setErr("Başlık gerekli"); setTimeout(()=>setErr(null),1200); return; }
    try {
      const body = { title: title.trim(), shift: shift || null, department: dept || null, default_assignee: assignee || null, is_active: active };
      const t = await api<Template>(`/admin-tasks/templates`, { method: "POST", body: JSON.stringify(body) });
      setRows((prev) => [t, ...prev]);
      setTitle(""); setShift(""); setDept(""); setAssignee(""); setActive(true);
      setMsg("Şablon eklendi"); setTimeout(()=>setMsg(""),1200);
    } catch (e: any) {
      setErr(e?.message || "Şablon eklenemedi"); setTimeout(()=>setErr(null),1500);
    }
  }

  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !t.is_active }) });
      setRows((prev) => prev.map((x) => (x.id === t.id ? res : x)));
    } catch (e: any) {
      setErr(e?.message || "Durum değişmedi"); setTimeout(()=>setErr(null),1500);
    }
  }

  async function removeTpl(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try {
      await api(`/admin-tasks/templates/${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Şablon silinemedi"); setTimeout(()=>setErr(null),1500);
    }
  }

  async function materializeToday() {
    try {
      const res = await api<{created:number; skipped:number}>(`/admin-tasks/materialize`, { method: "POST" });
      setMsg(`Bugün oluşturulan görev: ${res.created} • Atlanan: ${res.skipped}`); setTimeout(()=>setMsg(""),1600);
    } catch (e: any) {
      setErr(e?.message || "Görev üretilemedi"); setTimeout(()=>setErr(null),1600);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Görev Şablonları</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
          <button onClick={materializeToday}>Bugünün Görevlerini Üret</button>
        </div>
      </div>

      <div style={{ border: "1px solid #eef0f4", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Yeni Şablon</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 140px 160px minmax(160px,1fr) 140px", gap: 8, alignItems: "end" }}>
          <div><input placeholder="Başlık" value={title} onChange={(e)=>setTitle(e.target.value)} /></div>
          <div>
            <select value={shift} onChange={(e)=>setShift(e.target.value)}>
              <option value="">Vardiya —</option>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <select value={dept} onChange={(e)=>setDept(e.target.value)}>
              <option value="">Departman —</option>
              <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
          <div><input placeholder="Varsayılan kişi (örn: RD-021)" value={assignee} onChange={(e)=>setAssignee(e.target.value)} /></div>
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)} /> aktif
            </label>
            <button onClick={createOne}>Ekle</button>
          </div>
        </div>
      </div>

      <div style={{ border: "1px solid #eef0f4", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 120px 160px minmax(160px,1fr) 160px", gap: 8, padding: 10, background: "#f9fafb", fontWeight: 700, fontSize: 12 }}>
          <div>Başlık</div><div>Vardiya</div><div>Departman</div><div>Varsayılan Kişi</div><div style={{ textAlign: "right" }}>Aksiyon</div>
        </div>
        {rows.map((t, i) => (
          <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 120px 160px minmax(160px,1fr) 160px", gap: 8, padding: 10, borderTop: "1px solid #eef0f4", background: i%2 ? "#fff" : "#fcfcfc" }}>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
            <div style={{ fontSize: 12 }}>{t.shift || "—"}</div>
            <div style={{ fontSize: 12 }}>{t.department || "—"}</div>
            <div style={{ fontSize: 12 }}>{t.default_assignee || "—"}</div>
            <div style={{ textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={()=>toggleActive(t)}>{t.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
              <button onClick={()=>removeTpl(t.id)} style={{ borderColor: "#ef4444", color: "#991b1b" }}>Sil</button>
            </div>
          </div>
        ))}
        {!loading && !rows.length && <div style={{ padding: 16, color: "#6b7280" }}>Kayıt yok.</div>}
      </div>

      {(err || msg) && (
        <div style={{ position: "fixed", right: 16, bottom: 16, padding: "8px 10px", borderRadius: 10, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow: "0 6px 20px rgba(16,24,40,0.08)", fontSize: 13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
