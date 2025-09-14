import { useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

type Activity = { id: number; ts: string; channel: string; type: string; corr: string; payload: any };
type Daily = { day: string; kpi_code: string; value: number; samples: number; source: string };

export default function EmployeeDetail() {
  const [emp, setEmp] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [act, setAct] = useState<Activity[]>([]);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!emp.trim()) { setErr("employee_id giriniz (ör. RD-001)"); return; }
    setErr(null); setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const [a, d] = await Promise.all([
        apiGet<Activity[]>(`/employees/${encodeURIComponent(emp.trim())}/activity?${qs}`),
        apiGet<Daily[]>(`/employees/${encodeURIComponent(emp.trim())}/daily?${qs}`)
      ]);
      setAct(a); setDaily(d);
    } catch (e: any) {
      setErr(e?.message || "Veri alınamadı");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Personel Detay</h1>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input placeholder="employee_id (örn. RD-001)" value={emp} onChange={e=>setEmp(e.target.value)} />
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} />
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} />
        <button onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Getir"}</button>
        {err && <span style={{ color:"#b00020", fontSize:12 }}>{err}</span>}
      </div>

      {/* Aktiviteler */}
      <div style={{ border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:10, background:"#fafafa", fontWeight:600 }}>Son Aktiviteler</div>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#fafafa" }}>
              <th style={{ textAlign:"left", padding:8 }}>ts</th>
              <th style={{ textAlign:"left", padding:8 }}>channel</th>
              <th style={{ textAlign:"left", padding:8 }}>type</th>
              <th style={{ textAlign:"left", padding:8 }}>corr</th>
              <th style={{ textAlign:"left", padding:8 }}>payload</th>
            </tr>
          </thead>
          <tbody>
            {act.map(r=>(
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
            {act.length===0 && <tr><td colSpan={5} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Günlük metrikler */}
      <div style={{ border:"1px solid #eee", borderRadius:12, overflow:"hidden" }}>
        <div style={{ padding:10, background:"#fafafa", fontWeight:600 }}>Günlük Metrikler (facts_daily)</div>
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
            {daily.map((r, i)=>(
              <tr key={i} style={{ borderTop:"1px solid #f1f1f1" }}>
                <td style={{ padding:8 }}>{r.day}</td>
                <td style={{ padding:8 }}>{r.kpi_code}</td>
                <td style={{ padding:8 }}>{r.value}</td>
                <td style={{ padding:8 }}>{r.samples}</td>
                <td style={{ padding:8 }}>{r.source}</td>
              </tr>
            ))}
            {daily.length===0 && <tr><td colSpan={5} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
