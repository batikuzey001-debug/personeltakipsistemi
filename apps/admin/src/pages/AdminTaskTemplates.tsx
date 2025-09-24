// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type Template = {
  id: number;
  title: string;
  department?: string | null;
  shift?: string | null;
  repeat: string;
  grace_min: number; // backend'te 0, UI'da göstermiyoruz
  default_assignee?: string | null;
  notes?: string | null;
  is_active: boolean;
};
type TemplateIn = Omit<Template, "id" | "grace_min"> & { grace_min?: number };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

const SHIFTS = ["", "Sabah", "Öğlen", "Akşam", "Gece"];
const REPEATS = ["daily", "weekly", "shift", "once"];
const DEPTS = ["", "Admin", "Finans", "Bonus", "LC"];

export default function AdminTaskTemplates() {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"" | "true" | "false">("");

  const emptyForm: TemplateIn = {
    title: "",
    department: "",
    shift: "",
    repeat: "daily",
    default_assignee: "",
    notes: "",
    is_active: true,
  };
  const [form, setForm] = useState<TemplateIn>(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Toplu ekleme
  const [bulkShift, setBulkShift] = useState<string>("Sabah");
  const [bulkDept, setBulkDept] = useState<string>("Admin");
  const [bulkTitles, setBulkTitles] = useState<string>("");

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (activeFilter) qs.set("active", activeFilter);
      const data = await api<Template[]>(`/admin-tasks/templates?${qs.toString()}`);
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Şablonlar alınamadı");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  async function save() {
    setErr(null);
    setMsg("");
    const body: TemplateIn = {
      ...form,
      department: form.department || null,
      shift: form.shift || null,
      default_assignee: form.default_assignee || null,
      notes: form.notes || null,
      grace_min: 0,
    };
    try {
      if (editId) {
        const updated = await api<Template>(`/admin-tasks/templates/${editId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setRows(rows.map((r) => (r.id === editId ? updated : r)));
        setMsg("Şablon güncellendi.");
      } else {
        const created = await api<Template>(`/admin-tasks/templates`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        setRows([created, ...rows]);
        setMsg("Şablon oluşturuldu.");
      }
      setEditId(null);
      setForm(emptyForm);
    } catch (e: any) {
      setErr(e?.message || "Kaydetme hatası");
    }
  }

  async function toggleActive(t: Template, next: boolean) {
    setErr(null);
    setMsg("");
    try {
      const updated = await api<Template>(`/admin-tasks/templates/${t.id}/toggle?is_active=${String(next)}`, {
        method: "PATCH",
      });
      setRows(rows.map((r) => (r.id === t.id ? updated : r)));
    } catch (e: any) {
      setErr(e?.message || "Aktif/Pasif değiştirilemedi");
    }
  }

  async function remove(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    setErr(null);
    setMsg("");
    try {
      await api(`/admin-tasks/templates/${id}`, { method: "DELETE" });
      setRows(rows.filter((r) => r.id !== id));
    } catch (e: any) {
      setErr(e?.message || "Silme hatası");
    }
  }

  function startEdit(t: Template) {
    setEditId(t.id);
    setForm({
      title: t.title,
      department: t.department || "",
      shift: t.shift || "",
      repeat: t.repeat,
      default_assignee: t.default_assignee || "",
      notes: t.notes || "",
      is_active: t.is_active,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function cancelEdit() {
    setEditId(null);
    setForm(emptyForm);
  }

  async function bulkCreate() {
    setErr(null);
    setMsg("");
    const titles = bulkTitles.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!titles.length) {
      setErr("Başlık listesi boş");
      return;
    }
    try {
      const r = await api<{ created: number }>(`/admin-tasks/templates/bulk`, {
        method: "POST",
        body: JSON.stringify({
          shift: bulkShift,
          department: bulkDept,
          titles,
          is_active: true,
          repeat: "daily",
        }),
      });
      setMsg(`${r.created} şablon eklendi.`);
      setBulkTitles("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Toplu ekleme hatası");
    }
  }

  // ============ STYLES (listeyi alta al, tam genişlik) ============
  const container: React.CSSProperties = {
    maxWidth: 1200,
    margin: "0 auto",
    padding: 12,
    display: "grid",
    gap: 12,
  };
  const stack: React.CSSProperties = {
    display: "grid",
    gap: 12,
  };
  const twoCol: React.CSSProperties = {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr",
  };
  const card: React.CSSProperties = {
    border: "1px solid #e9e9e9",
    borderRadius: 12,
    background: "#fff",
    padding: 12,
  };
  const tableCard: React.CSSProperties = {
    border: "1px solid #e9e9e9",
    borderRadius: 12,
    background: "#fff",
    overflow: "hidden",
  };
  const th: React.CSSProperties = {
    padding: "6px 10px",
    fontWeight: 600,
    borderBottom: "1px solid #eee",
    background: "#fff",
    position: "sticky",
    top: 0,
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = { padding: "6px 10px", borderTop: "1px solid #f5f5f5", fontSize: 13 };

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Görev Şablonları</h1>

      {/* Üstte: Form + Toplu Ekle (yan yana küçük ekranlarda tek sütun) */}
      <div
        style={{
          ...twoCol,
          // geniş ekranlarda iki sütun; dar ekranda tek sütun
          gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
        }}
      >
        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Yeni / Düzenle</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <label>
              <div>Görev Başlığı</div>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Örn: Çekim Kontrol"
              />
            </label>

            <label>
              <div>Departman</div>
              <select
                value={form.department || ""}
                onChange={(e) => setForm({ ...form, department: e.target.value || "" })}
              >
                {DEPTS.map((d) => (
                  <option key={d} value={d}>
                    {d || "—"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div>Vardiya</div>
              <select
                value={form.shift || ""}
                onChange={(e) => setForm({ ...form, shift: e.target.value || "" })}
              >
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s || "—"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div>Tekrar</div>
              <select value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
                {REPEATS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div>Varsayılan Atanan (employee_id)</div>
              <input
                value={form.default_assignee || ""}
                onChange={(e) => setForm({ ...form, default_assignee: e.target.value })}
                placeholder="RD-0xx"
              />
            </label>

            <label>
              <div>Not</div>
              <textarea
                rows={3}
                value={form.notes || ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Aktif
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={save} disabled={!form.title.trim()}>
                {editId ? "Güncelle" : "Ekle"}
              </button>
              {editId && (
                <button type="button" onClick={cancelEdit}>
                  İptal
                </button>
              )}
            </div>

            {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
            {!err && msg && <div style={{ color: "#1b6f1b", fontSize: 12 }}>{msg}</div>}
          </div>
        </div>

        <div style={card}>
          <h3 style={{ marginTop: 0 }}>Toplu Ekle (Vardiyaya)</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <label>
              Vardiya&nbsp;
              <select value={bulkShift} onChange={(e) => setBulkShift(e.target.value)}>
                {["Sabah", "Öğlen", "Akşam", "Gece"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Departman&nbsp;
              <select value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}>
                {["Admin", "Finans", "Bonus", "LC"].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={bulkCreate}>
              Ekle
            </button>
          </div>
          <textarea
            rows={10}
            placeholder={"Her satıra bir görev başlığı yazın...\nÖrn:\nÇekim Kontrol\nKasa Mutabakat\nLog İnceleme"}
            value={bulkTitles}
            onChange={(e) => setBulkTitles(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      {/* ALTA ALINAN LİSTE — tam genişlik */}
      <div style={tableCard}>
        <div style={{ padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span>Filtre:</span>
          <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)}>
            <option value="">Hepsi</option>
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </select>
          <button onClick={() => load()} disabled={loading}>
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 280 }}>Başlık</th>
              <th style={{ ...th, width: 120 }}>Departman</th>
              <th style={{ ...th, width: 110 }}>Vardiya</th>
              <th style={{ ...th, width: 120 }}>Tekrar</th>
              <th style={{ ...th, width: 170 }}>Varsayılan Atanan</th>
              <th style={{ ...th, width: 90 }}>Durum</th>
              <th style={{ ...th, width: 200 }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#fafafa" : "#fff" }}>
                <td style={td}>{r.title}</td>
                <td style={td}>{r.department || "—"}</td>
                <td style={td}>{r.shift || "—"}</td>
                <td style={td}>{r.repeat}</td>
                <td style={td}>{r.default_assignee || "—"}</td>
                <td style={td}>{r.is_active ? "Aktif" : "Pasif"}</td>
                <td style={td}>
                  <button onClick={() => startEdit(r)}>Düzenle</button>{" "}
                  <button onClick={() => toggleActive(r, !r.is_active)}>
                    {r.is_active ? "Pasifleştir" : "Aktifleştir"}
                  </button>{" "}
                  <button onClick={() => remove(r.id)}>Sil</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} style={{ padding: 12, color: "#777" }}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
