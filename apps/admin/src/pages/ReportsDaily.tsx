// apps/admin/src/pages/ReportsDaily.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type Channel = "bonus" | "finans";

type Trend = { emoji: string; pct: number | null; team_avg_close_sec: number | null };
type Row = {
  employee_id: string;
  full_name: string;
  department: string;
  count_total: number;
  avg_first_sec: number | null;
  avg_close_sec: number;
  trend: Trend;
};

function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m as number) - 1, d + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function fmtMMSS(sec: number | null) {
  if (sec === null || sec === undefined) return "—";
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function ReportsDaily() {
  const [channel, setChannel] = useState<Channel>("finans");
  const [from, setFrom] = useState<string>(todayYmdLocal());
  const [to, setTo] = useState<string>(addDays(todayYmdLocal(), 1)); // exclusive
  const [order, setOrder] = useState<"avg_asc" | "avg_desc" | "cnt_desc">("cnt_desc");
  const [minKt, setMinKt] = useState<number>(5);
  const [onlyDept, setOnlyDept] = useState<boolean>(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("frm", from);
      qs.set("to", to);
      qs.set("order", order);
      qs.set("limit", "200");
      if (channel === "finans") qs.set("min_kt", String(minKt)); // Bonus da destekliyorsa kaldırmadan her ikisine set edebiliriz.

      const path = `/reports/${channel}/close-time?${qs.toString()}`;
      let data = await apiGet<Row[]>(path);

      if (onlyDept) {
        const required = channel === "finans" ? "Finans" : "Bonus";
        data = data.filter((r) => (r.department || "").toLowerCase() === required.toLowerCase());
      }

      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Rapor alınamadı");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const kpi = useMemo(() => {
    const total = rows.reduce((a, r) => a + (r.count_total || 0), 0);
    const sumClose = rows.reduce((a, r) => a + (r.avg_close_sec || 0) * (r.count_total || 0), 0);
    const sumFirst = rows.reduce((a, r) => a + ((r.avg_first_sec ?? 0) * (r.count_total || 0)), 0);
    const hasFirst = rows.some((r) => r.avg_first_sec != null);
    const wAvgClose = total ? sumClose / total : null;
    const wAvgFirst = total && hasFirst ? sumFirst / total : null;
    const SLA = 900;
    const slaBreaches = rows.filter((r) => (r.avg_close_sec || 0) > SLA).length;
    return { total, wAvgClose, wAvgFirst, slaBreaches, slaSec: SLA };
  }, [rows]);

  // ----- STYLES -----
  const container: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: 12, display: "grid", gap: 12 };
  const bar: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
  const kpis: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 8 };
  const card: React.CSSProperties = { border: "1px solid #e9e9e9", borderRadius: 12, background: "#fff", padding: 12 };
  const tableCard: React.CSSProperties = { border: "1px solid #e9e9e9", borderRadius: 12, background: "#fff", overflow: "hidden" };
  const th: React.CSSProperties = { position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #eee", fontWeight: 600, fontSize: 13, padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap" };
  const tdLeft: React.CSSProperties = { padding: "6px 10px", fontSize: 13, textAlign: "left", verticalAlign: "middle" };
  const tdRight: React.CSSProperties = { padding: "6px 10px", fontSize: 13, textAlign: "right", verticalAlign: "middle", whiteSpace: "nowrap" };
  const sub: React.CSSProperties = { fontSize: 11, color: "#666" };

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Günlük Rapor · {channel === "finans" ? "Finans" : "Bonus"}</h1>

      {/* Filtre / Kontrol barı */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        style={bar}
      >
        <select value={channel} onChange={(e) => setChannel(e.target.value as Channel)} title="Kanal seç">
          <option value="finans">Finans</option>
          <option value="bonus">Bonus</option>
        </select>

        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Başlangıç (bugün)" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Bitiş (exclusive)" />

        <select value={order} onChange={(e) => setOrder(e.target.value as any)} title="Sıralama">
          <option value="cnt_desc">İşlem (çoktan aza)</option>
          <option value="avg_asc">Ø Sonuçlandırma (artan)</option>
          <option value="avg_desc">Ø Sonuçlandırma (azalan)</option>
        </select>

        {channel === "finans" && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            min KT
            <input
              type="number"
              min={0}
              max={1000}
              value={minKt}
              onChange={(e) => setMinKt(Math.max(0, Number(e.target.value || 0)))}
              style={{ width: 70 }}
              title="En az KT sayısı"
            />
          </label>
        )}

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          Yalnız departman
          <input
            type="checkbox"
            checked={onlyDept}
            onChange={(e) => setOnlyDept(e.target.checked)}
            title="Kanal ile departman eşleşsin"
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Yükleniyor…" : "Listele"}
        </button>

        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
      </form>

      {/* KPI bar */}
      <div style={kpis}>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Toplam Kapanış</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.total}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ø Sonuçlandırma</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMMSS(kpi.wAvgClose)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Ø İlk Yanıt</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{fmtMMSS(kpi.wAvgFirst)}</div>
        </div>
        <div style={card}>
          {/* DÜZELTME: ">" karakteri yerine &gt; kaçış karakteri */}
          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>SLA İhlali (&gt;{kpi.slaSec}s)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.slaBreaches}</div>
        </div>
      </div>

      {/* Liste */}
      <div style={tableCard}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 360 }}>Personel</th>
              <th style={{ ...th, width: 120, textAlign: "right" }}>İşlem</th>
              <th style={{ ...th, width: 160, textAlign: "right" }}>Ø İlk Yanıt</th>
              <th style={{ ...th, width: 180, textAlign: "right" }}>Ø Sonuçlandırma</th>
              <th style={{ ...th, width: 160 }}>Trend (7g)</th>
              <th style={{ ...th, width: 120 }}>Kişi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.employee_id}-${i}`} style={{ borderTop: "1px solid #f5f5f5", background: i % 2 ? "#fafafa" : "#fff" }}>
                <td style={tdLeft}>
                  <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.full_name}
                  </div>
                  <div style={sub}>
                    {r.employee_id} • {r.department || "-"}
                  </div>
                </td>

                <td style={tdRight}>{r.count_total}</td>
                <td style={tdRight}>{r.avg_first_sec != null ? fmtMMSS(r.avg_first_sec) : "—"}</td>
                <td style={tdRight}>{fmtMMSS(r.avg_close_sec)}</td>

                <td style={tdLeft}>
                  <span style={{ marginRight: 6 }}>{r.trend.emoji}</span>
                  <b>{r.trend.pct == null ? "—" : `${r.trend.pct > 0 ? "+" : ""}${r.trend.pct}%`}</b>
                  <div style={sub}>Ekip Ø: {fmtMMSS(r.trend.team_avg_close_sec)}</div>
                </td>

                <td style={tdLeft}>
                  <Link to={`/employees/${encodeURIComponent(r.employee_id)}?tab=activity`}>Kişi</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, fontSize: 13, color: "#777" }}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
