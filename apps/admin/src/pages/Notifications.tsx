// apps/admin/src/pages/Notifications.tsx
import React, { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";
type Tpl = { id:number; channel:string; name:string; template:string; is_active:boolean };

async function api<T>(path:string, init?:RequestInit):Promise<T>{
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers:{ Authorization:`Bearer ${token}`, "Content-Type":"application/json" }, ...init });
  if(!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

const CHANNELS = ["custom","admin_tasks","attendance","bonus","finans"] as const;

export default function Notifications(){
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [channel, setChannel] = useState<string>("custom");
  const [text, setText] = useState<string>("");
  const [tplId, setTplId] = useState<number|"">("");
  const [ctx, setCtx] = useState<string>(""); // key=value satır satır
  const [err, setErr] = useState(""); const [msg,setMsg]=useState("");
  const [loading, setLoading] = useState(false);

  async function load(){
    setErr(""); setMsg(""); setLoading(true);
    try{ setTpls(await api<Tpl[]>(`/admin-notify/templates`)); }
    catch(e:any){ setErr(e?.message||"Şablonlar alınamadı"); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  function parseCtx(raw:string){
    const m:Record<string,string> = {};
    raw.split("\n").forEach(line=>{
      const t=line.trim(); if(!t) return;
      const [k,...rest]=t.split("="); m[k.trim()]=(rest.join("=")||"").trim();
    }); return m;
  }

  async function sendManual(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      const body:any = { channel };
      if (text.trim()) body.text = text.trim();
      if (tplId) body.template_id = Number(tplId);
      const obj = parseCtx(ctx);
      if (Object.keys(obj).length) body.context = obj;
      await api(`/admin-notify/manual`, { method:"POST", body: JSON.stringify(body) });
      setMsg("Gönderildi."); setText(""); setTplId(""); setCtx("");
    }catch(e:any){ setErr(e?.message || "Gönderilemedi"); }
    finally{ setLoading(false); }
  }

  // CRUD basit: sadece ekleme/düzenleme/silme (sayfanın altına)
  const [form, setForm] = useState({channel:"custom", name:"", template:"", is_active:true});
  const [editId, setEditId] = useState<number|null>(null);

  async function saveTpl(){
    setErr(""); setMsg(""); setLoading(true);
    try{
      if (editId){
        const res = await api<Tpl>(`/admin-notify/templates/${editId}`, { method:"PATCH", body: JSON.stringify(form) });
        setTpls(tpls.map(t=> t.id===editId?res:t)); setEditId(null); setMsg("Şablon güncellendi.");
      } else {
        const res = await api<Tpl>(`/admin-notify/templates`, { method:"POST", body: JSON.stringify(form) });
        setTpls([res, ...tpls]); setMsg("Şablon eklendi.");
      }
      setForm({channel:"custom", name:"", template:"", is_active:true});
    }catch(e:any){ setErr(e?.message||"Kaydedilemedi"); }
    finally{ setLoading(false); }
  }

  async function delTpl(id:number){
    if (!confirm("Silinsin mi?")) return;
    try{ await api(`/admin-notify/templates/${id}`, { method:"DELETE" }); setTpls(tpls.filter(t=>t.id!==id)); }
    catch(e:any){ setErr(e?.message||"Silinemedi"); }
  }

  // UI
  const container:React.CSSProperties={maxWidth:1000,margin:"0 auto",padding:16,display:"grid",gap:12};
  const card:React.CSSProperties={border:"1px solid #e5e7eb",borderRadius:12,background:"#fff",padding:12};

  return (
    <div style={container}>
      <h1 style={{margin:0,fontSize:20}}>Bildirim Yönetimi</h1>

      <div style={card}>
        <h3 style={{marginTop:0}}>Manuel Bildirim Gönder</h3>
        <div style={{display:"grid",gap:8, gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))"}}>
          <label> Kanal
            <select value={channel} onChange={e=>setChannel(e.target.value)}>
              {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label> Şablon (opsiyonel)
            <select value={tplId} onChange={e=>setTplId(e.target.value?Number(e.target.value):"")}>
              <option value="">—</option>
              {tpls.filter(t=>t.is_active && (t.channel===channel || channel==="custom")).map(t=>
                <option key={t.id} value={t.id}>{t.name}</option>
              )}
            </select>
          </label>
        </div>
        <label> Metin (opsiyonel — şablon yoksa kullanılır)
          <textarea rows={4} value={text} onChange={e=>setText(e.target.value)} />
        </label>
        <label> Context (key=value, satır satır — şablon için)
          <textarea rows={4} placeholder={"title=Örnek Başlık\nbody=Metin"} value={ctx} onChange={e=>setCtx(e.target.value)} />
        </label>
        <div style={{display:"flex",gap:8}}>
          <button onClick={sendManual} disabled={loading}>Gönder</button>
          <button onClick={load} disabled={loading}>Yenile</button>
        </div>
        {msg && <div style={{color:"#0a6d37",fontSize:12}}>{msg}</div>}
        {err && <div style={{color:"#b00020",fontSize:12}}>{err}</div>}
      </div>

      <div style={card}>
        <h3 style={{marginTop:0}}>Şablonlar</h3>
        <div style={{display:"grid", gap:8, gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))"}}>
          <label>Kanal
            <select value={form.channel} onChange={e=>setForm({...form, channel:e.target.value})}>
              {CHANNELS.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>Ad
            <input value={form.name} onChange={e=>setForm({...form, name:e.target.value})}/>
          </label>
          <label>Aktif
            <input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form, is_active:e.target.checked})}/>
          </label>
        </div>
        <label>Şablon Metni
          <textarea rows={6} placeholder={"📣 {title}\n{body}"} value={form.template} onChange={e=>setForm({...form, template:e.target.value})}/>
        </label>
        <div style={{display:"flex",gap:8}}>
          <button onClick={saveTpl} disabled={loading || !form.name.trim() || !form.template.trim()}>{editId? "Güncelle":"Ekle"}</button>
          {editId && <button onClick={()=>{setEditId(null); setForm({channel:"custom",name:"",template:"",is_active:true});}}>İptal</button>}
        </div>

        <div style={{marginTop:12}}>
          {tpls.map(t=>(
            <div key={t.id} style={{border:"1px solid #ececec",borderRadius:10,padding:10, marginBottom:8, background:"#fafafa"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><b>[{t.channel}]</b> {t.name} {t.is_active? "":"(pasif)"}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setEditId(t.id); setForm({channel:t.channel,name:t.name,template:t.template,is_active:t.is_active});}}>Düzenle</button>
                  <button onClick={()=>delTpl(t.id)}>Sil</button>
                </div>
              </div>
              <pre style={{whiteSpace:"pre-wrap", margin:0, fontSize:12, color:"#555"}}>{t.template}</pre>
            </div>
          ))}
          {!tpls.length && <div style={{color:"#777"}}>Kayıt yok.</div>}
        </div>
      </div>
    </div>
  );
}
