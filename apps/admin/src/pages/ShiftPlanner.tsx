// apps/admin/src/pages/ShiftPlanner.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

/* ---- Types ---- */
type Employee = { id: string; full_name: string; department?: string | null };
type ShiftDef = { id: number; name: string; start_time: string; end_time: string; is_active: boolean };
type Assign = {
  id?: number;
  employee_id: string;
  date: string;          // YYYY-MM-DD
  week_start: string;    // YYYY-MM-DD (Pazartesi)
  shift_def_id: number | null;
  status: "ON" | "OFF";
};
type WeekStatus = "draft" | "published";
type ShiftWeek = { week_start: string; status: WeekStatus; published_at?: string | null; published_by?: string | null };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

/* ---- Date helpers (Europe/Istanbul varsayımı) ---- */
function toISODate(d: Date): string {
  const z = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  return z.toISOString().slice(0, 10);
}
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // Monday
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/* ---- UI ---- */
export default function ShiftPlanner() {
  // hafta seçimi
  const [monday, setMonday] = useState<Date>(() => mondayOf(new Date()));
  const weekStartISO = toISODate(monday);
  const days: { label: string; iso: string }[] = useMemo(() => {
    const labels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cts", "Paz"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { label: labels[i], iso: toISODate(d) };
    });
  }, [monday]);

  const [emps, setEmps] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [assigns, setAssigns] = useState<Record<string, Record<string, Assign>>>({}); // emp -> date -> Assign
  const [week, setWeek] = useState<ShiftWeek | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // departman grupları
  const byDept = useMemo(() => {
    const map: Record<string, Employee[]> = {};
    for (const e of emps) {
      const k = e.department || "—";
      (map[k] ||= []).push(e);
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => (a.full_name || a.id).localeCompare(b.full_name || b.id, "tr"));
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0], "tr"));
  }, [emps]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const [e, s, w, a] = await Promise.all([
        api<Employee[]>(`/employees`),
        api<ShiftDef[]>(`/shifts`),
        api<ShiftWeek>(`/shift-weeks/${weekStartISO}`),
        api<Assign[]>(`/shift-assignments?week_start=${weekStartISO}`),
      ]);
      setEmps(e);
      setShifts(s.filter((x) => x.is_active));
      setWeek(w);

      const map: Record<string, Record<string, Assign>> = {};
      for (const emp of e) map[emp.id] = {};
      for (const d of days) for (const emp of e) map[emp.id][d.iso] = {
        employee_id: emp.id,
        date: d.iso,
        week_start: weekStartISO,
        shift_def_id: null,
        status: "OFF",
      };
      for (const row of a) {
        (map[row.employee_id] ||= {})[row.date] = { ...row };
      }
      setAssigns(map);
    } catch (e: any) {
      setErr(e?.message || "Veriler alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [weekStartISO]);

  function setCell(empId: string, dayISO: string, val: string) {
    setAssigns((prev) => {
      const copy = { ...prev };
      const row = { ...(copy[empId] || {}) };
      const cur = { ...(row[dayISO] || { employee_id: empId, date: dayISO, week_start: weekStartISO, shift_def_id: null, status: "OFF" as const }) };
      if (val === "OFF") {
        cur.shift_def_id = null;
        cur.status = "OFF";
      } else {
        cur.shift_def_id = Number(val);
        cur.status = "ON";
      }
      row[dayISO] = cur;
      copy[empId] = row;
      return copy;
    });
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload: Assign[] = [];
      for (const empId of Object.keys(assigns)) {
        for (const d of days) {
          const c = assigns[empId][d.iso];
          payload.push({
            employee_id: empId,
            date: d.iso,
            week_start: weekStartISO,
            shift_def_id: c?.shift_def_id ?? null,
            status: c?.status ?? "OFF",
          });
        }
      }
      await api<Assign[]>(`/shift-assignments/bulk`, { method: "POST", body: JSON.stringify(payload) });
      setMsg("Kaydedildi"); setTimeout(() => setMsg(""), 1200);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Kaydetme hatası"); setTimeout(() => setErr(null), 1800);
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!confirm("Bu haftayı yayınla ve kilitle?")) return;
    try {
      const w = await api<ShiftWeek>(`/shift-weeks/${weekStartISO}/publish`, { method: "POST" });
      setWeek(w);
      setMsg("Hafta yayınlandı"); setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Publish hatası"); setTimeout(() => setErr(null), 1800);
    }
  }

  const isDraft = week?.status !== "published";

  const page: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const card: React.CSSProperties = { border: "1px solid #eef0f4", borderRadius: 12, background: "#fff", boxShadow: "0 6px 24px rgba(16,24,40,0.04)" };

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setMonday(addDays(monday, -7))}>◀ Önceki</button>
          <strong style={{ fontSize: 18 }}>
            Hafta: {weekStartISO} (Pzt) – {toISODate(addDays(monday, 6))} (Paz) {isDraft ? "• DRAFT" : "• PUBLISHED"}
          </strong>
          <button onClick={() => setMonday(addDays(monday, 7))}>Sonraki ▶</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
          <button onClick={save} disabled={!isDraft || saving || loading}>{saving ? "Kaydediliyor…" : "Kaydet"}</button>
          <button onClick={publish} disabled={!isDraft}>Publish</button>
        </div>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", borderBottom: "1px solid #eef1f4", background: "#f9fafb" }}>
          <div style={{ padding: 10, fontWeight: 800 }}>Personel</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px,1fr))" }}>
            {days.map((d) => (
              <div key={d.iso} style={{ padding: 10, fontWeight: 800, borderLeft: "1px solid #eef1f4" }}>{d.label}<div style={{ fontSize: 12, color: "#6b7280" }}>{d.iso}</div></div>
            ))}
          </div>
        </div>

        {/* Body */}
        {byDept.map(([deptName, list], di) => (
          <div key={deptName}>
            {/* Department row */}
            <div style={{ padding: 10, background: "#fffbe6", borderBottom: "1px solid #f1e9c6", fontWeight: 800 }}>{deptName}</div>
            {list.map((emp, i) => (
              <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "220px 1fr", borderBottom: "1px solid #eef1f4", background: (i + di) % 2 ? "#fff" : "#fcfcfc" }}>
                <div style={{ padding: 10 }}>
                  <div style={{ fontWeight: 700 }}>{emp.full_name || emp.id}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{emp.id}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(120px,1fr))" }}>
                  {days.map((d) => {
                    const cell = assigns[emp.id]?.[d.iso];
                    const value = cell?.status === "OFF" ? "OFF" : (cell?.shift_def_id ? String(cell.shift_def_id) : "OFF");
                    return (
                      <div key={d.iso} style={{ padding: 8, borderLeft: "1px solid #eef1f4" }}>
                        <select
                          value={value}
                          onChange={(e) => setCell(emp.id, d.iso, e.target.value)}
                          disabled={!isDraft}
                          style={{ width: "100%" }}
                        >
                          <option value="OFF">OFF</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.start_time}-{s.end_time})
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}

        {!loading && !emps.length && (
          <div style={{ padding: 16, color: "#6b7280" }}>Personel bulunamadı.</div>
        )}
      </div>

      {(err || msg) && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            padding: "10px 12px",
            borderRadius: 12,
            background: err ? "#fee2e2" : "#dcfce7",
            color: err ? "#7f1d1d" : "#065f46",
            boxShadow: "0 6px 20px rgba(16,24,40,0.08)",
            fontSize: 13,
          }}
        >
          {err || msg}
        </div>
      )}
    </div>
  );
}
