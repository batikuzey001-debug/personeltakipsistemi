// apps/admin/src/pages/AdminTaskTemplates.tsx
import React, { useEffect, useMemo, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "";

/** Template & Task tipleri (tolerans yok) */
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
  date: string; // YYYY-MM-DD
  title: string;
  shift: "Gece" | "Sabah" | "Öğlen" | "Akşam" | null;
  department: string | null;
  assignee_employee_id: string | null;
  status: "open" | "done" | "late";
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

const SHIFTS = ["Gece", "Sabah", "Öğlen", "Akşam"] as const;

export default function AdminTaskTemplates() {
  const [tpls, setTpls] = useState<Template[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [tlErr, setTlErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  // Filtreler (her iki listeye uygulanıyor)
  const [q, setQ] = useState("");
  const [fltShift, setFltShift] = useState("");
  const [fltDept, setFltDept] = useState("");

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eShift, setEShift] = useState<string>("");
  const [eDept, setEDept] = useState<string>("");
  const [eAssignee, setEAssignee] = useState<string>("");
  const [eActive, setEActive] = useState<boolean>(true);

  // Toplu ekleme
  const [bulkText, setBulkText] = useState("");
  const [bulkShift, setBulkShift] = useState("");
  const [bulkDept, setBulkDept] = useState("");
  const [savingBulk, setSavingBulk] = useState(false);

  async function loadAll() {
    setLoading(true);
    setTlErr(null);
    try {
      // Templates
      const qsTpl = new URLSearchParams();
      if (fltShift) qsTpl.set("shift", fltShift);
      if (fltDept) qsTpl.set("dept", fltDept);
      if (q.trim()) qsTpl.set("q", q.trim());
      const t = await api<Template[]>(`/admin-tasks/templates?${qsTpl.toString()}`);
      setTpls(Array.isArray(t) ? t : []);

      // Tasks (AÇIK/GECİKMİŞ TÜMÜ — d'ye bağlı değil)
      const qsTask = new URLSearchParams();
      qsTask.set("scope", "open");
      if (fltShift) qsTask.set("shift", fltShift);
      if (fltDept) qsTask.set("dept", fltDept);
      const k = await api<Task[]>(`/admin-tasks?${qsTask.toString()}`);
      setTasks(Array.isArray(k) ? k : []);
    } catch (e: any) {
      setTlErr(e?.message || "Veriler alınamadı");
      setTpls([]);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arama & filtre (client tarafı — şablonlara uygulanır, tasks server filtresi alıyor)
  const filteredTpls = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tpls.filter((t) => {
      const okS = fltShift ? (t.shift === fltShift) : true;
      const okD = fltDept ? ((t.department || "") === fltDept) : true;
      const okQ =
        !needle ||
        [t.title, t.department || "", t.default_assignee || ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return okS && okD && okQ;
    });
  }, [tpls, q, fltShift, fltDept]);

  // Şablon ↔ görev eşlemesi: başlık + vardiya + departman
  function matchCountForTemplate(t: Template) {
    return tasks.filter(
      (x) =>
        (x.status === "open" || x.status === "late") &&
        x.title === t.title &&
        (x.shift || null) === (t.shift || null) &&
        (x.department || null) === (t.department || null)
    ).length;
  }

  // Inline edit başlat
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
      setTpls((prev) => prev.map((x) => (x.id === id ? res : x)));
      setEditId(null);
      setMsg("Şablon güncellendi.");
      setTimeout(() => setMsg(""), 1200);
      // Şablon değiştiğinde canlı görev sayısı değişmiş olabilir → yeniden yükle
      loadAll();
    } catch (e: any) {
      setTlErr(e?.message || "Şablon güncellenemedi");
      setTimeout(() => setTlErr(null), 1800);
    }
  }

  async function removeTpl(id: number) {
    if (!confirm("Şablon silinsin mi?")) return;
    try {
      await api(`/admin-tasks/templates/${id}`, { method: "DELETE" });
      setTpls((prev) => prev.filter((x) => x.id !== id));
      setMsg("Şablon silindi.");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setTlErr(e?.message || "Şablon silinemedi");
      setTimeout(() => setTlErr(null), 1800);
    }
  }

  async function toggleActive(t: Template) {
    try {
      const res = await api<Template>(`/admin-tasks/templates/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      setTpls((prev) => prev.map((x) => (x.id === t.id ? res : x)));
      loadAll();
    } catch (e: any) {
      setTlErr(e?.message || "Durum değişmedi");
      setTimeout(() => setTlErr(null), 1800);
    }
  }

  // Bugün için bu şablondan görev üret
  async function materializeOne(t: Template) {
    try {
      // Yalnız bu şablon alanlarıyla tek bir görev oluşturuyoruz (kontrol backend'de var)
      const body = {
        title: t.title,
        shift: t.shift,
        department: t.department,
        assignee_employee_id: t.default_assignee,
      };
      await api("/admin-tasks", { method: "POST", body: JSON.stringify(body) });
      setMsg("Görev oluşturuldu.");
      setTimeout(() => setMsg(""), 1200);
      loadAll();
    } catch (e: any) {
      setTlErr(e?.message || "Görev oluşturulamadı");
      setTimeout(() => setTlErr(null), 1800);
    }
  }

  // Toplu ekleme
  async function bulkAdd() {
    const lines = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) {
      setTlErr("Eklenecek satır yok.");
      setTimeout(() => setTlErr(null), 1500);
      return;
    }
    if (!bulkShift && !bulkDept) {
      setTlErr("Vardiya veya departman seçin.");
      setTimeout(() => setTlErr(null), 1500);
      return;
    }
    setSavingBulk(true);
    try {
      const items = lines.map((line) => {
        const [title, assignee] = line.split("|").map((s) => (s || "").trim());
        return {
          title,
          shift: bulkShift || null,
          department: bulkDept || null,
          default_assignee: assignee || null,
          is_active: true,
        };
      });
      // varsa bulk endpoint
      try {
        const res = await api<Template[]>("/admin-tasks/templates/bulk", {
          method: "POST",
          body: JSON.stringify({ items }),
        });
        setTpls((prev) => [...res, ...prev]);
      } catch {
        // yoksa tek tek
        for (const it of items) {
          const one = await api<Template>("/admin-tasks/templates", {
            method: "POST",
            body: JSON.stringify(it),
          });
          setTpls((prev) => [one, ...prev]);
        }
      }
      setBulkText("");
      setMsg("Şablonlar eklendi (ve bugüne görevler üretildi).");
      setTimeout(() => setMsg(""), 1200);
      loadAll();
    } catch (e: any) {
      setTlErr(e?.message || "Toplu ekleme başarısız");
      setTimeout(() => setTlErr(null), 1800);
    } finally {
      setSavingBulk(false);
    }
  }

  // ---------- STYLES ----------
  const page: React.CSSProperties = {
    maxWidth: 1160,
    margin: "0 auto",
    padding: 16,
    display: "grid",
    gap: 12,
  };
  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "2fr 1.4fr",
    gap: 12,
    alignItems: "start",
  };
  const card: React.CSSProperties = {
    border: "1px solid #eef0f4",
    borderRadius: 14,
    background: "#fff",
    padding: 14,
    boxShadow: "0 6px 24px rgba(16,24,40,0.04)",
  };
  const titleCss: React.CSSProperties = { margin: 0, fontSize: 20, fontWeight: 800 };
  const hint: React.CSSProperties = { fontSize: 12, color: "#6b7280" };
  const label: React.CSSProperties = {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: ".3px",
    marginBottom: 6,
  };
  const btn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #e5e7eb",
    background: "#fff",
    cursor: "pointer",
  };
  const btnPrimary: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  };
  const rowGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(260px,1fr) 140px 160px 160px 1fr",
    gap: 10,
    alignItems: "center",
  };
  const chip = (active: boolean): React.CSSProperties => ({
    padding: "2px 8px",
    borderRadius: 999,
    border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
    background: active ? "#eef2ff" : "#fff",
    color: active ? "#1d4ed8" : "#111",
    fontSize: 12,
    fontWeight: 700,
  });

  // ---------- UI ----------
  return (
    <div style={page}>
      <h1 style={titleCss}>Görev Şablonları</h1>

      <div style={twoCol}>
        {/* Sol: ŞABLONLAR (yönetim) */}
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) 140px 160px 1fr", gap: 10, alignItems: "end" }}>
            <div>
              <div style={label}>Ara</div>
              <input placeholder="Başlık, kişi…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div>
              <div style={label}>Vardiya</div>
              <select value={fltShift} onChange={(e) => setFltShift(e.target.value)}>
                <option value="">Tümü</option>
                {SHIFTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>Departman</div>
              <select value={fltDept} onChange={(e) => setFltDept(e.target.value)}>
                <option value="">Tümü</option>
                <option>Admin</option>
                <option>Finans</option>
                <option>Bonus</option>
                <option>LC</option>
              </select>
            </div>
            <div style={{ textAlign: "right" }}>
              <button style={btn} onClick={loadAll} disabled={loading}>
                {loading ? "Yükleniyor…" : "Yenile"}
              </button>
            </div>
          </div>

          {/* Toplu ekleme (sade) */}
          <div style={{ marginTop: 12 }}>
            <div style={label}>Toplu Şablon Ekle</div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 140px 160px 1fr", gap: 10, alignItems: "end" }}>
              <div>
                <div style={hint}>Her satır bir şablon. “Başlık | RD-xxx” ile kişi belirtebilirsiniz.</div>
                <textarea
                  rows={5}
                  placeholder={'Örn:\nGün sonu raporu\nVardiya teslim | RD-021\nLog kontrol'}
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
              <div style={{ textAlign: "right" }}>
                <button style={btnPrimary} onClick={bulkAdd} disabled={savingBulk || !bulkText.trim()}>
                  {savingBulk ? "Ekleniyor…" : "Ekle (bugüne üret)"}
                </button>
              </div>
            </div>
          </div>

          {/* Şablon listesi */}
          <div style={{ marginTop: 12 }}>
            {(filteredTpls || []).map((t) => {
              const match = matchCountForTemplate(t);
              return (
                <div key={t.id} style={{ border: "1px solid #eef1f5", borderRadius: 10, padding: 10, marginBottom: 8 }}>
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
                        <span style={chip(eActive)}>{eActive ? "Aktif" : "Pasif"}</span>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} /> aktif
                        </label>
                        <button style={btnPrimary} onClick={() => saveEdit(t.id)}>
                          Kaydet
                        </button>
                        <button style={btn} onClick={() => setEditId(null)}>
                          İptal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={rowGrid}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{t.title}</div>
                        <div style={hint}>
                          {t.department || "—"} {t.default_assignee ? `• ${t.default_assignee}` : ""}
                        </div>
                      </div>
                      <div style={hint}>{t.shift || "—"}</div>
                      <div style={hint}>{t.department || "—"}</div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
                        <span style={chip(t.is_active)}>{t.is_active ? "Aktif" : "Pasif"}</span>
                        <button style={btn} onClick={() => materializeOne(t)}>
                          Bugün için oluştur
                        </button>
                        <button style={btn} onClick={() => toggleActive(t)}>
                          {t.is_active ? "Pasifleştir" : "Aktifleştir"}
                        </button>
                        <button style={btn} onClick={() => beginEdit(t)}>
                          Düzenle
                        </button>
                        <button style={{ ...btn, borderColor: "#ef4444", color: "#991b1b" }} onClick={() => removeTpl(t.id)}>
                          Sil
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Eşleşen açık görev sayısı */}
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    Eşleşen açık/gecikmiş görev: <b>{match}</b>
                  </div>
                </div>
              );
            })}
            {!loading && !filteredTpls.length && <div style={{ color: "#6b7280" }}>Kayıt yok.</div>}
          </div>
        </div>

        {/* Sağ: CANLI GÖREVLER (şablonlarla eşleşen) */}
        <div style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontWeight: 800 }}>Canlı Görevler (Açık/Gecikmiş)</h3>
            <button style={btn} onClick={loadAll} disabled={loading}>
              {loading ? "Yükleniyor…" : "Yenile"}
            </button>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {(tasks || []).map((t) => (
              <div key={t.id} style={{ border: "1px solid #eef1f5", borderRadius: 10, padding: 10 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {t.department || "—"} {t.assignee_employee_id ? `• ${t.assignee_employee_id}` : ""} • {t.shift || "—"} • {t.status === "late" ? "Gecikmiş" : "Açık"}
                </div>
              </div>
            ))}
            {!loading && !tasks.length && <div style={{ color: "#6b7280" }}>Açık/gecikmiş görev yok.</div>}
          </div>
        </div>
      </div>

      {(tlErr || msg) && (
        <div
          style={{
            position: "fixed",
            right: 16,
            bottom: 16,
            padding: "10px 12px",
            borderRadius: 12,
            background: tlErr ? "#fee2e2" : "#dcfce7",
            color: tlErr ? "#7f1d1d" : "#065f46",
            boxShadow: "0 6px 20px rgba(16,24,40,0.08)",
            fontSize: 13,
          }}
        >
          {tlErr || msg}
        </div>
      )}
    </div>
  );
}
