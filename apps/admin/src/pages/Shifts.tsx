// apps/admin/src/pages/Shifts.tsx
import React, { useEffect, useState } from "react";
const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

type ShiftDef = { id: number; name: string; start_time: string; end_time: string; is_active: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export default function Shifts() {
  const [rows, setRows] = useState<ShiftDef[]>([]);
  const [name, setName] = useState(""); const [start, setStart] = useState("08:00"); const [end, setEnd] = useState("16:00"); const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string>("");

  async function load(){ setLoading(true); setErr(null);
    try{ const data = await api<ShiftDef[]>("/shifts"); setRows(Array.isArray(data)?data:[]);}
    catch(e:any){ setErr(e?.message||"Vardiyalar alınamadı"); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  async function createOne(){
    if(!name.trim()) { setErr("Ad gerekli"); setTimeout(()=>setErr(null),1200); return; }
    try{
      const body = { name: name.trim(), start_time: start, end_time: end, is_active: active };
      const s = await api<ShiftDef>("/shifts", { method:"POST", body: JSON.stringify(body) });
      setRows(prev=>[...prev, s]); setName(""); setStart("08:00"); setEnd("16:00"); setActive(true);
      setMsg("Eklendi"); setTimeout(()=>setMsg(""),1000);
    }catch(e:any){ setErr(e?.message||"Eklenemedi"); setTimeout(()=>setErr(null),1400); }
  }

  async function toggle(s: ShiftDef){
    try{
      const body = { name: s.name, start_time: s.start_time, end_time: s.end_time, is_active: !s.is_active };
      const res = await api<ShiftDef>(`/shifts/${s.id}`, { method:"PATCH", body: JSON.stringify(body) });
      setRows(prev=>prev.map(x=>x.id===s.id?res:x));
    }catch(e:any){ setErr(e?.message||"Güncellenemedi"); setTimeout(()=>setErr(null),1400); }
  }

  async function remove(id:number){
    if(!confirm("Silinsin mi?")) return;
    try{ await api(`/shifts/${id}`, { method:"DELETE" }); setRows(prev=>prev.filter(x=>x.id!==id)); }
    catch(e:any){ setErr(e?.message||"Silinemedi"); setTimeout(()=>setErr(null),1400); }
  }

  return (
    <div style={{ maxWidth: 900, margin:"0 auto", padding:16 }}>
      <h1 style={{ marginTop:0 }}>Vardiya Tanımları</h1>

      <div style={{ border:"1px solid #eef0f4", borderRadius:10, padding:12, marginBottom:12 }}>
        <div style={{ fontSize:12, color:"#6b7280", marginBottom:8 }}>Yeni Vardiya</div>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(200px,1fr) 120px 120px 120px", gap:8, alignItems:"end" }}>
          <div><input placeholder="Ad (örn: 08-16 Genel)" value={name} onChange={e=>setName(e.target.value)} /></div>
          <div><label style={{ fontSize:12, color:"#6b7280" }}>Başlangıç</label><input type="time" value={start} onChange={e=>setStart(e.target.value)} /></div>
          <div><label style={{ fontSize:12, color:"#6b7280" }}>Bitiş</label><input type="time" value={end} onChange={e=>setEnd(e.target.value)} /></div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> aktif</label>
            <button onClick={createOne}>Ekle</button>
          </div>
        </div>
      </div>

      <div style={{ border:"1px solid #eef0f4", borderRadius:10, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(240px,1fr) 140px 140px 120px 120px", gap:8, padding:10, background:"#f9fafb", fontWeight:700, fontSize:12 }}>
          <div>Ad</div><div>Başlangıç</div><div>Bitiş</div><div>Durum</div><div style={{ textAlign:"right" }}>Aksiyon</div>
        </div>
        {rows.map((s,i)=>(
          <div key={s.id} style={{ display:"grid", gridTemplateColumns:"minmax(240px,1fr) 140px 140px 120px 120px", gap:8, padding:10, borderTop:"1px solid #eef0f4", background:i%2?"#fff":"#fcfcfc" }}>
            <div>{s.name}</div>
            <div>{s.start_time}</div>
            <div>{s.end_time}</div>
            <div style={{ fontWeight:700, color: s.is_active?"#166534":"#7f1d1d" }}>{s.is_active?"aktif":"pasif"}</div>
            <div style={{ textAlign:"right", display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button onClick={()=>toggle(s)}>{s.is_active?"Pasifleştir":"Aktifleştir"}</button>
              <button onClick={()=>remove(s.id)} style={{ color:"#991b1b" }}>Sil</button>
            </div>
          </div>
        ))}
        {!loading && !rows.length && <div style={{ padding:16, color:"#6b7280" }}>Kayıt yok.</div>}
      </div>

      {(err||msg) && <div style={{ position:"fixed", right:16, bottom:16, padding:"8px 10px", borderRadius:10, background: err?"#fee2e2":"#dcfce7", color: err?"#7f1d1d":"#065f46" }}>{err||msg}</div>}
    </div>
  );
}
