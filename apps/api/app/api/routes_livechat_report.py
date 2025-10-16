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
  livechat_email?: string | null;     // ✅ LiveChat eşlemesi
};

type Activity = { id: number; ts: string; channel: string; type: string; corr: string; payload: any };
type Daily = { day: string; kpi_code: string; value: number; samples: number; source: string };

type LivechatDaily = {
  date: string;
  employee_id: string;
  agent_email: string;
  kpi: {
    total_chats: number;
    frt_sec: number | null;
    art_sec: number | null;
    aht_sec: number | null;
    csat_percent: number | null;
    csat_good?: number | null;
    csat_bad?: number | null;
    csat_total?: number | null;
    logged_in_hours?: number | null;
    accepting_hours?: number | null;
    not_accepting_hours?: number | null;
    chatting_hours?: number | null;
    transfer_out?: number | null;
  };
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

function Sec({ v }: { v?: number | null }) {
  if (v == null || Number.isNaN(v)) return <>-</>;
  const s = Math.round(Number(v));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return <>{m}:{r.toString().padStart(2, "0")}</>;
}

function Hrs({ v }: { v?: number | null }) {
  if (v == null || Number.isNaN(v)) return <>-</>;
  return <>{Number(v).toFixed(2)}</>;
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

  // Düzenleme durumu
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Employee>>({});

  // LiveChat günlük kart durumu
  const [lcDate, setLcDate] = useState(new Date().toISOString().slice(0, 10));
  const [lcData, setLcData] = useState<LivechatDaily | null>(null);
  const [lcErr, setLcErr] = useState<string | null>(null);
  const [lcLoading, setLcLoading] = useState(false);

  async function loadAll() {
    setLoading(true); setErr(null); setOk(null);
    try {
      const empData = await apiGet<Employee>(`/employees/${encodeURIComponent(employee_id)}`);
      const actData = await apiGet<Activity[]>(`/employees/${encodeURIComponent(employee_id)}/activity?limit=100`);
      const dailyData = await apiGet<Daily[]>(`/employees/${encodeURIComponent(employee_id)}/daily`);
      setEmp(empData); setAct(actData); setDaily(dailyData);
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
        livechat_email: empData.livechat_email ?? "", // ✅ form alanına al
      });
      setEditing(false);
    } catch (e: any) {
      setErr(e?.message || "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }

  async function loadLivechatDaily() {
    if (!employee_id) return;
    setLcLoading(true); setLcErr(null);
    try {
      const d = await apiGet<LivechatDaily>(`/report/daily/employee/${encodeURIComponent(employee_id)}?date=${lcDate}`);
      setLcData(d);
    } catch (e: any) {
      setLcErr(e?.message || "LiveChat verisi alınamadı");
      setLcData(null);
    } finally {
      setLcLoading(false);
    }
  }

  useEffect(() => { if (employee_id) loadAll(); /* eslint-disable-next-line */ }, [employee_id]);
  useEffect(() => { if (employee_id) loadLivechatDaily(); /* eslint-disable-next-line */ }, [employee_id]);

  const title = useMemo(
    () => (emp ? `${emp.full_name} • ${emp.employee_id}` : "Personel"),
    [emp]
  );

  function Row({
    label,
    view,
    edit,
    span = 1,
  }: {
    label: string;
    view: React.ReactNode;
    edit?: React.ReactNode;
    span?: number;
  }) {
    return (
      <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{label}</div>
        <div style={{ fontWeight: editing ? 400 : 600, wordBreak: "break-word" }}>
          {editing ? (edit ?? view) : (view ?? "—")}
        </div>
      </div>
    );
  }

  async function saveSummary(e: React.FormEvent) {
    e.preventDefault();
    if (!emp) return;
    setSaving(true); setErr(null); setOk(null);
    try {
      const payload: any = {};
      const assign = (k: keyof Employee) => {
        const v = (form as any)[k];
        if (v !== undefined) payload[k] = v === "" ? null : v;
      };
      ["full_name","email","title","status","hired_at","phone","notes","department","livechat_email"].forEach(k => assign(k as any)); // ✅ livechat_email dahil
      const updated = await apiPatch<Employee>(`/employees/${encodeURIComponent(emp.employee_id)}`, payload);
      setOk("Değişiklikler kaydedildi.");
      setEmp(updated);
      setEditing(false);
      // LiveChat email güncellendiyse kartı yenileyelim
      loadLivechatDaily();
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 16,
        display: "grid",
        gap: 16,
      }}
    >
      {/* Başlık ve sekmeler */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>{title}</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setTab("summary")} disabled={tab === "summary"}>Özet</button>
          <button type="button" onClick={() => setTab("activity")} disabled={tab === "activity"}>Aktiviteler</button>
          <button type="button" onClick={() => setTab("daily")} disabled={tab === "daily"}>Günlük Metrikler</button>
        </div>
      </div>

      {/* Bilgi mesajları */}
      <div>
        {loading && <span>Yükleniyor…</span>}
        {err && <div style={{ color: "#b00020" }}>{err}</div>}
        {ok && <div style={{ color: "green" }}>{ok}</div>}
      </div>

      {/* ÖZET */}
      {tab === "summary" && emp && (
        <form
          id="emp-summary-form"
          onSubmit={saveSummary}
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}
        >
          {/* Kart 1 */}
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
            <h3 style={{ marginTop: 0 }}>Kimlik</h3>
            <Row label="Employee ID" view={emp.employee_id} />
            <Row
              label="Durum"
              view={emp.status}
              edit={
                <select value={form.status ?? "active"} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={!editing}>
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              }
            />
            <Row
              label="Ad Soyad"
              view={emp.full_name}
              edit={<input value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={!editing} />}
            />
            <Row
              label="Departman"
              view={emp.department ?? "—"}
              edit={
                <select value={form.department ?? ""} onChange={(e) => setForm({ ...form, department: e.target.value })} disabled={!editing}>
                  <option value="">Seçiniz</option>
                  {DEPARTMENTS.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              }
            />
            <Row
              label="Ünvan"
              view={emp.title ?? "—"}
              edit={<input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={!editing} />}
            />
            <Row
              label="İşe Başlama"
              view={emp.hired_at ?? "—"}
              edit={<input type="date" value={form.hired_at ?? ""} onChange={(e) => setForm({ ...form, hired_at: e.target.value })} disabled={!editing} />}
            />
          </div>

          {/* Kart 2 */}
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
            <h3 style={{ marginTop: 0 }}>İletişim & LiveChat</h3>
            <Row
              label="E-posta"
              view={emp.email ?? "—"}
              edit={<input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!editing} />}
            />
            <Row
              label="LiveChat E-posta (eşleşme)"
              view={emp.livechat_email ?? "—"}
              edit={<input value={form.livechat_email ?? ""} onChange={(e) => setForm({ ...form, livechat_email: e.target.value })} disabled={!editing} />}
            />
            <Row
              label="Telefon"
              view={emp.phone ?? "—"}
              edit={<input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!editing} placeholder="+905xxxxxxxxx" />}
            />
            <Row label="Telegram Username" view={emp.telegram_username ?? "—"} />
            <Row label="Telegram User ID" view={emp.telegram_user_id ?? "—"} />
            <Row
              label="Maaş (brüt)"
              view={emp.salary_gross ?? "—"}
              edit={
                <input
                  type="number" step="0.01" value={form.salary_gross ?? ("" as any)}
                  onChange={(e) => setForm({ ...form, salary_gross: e.target.value === "" ? undefined : Number(e.target.value) })}
                  disabled={!editing}
                />
              }
            />
          </div>

          {/* Kart 3 – Notlar tam genişlik */}
          <div style={{ gridColumn: "1 / -1", border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
            <h3 style={{ marginTop: 0 }}>Notlar</h3>
            {editing ? (
              <textarea rows={4} style={{ width: "100%" }} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={!editing} />
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{emp.notes ?? "—"}</div>
            )}
          </div>

          {/* Düzenle / Kaydet butonları */}
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            {canEdit && !editing && (<button type="button" onClick={() => setEditing(true)}>Düzenle</button>)}
            {canEdit && editing && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    if (emp) {
                      setForm({
                        full_name: emp.full_name ?? "",
                        department: emp.department ?? "",
                        email: emp.email ?? "",
                        title: emp.title ?? "",
                        hired_at: emp.hired_at ?? "",
                        status: emp.status ?? "active",
                        telegram_username: emp.telegram_username ?? "",
                        telegram_user_id: emp.telegram_user_id ?? undefined,
                        phone: emp.phone ?? "",
                        salary_gross: (emp.salary_gross as any) ?? undefined,
                        notes: emp.notes ?? "",
                        livechat_email: emp.livechat_email ?? "",
                      });
                    }
                  }}
                >
                  İptal
                </button>
                <button type="submit" disabled={saving}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
              </>
            )}
          </div>

          {/* LiveChat – Günlük KPI Kartı (full width) */}
          <div style={{ gridColumn: "1 / -1", border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
            <div className="flex items-center gap-2" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0 }}>Canlı Destek (Günlük)</h3>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <input type="date" value={lcDate} onChange={(e) => setLcDate(e.target.value)} />
                <button type="button" onClick={loadLivechatDaily}>Yenile</button>
              </div>
            </div>
            {lcLoading && <div>Yükleniyor…</div>}
            {lcErr && <div style={{ color: "#b00020" }}>{lcErr}</div>}
            {lcData && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-8 text-sm" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12, marginTop: 12 }}>
                <Kpi label="Chat" value={lcData.kpi.total_chats ?? 0} />
                <Kpi label="FRT" value={<Sec v={lcData.kpi.frt_sec} />} />
                <Kpi label="ART" value={<Sec v={lcData.kpi.art_sec} />} />
                <Kpi label="AHT" value={<Sec v={lcData.kpi.aht_sec} />} />
                <Kpi label="CSAT %" value={lcData.kpi.csat_percent != null ? `${lcData.kpi.csat_percent.toFixed(2)}%` : "-"} />
                <Kpi label="Online h" value={<Hrs v={lcData.kpi.logged_in_hours} />} />
                <Kpi label="Accepting h" value={<Hrs v={lcData.kpi.accepting_hours} />} />
                <Kpi label="Not-accepting h" value={<Hrs v={lcData.kpi.not_accepting_hours} />} />
                <Kpi label="Chatting h" value={<Hrs v={lcData.kpi.chatting_hours} />} />
                <Kpi label="Transfer-out" value={lcData.kpi.transfer_out ?? 0} />
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "#666" }}>
                  Agent: {lcData.agent_email} • Gün: {lcData.date}
                </div>
              </div>
            )}
          </div>
        </form>
      )}

      {/* AKTİVİTELER */}
      {tab === "activity" && (
        <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Tarih</th>
                <th style={{ textAlign: "left", padding: 8 }}>Kanal</th>
                <th style={{ textAlign: "left", padding: 8 }}>Tip</th>
                <th style={{ textAlign: "left", padding: 8 }}>Corr</th>
                <th style={{ textAlign: "left", padding: 8 }}>İçerik</th>
              </tr>
            </thead>
            <tbody>
              {act.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(r.ts).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{r.channel}</td>
                  <td style={{ padding: 8 }}>{r.type}</td>
                  <td style={{ padding: 8 }}>{r.corr}</td>
                  <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {typeof r.payload === "object" ? JSON.stringify(r.payload, null, 2) : String(r.payload ?? "")}
                  </td>
                </tr>
              ))}
              {act.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#777" }}>Kayıt yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* GÜNLÜK METRİKLER (legacy günlük kayıtlar) */}
      {tab === "daily" && (
        <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={{ textAlign: "left", padding: 8 }}>Gün</th>
                <th style={{ textAlign: "left", padding: 8 }}>KPI</th>
                <th style={{ textAlign: "left", padding: 8 }}>Değer</th>
                <th style={{ textAlign: "left", padding: 8 }}>Örnek</th>
                <th style={{ textAlign: "left", padding: 8 }}>Kaynak</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r, i) => (
                <tr key={i} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8 }}>{r.day}</td>
                  <td style={{ padding: 8 }}>{r.kpi_code}</td>
                  <td style={{ padding: 8 }}>{r.value}</td>
                  <td style={{ padding: 8 }}>{r.samples}</td>
                  <td style={{ padding: 8 }}>{r.source}</td>
                </tr>
              ))}
              {daily.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 12, color: "#777" }}>Kayıt yok.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
