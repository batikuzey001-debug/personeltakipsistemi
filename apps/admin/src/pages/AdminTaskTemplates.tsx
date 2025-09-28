// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

/** Server model (tolerans kaldırıldı) */
type Template = {
  id: number;
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;            // "Admin" | "Finans" | "Bonus" | "LC" ...
  default_assignee: string | null;      // RD-xxx vb.
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
  const [shift, setShift] = useState<string>("");
  const [dept, setDept] = useState<string>("");
  const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eShift, setEShift] = useState<string>("");
  const [eDept, setEDept] = useState<string>("");
  const [eAssignee, setEAssignee] = useState<string>("");
  const [eActive, setEActive] = useState<boolean>(true);

  // Bulk add form
  const [bulkShift, setBulkShift] = useState<string>("");
  const [bulkDept, setBulkDept] = useState<string>("");
  const [bulkText, setBulkText] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Load
  async function load() {
    setErr(null);
    setMsg("");
    setLoading(true);
    try {
      const data = await api<Template[]>("/admin-tasks/templates");
      setRows(data || []);
    } catch (e: any) {
      setErr(e?.message || "Şablonlar alınamadı");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Filtering
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => {
      const okShift = shift ? r.shift === shift : true;
      const okDept = dept ? (r.department || "") === dept : true;
      const okQ =
        !qq ||
        [r.title, r.department || "", r.default_assignee || ""]
          .join(" ")
          .toLowerCase()
          .includes(qq);
      return okShift && okDept && okQ;
    });
  }, [rows, q, shift, dept]);

  // Group by shift
  const groups = useMemo(() => {
    const map: Record<string, Template[]> = {};
    for (const r of filtered) {
      const k = r.shift || "—";
      (map[k] = map[k] || []).push(r);
    }
    return ["Gece", "Sabah", "Öğlen", "Akşam", "—"]
      .filter((k) => map[k]?.length)
      .map((k) => ({
        shift: k,
        items: map[k].slice().sort((a, b) => a.title.localeCompare(b.title, "tr")),
      }));
  }, [filtered]);

  // Edit helpers
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
      const body = {
        title: eTitle.trim(),
        shift: eShift || null,
        department: eDept || null,
        default_assignee: eAssignee || null,
        is_active: eActive,
      };
      const res = await api<Template>(`/admin-tasks/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRows((prev) => prev.map((x) => (x.id === id ? res : x)));
      setEditId(null);
      setMsg("Şablon güncellendi.");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Şablon güncellenemedi");
      setTimeout(() => setErr(null), 1800);
    }
  }
  async function remove(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try {
      await api(`/admin-tasks/templates/${id}`, { method: "DELETE" });
      setRows((prev) => prev.filter((x) => x.id !== id));
      setMsg("Şablon silindi.");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Şablon silinemedi");
      setTimeout(() => setErr(null), 1800);
    }
  }
  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      setRows((prev) => prev.map((x) => (x.id === t.id ? res : x)));
    } catch (e: any) {
      setErr(e?.message || "Durum değiştirilemedi");
      setTimeout(() => setErr(null), 1800);
    }
  }

  // Bulk add (multi-line)
  async function createBulk() {
    const lines = bulkText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      setErr("Eklenecek görev satırı yok.");
      setTimeout(() => setErr(null), 1500);
      return;
    }
    if (!bulkShift && !bulkDept) {
      setErr("Vardiya veya departman seçin (en az biri).");
      setTimeout(() => setErr(null), 1800);
      return;
    }
    setBulkSaving(true);
    setErr(null);
    setMsg("");
    try {
      // Tercihen bulk endpoint varsa deneyelim:
      try {
        const payload = lines.map((line) => {
          // Satır biçimi: "Başlık | RD-xxx" (assignee opsiyonel)
          const [title, assignee] = line.split("|").map((s) => s?.trim() || "");
          return {
            title,
            shift: bulkShift || null,
            department: bulkDept || null,
            default_assignee: assignee || null,
            is_active: true,
          };
        });
        // Deneme: bulk
        const res = await api<Template[]>("/admin-tasks/templates/bulk", {
          method: "POST",
          body: JSON.stringify({ items: payload }),
        });
        setRows((prev) => [...res, ...prev]);
      } catch {
        // Bulk yoksa tek tek POST
        for (const line of lines) {
          const [title, assignee] = line.split("|").map((s) => s?.trim() || "");
          const one = await api<Template>("/admin-tasks/templates", {
            method: "POST",
            body: JSON.stringify({
              title,
              shift: bulkShift || null,
              department: bulkDept || null,
              default_assignee: assignee || null,
              is_active: true,
            }),
          });
          setRows((prev) => [one, ...prev]);
        }
      }
      setBulkText("");
      setMsg("Şablonlar eklendi.");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setErr(e?.message || "Toplu ekleme başarısız");
      setTimeout(() => setErr(null), 1800);
    } finally {
      setBulkSaving(false);
    }
  }

  // ---- styles (sade & modern) ----
  const page: React.CSSProperties = { maxWidth: 1120, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const surface: React.CSSProperties = { background: "#fff", border: "1px solid #eef0f4", borderRadius: 14, boxShadow: "0 6px 24px rgba(16,24,40,0.04)" };
  const section: React.CSSProperties = { ...surface, padding: 14 };
  const h1: React.CSSProperties = { fontSize: 20, fontWeight: 800, margin: 0 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const label: React.CSSProperties = { fontSize: 12, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".3px", marginBottom: 6 };
  const inputRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px,1fr) 140px 160px 160px 120px", gap: 8, alignItems: "end" };
  const btnPrimary: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #2563eb", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer" };
  const btnGhost: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", color: "#111", cursor: "pointer" };
  const tag = (txt: string) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, background: "#eef2ff", border: "1px solid #c7d2fe", color: "#1d4ed8", fontSize: 12, fontWeight: 700 } as React.CSSProperties);
  const pill = (active: boolean) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, border: `1px solid ${active ? "#bfe8d1" : "#e5e7eb"}`, background: active ? "#e7f7ee" : "#fff", color: active ? "#166534" : "#374151", fontSize: 12, fontWeight: 700 } as React.CSSProperties);
  const rowGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(260px,1fr) 140px 160px 160px 160px", gap: 8, alignItems: "center" };

  // Filtered stats
  const total = filtered.length;

  return (
    <div style={page}>
      <h1 style={h1}>Görev Şablonları</h1>

      {/* Toplu Ekle (sade) */}
      <div style={section}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={label}>Toplu Şablon Ekle</div>
          <div style={inputRow}>
            <div>
              <div style={hint}>Satırlar (bir satır = "Başlık" ya da "Başlık | RD-xxx")</div>
              <textarea
                rows={4}
                placeholder={'Örn:\nGün sonu raporu\nVardiya teslim | RD-021\nBot log kontrolü'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            <div>
              <div style={label}>Vardiya</div>
              <select value={bulkShift} onChange={(e) => setBulkShift(e.target.value)}>
                <option value="">—</option>
                {SHIFTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>Departman</div>
              <select value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}>
                <option value="">—</option>
                <option>Admin</option>
                <option>Finans</option>
                <option>Bonus</option>
                <option>LC</option>
              </select>
            </div>
            <div />
            <div style={{ textAlign: "right" }}>
              <button style={btnPrimary} onClick={createBulk} disabled={bulkSaving || !bulkText.trim()}>
                {bulkSaving ? "Ekleniyor…" : "Ekle"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div style={section}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 160px 180px 120px", gap: 10, alignItems: "end" }}>
          <div>
            <div style={label}>Ara</div>
            <input placeholder="Başlık, kişi…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <div style={label}>Vardiya</div>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              <option value="">Tümü</option>
              {SHIFTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={label}>Departman</div>
            <select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Tümü</option>
              <option>Admin</option>
              <option>Finans</option>
              <option>Bonus</option>
              <option>LC</option>
            </select>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ ...hint, marginRight: 8 }}>{total} kayıt</span>
            <button style={btnGhost} onClick={load} disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
          </div>
        </div>
      </div>

      {/* Liste (sade) */}
      {groups.map((g) => (
        <div key={g.shift} style={section}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <span style={tag(g.shift)}> {g.shift} </span>
              <span style={{ ...hint, marginLeft: 8 }}>{g.items.length} şablon</span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {g.items.map((t) => (
              <div key={t.id} style={{ border: "1px solid #eef1f5", borderRadius: 10, padding: 10, background: "#fff" }}>
                {editId === t.id ? (
                  <div style={rowGrid}>
                    <div>
                      <div style={label}>Başlık</div>
                      <input value={eTitle} onChange={(e) => setETitle(e.target.value)} />
                    </div>
                    <div>
                      <div style={label}>Vardiya</div>
                      <select value={eShift} onChange={(e) => setEShift(e.target.value)}>
                        <option value="">—</option>
                        {SHIFTS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={label}>Departman</div>
                      <select value={eDept} onChange={(e) => setEDept(e.target.value)}>
                        <option value="">—</option>
                        <option>Admin</option>
                        <option>Finans</option>
                        <option>Bonus</option>
                        <option>LC</option>
                      </select>
                    </div>
                    <div>
                      <div style={label}>Varsayılan Kişi</div>
                      <input value={eAssignee} onChange={(e) => setEAssignee(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} />{" "}
                        {eActive ? "Aktif" : "Pasif"}
                      </label>
                      <button style={btnPrimary} onClick={() => saveEdit(t.id)}>
                        Kaydet
                      </button>
                      <button style={btnGhost} onClick={() => setEditId(null)}>
                        İptal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={rowGrid}>
                    <div>
                      <div style={{ fontWeight: 800 }}>{t.title}</div>
                      <div style={hint}>
                        {t.department || "-"} {t.default_assignee ? `• ${t.default_assignee}` : ""}
                      </div>
                    </div>
                    <div style={hint}>{t.shift || "—"}</div>
                    <div style={hint}>{t.department || "—"}</div>
                    <div style={hint}>{t.default_assignee || "—"}</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <span style={pill(t.is_active)}>{t.is_active ? "Aktif" : "Pasif"}</span>
                      <button style={btnGhost} onClick={() => beginEdit(t)}>
                        Düzenle
                      </button>
                      <button style={{ ...btnGhost, borderColor: "#ef4444", color: "#991b1b" }} onClick={() => remove(t.id)}>
                        Sil
                      </button>
                      <button style={btnGhost} onClick={() => toggleActive(t)}>
                        {t.is_active ? "Pasifleştir" : "Aktifleştir"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!g.items.length && <div style={{ ...hint }}>Kayıt yok.</div>}
          </div>
        </div>
      ))}

      {/* Toast */}
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
