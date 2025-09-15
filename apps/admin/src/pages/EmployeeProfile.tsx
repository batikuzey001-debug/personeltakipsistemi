// apps/admin/src/pages/EmployeeProfile.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Employee = {
  employee_id: string;
  full_name: string;
  email?: string | null;
  department?: string | null;
  title?: string | null;
  hired_at?: string | null;
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

export default function EmployeeProfile() {
  const { employee_id = "" } = useParams();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [act, setAct] = useState<Activity[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [tab, setTab] = useState<"summary" | "activity" | "daily">("summary");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadAll() {
    setLoading(true); setErr(null);
    try {
      const empData = await apiGet<Employee>(`/employees/${encodeURIComponent(employee_id)}`);
      const actData = await apiGet<Activity[]>(`/employees/${encodeURIComponent(employee_id)}/activity?limit=100`);
      const dailyData = await apiGet<Daily[]>(`/employees/${encodeURIComponent(employee_id)}/daily`);
      setEmp(empData); setAct(actData); setDaily(dailyData);
    } catch (e: any) {
      setErr(e?.message || "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (employee_id) loadAll(); /* eslint-disable-next-line */ }, [employee_id]);

  const title = useMemo(() => emp ? `${emp.full_name} • ${emp.employee_id}` : "Personel", [emp]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>{title}</h1>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setTab("summary")} disabled={tab==="summary"}>Özet</button>
        <button onClick={() => setTab("activity")} disabled={tab==="activity"}>Aktiviteler</button>
        <button onClick={() => setTab("daily")} disabled={tab==="daily"}>Günlük Metrikler</button>
        <div style={{ marginLeft: "auto" }}>{loading && <span>Yükleniyor…</span>}</div>
      </div>

      {err && <div style={{ color:"#b00020" }}>{err}</div>}

      {/* ÖZET */}
      {tab === "summary" && emp && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ border:"1px solid #eee", borderRadius:12, padding:12 }}>
            <h3>Kimlik</h3>
            <div><b>Employee ID:</b> {emp.employee_id}</div>
            <div><b>Ad Soyad:</b> {emp.full_name}</div>
            <div><b>Departman:</b> {emp.department ?? "-"}</div>
            <div><b>Ünvan:</b> {emp.title ?? "-"}</div>
            <div><b>Durum:</b> {emp.status}</div>
            <div><b>İşe Başlama:</b> {emp.hired_at ?? "-"}</div>
          </div>
          <div style={{ border:"1px solid #eee", borderRadius:12, padding:12 }}>
            <h3>İletişim & Telegram</h3>
            <div><b>E-posta:</b> {emp.email ?? "-"}</div>
            <div><b>Telefon:</b> {emp.phone ?? "-"}</div>
            <div><b>Telegram Username:</b> {emp.telegram_username ?? "-"}</div>
            <div><b>Telegram User ID:</b> {emp.telegram_user_id ?? "-"}</div>
            <div><b>Maaş (brüt):</b> {emp.salary_gross ?? "-"}</div>
          </div>
          <div style={{ gridColumn: "1 / -1", border:"1px solid #eee", borderRadius:12, padding:12 }}>
            <h3>Notlar</h3>
            <div style={{ whiteSpace:"pre-wrap" }}>{emp.notes ?? "—"}</div>
          </div>
      </div>
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
        <div style={{ border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
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
