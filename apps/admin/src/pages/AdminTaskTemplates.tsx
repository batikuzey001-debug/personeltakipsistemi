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

type Task = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  assignee_employee_id: string | null;
  status: "open" | "late" | "done";
  due_ts: string | null;
  done_at: string | null;
  done_by: string | null;
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

const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

export default function AdminTaskTemplates() {
  // Data
  const [rows, setRows] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Filters (templates)
  const [q, setQ] = useState("");
  const [fltShift, setFltShift] = useState("");
  const [fltDept, setFltDept] = useState("");

  // Selection (template detail)
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eShift, setEShift] = useState<string>("");
  const [eDept, setEDept] = useState<string>("");
  const [eAssignee, setEAssignee] = useState<string>("");
  const [eActive, setEActive] = useState<boolean>(true);

  // Bulk add
  const [bulkText, setBulkText] = useState("");
  const [bulkShift, setBulkShift] = useState("");
  const [bulkDept, setBulkDept] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);

  async function load() {
    setErr(null); setMsg(""); setLoading(true);
    try {
      // ŞABLONLAR
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (fltShift) qs.set("shift", fltShift);
      if (fltDept) qs.set("dept", fltDept);
      const tpls = await api<Template[]>(`/admin-tasks/templates?${qs.toString()}`);
      setRows(Array.isArray(tpls) ? tpls : []);

      // CANLI GÖREVLER — yalnız açık/gecikmiş (scope=open)
      const qsTasks = new URLSearchParams();
      qsTasks.set("scope", "open");
      const live = await api<Task[]>(`/admin-tasks?${qsTasks.toString()}`);
      setTasks(Array.isArray(live) ? live : []);

      // seçili id yoksa ilk sırayı ata
      if (!selectedId && tpls && tpls.length) setSelectedId(tpls[0].id);
    } catch (e: any) {
      setErr(e?.message || "Veriler alınamadı");
      setRows([]); setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filteredTpls = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(t => {
      const okS = fltShift ? t.shift === fltShift : true;
      const okD = fltDept ? (t.department || "") === fltDept : true;
      const okQ = !needle || [t.title, t.department || "", t.default_assignee || ""].join(" ").toLowerCase().includes(needle);
      return okS && okD && okQ;
    });
  }, [rows, q, fltShift, fltDept]);

  const selected = useMemo(() => rows.find(r => r.id === selectedId) || null, [rows, selectedId]);

  // Seçili şablonun canlı görevleri (başlık + vardiya + departman eşleşmesi)
  const selectedTasks = useMemo(() => {
    if (!selected) return [];
    return tasks.filter(x =>
      x.title === selected.title &&
      (x.shift || null) === (selected.shift || null) &&
      (x.department || null) === (selected.department || null)
    );
  }, [tasks, selected]);

  function beginEdit(t: Template) {
    setEditId(t.id);
    setETitle(t.title);
    setEShift(t.shift || "");
    setEDept(t.department || "");
    setEAssignee(t.default_assignee || "");
    setEActive(!!t.is_active);
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
          is_active: eActive,
        }),
      });
      setRows(prev => prev.map(x => x.id === id ? res : x));
      setEditId(null); setMsg("Şablon güncellendi."); setTimeout(()=>setMsg(""), 1200);
      // düzenlemeden sonra canlı görev eşleşmesi değişebilir → reload
      load();
    } catch (e:any) {
      setErr(e?.message || "Şablon güncellenemedi"); setTimeout(()=>setErr(null), 1800);
    }
  }

  async function removeTpl(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try {
      await api(`/admin-tasks/templates/${id}`, { method: "DELETE" });
      setRows(prev => prev.filter(x => x.id !== id));
      if (selectedId === id) setSelectedId(null);
      setMsg("Şablon silindi."); setTimeout(()=>setMsg(""), 1200);
    } catch (e:any) {
      setErr(e?.message || "Şablon silinemedi"); setTimeout(()=>setErr(null), 1800);
    }
  }

  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      setRows(prev => prev.map(x => x.id === t.id ? res : x));
    } catch (e:any) {
      setErr(e?.message || "Durum değişmedi"); setTimeout(()=>setErr(null), 1800);
    }
  }

  // Şablondan TEK görev ata (anında Admin Görevleri’nde görünür)
  async function assignOneFromTemplate(t: Template) {
    try {
      await api("/admin-tasks", {
        method: "POST",
        body: JSON.stringify({
          title: t.title,
          shift: t.shift,
          department: t.department,
          assignee_employee_id: t.default_assignee,
        }),
      });
      setMsg("Görev atandı."); setTimeout(()=>setMsg(""), 1200);
      load(); // canlı görevleri güncelle
    } catch (e:any) {
      setErr(e?.message || "Görev atanamadı"); setTimeout(()=>setErr(null), 1800);
    }
  }

  // Toplu ekleme
  async function bulkAdd() {
    const lines = bulkText.split("\n").map(s=>s.trim()).filter(Boolean);
    if (!lines.length) { setErr("Eklenecek satır yok."); setTimeout(()=>setErr(null), 1500); return; }
    if (!bulkShift && !bulkDept) { setErr("Vardiya veya departman seçin."); setTimeout(()=>setErr(null), 1500); return; }
    setSavingBulk(true);
    try {
      const items = lines.map(line => {
        const [title, assignee] = line.split("|").map(s=> (s||"").trim());
        return { title, shift: bulkShift || null, department: bulkDept || null, default_assignee: assignee || null, is_active: true };
      });
      let out: Template[] = [];
      try {
        out = await api<Template[]>("/admin-tasks/templates/bulk", { method:"POST", body: JSON.stringify({ items }) });
      } catch {
        for (const it of items) {
          const one = await api<Template>("/admin-tasks/templates", { method:"POST", body: JSON.stringify(it) });
          out.push(one);
        }
      }
      setRows(prev => [...out, ...prev]);
      setBulkText("");
      setMsg("Şablonlar eklendi."); setTimeout(()=>setMsg(""), 1200);
    } catch (e:any) {
      setErr(e?.message || "Toplu ekleme başarısız"); setTimeout(()=>setErr(null), 1800);
    } finally {
      setSavingBulk(false);
    }
  }

  // ---- STYLES ----
  const page: React.CSSProperties = { maxWidth: 1160, margin:"0 auto", padding:16, display:"grid", gap:12 };
  const two: React.CSSProperties = { display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:12, alignItems:"start" };
  const card: React.CSSProperties = { border:"1px solid #eef0f4", borderRadius:14, background:"#fff", padding:14, boxShadow:"0 6px 24px rgba(16,24,40,0.04)" };
  const label: React.CSSProperties = { fontSize:12, color:"#6b7280", fontWeight:700, textTransform:"uppercase", letterSpacing:".3px", marginBottom:6 };
  const hint: React.CSSProperties = { fontSize:12, color:"#6b7280" };
  const btn: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #e5e7eb", background:"#fff", cursor:"pointer" };
  const btnPrimary: React.CSSProperties = { padding:"8px 12px", borderRadius:10, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" };
  const rowGrid: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(200px,1fr) 120px 160px 160px 1fr", gap:10, alignItems:"center" };
  const taskRow: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(200px,1fr) 120px 160px 1fr", gap:10, alignItems:"center" };
  const badge = (s: Task["status"])=>{
    const map = { open:{bg:"#eef3ff",bd:"#c7d2fe",fg:"#1d4ed8",tx:"Açık"}, late:{bg:"#fff1f2",bd:"#fecdd3",fg:"#b91c1c",tx:"Gecikmiş"}, done:{bg:"#e7f7ee",bd:"#bfe8d1",fg:"#166534",tx:"Tamamlandı"} } as const;
    const c = map[s]; return { display:"inline-block", padding:"2px 8px", borderRadius:999, background:c.bg, border:`1px solid ${c.bd}`, color:c.fg, fontWeight:800, fontSize:12 };
  };

  return (
    <div style={page}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <h1 style={{ margin:0, fontSize:20, fontWeight:800 }}>Görev Şablonları</h1>
        <div style={{ display:"flex", gap:8 }}>
          <button style={btn} onClick={load} disabled={loading}>{loading?"Yükleniyor…":"Yenile"}</button>
        </div>
      </div>

      <div style={two}>
        {/* Sol: ŞABLON Yönetimi */}
        <div style={card}>
          {/* Toplu Ekle */}
          <div style={{ display:"grid", gap:10 }}>
            <div style={label}>Toplu Şablon Ekle</div>
            <div>
              <div style={hint}>Her satır bir şablon. “Başlık | RD-xxx” ile kişi belirtebilirsiniz.</div>
              <textarea rows={5} value={bulkText} onChange={(e)=>setBulkText(e.target.value)} placeholder={'Örn:\nGün sonu raporu\nVardiya teslim | RD-021\nLog kontrol'} style={{ width:"100%", resize:"vertical" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"140px 160px 1fr", gap:10, alignItems:"end" }}>
              <div><div style={label}>Vardiya</div><select value={bulkShift} onChange={(e)=>setBulkShift(e.target.value)}><option value="">—</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><div style={label}>Departman</div><select value={bulkDept} onChange={(e)=>setBulkDept(e.target.value)}><option value="">—</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option></select></div>
              <div style={{ textAlign:"right" }}><button style={btnPrimary} onClick={bulkAdd} disabled={savingBulk || !bulkText.trim()}>{savingBulk?"Ekleniyor…":"Ekle"}</button></div>
            </div>
          </div>

          {/* Filtreler */}
          <div style={{ display:"grid", gridTemplateColumns:"minmax(220px,1fr) 140px 160px 1fr", gap:10, alignItems:"end", marginTop:12 }}>
            <div><div style={label}>Ara</div><input placeholder="Başlık, kişi…" value={q} onChange={(e)=>setQ(e.target.value)} /></div>
            <div><div style={label}>Vardiya</div><select value={fltShift} onChange={(e)=>setFltShift(e.target.value)}><option value="">Tümü</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}</select></div>
            <div><div style={label}>Departman</div><select value={fltDept} onChange={(e)=>setFltDept(e.target.value)}><option value="">Tümü</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option></select></div>
            <div style={{ textAlign:"right", color:"#6b7280" }}>{filteredTpls.length} şablon</div>
          </div>

          {/* Şablon listesi */}
          <div style={{ marginTop: 10 }}>
            {filteredTpls.map(t=>(
              <div key={t.id} style={{ border:"1px solid #eef1f5", borderRadius:10, padding:10, marginBottom:8, cursor:"pointer", background: selectedId===t.id ? "#f8fafc" : "#fff" }} onClick={()=>setSelectedId(t.id)}>
                {editId === t.id ? (
                  <div style={rowGrid}>
                    <div><div style={label}>Başlık</div><input value={eTitle} onChange={(e)=>setETitle(e.target.value)} /></div>
                    <div><div style={label}>Vardiya</div><select value={eShift} onChange={(e)=>setEShift(e.target.value)}><option value="">—</option>{SHIFTS.map(s=><option key={s}>{s}</option>)}</select></div>
                    <div><div style={label}>Departman</div><select value={eDept} onChange={(e)=>setEDept(e.target.value)}><option value="">—</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option></select></div>
                    <div><div style={label}>Varsayılan Kişi</div><input value={eAssignee} onChange={(e)=>setEAssignee(e.target.value)} /></div>
                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end", alignItems:"center" }}>
                      <label style={{ display:"inline-flex", alignItems:"center", gap:6 }}><input type="checkbox" checked={eActive} onChange={(e)=>setEActive(e.target.checked)} /> aktif</label>
                      <button style={btnPrimary} onClick={()=>saveEdit(t.id)}>Kaydet</button>
                      <button style={btn} onClick={()=>setEditId(null)}>İptal</button>
                    </div>
                  </div>
                ) : (
                  <div style={rowGrid}>
                    <div>
                      <div style={{ fontWeight:800 }}>{t.title}</div>
                      <div style={hint}>{t.department || "—"} {t.default_assignee ? `• ${t.default_assignee}` : ""}</div>
                    </div>
                    <div style={hint}>{t.shift || "—"}</div>
                    <div style={hint}>{t.department || "—"}</div>
                    <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                      <button style={btn} onClick={(e)=>{e.stopPropagation(); assignOneFromTemplate(t);}}>Görev ata</button>
                      <button style={btn} onClick={(e)=>{e.stopPropagation(); toggleActive(t);}}>{t.is_active ? "Pasifleştir" : "Aktifleştir"}</button>
                      <button style={btn} onClick={(e)=>{e.stopPropagation(); beginEdit(t);}}>Düzenle</button>
                      <button style={{ ...btn, borderColor:"#ef4444", color:"#991b1b" }} onClick={(e)=>{e.stopPropagation(); removeTpl(t.id);}}>Sil</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!loading && !filteredTpls.length && (<div style={{ color:"#6b7280" }}>Kayıt yok.</div>)}
          </div>
        </div>

        {/* Sağ: Seçili şablonun CANLI görevleri */}
        <div style={card}>
          <h3 style={{ margin: 0, fontWeight: 800 }}>Seçili Şablon • Canlı Görevler</h3>
          {!selected && <div style={{ marginTop: 8, color:"#6b7280" }}>Şablon seçiniz.</div>}
          {selected && (
            <div style={{ marginTop: 10, display:"grid", gap:8 }}>
              {selectedTasks.map((x)=>(
                <div key={x.id} style={{ border:"1px solid #eef1f5", borderRadius:10, padding:10 }}>
                  <div style={{ fontWeight:800 }}>{x.title}</div>
                  <div style={{ fontSize:12, color:"#6b7280", display:"flex", gap:8, flexWrap:"wrap" }}>
                    <span>{x.department || "—"}</span>
                    {x.assignee_employee_id && <span>• {x.assignee_employee_id}</span>}
                    <span>• {x.shift || "—"}</span>
                    <span>• {x.status === "late" ? "Gecikmiş" : "Açık"}</span>
                  </div>
                </div>
              ))}
              {!selectedTasks.length && <div style={{ color:"#6b7280" }}>Bu şablonla eşleşen canlı görev yok.</div>}
            </div>
          )}
        </div>
      </div>

      {(err || msg) && (
        <div style={{ position:"fixed", right:16, bottom:16, padding:"10px 12px", borderRadius:12, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow:"0 6px 20px rgba(16,24,40,0.08)", fontSize:13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
