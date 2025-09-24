// apps/admin/src/pages/AdminTasks.tsx
import React, { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";

type Task = {
  id: number; date: string; shift: string|null; title: string; department: string|null;
  assignee_employee_id: string|null; due_ts: string|null; grace_min: number;
  status: "open"|"done"|"late"; is_done: boolean; done_at: string|null; done_by: string|null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" }, ...init });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

function ymd(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}

export default function AdminTasks() {
  const [date, setDate] = useState(ymd());
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setErr(null); setMsg(""); setLoading(true);
    try{
      const qs = new URLSearchParams();
      if (date) qs.set("d", date);
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Task[]>(`/admin-tasks?${qs.toString()}`);
      setRows(data);
    }catch(e:any){ setErr(e?.message||"Hata"); setRows([]); }
    finally{ setLoading(false); }
  }

  async function tick(id:number) {
    const who = localStorage.getItem("email") || "admin";
    const t = await api<Task>(`/admin-tasks/${id}/tick`, { method:"PATCH", body: JSON.stringify({ who })});
    setRows(rows.map(r=> r.id===id ? t : r));
  }

  async function generateToday() {
    await api(`/admin-tasks/generate`, { method:"POST" });
    await load();
  }

  async function scanOverdue() {
    const r = await api<{alerts:number}>(`/admin-tasks/scan-overdue`, { method:"POST" });
    setMsg(`Gecikme tarandı: ${r.alerts} uyarı gönderildi.`);
    await load();
  }

  // ← YENİ: Telegram rapor gönder
  async function sendReport() {
    setErr(""); setMsg("");
    try {
      const body = { d: date || undefined, shift: shift || undefined, include_late_list: true };
      await api(`/admin-tasks/report`, { method:"POST", body: JSON.stringify(body) });
      setMsg("Telegram raporu gönderildi.");
    } catch(e:any) {
      setErr(e?.message || "Rapor gönderilemedi");
    }
  }

  useEffect(()=>{ load(); /* eslint-disable-next-line */ }, []);

  const container: React.CSSProperties = { maxWidth: 1100, margin:"0 auto", padding:12, display:"grid", gap:12 };
  const th: React.CSSProperties = { padding:"6px 10px", fontWeight:600, borderBottom:"1px solid #eee", background:"#fff", position:"sticky", top:0, whiteSpace:"nowrap" };
  const td: React.CSSProperties = { padding:"6px 10px", borderTop:"1px solid #f5f5f5", fontSize:13 };

  return (
    <div style={container}>
      <h1 style={{ margin:0, fontSize:20 }}>Admin Görevleri</h1>

      <form onSubmit={(e)=>{e.preventDefault(); load();}} style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
        <select value={shift} onChange={e=>setShift(e.target.value)} >
          <option value="">Tüm vardiyalar</option>
          <option>Sabah</option><option>Öğlen</option><option>Akşam</option><option>Gece</option>
        </select>
        <select value={dept} onChange={e=>setDept(e.target.value)}>
          <option value="">Tüm departmanlar</option>
          <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
        <button type="button" onClick={generateToday}>Bugünü Oluştur</button>
        <button type="button" onClick={scanOverdue}>Gecikmeleri Tara</button>
        <button type="button" onClick={sendReport}>Telegram’a Rapor Gönder</button> {/* ← YENİ */}
        {err && <span style={{ color:"#b00020", fontSize:12 }}>{err}</span>}
        {msg && <span style={{ color:"#1b6f1b", fontSize:12 }}>{msg}</span>}
      </form>

      <div style={{ border:"1px solid #e9e9e9", borderRadius:12, overflow:"hidden", background:"#fff" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width:140 }}>Vardiya</th>
              <th style={{ ...th, width:320 }}>Görev</th>
              <th style={{ ...th, width:140 }}>Departman</th>
              <th style={{ ...th, width:160 }}>Atanan</th>
              <th style={{ ...th, width:160 }}>Bitiş</th>
              <th style={{ ...th, width:100 }}>Durum</th>
              <th style={{ ...th, width:100 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.id} style={{ background: r.status==="late" ? "#fff5f5" : i%2 ? "#fafafa":"#fff" }}>
                <td style={td}>{r.shift||"-"}</td>
                <td style={td}>{r.title}</td>
                <td style={td}>{r.department||"-"}</td>
                <td style={td}>{r.assignee_employee_id||"-"}</td>
                <td style={td}>{r.due_ts ? new Date(r.due_ts).toLocaleString() : "-"}</td>
                <td style={td}>{r.status.toUpperCase()}</td>
                <td style={td}>
                  {!r.is_done ? (
                    <button onClick={()=>tick(r.id)}>Tick</button>
                  ) : (
                    <span>{r.done_at ? new Date(r.done_at).toLocaleTimeString() : "-"}</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (<tr><td colSpan={7} style={{ padding:12, color:"#777" }}>Kayıt yok.</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
