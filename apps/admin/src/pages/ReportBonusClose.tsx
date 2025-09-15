// apps/admin/src/pages/ReportBonusClose.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Trend = { emoji: string; pct: number | null; team_avg_close_sec: number | null };
type Row = {
  employee_id: string;
  full_name: string;
  department: string;
  count_total: number;      // İşlem Sayısı
  avg_first_sec: number | null; // Ø İlk Yanıt (sn)
  avg_close_sec: number;    // Ø Sonuçlandırma (sn)
  trend: Trend;             // Trend (ekip karşılaştırma)
};

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function ReportBonusClose() {
  const [rows, setRows] = useState<Row[]>([]);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [order, setOrder] = useState<"avg_asc" | "avg_desc" | "cnt_desc">("avg_asc");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null); setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (from) qs.set("frm", from);
      if (to) qs.set("to", to);
      qs.set("order", order);
      qs.set("limit", "200");
      const data = await apiGet<Row[]>(`/reports/bonus/close-time?${qs.toString()}`);
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Rapor alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Bonus • Kapanış Süresi (Kişi Bazlı)</h1>

      <form onSubmit={(e)=>{e.preventDefault(); load();}} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
        <select value={order} onChange={(e)=>setOrder(e.target.value as any)}>
          <option value="avg_asc">Ø Sonuçlandırma (artan)</option>
          <option value="avg_desc">Ø Sonuçlandırma (azalan)</option>
          <option value="cnt_desc">İşlem Sayısı (çoktan aza)</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
      </form>

      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Personel</th>
              <th style={{ textAlign: "right", padding: 8, width: 120 }}>İşlem Sayısı</th>
              <th style={{ textAlign: "right", padding: 8, width: 160 }}>Ø İlk Yanıt (sn)</th>
              <th style={{ textAlign: "right", padding: 8, width: 180 }}>Ø Sonuçlandırma (sn)</th>
              <th style={{ textAlign: "left", padding: 8, width: 140 }}>Trend</th>
              <th style={{ textAlign: "left", padding: 8, width: 120 }}>Kişi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} style={{ borderTop: "1px solid #f1f1f1" }}>
                <td style={{ padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                  <div style={{ fontSize: 12, color: "#666" }}>{r.employee_id} • {r.department}</div>
                </td>
                <td style={{ padding: 8, textAlign: "right" }}>{r.count_total}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{r.avg_first_sec ?? "—"}</td>
                <td style={{ padding: 8, textAlign: "right" }}>{r.avg_close_sec}</td>
                <td style={{ padding: 8 }}>
                  {r.trend.emoji}{" "}
                  {r.trend.pct === null ? "—" : `${r.trend.pct > 0 ? "+" : ""}${r.trend.pct}%`}
                </td>
                <td style={{ padding: 8 }}>
                  <Link to={`/employees/${encodeURIComponent(r.employee_id)}?tab=activity`}>Kişi sayfası</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 12, color: "#777" }}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
