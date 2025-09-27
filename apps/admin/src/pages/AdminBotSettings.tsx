// apps/admin/src/pages/AdminBotSettings.tsx
import React, { useEffect, useState } from "react";
const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";

type BotSettings = {
  admin_tasks_tg_enabled: boolean;
  bonus_tg_enabled: boolean;
  finance_tg_enabled: boolean;
  attendance_tg_enabled?: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

function ymdIST() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function yesterdayIST() {
  const d = new Date(); d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function AdminBotSettings() {
  const [data, setData] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  // Manuel tetik formları
  const [dToday, setDToday] = useState(ymdIST());
  const [dYest, setDYest] = useState(yesterdayIST());
  const [shift, setShift] = useState<"Sabah"|"Öğlen"|"Akşam"|"Gece">("Sabah");
  const [slaFirst, setSlaFirst] = useState<number>(60);

  async function load() {
    setMsg(""); setErr(""); setLoading(true);
    try { setData(await api<BotSettings>("/admin-bot/settings")); }
    catch(e:any){ setErr(e?.message || "Ayarlar alınamadı"); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  async function save(partial: Partial<BotSettings>) {
    setMsg(""); setErr(""); setLoading(true);
    try {
      const res = await api<BotSettings>("/admin-bot/settings", { method:"PUT", body: JSON.stringify(partial) });
      setData(res); setMsg("Ayar kaydedildi.");
    } catch(e:any){ setErr(e?.message || "Kaydedilemedi"); }
    finally{ setLoading(false); }
  }

  // Manuel tetik helpers
  async function post(path: string) {
    setMsg(""); setErr(""); setLoading(true);
    try { await api(path, { method:"POST" }); setMsg("Tetik gönderildi."); }
    catch(e:any){ setErr(e?.message || "Tetik gönderilemedi."); }
    finally{ setLoading(false); }
  }

  const container: React.CSSProperties = { maxWidth: 900, margin:"0 auto", padding:16, display:"grid", gap:12 };
  const card: React.CSSProperties = { border:"1px solid #e5e7eb", borderRadius:12, padding:16, background:"#fff", display:"grid", gap:10 };
  const row: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" };

  return (
    <div style={container}>
      <h1 style={{ margin:0, fontSize:20 }}>Bot İşlemleri</h1>

      {/* Toggle ayarları */}
      <div style={card}>
        <div style={row}>
          <div><b>Admin Görevleri Bildirimleri</b><div style={{fontSize:12,color:"#666"}}>Tick/Shift/Gün Sonu</div></div>
          <label><input type="checkbox" checked={!!data?.admin_tasks_tg_enabled} onChange={(e)=>save({ admin_tasks_tg_enabled: e.target.checked })}/> {data?.admin_tasks_tg_enabled ? "Açık":"Kapalı"}</label>
        </div>
        <div style={row}>
          <div><b>Bonus Bildirimleri</b><div style={{fontSize:12,color:"#666"}}>Gün Sonu + (ileride) Periyodik</div></div>
          <label><input type="checkbox" checked={!!data?.bonus_tg_enabled} onChange={(e)=>save({ bonus_tg_enabled: e.target.checked })}/> {data?.bonus_tg_enabled ? "Açık":"Kapalı"}</label>
        </div>
        <div style={row}>
          <div><b>Finans Bildirimleri</b></div>
          <label><input type="checkbox" checked={!!data?.finance_tg_enabled} onChange={(e)=>save({ finance_tg_enabled: e.target.checked })}/> {data?.finance_tg_enabled ? "Açık":"Kapalı"}</label>
        </div>
        <div style={row}>
          <div><b>Mesai (Attendance) Bildirimleri</b></div>
          <label><input type="checkbox" checked={!!data?.attendance_tg_enabled} onChange={(e)=>save({ attendance_tg_enabled: e.target.checked })}/> {data?.attendance_tg_enabled ? "Açık":"Kapalı"}</label>
        </div>
      </div>

      {/* Manuel tetikleme */}
      <div style={card}>
        <div style={{fontWeight:600, marginBottom:4}}>Manuel Tetikleme</div>

        {/* Bonus Gün Sonu */}
        <div style={row}>
          <div>Bonus Gün Sonu — Tarih (dün varsayılan)</div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <input type="date" value={dYest} onChange={e=>setDYest(e.target.value)} />
            <label style={{fontSize:12,color:"#666"}}>SLA İlk KT (sn)</label>
            <input type="number" min={1} max={3600} value={slaFirst} onChange={e=>setSlaFirst(Math.max(1, Number(e.target.value||60)))} style={{width:80}} />
            <button onClick={()=>post(`/admin-bot/trigger/bonus/daily?d=${encodeURIComponent(dYest)}&sla_first_sec=${slaFirst}`)}>Gönder</button>
          </div>
        </div>

        {/* Admin Tasks Gün Sonu */}
        <div style={row}>
          <div>Admin Görevleri — Gün Sonu</div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <input type="date" value={dYest} onChange={e=>setDYest(e.target.value)} />
            <button onClick={()=>post(`/admin-bot/trigger/admin-tasks/day-end?d=${encodeURIComponent(dYest)}`)}>Gönder</button>
          </div>
        </div>

        {/* Admin Tasks Vardiya Sonu */}
        <div style={row}>
          <div>Admin Görevleri — Vardiya Sonu</div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <select value={shift} onChange={e=>setShift(e.target.value as any)}>
              <option>Sabah</option><option>Öğlen</option><option>Akşam</option><option>Gece</option>
            </select>
            <input type="date" value={dToday} onChange={e=>setDToday(e.target.value)} />
            <button onClick={()=>post(`/admin-bot/trigger/admin-tasks/shift-end?shift=${encodeURIComponent(shift)}&d=${encodeURIComponent(dToday)}`)}>Gönder</button>
          </div>
        </div>

        {/* Attendance Günlük */}
        <div style={row}>
          <div>Mesai (Attendance) — Günlük Yoklama</div>
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            <input type="date" value={dToday} onChange={e=>setDToday(e.target.value)} />
            <button onClick={()=>post(`/admin-bot/trigger/attendance/daily?d=${encodeURIComponent(dToday)}`)}>Gönder</button>
          </div>
        </div>

        {msg && <div style={{ color:"#0a6d37", fontSize:12 }}>{msg}</div>}
        {err && <div style={{ color:"#b00020", fontSize:12 }}>{err}</div>}
      </div>
    </div>
  );
}
