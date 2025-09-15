// apps/admin/src/pages/Employees.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Employee = {
  employee_id: string;
  full_name: string;
  email?: string | null;
  team_id?: number | null;
  title?: string | null;
  hired_at?: string | null; // YYYY-MM-DD veya null
  status: string;
};

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function apiPatch<T>(path: string, body: any): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function Employees() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Düzenleme modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (teamId.trim()) params.set("team_id", teamId.trim());
      params.set("limit", String(limit));
      params.set("offset", "0");
      const data = await apiGet<Employee[]>(`/employees?${params.toString()}`);
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function onSearch(e: React.FormEvent) { e.preventDefault(); load(); }

  async function openEdit(id: string) {
    setErr(null); setOk(null);
    try {
      const emp = await apiGet<Employee>(`/employees/${encodeURIComponent(id)}`);
      setEditingId(emp.employee_id);
      setForm({
        full_name: emp.full_name ?? "",
        email: emp.email ?? "",
        title: emp.title ?? "",
        team_id: emp.team_id ?? undefined,
        hired_at: emp.hired_at ?? "",
        status: emp.status ?? "active",
      });
    } catch (e: any) {
      setErr(e?.message || "Kayıt alınamadı");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSaving(true); setErr(null); setOk(null);
    try {
      const payload: any = {};
      // Sadece gönderilen alanları yolla
      ["full_name","email","title","status","hired_at"].forEach((k) => {
        const v = (form as any)[k];
        if (v !== undefined) payload[k] = v === "" ? null : v;
      });
      if (form.team_id !== undefined)
        payload.team_id = form.team_id === ("" as any) ? null : Number(form.team_id);

      await apiPatch<Employee>(`/employees/${encodeURIComponent(editingId)}`, payload);
      setOk("Kayıt güncellendi");
      setEditingId(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Personeller</h1>

      {/* Filtreler */}
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input placeholder="Ara (ad / e-posta)" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: 8, minWidth: 260 }} />
        <input placeholder="Takım ID (ops.)" value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ padding: 8, width: 140 }} />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ padding: 8 }}>
          {[20, 50, 100, 200].map((n) => (<option key={n} value={n}>{n}</option>))}
        </select>
        <button type="submit" disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
        {ok && <span style={{ color: "green", fontSize: 12 }}>{ok}</span>}
      </form>

      {/* Tablo */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Employee ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>Ad Soyad</th>
              <th style={{ textAlign: "left", padding: 8 }}>Ünvan</th>
              <th style={{ textAlign: "left", padding: 8 }}>Takım ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>İşe Başlama</th>
              <th style={{ textAlign: "left", padding: 8 }}>Durum</th>
              <th style={{ textAlign: "left", padding: 8, width: 120 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} style={{ borderTop: "1px solid #f1f1f1" }}>
                <td style={{ padding: 8, fontFamily: "monospace" }}>{r.employee_id}</td>
                <td style={{ padding: 8 }}>{r.full_name}</td>
                <td style={{ padding: 8 }}>{r.title ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.team_id ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.hired_at ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.status}</td>
                <td style={{ padding: 8 }}>
                  <button onClick={() => openEdit(r.employee_id)}>Düzenle</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 12, color: "#777" }}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
          display: "grid", placeItems: "center", zIndex: 50
        }}>
          <form onSubmit={saveEdit} style={{
            width: 520, background: "#fff", borderRadius: 12, padding: 16,
            boxShadow: "0 12px 32px rgba(0,0,0,0.2)", display: "grid", gap: 10
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Düzenle: {editingId}</h3>
              <div style={{ marginLeft: "auto" }}>
                <button type="button" onClick={() => setEditingId(null)}>Kapat</button>
              </div>
            </div>

            <label>Ad Soyad
              <input value={form.full_name ?? ""} onChange={(e)=>setForm({...form, full_name: e.target.value})} />
            </label>

            <label>E-posta
              <input value={form.email ?? ""} onChange={(e)=>setForm({...form, email: e.target.value})} />
            </label>

            <label>Ünvan
              <input value={form.title ?? ""} onChange={(e)=>setForm({...form, title: e.target.value})} />
            </label>

            <label>Takım ID
              <input
                value={form.team_id ?? ""}
                onChange={(e)=>setForm({...form, team_id: e.target.value === "" ? undefined : Number(e.target.value)})}
              />
            </label>

            <label>İşe Başlama
              <input type="date" value={form.hired_at ?? ""} onChange={(e)=>setForm({...form, hired_at: e.target.value})} />
            </label>

            <label>Durum
              <select value={form.status ?? "active"} onChange={(e)=>setForm({...form, status: e.target.value})}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>

            {/* Model genişleyince açılacak alanlar:
            <label>Telegram Username
              <input value={(form as any).telegram_username ?? ""} onChange={(e)=>setForm({...form, telegram_username: e.target.value})} />
            </label>
            <label>Telefon
              <input value={(form as any).phone ?? ""} onChange={(e)=>setForm({...form, phone: e.target.value})} />
            </label>
            <label>Maaş (brüt)
              <input type="number" step="0.01" value={(form as any).salary_gross ?? ""} onChange={(e)=>setForm({...form, salary_gross: Number(e.target.value)})} />
            </label>
            <label>Notlar
              <textarea value={(form as any).notes ?? ""} onChange={(e)=>setForm({...form, notes: e.target.value})} />
            </label>
            */}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={()=>setEditingId(null)}>İptal</button>
              <button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
            </div>

            {err && <div style={{ color:"#b00020", fontSize:12 }}>{err}</div>}
            {ok && <div style={{ color:"green", fontSize:12 }}>{ok}</div>}
          </form>
        </div>
      )}
    </div>
  );
}
