// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

/** Server model (beklenen alanlar) */
type Template = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;            // "Admin" | "Finans" | "Bonus" | "LC" | ...
  default_assignee: string | null;      // RD-xxx vb.
  grace_min: number | null;             // gecikme toleransı (dakika)
  is_active: boolean;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

export default function AdminTaskTemplates() {
  // Data
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Filters
  const [q, setQ] = useState("");
  const [shift, setShift] = useState<string>("");   // ""=tümü
  const [dept, setDept] = useState<string>("");     // ""=tümü
  const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

  // Create form
  const [title, setTitle] = useState("");
  const [cShift, setCShift] = useState<string>("");
  const [cDept, setCDept] = useState<string>("");
  const [cAssignee, setCAssignee] = useState<string>("");
  const [cGrace, setCGrace] = useState<string>("0");
  const [cActive, setCActive] = useState<boolean>(true);

  // Edit state (inline)
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eShift, setEShift] = useState<string>("");
  const [eDept, setEDept] = useState<string>("");
  const [eAssignee, setEAssignee] = useState<string>("");
  const [eGrace, setEGrace] = useState<string>("0");
  const [eActive, setEActive] = useState<boolean>(true);

  // Load
  async function load() {
    setErr(null); setMsg(""); setLoading(true);
    try {
      // Varsayılan endpoint: /admin-tasks/templates
      const data = await api<Template[]>("/admin-tasks/templates");
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message || "Şablonlar alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Filtered + grouped
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(r => {
      const okShift = shift ? (r.shift === shift) : true;
      const okDept = dept ? ((r.department || "") === dept) : true;
      const okQ = !qq || [r.title, r.department || "", r.default_assignee || ""].some(s => s.toLowerCase().includes(qq));
      return okShift && okDept && okQ;
    });
  }, [rows, q, shift, dept]);

  const groups = useMemo(() => {
    const map: Record<string, Template[]> = {};
    for (const r of filtered) {
      const k = r.shift || "—";
      (map[k] = map[k] || []).push(r);
    }
    return ["Gece","Sabah","Öğlen","Akşam","—"].filter(k => map[k]?.length).map(k => ({
      shift: k,
      items: map[k].slice().sort((a,b)=>a.title.localeCompare(b.title,"tr")),
    }));
  }, [filtered]);

  // Create
  async function createTpl() {
    if (!title.trim()) { setErr("Başlık zorunludur."); setTimeout(()=>setErr(null),2000); return; }
    try {
      const body = {
        title: title.trim(),
        shift: cShift || null,
        department: cDept || null,
        default_assignee: cAssignee || null,
        grace_min: Number.isFinite(Number(cGrace)) ? Number(cGrace) : 0,
        is_active: !!cActive,
      };
      const res = await api<Template>("/admin-tasks/templates", { method:"POST", body: JSON.stringify(body) });
      setRows(prev => [res, ...prev]);
      setTitle(""); setCShift(""); setCDept(""); setCAssignee(""); setCGrace("0"); setCActive(true);
      setMsg("Şablon eklendi."); setTimeout(()=>setMsg(""),1500);
    } catch (e:any) {
      setErr(e?.message || "Şablon eklenemedi"); setTimeout(()=>setErr(null),2500);
    }
  }

  // Start edit
  function beginEdit(t: Template) {
    setEditId(t.id);
    setETitle(t.title);
    setEShift(t.shift || "");
    setEDept(t.department || "");
    setEAssignee(t.default_assignee || "");
    setEGrace(String(t.grace_min ?? 0));
    setEActive(!!t.is_active);
  }

  // Save edit
  async function saveEdit(id: number) {
    try {
      const body = {
        title: eTitle.trim(),
        shift: eShift || null,
        department: eDept || null,
        default_assignee: eAssignee || null,
        grace_min: Number.isFinite(Number(eGrace)) ? Number(eGrace) : 0,
        is_active: !!eActive,
      };
      const res = await api<Template>(`/admin-tasks/templates/${id}`, { method:"PATCH", body: JSON.stringify(body) });
      setRows(prev => prev.map(x => x.id === id ? res : x));
      setEditId(null);
      setMsg("Şablon güncellendi."); setTimeout(()=>setMsg(""),1500);
    } catch (e:any) {
      setErr(e?.message || "Şablon güncellenemedi"); setTimeout(()=>setErr(null),2500);
    }
  }

  // Delete
  async function remove(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try {
      await api(`/admin-tasks/templates/${id}`, { method:"DELETE" });
      setRows(prev => prev.filter(x => x.id !== id));
      setMsg("Şablon silindi."); setTimeout(()=>setMsg(""),1500);
    } catch (e:any) {
      setErr(e?.message || "Şablon silinemedi"); setTimeout(()=>setErr(null),2500);
    }
  }

  // Toggle active
  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, { method:"PATCH", body: JSON.stringify({ is_active: !t.is_active }) });
      setRows(prev => prev.map(x => x.id === t.id ? res : x));
    } catch (e:any) {
      setErr(e?.message || "Durum değiştirilemedi"); setTimeout(()=>setErr(null),2500);
    }
  }

  // --- styles
  const container: React.CSSProperties = { maxWidth: 1120, margin:"0 auto", padding:16, display:"grid", gap:12 };
  const card: React.CSSProperties = { border:"1px solid #e5e7eb", borderRadius:12, background:"#fff", padding:12 };
  const th: React.CSSProperties = { fontSize:12, color:"#6b7280", fontWeight:600, textTransform:"uppercase" };
  const muted: React.CSSProperties = { fontSize:12, color:"#6b7280" };
  const btnPrimary: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" };
  const btnGhost: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#111", cursor:"pointer" };
  const tag = (txt: string) => ({ display:"inline-block", padding:"2px 8px", borderRadius:999, background:"#eef2ff", border:"1px solid #c7d2fe", color:"#1d4ed8", fontSize:12, fontWeight:700 } as React.CSSProperties);
  const pill = (active: boolean) => ({ display:"inline-block", padding:"2px 8px", borderRadius:999, border:`1px solid ${active?"#bfe8d1":"#e5e7eb"}`, background: active?"#e7f7ee":"#fff", color: active?"#166534":"#374151", fontSize:12, fontWeight:700 } as React.CSSProperties);

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Görev Şablonları</h1>

      {/* Yeni şablon */}
      <div style={card}>
        <div style={{ ...th, marginBottom: 8 }}>Yeni Şablon Ekle</div>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(260px,1fr) 140px 160px 160px 120px 120px", gap:8, alignItems:"end" }}>
          <div>
            <div style={th}>Başlık</div>
            <input placeholder="Örn: Günlük rapor gönderimi" value={title} onChange={(e)=>setTitle(e.target.value)} />
          </div>
          <div>
            <div style={th}>Vardiya</div>
            <select value={cShift} onChange={(e)=>setCShift(e.target.value)}>
              <option value="">—</option>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={th}>Departman</div>
            <select value={cDept} onChange={(e)=>setCDept(e.target.value)}>
              <option value="">—</option>
              <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
          <div>
            <div style={th}>Varsayılan Kişi</div>
            <input placeholder="RD-xxx / ad" value={cAssignee} onChange={(e)=>setCAssignee(e.target.value)} />
          </div>
          <div>
            <div style={th}>Tolerans (dk)</div>
            <input type="number" min={0} value={cGrace} onChange={(e)=>setCGrace(e.target.value)} />
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={th}>Aktif</div>
            <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
              <input type="checkbox" checked={cActive} onChange={(e)=>setCActive(e.target.checked)} /> {cActive ? "Açık" : "Kapalı"}
            </label>
          </div>
        </div>
        <div style={{ marginTop:10, textAlign:"right" }}>
          <button style={btnPrimary} onClick={createTpl} disabled={loading || !title.trim()}>
            Ekle
          </button>
        </div>
      </div>

      {/* Filtreler */}
      <div style={card}>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(200px,1fr) 160px 180px 160px", gap:8 }}>
          <div>
            <div style={th}>Ara</div>
            <input placeholder="Başlık, kişi…" value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
          <div>
            <div style={th}>Vardiya</div>
            <select value={shift} onChange={(e)=>setShift(e.target.value)}>
              <option value="">Tümü</option>
              {SHIFTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={th}>Departman</div>
            <select value={dept} onChange={(e)=>setDept(e.target.value)}>
              <option value="">Tümü</option>
              <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
          <div style={{ alignSelf:"end", textAlign:"right" }}>
            <button style={btnGhost} onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
          </div>
        </div>
      </div>

      {/* Liste */}
      {groups.map(g => (
        <div key={g.shift} style={card}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <div>
              <span style={tag(g.shift)}> {g.shift} </span>
              <span style={{ ...muted, marginLeft:8 }}>{g.items.length} şablon</span>
            </div>
          </div>

          <div style={{ display:"grid", gap:8 }}>
            {g.items.map(t => (
              <div key={t.id} style={{ border:"1px solid #eef1f5", borderRadius:10, padding:10, background:"#fff" }}>
                {editId === t.id ? (
                  // ---- Edit form (inline) ----
                  <div style={{ display:"grid", gridTemplateColumns:"minmax(260px,1fr) 140px 160px 160px 120px 160px", gap:8, alignItems:"end" }}>
                    <div>
                      <div style={th}>Başlık</div>
                      <input value={eTitle} onChange={(e)=>setETitle(e.target.value)} />
                    </div>
                    <div>
                      <div style={th}>Vardiya</div>
                      <select value={eShift} onChange={(e)=>setEShift(e.target.value)}>
                        <option value="">—</option>
                        {SHIFTS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={th}>Departman</div>
                      <select value={eDept} onChange={(e)=>setEDept(e.target.value)}>
                        <option value="">—</option>
                        <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
                      </select>
                    </div>
                    <div>
                      <div style={th}>Varsayılan Kişi</div>
                      <input value={eAssignee} onChange={(e)=>setEAssignee(e.target.value)} />
                    </div>
                    <div>
                      <div style={th}>Tolerans (dk)</div>
                      <input type="number" min={0} value={eGrace} onChange={(e)=>setEGrace(e.target.value)} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
                        <input type="checkbox" checked={eActive} onChange={(e)=>setEActive(e.target.checked)} /> {eActive ? "Açık" : "Kapalı"}
                      </label>
                      <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                        <button style={btnPrimary} onClick={()=>saveEdit(t.id)}>Kaydet</button>
                        <button style={btnGhost} onClick={()=>setEditId(null)}>İptal</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // ---- Readonly row ----
                  <div style={{ display:"grid", gridTemplateColumns:"minmax(260px,1fr) 140px 160px 160px 120px 160px", gap:8, alignItems:"center" }}>
                    <div>
                      <div style={{ fontWeight:700 }}>{t.title}</div>
                      <div style={muted}>{t.department || "-"} {t.default_assignee ? `• ${t.default_assignee}` : ""}</div>
                    </div>
                    <div style={muted}>{t.shift || "—"}</div>
                    <div style={muted}>{(t.grace_min ?? 0) + " dk"}</div>
                    <div>
                      <span style={pill(t.is_active)}>{t.is_active ? "Aktif" : "Pasif"}</span>
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      <button style={btnGhost} onClick={()=>beginEdit(t)}>Düzenle</button>
                      <button style={btnGhost} onClick={()=>toggleActive(t)}>{t.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <button style={{ ...btnGhost, borderColor:"#ef4444", color:"#991b1b" }} onClick={()=>remove(t.id)}>Sil</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!g.items.length && <div style={{ ...muted }}>Kayıt yok.</div>}
          </div>
        </div>
      ))}

      {/* Toast */}
      {(err || msg) && (
        <div style={{
          position:"fixed", right:16, bottom:16, padding:"10px 12px", borderRadius:10,
          background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46",
          boxShadow:"0 6px 20px rgba(0,0,0,.08)", fontSize:13, maxWidth:360
        }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
