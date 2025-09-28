// apps/admin/src/pages/ShiftPlanner.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

/* Types */
type Employee = { id: string; full_name: string; department?: string | null };
type Assign = { employee_id: string; date: string; week_start: string; shift_def_id: number | null; status: "ON" | "OFF" };
type WeekStatus = "draft" | "published";
type ShiftWeek = { week_start: string; status: WeekStatus; published_at?: string | null; published_by?: string | null };
type ShiftDef = { id: number; start_time: string; end_time: string; is_active?: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

/* Date helpers */
const fmtTR = new Intl.DateTimeFormat("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Istanbul" });
function toISODate(d: Date): string { const z = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); return z.toISOString().slice(0, 10); }
function mondayOf(d: Date): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const day = x.getDay(); const diff = (day === 0 ? -6 : 1) - day; x.setDate(x.getDate() + diff); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function pad2(n: number) { return n.toString().padStart(2, "0"); }

/* 24 adet 8 saatlik slot key'i (UI) */
const SLOT_KEYS = Array.from({ length: 24 }, (_, h) => {
  const s = `${pad2(h)}:00`, e = `${pad2((h + 8) % 24)}:00`;
  return `${s}-${e}`;
});

/* ---- Bileşen ---- */
export default function ShiftPlanner() {
  // Hafta
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const weekStartISO = toISODate(monday);
  const weekEndISO = toISODate(addDays(monday, 6));
  const days = useMemo(() => {
    const labels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cts", "Paz"];
    return Array.from({ length: 7 }, (_, i) => ({ label: labels[i], iso: toISODate(addDays(monday, i)) }));
  }, [monday]);

  // Veriler
  const [emps, setEmps] = useState<Employee[]>([]);
  const [week, setWeek] = useState<ShiftWeek | null>(null);
  const [defs, setDefs] = useState<Record<string, number>>({}); // "HH:MM-HH:MM" -> shift_def_id

  // Hücre state: tek sözlük. Key = "empId|YYYY-MM-DD". Value = "OFF" veya "HH:MM-HH:MM"
  const [cells, setCells] = useState<Record<string, string>>({});

  // UI
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Departman grupları + aç/kapa
  const byDept = useMemo(() => {
    const map: Record<string, Employee[]> = {};
    for (const e of emps) (map[e.department || "—"] ||= []).push(e);
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.full_name || a.id).localeCompare(b.full_name || b.id, "tr"));
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [emps]);
  const [openDept, setOpenDept] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const o: Record<string, boolean> = {};
    for (const [d] of byDept) o[d] = true;
    setOpenDept(o);
  }, [byDept.length]);

  /* Backend'de yoksa /shifts tablosunu 24 slot ile seed et ve id eşlemesi kur */
  async function ensureDefs(): Promise<Record<string, number>> {
    const map: Record<string, number> = {};
    let existing: ShiftDef[] = [];
    try { existing = await api<ShiftDef[]>("/shifts"); } catch { existing = []; }
    for (const s of existing) map[`${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)}`] = (s as any).id;

    // eksikleri yarat
    for (const key of SLOT_KEYS) {
      if (map[key]) continue;
      const [start_time, end_time] = key.split("-");
      try {
        const res = await api<ShiftDef>("/shifts", { method: "POST", body: JSON.stringify({ name: key, start_time, end_time, is_active: true }) });
        map[key] = (res as any).id;
      } catch { /* idempotent */ }
    }

    // final çek
    try {
      existing = await api<ShiftDef[]>("/shifts");
      for (const s of existing) map[`${s.start_time.slice(0,5)}-${s.end_time.slice(0,5)}`] = (s as any).id;
    } catch {}

    return map;
  }

  /* Yükleme */
  async function load() {
    setLoading(true); setErr(null);
    try {
      const [e, w, a, map] = await Promise.all([
        api<Employee[]>("/employees"),
        api<ShiftWeek>(`/shift-weeks/${weekStartISO}`),
        api<Assign[]>(`/shift-assignments?week_start=${weekStartISO}`),
        ensureDefs(),
      ]);
      setEmps(e);
      setWeek(w);
      setDefs(map);

      // Tüm hücreleri OFF yap
      const dict: Record<string, string> = {};
      for (const emp of e) for (const d of days) dict[`${emp.id}|${d.iso}`] = "OFF";

      // Atamaları işle
      for (const row of a) {
        const key = `${row.employee_id}|${row.date}`;
        if (row.status === "ON" && row.shift_def_id != null) {
          // id -> UI anahtarı
          const uiKey = Object.keys(map).find(k => map[k] === row.shift_def_id) || "OFF";
          dict[key] = uiKey;
        }
      }
      setCells(dict);
    } catch (ex: any) {
      setErr(ex?.message || "Veriler alınamadı");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-line */ }, [weekStartISO]);

  /* Tek hücre güncelle — sadece o anahtar değişir */
  function setCell(empId: string, iso: string, value: string) {
    const key = `${empId}|${iso}`;
    setCells(prev => ({ ...prev, [key]: value }));
  }

  /* Kaydet */
  async function save() {
    setSaving(true); setErr(null);
    try {
      const payload: Assign[] = [];
      for (const [deptName, list] of byDept) {
        for (const emp of list) {
          for (const d of days) {
            const v = cells[`${emp.id}|${d.iso}`] || "OFF";
            payload.push({
              employee_id: emp.id,
              date: d.iso,
              week_start: weekStartISO,
              shift_def_id: v === "OFF" ? null : (defs[v] ?? null),
              status: v === "OFF" ? "OFF" : "ON",
            });
          }
        }
      }
      await api("/shift-assignments/bulk", { method: "POST", body: JSON.stringify(payload) });
      setMsg("Kaydedildi"); setTimeout(() => setMsg(""), 1200);
      await load();
    } catch (ex: any) {
      setErr(ex?.message || "Kaydetme hatası"); setTimeout(() => setErr(null), 1800);
    } finally { setSaving(false); }
  }

  /* Publish */
  async function publish() {
    if (!confirm("Bu haftayı yayınla ve kilitle?")) return;
    try {
      const w = await api<ShiftWeek>(`/shift-weeks/${weekStartISO}/publish`, { method: "POST" });
      setWeek(w); setMsg("Hafta yayınlandı"); setTimeout(() => setMsg(""), 1200);
    } catch (ex: any) {
      setErr(ex?.message || "Publish hatası"); setTimeout(() => setErr(null), 1800);
    }
  }

  const isDraft = week?.status !== "published";

  /* UI */
  const page: React.CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const card: React.CSSProperties = { border: "1px solid #eef0f4", borderRadius: 12, background: "#fff", boxShadow: "0 6px 24px rgba(16,24,40,0.04)" };
  const badge: React.CSSProperties = { padding: "2px 8px", borderRadius: 999, fontWeight: 800, fontSize: 12, background: isDraft ? "#fff7ed" : "#ecfdf5", border: `1px solid ${isDraft ? "#fdba74" : "#a7f3d0"}`, color: isDraft ? "#9a3412" : "#065f46" };

  return (
    <div style={page}>
      <div style={{ ...card, padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setMonday(addDays(monday, -7))}>◀ Önceki</button>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtTR.format(monday)}  ➜  {fmtTR.format(new Date(weekEndISO))}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Hafta başlangıcı (Pzt): {weekStartISO}</div>
          </div>
          <button onClick={() => setMonday(addDays(monday, 7))}>Sonraki ▶</button>
          <span style={badge}>{isDraft ? "DRAFT" : "PUBLISHED"}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => load()} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
          <button onClick={save} disabled={!isDraft || saving || loading}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          <button onClick={publish} disabled={!isDraft}>Publish</button>
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderBottom: "1px solid #eef1f4", background: "#f9fafb" }}>
          <div style={{ padding: 10, fontWeight: 800 }}>Departman / Personel</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px,1fr))" }}>
            {days.map((d) => (
              <div key={d.iso} style={{ padding: 10, fontWeight: 800, borderLeft: "1px solid #eef1f4" }}>
                {d.label}
                <div style={{ fontSize: 12, color: "#6b7280" }}>{d.iso}</div>
              </div>
            ))}
          </div>
        </div>

        {byDept.map(([deptName, list]) => {
          const isOpen = openDept[deptName] ?? true;
          return (
            <div key={deptName}>
              <div
                onClick={() => setOpenDept(s => ({ ...s, [deptName]: !isOpen }))}
                style={{ padding: "10px 12px", background: "#fffbe6", borderBottom: "1px solid #f1e9c6", fontWeight: 900, cursor: "pointer", display: "flex", justifyContent: "space-between" }}
              >
                <span>{deptName} — {list.length} kişi</span>
                <span style={{ fontSize: 18 }}>{isOpen ? "▾" : "▸"}</span>
              </div>

              {isOpen && list.map((emp, i) => (
                <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "260px 1fr", borderBottom: "1px solid #eef1f4", background: i % 2 ? "#fff" : "#fcfcfc" }}>
                  <div style={{ padding: 10 }}>
                    <div style={{ fontWeight: 700 }}>{emp.full_name || emp.id}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{emp.id}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(140px,1fr))" }}>
                    {days.map((d) => {
                      const key = `${emp.id}|${d.iso}`;
                      const value = cells[key] ?? "OFF"; // sadece bu hücre
                      return (
                        <div key={key} style={{ padding: 8, borderLeft: "1px solid #eef1f4" }}>
                          <select
                            value={value}
                            onChange={(e) => setCell(emp.id, d.iso, e.target.value)}
                            disabled={!isDraft}
                            autoComplete="off"
                            style={{ width: "100%" }}
                          >
                            <option value="OFF">OFF</option>
                            {SLOT_KEYS.map((k) => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {(err || msg) && (
        <div style={{ position: "fixed", right: 16, bottom: 16, padding: "10px 12px", borderRadius: 12, background: err ? "#fee2e2" : "#dcfce7", color: err ? "#7f1d1d" : "#065f46" }}>
          {err || msg}
        </div>
      )}
    </div>
  );
}
