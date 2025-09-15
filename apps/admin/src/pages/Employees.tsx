// apps/admin/src/pages/Employees.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Employee = {
  employee_id: string;
  full_name: string;
  email?: string | null;
  team_id?: number | null;
  title?: string | null;
  hired_at?: string | null; // YYYY-MM-DD
  status: string;
  telegram_username?: string | null;
  telegram_user_id?: number | null;
  phone?: string | null;
  salary_gross?: number | null;
  notes?: string | null;
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
        telegram_username: emp.telegram_username ?? "",
        telegram_user_id: emp.telegram_user_id ?? undefined,
        phone: emp.phone ?? "",
        salary_gross: (emp.salary_gross as any) ?? undefined,
        notes: emp.notes ?? "",
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
      const assign = (k: keyof Employee) => {
        const v = (form as any)[k];
        if (v !== undefined) payload[k] = v === "" ? null : v;
      };
      ["full_name","email","title","status","hired_at","telegram_username","phone","notes"].forEach(k => assign(k as any));
      if (form.team_id !== undefined) payload.team_id = form.team_id === ("" as any) ? null : Number(form.team_id);
      if (form.telegram_user_id !== undefined) payload.telegram_user_id = (form.telegram_user_id as any) === "" ? null : Number(form.telegram_user_id);
      if (form.salary_gross !== undefined) payload.salary_gross = form.salary_gross === ("" as any) ? null : Number(form.salary_gross);

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
              <th style={{ textAlign: "left", padding: 8, width: 140 }}>İşlem</th>
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
                <td style={{ padding: 8, display: "flex", gap: 8 }}>
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

      {/* Düzenle Modal – modern kart görünüm */}
      {editingId && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.40)",
          display: "grid", placeItems: "center", zIndex: 1000
        }}>
          <form onSubmit={saveEdit} style={{
            width: 720, background: "#fff", borderRadius: 16, padding: 20,
            boxShadow: "0 18px 40px rgba(0,0,0,0.25)", display: "grid", gap: 16
          }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Personel Kartı • {editingId}</h2>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setEditingId(null)}>Kapat</button>
                <button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
              </div>
            </div>

            {/* GRID – 2 kolon */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Sol */}
              <div style={{ display: "grid", gap: 10 }}>
                <label>Ad Soyad
                  <input value={form.full_name ?? ""} onChange={(e)=>setForm({...form, full_name: e.target.value})} />
                </label>

                <label>Telegram Kullanıcı Adı
                  <input placeholder="@kullanici" value={form.telegram_username ?? ""} onChange={(e)=>setForm({...form, telegram_username: e.target.value})} />
                </label>

                <label>Telegram User ID
                  <input placeholder="örn. 8147xxxxx" value={form.telegram_user_id ?? "" as any} onChange={(e)=>setForm({...form, telegram_user_id: e.target.value === "" ? undefined : Number(e.target.value)})} />
                </label>

                <label>Telefon
                  <input placeholder="+905xxxxxxxxx" value={form.phone ?? ""} onChange={(e)=>setForm({...form, phone: e.target.value})} />
                </label>

                <label>E-posta
                  <input value={form.email ?? ""} onChange={(e)=>setForm({...form, email: e.target.value})} />
                </label>
              </div>

              {/* Sağ */}
              <div style={{ display: "grid", gap: 10 }}>
                <label>Ünvan
                  <input value={form.title ?? ""} onChange={(e)=>setForm({...form, title: e.target.value})} />
                </label>

                <label>Takım ID
                  <input value={form.team_id ?? ""} onChange={(e)=>setForm({...form, team_id: e.target.value === "" ? undefined : Number(e.target.value)})} />
                </label>

                <label>İşe Başlama
                  <input type="date" value={form.hired_at ?? ""} onChange={(e)=>setForm({...form, hired_at: e.target.value})} />
                </label>

                <label>Maaş (brüt)
                  <input type="number" step="0.01" placeholder="örn. 35000" value={form.salary_gross ?? "" as any} onChange={(e)=>setForm({...form, salary_gross: e.target.value === "" ? undefined : Number(e.target.value)})} />
                </label>

                <label>Durum
                  <select value={form.status ?? "active"} onChange={(e)=>setForm({...form, status: e.target.value})}>
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </label>
              </div>
            </div>

            <label>Notlar
              <textarea rows={4} placeholder="İç notlar…" value={form.notes ?? ""} onChange={(e)=>setForm({...form, notes: e.target.value})} />
            </label>

            {err && <div style={{ color:"#b00020", fontSize:12 }}>{err}</div>}
            {ok && <div style={{ color:"green", fontSize:12 }}>{ok}</div>}
          </form>
        </div>
      )}
    </div>
  );
}
