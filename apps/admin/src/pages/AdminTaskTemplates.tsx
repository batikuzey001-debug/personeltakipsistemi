// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

type Template = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  default_assignee: string | null;
  is_active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export default function AdminTaskTemplates() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // filters
  const [q, setQ] = useState(""); const [shift, setShift] = useState(""); const [dept, setDept] = useState("");
  const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

  // inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState(""); const [eShift, setEShift] = useState(""); const [eDept, setEDept] = useState("");
  const [eAssignee, setEAssignee] = useState(""); const [eActive, setEActive] = useState(true);

  // modal (bulk)
  const [modal, setModal] = useState(false);
  const [bShift, setBShift] = useState(""); const [bDept, setBDept] = useState("");
  const [bText, setBText] = useState(""); const [saving, setSaving] = useState(false);

  async function load() {
    setErr(null); setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Template[]>(`/admin-tasks/templates?${qs.toString()}`);
      setRows(data || []);
    } catch (e: any) { setErr(e?.message || "Şablonlar alınamadı"); }
    finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  const filtered = useMemo(() => rows, [rows]); // server-side filtrelediğimiz için

  function beginEdit(t: Template) {
    setEditId(t.id); setETitle(t.title); setEShift(t.shift || ""); setEDept(t.department || ""); setEAssignee(t.default_assignee || ""); setEActive(!!t.is_active);
  }
  async function saveEdit(id: number) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: eTitle.trim(),
          shift: eShift || null,
          department: eDept || null,
          default_assignee: eAssignee || null,
          is_active: eActive
        })
      });
      setRows(prev => prev.map(x => x.id === id ? res : x)); setEditId(null);
      setMsg("Şablon güncellendi."); setTimeout(()=>setMsg(""),1200);
    } catch (e:any) { setErr(e?.message || "Şablon güncellenemedi"); setTimeout(()=>setErr(null),1800); }
  }
  async function remove(id: number) {
    if(!confirm("Silinsin mi?")) return;
    try { await api(`/admin-tasks/templates/${id}`, { method: "DELETE" }); setRows(prev => prev.filter(x => x.id !== id)); }
    catch(e:any){ setErr(e?.message || "Silinemedi"); setTimeout(()=>setErr(null),1800); }
  }
  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !t.is_active })
      });
      setRows(prev => prev.map(x => x.id === t.id ? res : x));
    } catch(e:any){ setErr(e?.message || "Durum değişmedi"); setTimeout(()=>setErr(null),1800); }
  }

  async function bulkAdd() {
    const lines = bText.split("\n").map(s=>s.trim()).filter(Boolean);
    if (!lines.length) { setErr("Satır yok."); setTimeout(()=>setErr(null),1500); return; }
    if (!bShift && !bDept) { setErr("Vardiya veya departman seçin."); setTimeout(()=>setErr(null),1500); return; }
    setSaving(true);
    try {
      // bulk varsa:
      const items = lines.map(line => {
        const [title, assignee] = line.split("|").map(s => (s||"").trim());
        return { title, shift: bShift || null, department: bDept || null, default_assignee: assignee || null, is_active: true };
      });
      let res: Template[] | null = null;
      try {
        res = await api<Template[]>("/admin-tasks/templates/bulk", { method:"POST", body: JSON.stringify({ items }) });
      } catch {
        // tek tek
        res = [];
        for (const it of items) {
          const one = await api<Template>("/admin-tasks/templates", { method:"POST", body: JSON.stringify(it) });
          res.push(one);
        }
      }
      setRows(prev => [...res!, ...prev]);
      setBText(""); setModal(false);
      setMsg("Şablonlar eklendi."); setTimeout(()=>setMsg(""),1200);
    } catch(e:any){ setErr(e?.message || "Toplu ekleme başarısız"); setTimeout(()=>setErr(null),1800); }
    finally { setSaving(false); }
  }

  // ---------- STYLES ----------
  const page: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 16, display:"grid", gap: 12 };
  const section: React.CSSProperties = { border:"1px solid #eef0f4", borderRadius: 14, background:"#fff", padding: 14, boxShadow:"0 6px 24px rgba(16,24,40,0.04)" };
  const title: React.CSSProperties = { margin:0, fontSize:20, fontWeight:800 };
  const hint: React.CSSProperties = { fontSize:12, color:"#6b7280" };
  const label: React.CSSProperties = { fontSize:12, color:"#6b7280", fontWeight:700, textTransform:"uppercase", letterSpacing:".3px", marginBottom:6 };
  const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer" };
  const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" };
  const rowGrid: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(260px,1fr) 140px 160px 160px 1fr", gap: 10, alignItems:"center" };
  const tag = (txt:string) => ({ display:"inline-block", padding:"2px 8px", borderRadius:999, background:"#eef2ff", border:"1px solid #c7d2fe", color:"#1d4ed8", fontSize:12, fontWeight:700 } as React.CSSProperties);

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={title}>Görev Şablonları</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btn} onClick={()=>load()} disabled={loading}>{loading?"Yükleniyor…":"Yenile"}</button>
          <button style={btnPrimary} onClick={()=>setModal(true)}>Toplu Ekle</button>
        </div>
      </div>

      {/* Filters */}
      <div style={section}>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(240px,1fr) 160px 180px", gap:10, alignItems:"end" }}>
          <div><div style={label}>Ara</div><input placeholder="Başlık, kişi…" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
          <div><div style={label}>Vardiya</div>
            <select value={shift} onChange={(e)=>setShift(e.target.value)}><option value="">Tümü</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}</select>
          </div>
          <div><div style={label}>Departman</div>
            <select value={dept} onChange={(e)=>setDept(e.target.value)}>
              <option value="">Tümü</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
        </div>
      </div>

      {/* List by shift */}
      {["Gece","Sabah","Öğlen","Akşam","—"].map(shiftKey=>{
        const items = groups.find(g=>g.shift===shiftKey)?.items || [];
        if (!items.length) return null;
        return (
          <div key={shiftKey} style={section}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <div><span style={tag(shiftKey)}>{shiftKey}</span> <span style={{ ...hint, marginLeft:8 }}>{items.length} şablon</span></div>
            </div>
            <div style={{ display:"grid", gap:8 }}>
              {items.map(t=>(
                <div key={t.id} style={{ border:"1px solid #eef1f5", borderRadius:10, padding:10 }}>
                  {editId === t.id ? (
                    <div style={rowGrid}>
                      <div><div style={label}>Başlık</div><input value={eTitle} onChange={(e)=>setETitle(e.target.value)} /></div>
                      <div><div style={label}>Vardiya</div>
                        <select value={eShift} onChange={(e)=>setEShift(e.target.value)}>
                          <option value="">—</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <div><div style={label}>Departman</div>
                        <select value={eDept} onChange={(e)=>setEDept(e.target.value)}>
                          <option value="">—</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
                        </select>
                      </div>
                      <div><div style={label}>Varsayılan Kişi</div><input value={eAssignee} onChange={(e)=>setEAssignee(e.target.value)} /></div>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center" }}>
                        <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                          <input type="checkbox" checked={eActive} onChange={(e)=>setEActive(e.target.checked)} /> {eActive ? "Aktif" : "Pasif"}
                        </label>
                        <button style={btnPrimary} onClick={()=>saveEdit(t.id)}>Kaydet</button>
                        <button style={btn} onClick={()=>setEditId(null)}>İptal</button>
                      </div>
                    </div>
                  ) : (
                    <div style={rowGrid}>
                      <div>
                        <div style={{ fontWeight:800 }}>{t.title}</div>
                        <div style={hint}>{t.department || "-"} {t.default_assignee ? `• ${t.default_assignee}` : ""}</div>
                      </div>
                      <div style={hint}>{t.shift || "—"}</div>
                      <div style={hint}>{t.department || "—"}</div>
                      <div style={hint}>{t.default_assignee || "—"}</div>
                      <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                        <button style={btn} onClick={()=>beginEdit(t)}>Düzenle</button>
                        <button style={btn} onClick={()=>toggleActive(t)}>{t.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                        <button style={{ ...btn, borderColor:"#ef4444", color:"#991b1b" }} onClick={()=>remove(t.id)}>Sil</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Modal: Toplu Ekle */}
      {modal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.35)", display:"grid", placeItems:"center", zIndex:50 }}>
          <div style={{ width:"min(720px, 92vw)", background:"#fff", borderRadius:14, padding:16, boxShadow:"0 16px 40px rgba(16,24,40,.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <h3 style={{ margin:0, fontWeight:800 }}>Toplu Şablon Ekle</h3>
              <button style={btn} onClick={()=>setModal(false)}>Kapat</button>
            </div>
            <div style={{ display:"grid", gap:10 }}>
              <div>
                <div style={hint}>Her satır bir şablonu temsil eder. İsterseniz “Başlık | RD-xxx” biçiminde kişi belirtebilirsiniz.</div>
                <textarea rows={8} value={bText} onChange={(e)=>setBText(e.target.value)} placeholder={'Örn:\nGün sonu raporu\nVardiya teslim | RD-021\nBot log kontrolü'} style={{ width:"100%", resize:"vertical" }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"160px 180px 1fr", gap:10, alignItems:"end" }}>
                <div>
                  <div style={label}>Vardiya</div>
                  <select value={bShift} onChange={(e)=>setBShift(e.target.value)}>
                    <option value="">—</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <div style={label}>Departman</div>
                  <select value={bDept} onChange={(e)=>setBDept(e.target.value)}>
                    <option value="">—</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
                  </select>
                </div>
                <div style={{ textAlign:"right" }}>
                  <button style={btnPrimary} onClick={bulkAdd} disabled={saving || !bText.trim()}>
                    {saving ? "Ekleniyor…" : "Ekle"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(err || msg) && (
        <div style={{ position:"fixed", right:16, bottom:16, padding:"10px 12px", borderRadius:12, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow:"0 6px 20px rgba(16,24,40,.08)", fontSize:13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
