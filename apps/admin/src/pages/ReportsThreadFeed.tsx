// apps/admin/src/pages/ReportsThreadFeed.tsx
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type Channel = "bonus" | "finans";

type ThreadRow = {
  corr: string;
  origin_ts: string | null;
  first_reply_ts: string | null;
  first_close_ts: string | null;
  close_type: "approve" | "reply_close" | "reject";
  closer_employee_id: string | null;
  closer_full_name: string | null;
  closer_department: string | null;
  first_response_sec: number | null;
  close_sec: number | null;
  sla_breach: boolean;
  close_chat_id?: number;
  close_msg_id?: number;
};

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m as number) - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function fmtMMSS(sec: number | null) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
function downloadCsv(rows: ThreadRow[], filename = "threads.csv") {
  const header = [
    "corr",
    "origin_ts",
    "first_reply_ts",
    "first_close_ts",
    "close_type",
    "closer_employee_id",
    "closer_full_name",
    "closer_department",
    "first_response_sec",
    "close_sec",
    "sla_breach",
  ];
  const lines = [header.join(",")];
  rows.forEach((r) => {
    lines.push(
      [
        r.corr,
        r.origin_ts ?? "",
        r.first_reply_ts ?? "",
        r.first_close_ts ?? "",
        r.close_type,
        r.closer_employee_id ?? "",
        (r.closer_full_name ?? "").replaceAll(",", " "),
        r.closer_department ?? "",
        r.first_response_sec ?? "",
        r.close_sec ?? "",
        r.sla_breach ? "1" : "0",
      ].join(",")
    );
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

export default function ReportsThreadFeed() {
  const [channel, setChannel] = useState<Channel>("finans");
  const [from, setFrom] = useState<string>(todayYmd());
  const [to, setTo] = useState<string>(addDays(todayYmd(), 1)); // exclusive
  const [order, setOrder] = useState<"close_desc" | "close_asc" | "dur_asc" | "dur_desc">("close_desc");
  const [slaSec, setSlaSec] = useState<number>(900);
  const [onlySla, setOnlySla] = useState<boolean>(false);
  const [rows, setRows] = useState<ThreadRow[]>([]);
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
      qs.set("sla_sec", String(slaSec));
      const path = `/reports/${channel}/threads?${qs.toString()}`;
      const data = await apiGet<ThreadRow[]>(path);
      setRows(onlySla ? data.filter((r) => r.sla_breach) : data);
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
    const total = rows.length;
    const sla = rows.filter((r) => r.sla_breach).length;
    const avgClose =
      rows.reduce((a, r) => a + (r.close_sec ?? 0), 0) / (rows.filter((r) => r.close_sec != null).length || 1);
    const avgFirst =
      rows.reduce((a, r) => a + (r.first_response_sec ?? 0), 0) /
      (rows.filter((r) => r.first_response_sec != null).length || 1);
    return { total, sla, avgClose: Number.isFinite(avgClose) ? avgClose : null, avgFirst: Number.isFinite(avgFirst) ? avgFirst : null };
  }, [rows]);

  // styles
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
      <h1 style={{ margin: 0, fontSize: 20 }}>İşlem Akışı (Thread) · {channel === "finans" ? "Finans" : "Bonus"}</h1>

      <form onSubmit={(e)=>{e.preventDefault(); load();}} style={bar}>
        <select value={channel} onChange={(e)=>setChannel(e.target.value as Channel)} title="Kanal">
          <option value="finans">Finans</option>
          <option value="bonus">Bonus</option>
        </select>

        <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} title="Başlangıç (bugün)"/>
        <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} title="Bitiş (exclusive)"/>

        <select value={order} onChange={(e)=>setOrder(e.target.value as any)} title="Sıralama">
          <option value="close_desc">Son kapananlar</option>
          <option value="close_asc">Önce kapananlar</option>
          <option value="dur_asc">Süre artan</option>
          <option value="dur_desc">Süre azalan</option>
        </select>

        <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
          SLA (sn)
          <input type="number" min={1} max={86400} value={slaSec} onChange={(e)=>setSlaSec(Math.max(1, Number(e.target.value||1)))} style={{ width:80 }}/>
        </label>

        <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
          Sadece SLA ihlali
          <input type="checkbox" checked={onlySla} onChange={(e)=>setOnlySla(e.target.checked)}/>
        </label>

        <button type="submit" disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
        <button type="button" onClick={()=>downloadCsv(rows, `threads_${channel}_${from}.csv`)} disabled={!rows.length}>
          CSV İndir
        </button>

        {err && <span style={{ color:"#b00020", fontSize:12 }}>{err}</span>}
      </form>

      {/* KPI */}
      <div style={kpis}>
        <div style={card}>
          <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Bugün Kapanan Thread</div>
          <div style={{ fontSize:20, fontWeight:700 }}>{kpi.total}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>SLA İhlali</div>
          <div style={{ fontSize:20, fontWeight:700 }}>{kpi.sla}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Ø Sonuçlandırma</div>
          <div style={{ fontSize:20, fontWeight:700 }}>{fmtMMSS(kpi.avgClose)}</div>
        </div>
        <div style={card}>
          <div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Ø İlk Yanıt</div>
          <div style={{ fontSize:20, fontWeight:700 }}>{fmtMMSS(kpi.avgFirst)}</div>
        </div>
      </div>

      {/* Tablo */}
      <div style={tableCard}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width:280 }}>Thread</th>
              <th style={{ ...th, width:160, textAlign:"right" }}>İlk Yanıt (dk:ss)</th>
              <th style={{ ...th, width:160, textAlign:"right" }}>Kapanış (dk:ss)</th>
              <th style={{ ...th, width:120 }}>Tip</th>
              <th style={{ ...th, width:260 }}>Kapanışı Yapan</th>
              <th style={{ ...th, width:220 }}>Zamanlar</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.corr}-${i}`} style={{ borderTop:"1px solid #f5f5f5", background: r.sla_breach ? "#fff5f5" : i%2 ? "#fafafa":"#fff" }}>
                <td style={tdLeft}>
                  <div style={{ fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.corr}</div>
                  <div style={sub}>
                    {r.close_chat_id && r.close_msg_id ? (
                      <a
                        href={`https://t.me/c/${String(r.close_chat_id).replace("-100","")}/${r.close_msg_id}`}
                        target="_blank" rel="noreferrer"
                      >
                        Telegram’da aç
                      </a>
                    ) : "—"}
                  </div>
                </td>
                <td style={tdRight}>{fmtMMSS(r.first_response_sec)}</td>
                <td style={tdRight}>{fmtMMSS(r.close_sec)}</td>
                <td style={tdLeft}>{r.close_type}</td>
                <td style={tdLeft}>
                  <div style={{ fontWeight:600 }}>{r.closer_full_name ?? "—"}</div>
                  <div style={sub}>{r.closer_employee_id ?? "—"} • {r.closer_department ?? "-"}</div>
                </td>
                <td style={tdLeft}>
                  <div style={sub}>Origin: {r.origin_ts ?? "—"}</div>
                  <div style={sub}>First: {r.first_reply_ts ?? "—"}</div>
                  <div style={sub}>Close: {r.first_close_ts ?? "—"}</div>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
