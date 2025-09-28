// apps/admin/src/pages/AdminTasks.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

type Task = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  assignee_employee_id: string | null;
  due_ts: string | null;
  status: "open" | "late" | "done";
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
  return (await r.json()) as T;
}

const IST_TZ = "Europe/Istanbul";
const fmtIST = (ts: string | null) =>
  ts
    ? new Intl.DateTimeFormat("tr-TR", { timeZone: IST_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(ts))
    : "—";

const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam", "—"] as const;

export default function AdminTasks() {
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");

  const [rows, setRows] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  const [openMap, setOpenMap] = useState<Record<string, boolean>>({
    Gece: true, Sabah: true, Öğlen: true, Akşam: true, "—": true,
  });

  const dayRef = useRef<string>(new Date().toLocaleDateString("tr-TR", { timeZone: IST_TZ }));

  // Neden: Her gün 00:00'da otomatik yeni görevleri üretip listeyi yenilemek
  useEffect(() => {
    const tickMidnight = setInterval(async () => {
      const nowDay = new Date().toLocaleDateString("tr-TR", { timeZone: IST_TZ });
      if (nowDay !== dayRef.current) {
        dayRef.current = nowDay;
        try { await api<{created:number; skipped:number}>(`/admin-tasks/materialize`, { method: "POST" }); } catch {}
        await load(); // yeni gün listesi
      }
    }, 30000);
    return () => clearInterval(tickMidnight);
  }, []);

  async function materialize(): Promise<void> {
    try {
      const res = await api<{ created: number; skipped: number }>(`/admin-tasks/materialize`, { method: "POST" });
      if (res) { setMsg(`Bugün oluşturulan görev: ${res.created} • Atlanan: ${res.skipped}`); setTimeout(()=>setMsg(""),1500); }
    } catch (e: any) {
      setErr(e?.message || "Günlük görevler oluşturulamadı"); setTimeout(()=>setErr(null),1800);
    }
  }

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", "all"); // tamamlananlar kaybolmasın
      if (shift) qs.set("shift", shift);
      if (dept) qs.set("dept", dept);
      const data = await api<Task[]>(`/admin-tasks?${qs.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Görevler alınamadı"); setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    await materialize();
    await load();
  }

  useEffect(() => { (async () => { await materialize(); await load(); })(); }, []);
  useEffect(() => { load(); }, [shift, dept]);

  async function tick(id: number) {
    try {
      const who = (localStorage.getItem("email") || "admin").trim();
      const t = await api<Task>(`/admin-tasks/${id}/tick`, { method: "PATCH", body: JSON.stringify({ who }) });
      setRows((prev) => prev.map((x) => (x.id === id ? t : x)));
      setMsg("Görev tamamlandı"); setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Tamamlama başarısız"); setTimeout(() => setErr(null), 1800);
    }
  }

  // Gruplama: vardiya → başlık
  const groups = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const r of rows) {
      const k = r.shift || "—";
      (map[k] ||= []).push(r);
    }
    return SHIFTS
      .filter((k) => (map[k]?.length ?? 0) > 0)
      .map((k) => ({
        shift: k,
        items: map[k].slice().sort((a,b)=>a.title.localeCompare(b.title,"tr")),
      }));
  }, [rows]);

  const total = rows.length;
  const openCnt = rows.filter((x) => x.status === "open").length;
  const lateCnt = rows.filter((x) => x.status === "late").length;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Admin Görevleri</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={refreshAll} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "160px 180px 1fr", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Vardiya</div>
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">Tümü</option>
            <option>Gece</option><option>Sabah</option><option>Öğlen</option><option>Akşam</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Departman</div>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">Tümü</option>
            <option>Admin</option><option>Finans</option><option>Bonus</option><option>LC</option>
          </select>
        </div>
        <div style={{ textAlign: "right", color: "#6b7280", alignSelf: "end" }}>
          {openCnt} açık • {lateCnt} gecikmiş • {total} toplam
        </div>
      </div>

      {SHIFTS.map((key) => {
        const items = groups.find((g) => g.shift === key)?.items || [];
        if (!items.length) return null;
        const isOpen = openMap[key];
        const toggle = () => setOpenMap((s) => ({ ...s, [key]: !s[key] }));
        return (
          <div key={key} style={{ border: "1px solid #eef0f4", borderRadius: 10, marginBottom: 10, background: "#fff" }}>
            <div onClick={toggle} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #eef1f4" }}>
              <div><strong>{key} Vardiyası</strong> <span style={{ color: "#6b7280", fontSize: 12 }}>• {items.length} görev</span></div>
              <div style={{ fontSize: 18 }}>{isOpen ? "▾" : "▸"}</div>
            </div>
            {isOpen && (
              <div style={{ padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 160px 160px 160px 120px", gap: 8, marginBottom: 8, color: "#6b7280", fontWeight: 700, fontSize: 12 }}>
                  <div>Görev</div><div>Departman</div><div>Atanan</div><div>Bitiş</div><div style={{ textAlign: "right" }}>Aksiyon</div>
                </div>
                {items.map((t, i) => (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 160px 160px 160px 120px", gap: 8, padding: 10, borderTop: "1px solid #f2f4f7", background: i%2 ? "#fafafa" : "#fff" }}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{t.title}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {t.is_done
                          ? `Tamam: ${t.done_by || "—"} • ${fmtIST(t.done_at)}`
                          : (t.status === "late" ? "Gecikmiş" : "Açık")}
                      </div>
                    </div>
                    <div style={{ fontSize: 12 }}>{t.department || "—"}</div>
                    <div style={{ fontSize: 12 }}>{t.assignee_employee_id || "—"}</div>
                    <div style={{ fontSize: 12 }}>{fmtIST(t.due_ts)}</div>
                    <div style={{ textAlign: "right" }}>
                      {!t.is_done ? (
                        <button onClick={() => tick(t.id)}>Tamamla</button>
                      ) : (
                        <span style={{ fontWeight: 700, color: "#166534" }}>✔</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {(err || msg) && (
        <div style={{ position: "fixed", right: 16, bottom: 16, padding: "8px 10px", borderRadius: 10, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46", boxShadow: "0 6px 20px rgba(16,24,40,0.08)", fontSize: 13 }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
