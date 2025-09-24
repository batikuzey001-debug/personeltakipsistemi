// apps/admin/src/pages/ReportsDaily.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";
type Channel = "bonus" | "finans";

type Trend = { emoji: string; pct: number | null; team_avg_close_sec: number | null };
type PersonRow = {
  employee_id: string; full_name: string; department: string;
  count_total: number; avg_first_sec: number | null; avg_close_sec: number; trend: Trend;
};
type ThreadRow = {
  corr: string; origin_ts: string | null; first_reply_ts: string | null; first_close_ts: string | null;
  close_type: "approve" | "reply_close" | "reject"; closer_employee_id: string | null;
  closer_full_name: string | null; closer_department: string | null; first_response_sec: number | null;
  close_sec: number | null; sla_breach: boolean;
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(ymd: string, days: number) {
  const [y,m,d] = ymd.split("-").map(Number);
  const dt = new Date(y, m-1, d+days);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
function fmtMMSS(sec: number | null) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec)); const mm = Math.floor(s/60); const ss = s%60;
  return `${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function ReportsDaily() {
  const [tab, setTab] = useState<"people"|"threads">("people");
  const [channel, setChannel] = useState<Channel>("finans");
  const [from, setFrom] = useState(todayYmd());
  const [to, setTo] = useState(addDays(todayYmd(), 1)); // exclusive

  // kişi bazlı state
  const [order, setOrder] = useState<"avg_asc"|"avg_desc"|"cnt_desc">("cnt_desc");
  const [minKt, setMinKt] = useState(5);
  const [onlyDept, setOnlyDept] = useState(true);
  const [pRows, setPRows] = useState<PersonRow[]>([]);
  const [pOffset, setPOffset] = useState(0);
  const [pHasMore, setPHasMore] = useState(false);

  // thread state (lazy)
  const [tRows, setTRows] = useState<ThreadRow[]>([]);
  const [tOffset, setTOffset] = useState(0);
  const [tHasMore, setTHasMore] = useState(false);
  const [slaSec, setSlaSec] = useState(900);
  const [onlySla, setOnlySla] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  // Kişi bazlı yükleme
  async function loadPeople(reset=false) {
    setErr(null); setLoading(true);
    try {
      const limit = 100;
      const qs = new URLSearchParams();
      qs.set("frm", from); qs.set("to", to); qs.set("order", order);
      qs.set("limit", String(limit)); qs.set("offset", String(reset ? 0 : pOffset));
      if (channel === "finans") qs.set("min_kt", String(minKt)); // bonus da destekliyorsa kaldır: her iki kanala da gönder
      let data = await apiGet<PersonRow[]>(`/reports/${channel}/close-time?${qs.toString()}`);
      if (onlyDept) {
        const required = channel === "finans" ? "Finans" : "Bonus";
        data = data.filter(r => (r.department||"").toLowerCase() === required.toLowerCase());
      }
      setPRows(reset ? data : [...pRows, ...data]);
      setPOffset((reset ? 0 : pOffset) + data.length);
      setPHasMore(data.length === limit);
    } catch(e:any) { setErr(e?.message || "Rapor alınamadı"); }
    finally { setLoading(false); }
  }

  // Thread yükleme (lazy)
  async function loadThreads(reset=false) {
    setErr(null); setLoading(true);
    try {
      const limit = 100;
      const qs = new URLSearchParams();
      qs.set("frm", from); qs.set("to", to);
      qs.set("order", "close_desc");
      qs.set("limit", String(limit)); qs.set("offset", String(reset ? 0 : tOffset));
      qs.set("sla_sec", String(slaSec));
      let data = await apiGet<ThreadRow[]>(`/reports/${channel}/threads?${qs.toString()}`);
      if (onlySla) data = data.filter(r => r.sla_breach);
      setTRows(reset ? data : [...tRows, ...data]);
      setTOffset((reset ? 0 : tOffset) + data.length);
      setTHasMore(data.length === limit);
    } catch(e:any) { setErr(e?.message || "Rapor alınamadı"); }
    finally { setLoading(false); }
  }

  // İlk açılışta sadece kişi tabını yükle
  useEffect(() => { loadPeople(true); /* eslint-disable-next-line */ }, [channel]);

  // KPI’lar (kişi sekmesinden)
  const kpi = useMemo(() => {
    const total = pRows.reduce((a,r)=>a+(r.count_total||0),0);
    const sumClose = pRows.reduce((a,r)=>a+(r.avg_close_sec||0)*(r.count_total||0),0);
    const sumFirst = pRows.reduce((a,r)=>a+((r.avg_first_sec??0)*(r.count_total||0)),0);
    const hasFirst = pRows.some(r=>r.avg_first_sec!=null);
    const wAvgClose = total ? sumClose/total : null;
    const wAvgFirst = total && hasFirst ? sumFirst/total : null;
    const SLA=900;
    const slaBreaches = pRows.filter(r=>(r.avg_close_sec||0)>SLA).length;
    return { total, wAvgClose, wAvgFirst, slaBreaches, slaSec: SLA };
  }, [pRows]);

  // styles
  const container: React.CSSProperties = { maxWidth: 1200, margin:"0 auto", padding:12, display:"grid", gap:12 };
  const tabs: React.CSSProperties = { display:"flex", gap:8 };
  const tabBtn = (active:boolean):React.CSSProperties => ({
    padding:"8px 10px", border:"1px solid #e9e9e9", borderRadius:8, background: active?"#eef3ff":"#fff", fontWeight:500, cursor:"pointer"
  });
  const bar: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" };
  const kpis: React.CSSProperties = { display:"grid", gridTemplateColumns:"repeat(4, minmax(160px,1fr))", gap:8 };
  const card: React.CSSProperties = { border:"1px solid #e9e9e9", borderRadius:12, background:"#fff", padding:12 };
  const tableCard: React.CSSProperties = { border:"1px solid #e9e9e9", borderRadius:12, background:"#fff", overflow:"hidden" };
  const th: React.CSSProperties = { position:"sticky", top:0, background:"#fff", borderBottom:"1px solid #eee", fontWeight:600, fontSize:13, padding:"6px 10px", textAlign:"left", whiteSpace:"nowrap" };
  const tdLeft: React.CSSProperties = { padding:"6px 10px", fontSize:13, textAlign:"left", verticalAlign:"middle" };
  const tdRight: React.CSSProperties = { padding:"6px 10px", fontSize:13, textAlign:"right", verticalAlign:"middle", whiteSpace:"nowrap" };
  const sub: React.CSSProperties = { fontSize:11, color:"#666" };

  return (
    <div style={container}>
      <h1 style={{ margin:0, fontSize:20 }}>Günlük Rapor</h1>

      {/* Sekmeler */}
      <div style={tabs}>
        <button style={tabBtn(tab==="people")} onClick={()=>{ setTab("people"); /* sadece kişi sekmesi */ }}>
          Kişi Bazlı
        </button>
        <button style={tabBtn(tab==="threads")} onClick={()=>{
          setTab("threads");
          if (!tRows.length) loadThreads(true); // tembel yükleme
        }}>
          İşlem Akışı (Thread)
        </button>
      </div>

      {/* Ortak filtreler */}
      <form onSubmit={(e)=>{e.preventDefault(); tab==="people" ? loadPeople(true) : loadThreads(true);}} style={bar}>
        <select value={channel} onChange={(e)=>setChannel(e.target.value as Channel)} title="Kanal">
          <option value="finans">Finans</option>
          <option value="bonus">Bonus</option>
        </select>

        <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />

        {tab==="people" ? (
          <>
            <select value={order} onChange={(e)=>setOrder(e.target.value as any)}>
              <option value="cnt_desc">İşlem (çoktan aza)</option>
              <option value="avg_asc">Ø Sonuçlandırma (artan)</option>
              <option value="avg_desc">Ø Sonuçlandırma (azalan)</option>
            </select>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
              min KT
              <input type="number" min={0} max={1000} value={minKt} onChange={(e)=>setMinKt(Math.max(0, Number(e.target.value||0)))} style={{ width:70 }}/>
            </label>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
              Yalnız departman
              <input type="checkbox" checked={onlyDept} onChange={(e)=>setOnlyDept(e.target.checked)} />
            </label>
          </>
        ) : (
          <>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
              SLA (sn)
              <input type="number" min={1} max={86400} value={slaSec} onChange={(e)=>setSlaSec(Math.max(1, Number(e.target.value||1)))} style={{ width:80 }}/>
            </label>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
              Sadece SLA ihlali
              <input type="checkbox" checked={onlySla} onChange={(e)=>setOnlySla(e.target.checked)} />
            </label>
          </>
        )}

        <button type="submit" disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
        {err && <span style={{ color:"#b00020", fontSize:12 }}>{err}</span>}
      </form>

      {/* KPI — kişi sekmesi verisinden */}
      <div style={kpis}>
        <div style={card}><div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Toplam Kapanış</div><div style={{ fontSize:20, fontWeight:700 }}>{kpi.total}</div></div>
        <div style={card}><div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Ø Sonuçlandırma</div><div style={{ fontSize:20, fontWeight:700 }}>{fmtMMSS(kpi.wAvgClose)}</div></div>
        <div style={card}><div style={{ fontSize:12, color:"#666", marginBottom:4 }}>Ø İlk Yanıt</div><div style={{ fontSize:20, fontWeight:700 }}>{fmtMMSS(kpi.wAvgFirst)}</div></div>
        <div style={card}><div style={{ fontSize:12, color:"#666", marginBottom:4 }}>SLA İhlali (&gt;{900}s)</div><div style={{ fontSize:20, fontWeight:700 }}>{kpi.slaBreaches}</div></div>
      </div>

      {/* Sekme içerikleri */}
      {tab==="people" ? (
        <div style={tableCard}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width:360 }}>Personel</th>
                <th style={{ ...th, width:120, textAlign:"right" }}>İşlem</th>
                <th style={{ ...th, width:160, textAlign:"right" }}>Ø İlk Yanıt</th>
                <th style={{ ...th, width:180, textAlign:"right" }}>Ø Sonuçlandırma</th>
                <th style={{ ...th, width:160 }}>Trend (7g)</th>
                <th style={{ ...th, width:120 }}>Kişi</th>
              </tr>
            </thead>
            <tbody>
              {pRows.map((r,i)=>(
                <tr key={`${r.employee_id}-${i}`} style={{ borderTop:"1px solid #f5f5f5", background: i%2 ? "#fafafa":"#fff" }}>
                  <td style={tdLeft}><div style={{ fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.full_name}</div><div style={{ fontSize:11, color:"#666" }}>{r.employee_id} • {r.department||"-"}</div></td>
                  <td style={tdRight}>{r.count_total}</td>
                  <td style={tdRight}>{r.avg_first_sec!=null ? fmtMMSS(r.avg_first_sec) : "—"}</td>
                  <td style={tdRight}>{fmtMMSS(r.avg_close_sec)}</td>
                  <td style={tdLeft}><span style={{ marginRight:6 }}>{r.trend.emoji}</span><b>{r.trend.pct==null ? "—" : `${r.trend.pct>0?"+":""}${r.trend.pct}%`}</b><div style={{ fontSize:11, color:"#666" }}>Ekip Ø: {fmtMMSS(r.trend.team_avg_close_sec)}</div></td>
                  <td style={tdLeft}><Link to={`/employees/${encodeURIComponent(r.employee_id)}?tab=activity`}>Kişi</Link></td>
                </tr>
              ))}
              {!pRows.length && (<tr><td colSpan={6} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>)}
            </tbody>
          </table>
          <div style={{ padding:12 }}>
            {pHasMore && <button onClick={()=>loadPeople(false)} disabled={loading}>Daha Fazla</button>}
          </div>
        </div>
      ) : (
        <div style={tableCard}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, width:280 }}>Thread</th>
                <th style={{ ...th, width:160, textAlign:"right" }}>İlk Yanıt</th>
                <th style={{ ...th, width:160, textAlign:"right" }}>Kapanış</th>
                <th style={{ ...th, width:120 }}>Tip</th>
                <th style={{ ...th, width:260 }}>Kapanışı Yapan</th>
                <th style={{ ...th, width:220 }}>Zamanlar</th>
              </tr>
            </thead>
            <tbody>
              {tRows.map((r,i)=>(
                <tr key={`${r.corr}-${i}`} style={{ borderTop:"1px solid #f5f5f5", background: r.sla_breach ? "#fff5f5" : i%2 ? "#fafafa":"#fff" }}>
                  <td style={tdLeft}><div style={{ fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{r.corr}</div></td>
                  <td style={tdRight}>{fmtMMSS(r.first_response_sec)}</td>
                  <td style={tdRight}>{fmtMMSS(r.close_sec)}</td>
                  <td style={tdLeft}>{r.close_type}</td>
                  <td style={tdLeft}><div style={{ fontWeight:600 }}>{r.closer_full_name ?? "—"}</div><div style={{ fontSize:11, color:"#666" }}>{r.closer_employee_id ?? "—"} • {r.closer_department ?? "-"}</div></td>
                  <td style={tdLeft}><div style={{ fontSize:11, color:"#666" }}>Origin: {r.origin_ts ?? "—"}</div><div style={{ fontSize:11, color:"#666" }}>First: {r.first_reply_ts ?? "—"}</div><div style={{ fontSize:11, color:"#666" }}>Close: {r.first_close_ts ?? "—"}</div></td>
                </tr>
              ))}
              {!tRows.length && (<tr><td colSpan={6} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>)}
            </tbody>
          </table>
          <div style={{ padding:12 }}>
            {tHasMore && <button onClick={()=>loadThreads(false)} disabled={loading}>Daha Fazla</button>}
          </div>
        </div>
      )}
    </div>
  );
}
