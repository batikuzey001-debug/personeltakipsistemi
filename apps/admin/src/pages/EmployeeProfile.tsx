// apps/admin/src/pages/EmployeeProfile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../lib/auth";

const API = import.meta.env.VITE_API_BASE_URL as string;
const DEPARTMENTS = ["Call Center", "Canlı", "Finans", "Bonus", "Admin"] as const;

type Employee = {
  employee_id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  hired_at?: string | null; // YYYY-MM-DD
  status: string;
  telegram_username?: string | null;
  telegram_user_id?: number | null;
  phone?: string | null;
  salary_gross?: number | null;
  notes?: string | null;
};

type Activity = { id: number; ts: string; channel: string; type: string; corr: string; payload: any };
type Daily = { day: string; kpi_code: string; value: number; samples: number; source: string };

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

export default function EmployeeProfile() {
  const { employee_id = "" } = useParams();
  const { auth } = useAuth();
  const canEdit = auth.role === "super_admin";

  const [emp, setEmp] = useState<Employee | null>(null);
  const [act, setAct] = useState<Activity[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [tab, setTab] = useState<"summary" | "activity" | "daily">("summary");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Employee>>({});

  async function loadAll() {
    setLoading(true); setErr(null); setOk(null);
    try {
      const empData = await apiGet<Employee>(`/employees/${encodeURIComponent(employee_id)}`);
      const actData = await apiGet<Activity[]>(`/employees/${encodeURIComponent(employee_id)}/activity?limit=100`);
      const dailyData = await apiGet<Daily[]>(`/employees/${encodeURIComponent(employee_id)}/daily`);
      setEmp(empData); setAct(actData); setDaily(dailyData);
      // form başlangıç değerleri
      setForm({
        full_name: empData.full_name ?? "",
        department: empData.department ?? "",
        email: empData.email ?? "",
        title: empData.title ?? "",
        hired_at: empData.hired_at ?? "",
        status: empData.status ?? "active",
        telegram_username: empData.telegram_username ?? "",
        telegram_user_id: empData.telegram_user_id ?? undefined,
        phone: empData.phone ?? "",
        salary_gross: (empData.salary_gross as any) ?? undefined,
        notes: empData.notes ?? "",
      });
    } catch (e: any) {
      setErr(e?.message || "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (employee_id) loadAll(); /* eslint-disable-next-line */ }, [employee_id]);

  const title = useMemo(() => emp ? `${emp.full_name} • ${emp.employee_id}` : "Personel", [emp]);

  // ---- yardımcı: alanı hem görüntü hem input olarak render et (editing'e göre) ----
  function Field({
    label, value, children, span = 1,
  }: { label: string; value: React.ReactNode; children?: React.ReactNode; span?: number }) {
    return (
      <div style={{ gridColumn: `span ${span}` }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</div>
        {editing ? children ?? <div>{value}</div> : <div style={{ fontWeight: 600 }}>{value || "—"}</div>}
      </div>
    );
  }

  async function saveSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!emp) return;
    setSaving(true); setErr(null); setOk(null);
    try {
      const payload: any = {};
      const assign = (k: keyof Employee) => { const v = (form as any)[k]; if (v !== undefined) payload[k] = v === "" ? null : v; };
      ["full_name","email","title","status","hired_at","phone","notes","department"].forEach(k => assign(k as any));
      // telegram_* alanları sadece görüntülük; backend zaten otomatik eşliyor. Yine de boş değilse değişmeyecek.
      await apiPatch<Employee>(`/employees/${encodeURIComponent(emp.employee_id)}`, payload);
      setOk("Kart güncellendi");
      setEditing(false);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{title}</h1>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setTab("summary")} disabled={tab==="summary"}>Özet</button>
        <button onClick={() => setTab("activity")} disabled={tab==="activity"}>Aktiviteler</button>
        <button onClick={() => setTab("daily")} disabled={tab==="daily"}>Günlük Metrikler</button>
        <div style={{ marginLeft: "auto" }}>
          {canEdit && tab==="summary" && (
            !editing
              ? <button onClick={() => setEditing(true)}>Düzenle</button>
              : <button form="emp-summary-form" type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          )}
          {loading && <span style={{ marginLeft: 8 }}>Yükleniyor…</span>}
        </div>
      </div>

      {err && <div style={{ color:"#b00020" }}>{err}</div>}
      {ok && <div style={{ color:"green" }}>{ok}</div>}

      {/* ÖZET (görüntü modu → daha derli toplu; düzenle modunda aynı düzenin içinde inputlar açılır) */}
      {tab === "summary" && emp && (
        <form id="emp-summary-form" onSubmit={saveSummary} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <Field label="Employee ID" value={emp.employee_id} />
            <Field label="Durum" value={emp.status}>
              <select value={form.status ?? "active"} onChange={(e)=>setForm({...form, status: e.target.value})} disabled={!editing}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>

            <Field label="Ad Soyad" value={emp.full_name}>
              <input value={form.full_name ?? ""} onChange={(e)=>setForm({...form, full_name: e.target.value})} disabled={!editing} />
            </Field>

            <Field label="Departman" value={emp.department ?? "—"}>
              <select value={form.department ?? ""} onChange={(e)=>setForm({...form, department: e.target.value})} disabled={!editing}>
                <option value="">Seçiniz</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>

            <Field label="Ünvan" value={emp.title ?? "—"}>
              <input value={form.title ?? ""} onChange={(e)=>setForm({...form, title: e.target.value})} disabled={!editing} />
            </Field>

            <Field label="İşe Başlama" value={emp.hired_at ?? "—"}>
              <input type="date" value={form.hired_at ?? ""} onChange={(e)=>setForm({...form, hired_at: e.target.value})} disabled={!editing} />
            </Field>

            <Field label="E-posta" value={emp.email ?? "—"}>
              <input value={form.email ?? ""} onChange={(e)=>setForm({...form, email: e.target.value})} disabled={!editing} />
            </Field>

            <Field label="Telefon" value={emp.phone ?? "—"}>
              <input value={form.phone ?? ""} onChange={(e)=>setForm({...form, phone: e.target.value})} disabled={!editing} placeholder="+905xxxxxxxxx" />
            </Field>

            <Field label="Telegram Username" value={emp.telegram_username ?? "—"}>
              <input value={emp.telegram_username ?? ""} disabled />
            </Field>

            <Field label="Telegram User ID" value={emp.telegram_user_id ?? "—"}>
              <input value={emp.telegram_user_id ?? "" as any} disabled />
            </Field>

            <Field label="Maaş (brüt)" value={emp.salary_gross ?? "—"}>
              <input type="number" step="0.01" value={form.salary_gross ?? "" as any} onChange={(e)=>setForm({...form, salary_gross: e.target.value === "" ? undefined : Number(e.target.value)})} disabled={!editing} />
            </Field>

            <Field label="Notlar" value={<span style={{ whiteSpace:"pre-wrap" }}>{emp.notes ?? "—"}</span>} span={2}>
              <textarea rows={4} value={form.notes ?? ""} onChange={(e)=>setForm({...form, notes: e.target.value})} disabled={!editing} />
            </Field>
          </div>
        </form>
      )}

      {/* AKTİVİTELER */}
      {tab === "activity" && (
        <div style={{ border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#fafafa" }}>
                <th style={{ textAlign:"left", padding:8 }}>Tarih</th>
                <th style={{ textAlign:"left", padding:8 }}>Kanal</th>
                <th style={{ textAlign:"left", padding:8 }}>Tip</th>
                <th style={{ textAlign:"left", padding:8 }}>Corr</th>
                <th style={{ textAlign:"left", padding:8 }}>İçerik</th>
              </tr>
            </thead>
            <tbody>
              {act.map(r => (
                <tr key={r.id} style={{ borderTop:"1px solid #f1f1f1" }}>
                  <td style={{ padding:8, whiteSpace:"nowrap" }}>{new Date(r.ts).toLocaleString()}</td>
                  <td style={{ padding:8 }}>{r.channel}</td>
                  <td style={{ padding:8 }}>{r.type}</td>
                  <td style={{ padding:8 }}>{r.corr}</td>
                  <td style={{ padding:8, fontFamily:"monospace", fontSize:12, whiteSpace:"pre-wrap" }}>
                    {typeof r.payload === "object" ? JSON.stringify(r.payload, null, 2) : String(r.payload ?? "")}
                  </td>
                </tr>
              ))}
              {act.length === 0 && <tr><td colSpan={5} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* GÜNLÜK METRİKLER */}
      {tab === "daily" && (
        <div style={{ border:"1px solid "#eee", borderRadius:12, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:"#fafafa" }}>
                <th style={{ textAlign:"left", padding:8 }}>Gün</th>
                <th style={{ textAlign:"left", padding:8 }}>KPI</th>
                <th style={{ textAlign:"left", padding:8 }}>Değer</th>
                <th style={{ textAlign:"left", padding:8 }}>Örnek</th>
                <th style={{ textAlign:"left", padding:8 }}>Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r, i) => (
                <tr key={i} style={{ borderTop:"1px solid #f1f1f1" }}>
                  <td style={{ padding:8 }}>{r.day}</td>
                  <td style={{ padding:8 }}>{r.kpi_code}</td>
                  <td style={{ padding:8 }}>{r.value}</td>
                  <td style={{ padding:8 }}>{r.samples}</td>
                  <td style={{ padding:8 }}>{r.source}</td>
                </tr>
              ))}
              {daily.length === 0 && <tr><td colSpan={5} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
