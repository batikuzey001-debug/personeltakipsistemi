// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || window.location.origin;

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
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  // Hata atmak yerine "yumuşak" dön – UI düşmesin
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status} ${r.statusText}: ${text.slice(0, 140)}`);
  }
  return r.json() as Promise<T>;
}

export default function AdminTaskTemplates() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Filtreler
  const [q, setQ] = useState(""); const [shift, setShift] = useState(""); const [dept, setDept] = useState("");
  const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState(""); const [eShift, setEShift] = useState(""); const [eDept, setEDept] = useState("");
  const [eAssignee, setEAssignee] = useState(""); const [eActive, setEActive] = useState(true);

  // Toplu ekleme – sade (modal yok; ayrı kart)
  const [bulkText, setBulkText] = useState(""); const [bulkShift, setBulkShift] = useState(""); const [bulkDept, setBulkDept] = useState("");
  const [saving, setSaving] = useState(false);

  // İlk uyarı: API_BASE boşsa geliştirici hatası
  useEffect(() => {
    if (!API_BASE) {
      setErr("VITE_API_BASE_URL tanımlı değil. .env panel ayarını kontrol edin.");
    }
  }, []);

  async function load() {
    setLoading(true); setErr(null); setMsg("");
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Template[]>(`/admin-tasks/templates?${qs.toString()}`);
      if (!Array.isArray(data)) throw new Error("Beklenmeyen yanıt formatı");
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Şablonlar alınamadı");
      setRows([]); // güvenli
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => rows, [rows]); // server tarafı filtreleniyor

  function startEdit(t: Template) {
    setEditId(t.id); setETitle(t.title);
    setEShift(t.shift || ""); setEDept(t.department || ""); setEAssignee(t.default_assignee || "");
    setEActive(!!t.is_active);
  }

  async function saveEdit(id: number) {
    try {
      const body = { title: eTitle.trim(), shift: eShift || null, department: eDept || null, default_assignee: eAssignee || null, is_active: eActive };
      const res = await api<Template>(`/admin-tasks/templates/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setRows(prev => prev.map(x => x.id === id ? res : x));
      setEditId(null); setMsg("Şablon güncellendi."); setTimeout(()=>setMsg(""),1200);
    } catch (e:any) { setErr(e?.message || "Şablon güncellenemedi"); setTimeout(()=>setErr(null),1800); }
  }

  async function remove(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try { await api(`/admin-tasks/templates/${id}`, { method: "DELETE" }); setRows(prev => prev.filter(x => x.id !== id)); }
    catch (e:any) { setErr(e?.message || "Silinemedi"); setTimeout(()=>setErr(null),1800); }
  }

  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, {
        method: "PATCH", body: JSON.stringify({ is_active: !t.is_active })
      });
      setRows(prev => prev.map(x => x.id === t.id ? res : x));
    } catch(e:any) { setErr(e?.message || "Durum değişmedi"); setTimeout(()=>setErr(null),1800); }
  }

  async function bulkAdd() {
    const lines = bulkText.split("\n").map(s=>s.trim()).filter(Boolean);
    if (!lines.length) { setErr("Eklenecek satır yok."); setTimeout(()=>setErr(null),1500); return; }
    if (!bulkShift && !bulkDept) { setErr("Vardiya veya departman seçin."); setTimeout(()=>setErr(null),1500); return; }
    setSaving(true); setErr(null); setMsg("");
    try {
      const items = lines.map(line=>{
        const [title, assignee] = line.split("|").map(s=> (s||"").trim());
        return { title, shift: bulkShift || null, department: bulkDept || null, default_assignee: assignee || null, is_active: true };
      });
      // bulk varsa dene
      let out: Template[] | null = null;
      try {
        out = await api<Template[]>("/admin-tasks/templates/bulk", { method:"POST", body: JSON.stringify({ items }) });
      } catch {
        // yoksa tek tek
        out = [];
        for (const it of items) {
          const one = await api<Template>("/admin-tasks/templates", { method:"POST", body: JSON.stringify(it) });
          out.push(one);
        }
      }
      setRows(prev => [...out!, ...prev]);
      setBulkText(""); setMsg("Şablonlar eklendi."); setTimeout(()=>setMsg(""),1200);
    } catch (e:any) {
      setErr(e?.message || "Toplu ekleme başarısız");
      setTimeout(()=>setErr(null),1800);
    } finally { setSaving(false); }
  }

  // ---- UI (sade) ----
  const page: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const card: React.CSSProperties = { border: "1px solid #eef0f4", borderRadius: 14, background: "#fff", padding: 14, boxShadow: "0 6px 24px rgba(16,24,40,0.04)" };
  const titleCss: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 800 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const label: React.CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 6 };
  const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer" };
  const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" };
  const rowGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px,1fr) 140px 160px 160px 1fr", gap: 10, alignItems: "center" };

  return (
    <div style={page}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={titleCss}>Görev Şablonları</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btn} onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
        </div>
      </div>

      {/* Toplu ekleme (sade kart) */}
      <div style={card}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={label}>Toplu Şablon Ekle</div>
          <div>
            <div style={hint}>Her satır bir şablon. İsterseniz "Başlık | RD-xxx" formatında kişi belirtebilirsiniz.</div>
            <textarea rows={6} value={bulkText} onChange={(e)=>setBulkText(e.target.value)} placeholder={'Örn:\nGün sonu raporu\nVardiya teslim | RD-021\nLog kontrol'} style={{ width:"100%", resize:"vertical" }} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"160px 180px 1fr", gap:10, alignItems:"end" }}>
            <div><div style={label}>Vardiya</div>
              <select value={bulkShift} onChange={(e)=>setBulkShift(e.target.value)}>
                <option value="">—</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><div style={label}>Departman</div>
              <select value={bulkDept} onChange={(e)=>setBulkDept(e.target.value)}>
                <option value="">—</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
              </select>
            </div>
            <div style={{ textAlign:"right" }}>
              <button style={btnPrimary} onClick={bulkAdd} disabled={saving || !bulkText.trim()}>
                {saving ? "Ekleniyor…" : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Liste */}
      <div style={card}>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(240px,1fr) 160px 180px 1fr", gap:10, alignItems:"center", marginBottom:10 }}>
          <div><div style={label}>Ara</div><input placeholder="Başlık, kişi…" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
          <div><div style={label}>Vardiya</div>
            <select value={shift} onChange={(e)=>setShift(e.target.value)}><option value="">Tümü</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}</select>
          </div>
          <div><div style={label}>Departman</div>
            <select value={dept} onChange={(e)=>setDept(e.target.value)}>
              <option value="">Tümü</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
          <div style={{ textAlign:"right", color:"#6b7280" }}>{filtered.length} kayıt</div>
        </div>

        {(filtered || []).map((t)=>(
          <div key={t.id} style={{ border:"1px solid #eef1f5", borderRadius:10, padding:10, marginBottom:8 }}>
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
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:999, border:`1px solid ${t.is_active ? "#bfe8d1":"#e5e7eb"}`, background: t.is_active ? "#e7f7ee":"#fff", color: t.is_active ? "#166534":"#374151", fontSize:12, fontWeight:700 }}>
                    {t.is_active ? "Aktif" : "Pasif"}
                  </span>
                  <button style={btn} onClick={()=>startEdit(t)}>Düzenle</button>
                  <button style={btn} onClick={()=>toggleActive(t)}>{t.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                  <button style={{ ...btn, borderColor:"#ef4444", color:"#991b1b" }} onClick={()=>remove(t.id)}>Sil</button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!loading && !filtered.length && (
          <div style={{ color:"#6b7280", padding:8 }}>Kayıt yok.</div>
        )}
      </div>

      {(err || msg) && (
        <div style={{ position:"fixed", right:16, bottom:16, padding:"10px 12px", borderRadius:12, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow:"0 6px 20px rgba(16,24,40,0.08)", fontSize:13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
