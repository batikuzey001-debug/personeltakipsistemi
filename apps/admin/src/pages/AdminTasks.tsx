// apps/admin/src/pages/AdminTasks.tsx
// ... (dosyanın tamamı, güncellenmiş hâli)
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type Task = {
  id: number;
  date: string;
  shift: string | null;
  title: string;
  department: string | null;
  assignee_employee_id: string | null;
  due_ts: string | null;
  status: "open" | "done" | "late";
  is_done: boolean;
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

const IST_TZ = "Europe/Istanbul";
const fmtISTTime = (ts: string | null) =>
  ts ? new Intl.DateTimeFormat("tr-TR", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) : "—";
function todayYmd() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

export default function AdminTasks() {
  // Filtreler
  const [date, setDate] = useState<string>(todayYmd());
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  // Data
  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Yeni görev formu (anlık ekleme)
  const [newTitle, setNewTitle] = useState("");
  const [newShift, setNewShift] = useState("");
  const [newDept, setNewDept] = useState("");
  const [newAssignee, setNewAssignee] = useState("");

  const SHIFT_ORDER = ["Gece", "Sabah", "Öğlen", "Akşam", "—"] as const;
  const [open, setOpen] = useState<Record<string, boolean>>({ Gece:true, Sabah:true, Öğlen:true, Akşam:true, "—":true });

  async function load() {
    setErr(null); setMsg("");
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (date) qs.set("d", date);
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Task[]>(`/admin-tasks?${qs.toString()}`);
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message || "Görevler alınamadı");
      setRows([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Anlık yenileme: 20 sn'de bir ve pencere odaklanınca
  useEffect(() => {
    const id = setInterval(() => load(), 20000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(id); window.removeEventListener("focus", onFocus); };
    // eslint-disable-next-line
  }, [date, shift, dept]);

  // Client-side arama
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.title, r.department || "", r.assignee_employee_id || ""].some(f => f.toLowerCase().includes(q)));
  }, [rows, search]);

  // Gruplama
  const groups = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const r of filtered) (map[r.shift || "—"] = map[r.shift || "—"] || []).push(r);
    return SHIFT_ORDER.filter(k => map[k]?.length).map(k => ({ shift: k, items: map[k].slice().sort((a,b)=>a.title.localeCompare(b.title,"tr")) }));
  }, [filtered]);

  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "admin").trim();
      const t = await api<Task>(`/admin-tasks/${id}/tick`, { method:"PATCH", body: JSON.stringify({ who }) });
      setRows(prev => prev.map(r => r.id === id ? t : r));
      setMsg("Görev tamamlandı."); setTimeout(()=>setMsg(""), 1500);
    } catch (e:any) { setErr(e?.message || "Tamamlama başarısız"); setTimeout(()=>setErr(null), 3000); }
  }

  async function createTask() {
    if (!newTitle.trim()) { setErr("Görev başlığı zorunlu."); setTimeout(()=>setErr(null), 2500); return; }
    try {
      await api<Task>("/admin-tasks", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          shift: newShift || null,
          department: newDept || null,
          assignee_employee_id: newAssignee || null,
        }),
      });
      // form sıfırla + anlık yenile
      setNewTitle(""); setNewShift(""); setNewDept(""); setNewAssignee("");
      await load();
      setMsg("Görev oluşturuldu."); setTimeout(()=>setMsg(""), 1500);
    } catch (e:any) { setErr(e?.message || "Görev oluşturulamadı"); setTimeout(()=>setErr(null), 3000); }
  }

  // ---- STYLES ----
  const container: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const card: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12 };
  const bar: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 8, alignItems: "center" };
  const chips: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
  const chipBtn = (active: boolean): React.CSSProperties => ({ padding:"6px 10px", borderRadius:20, border: active?"1px solid #2563eb":"1px solid #e5e7eb", background: active?"#eef2ff":"#fff", color: active?"#1d4ed8":"#111", fontWeight:600, cursor:"pointer" });
  const th: React.CSSProperties = { fontSize: 12, color: "#6b7280", textTransform:"uppercase", letterSpacing: 0.3 };
  const muted: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const gridList: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(260px,1fr) 150px 160px 160px 120px", gap:8, alignItems:"center" };
  const shiftHead: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, padding:"10px 12px", background:"#f9fafb", borderBottom:"1px solid #eef1f4", cursor:"pointer" };
  const btnPrimary: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #2563eb", background:"#2563eb", color:"#fff", fontWeight:600, cursor:"pointer" };
  const btnGhost: React.CSSProperties = { padding:"8px 10px", borderRadius:8, border:"1px solid #e5e7eb", background:"#fff", color:"#111", cursor:"pointer" };
  const statusPill = (s: Task["status"]) => {
    const map: any = { open:{bg:"#eef3ff",bd:"#c7d2fe",fg:"#1d4ed8",tx:"Açık"}, late:{bg:"#fff1f2",bd:"#fecdd3",fg:"#b91c1c",tx:"Gecikmiş"}, done:{bg:"#e7f7ee",bd:"#bfe8d1",fg:"#166534",tx:"Tamamlandı"} };
    return { display:"inline-block", padding:"2px 8px", borderRadius:999, background:map[s].bg, border:`1px solid ${map[s].bd}`, color:map[s].fg, fontSize:12, fontWeight:700 } as React.CSSProperties;
  };

  // Top-strip: Yeni Görev
  const topStrip: React.CSSProperties = { display:"grid", gridTemplateColumns:"minmax(220px,1fr) 140px 160px 180px 120px", gap:8, alignItems:"end" };

  // ---- RENDER ----
  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Admin Görevleri</h1>

      {/* Yeni Görev (anlık) */}
      <div style={card}>
        <div style={{ ...th, marginBottom: 6 }}>Yeni Görev</div>
        <div style={topStrip}>
          <div>
            <div style={th}>Başlık</div>
            <input placeholder="Görev başlığı" value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} />
          </div>
          <div>
            <div style={th}>Vardiya</div>
            <select value={newShift} onChange={(e)=>setNewShift(e.target.value)}>
              <option value="">—</option>
              <option>Gece</option><option>Sabah</option><option>Öğlen</option><option>Akşam</option>
            </select>
          </div>
          <div>
            <div style={th}>Departman</div>
            <select value={newDept} onChange={(e)=>setNewDept(e.target.value)}>
              <option value="">—</option>
              <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
            </select>
          </div>
          <div>
            <div style={th}>Atanacak Kişi (ops.)</div>
            <input placeholder="RD-xxx / ad" value={newAssignee} onChange={(e)=>setNewAssignee(e.target.value)} />
          </div>
          <div style={{ textAlign:"right" }}>
            <button type="button" style={btnPrimary} onClick={createTask} disabled={loading || !newTitle.trim()}>
              Ekle
            </button>
          </div>
        </div>
      </div>

      {/* Filtre barı */}
      <div style={card}>
        <form onSubmit={(e)=>{e.preventDefault(); load();}} style={{ display:"grid", gap:10 }}>
          <div style={bar}>
            <div><div style={th}>Tarih</div><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} /></div>
            <div><div style={th}>Vardiya</div>
              <select value={shift} onChange={(e)=>setShift(e.target.value)}><option value="">Tümü</option><option>Gece</option><option>Sabah</option><option>Öğlen</option><option>Akşam</option></select>
            </div>
            <div><div style={th}>Departman</div>
              <select value={dept} onChange={(e)=>setDept(e.target.value)}><option value="">Tümü</option><option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option></select>
            </div>
            <div><div style={th}>Ara</div><input placeholder="Görev başlığı, kişi…" value={search} onChange={(e)=>setSearch(e.target.value)} /></div>
            <div style={{ alignSelf:"end", display:"flex", gap:8 }}>
              <button type="submit" style={btnGhost} disabled={loading}>{loading ? "Yükleniyor…" : "Listele"}</button>
              <button type="button" style={btnGhost} onClick={()=>{ setDate(todayYmd()); setShift(""); setDept(""); setSearch(""); load(); }}>Sıfırla</button>
            </div>
          </div>

          {/* Vardiya çipleri */}
          <div style={chips}>
            {["Gece","Sabah","Öğlen","Akşam"].map(s=>{
              const count = rows.filter(r => (r.shift || "—") === s).length;
              const active = shift === s;
              return <button key={s} type="button" onClick={()=>setShift(active?"":s)} style={chipBtn(active)}>{s} {count?`• ${count}`:""}</button>;
            })}
          </div>
        </form>
      </div>

      {/* Gruplar */}
      {useMemo(()=>groups, [groups]).map(g=>{
        const isOpen = open[g.shift]; const toggle = ()=>setOpen(s=>({ ...s, [g.shift]: !s[g.shift] }));
        const total = g.items.length, openCnt = g.items.filter(x=>x.status==="open").length, lateCnt = g.items.filter(x=>x.status==="late").length;

        return (
          <div key={g.shift} style={{ ...card, padding:0, overflow:"hidden" }}>
            <div style={shiftHead} onClick={toggle}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <strong>{g.shift} Vardiyası</strong>
                <span style={muted}>{total} görev • Açık {openCnt} • Gecikmiş {lateCnt}</span>
              </div>
              <div style={{ fontSize:18 }}>{isOpen?"▾":"▸"}</div>
            </div>

            {isOpen && (
              <div style={{ padding:12 }}>
                <div style={{ ...gridList, marginBottom:6 }}>
                  <div style={th}>Görev</div><div style={th}>Durum</div><div style={th}>Atanan</div><div style={th}>Bitiş (IST)</div><div style={{ ...th, textAlign:"right" }}>Aksiyon</div>
                </div>
                {g.items.map((t,i)=>(
                  <div key={t.id} style={{ ...gridList, padding:"10px 8px", borderTop:"1px solid #f3f4f6", background: i%2?"#fafafa":"#fff" }}>
                    <div>
                      <div style={{ fontWeight:700, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{t.title}</div>
                      <div style={muted}>{t.department || "-"} {t.assignee_employee_id?`• ${t.assignee_employee_id}`:""}</div>
                    </div>
                    <div>
                      <span style={statusPill(t.status)}>{t.status==="open"?"Açık":t.status==="late"?"Gecikmiş":"Tamamlandı"}</span>
                      {t.done_at && <div style={{ marginTop:4, ...muted }}>İşaretlenme: {fmtISTTime(t.done_at)}</div>}
                    </div>
                    <div style={muted}>{t.assignee_employee_id || "—"}</div>
                    <div style={muted}>{fmtISTTime(t.due_ts)}</div>
                    <div style={{ display:"flex", justifyContent:"flex-end" }}>
                      {!t.is_done ? <button style={btnPrimary} onClick={()=>tick(t.id)}>Tamamla</button> : <span style={{ ...muted, fontWeight:700, color:"#166534" }}>✔ Tamamlandı</span>}
                    </div>
                  </div>
                ))}
                {!g.items.length && <div style={{ padding:12, color:"#6b7280" }}>Kayıt yok.</div>}
              </div>
            )}
          </div>
        );
      })}

      {(err || msg) && (
        <div style={{ position:"fixed", right:16, bottom:16, padding:"10px 12px", borderRadius:10, boxShadow:"0 6px 20px rgba(0,0,0,.08)", background: err?"#fee2e2":"#dcfce7", color: err?"#7f1d1d":"#065f46", fontSize:13, maxWidth:320 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
