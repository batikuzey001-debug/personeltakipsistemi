// apps/admin/src/pages/ReportBonusClose.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Trend = { emoji: string; pct: number | null; team_avg_close_sec: number | null };
type Row = {
  employee_id: string;
  full_name: string;
  department: string;
  count_total: number;
  avg_first_sec: number | null; // sn
  avg_close_sec: number;        // sn
  trend: Trend;                 // ekip Ø = her zaman son 7 gün
};

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

function fmtMMSS(sec: number | null) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
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

  const container: React.CSSProperties = {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 12,
    display: "grid",
    gap: 12,
  };
  const card: React.CSSProperties = {
    border: "1px solid #e9e9e9",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
  };
  const th: React.CSSProperties = {
    position: "sticky",
    top: 0,
    background: "#fff",
    borderBottom: "1px solid #eee",
    fontWeight: 600,
    fontSize: 13,
    padding: "6px 10px",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
  const tdLeft: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 13,
    textAlign: "left",
    verticalAlign: "middle",
  };
  const tdRight: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: 13,
    textAlign: "right",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  };
  const personCell: React.CSSProperties = {
    ...tdLeft,
    maxWidth: 280,
  };
  const subNote: React.CSSProperties = { fontSize: 11, color: "#666" };

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Bonus • Kapanış Performansı</h1>

      {/* Filtre barı */}
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

      {/* Bilgilendirme */}
      <div style={{ fontSize: 12, color: "#666" }}>
        Trend, **her zaman** <b>son 7 gün ekip ortalamasına</b> göre hesaplanır. Tarih seçimi yalnızca tablo satırlarını (kişisel metrikleri) sınırlar.
      </div>

      {/* Tablo */}
      <div style={card}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 360 }}>Personel</th>
              <th style={{ ...th, width: 120, textAlign: "right" }}>İşlem Sayısı</th>
              <th style={{ ...th, width: 160, textAlign: "right" }}>Ø İlk Yanıt (dk:ss)</th>
              <th style={{ ...th, width: 180, textAlign: "right" }}>Ø Sonuçlandırma (dk:ss)</th>
              <th style={{ ...th, width: 160 }}>Trend (Ekip 7G)</th>
              <th style={{ ...th, width: 120 }}>Kişi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.employee_id} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 ? "#fafafa" : "#fff" }}>
                <td style={personCell}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.full_name}
                  </div>
                  <div style={subNote}>
                    {r.employee_id} • {r.department}
                  </div>
                </td>
                <td style={tdRight}>{r.count_total}</td>
                <td style={tdRight}>{r.avg_first_sec is not None ? fmtMMSS(r.avg_first_sec) : "—"}</td>
                <td style={tdRight}>{fmtMMSS(r.avg_close_sec)}</td>
                <td style={tdLeft}>
                  <span style={{ marginRight: 6 }}>{r.trend.emoji}</span>
                  <b>{r.trend.pct is null ? "—" : `${r.trend.pct > 0 ? "+" : ""}${r.trend.pct}%`}</b>
                  <div style={subNote}>Ekip Ø: {fmtMMSS(r.trend.team_avg_close_sec)}</div>
                </td>
                <td style={tdLeft}>
                  <Link to={`/employees/${encodeURIComponent(r.employee_id)}?tab=activity`}>Kişi sayfası</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 12, fontSize: 13, color: "#777" }}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
