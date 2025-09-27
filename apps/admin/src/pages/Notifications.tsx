// apps/admin/src/pages/Notifications.tsx
import React, { useEffect, useMemo, useState } from "react";

const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

// ---- Types ----
type Tpl = {
  id: number;
  channel: string;        // "custom" | "admin_tasks" | "attendance" | "bonus" | "finans"
  name: string;
  template: string;
  is_active: boolean;
};

type BotSettings = {
  admin_tasks_tg_enabled: boolean;
  bonus_tg_enabled: boolean;
  finance_tg_enabled: boolean;
};

// ---- API helper ----
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

// ---- UI helpers ----
const CHANNELS: Array<{ v: string; label: string }> = [
  { v: "custom", label: "Özel" },
  { v: "admin_tasks", label: "Admin Görevleri" },
  { v: "attendance", label: "Mesai" },
  { v: "bonus", label: "Bonus" },
  { v: "finans", label: "Finans" },
];

const chip = (text: string, kind: "ok" | "warn" | "muted") => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  background: kind === "ok" ? "#e7f7ee" : kind === "warn" ? "#fff1f1" : "#eef2f7",
  color: kind === "ok" ? "#177245" : kind === "warn" ? "#a20000" : "#334155",
  border: kind === "ok" ? "1px solid #bfe8d1" : kind === "warn" ? "1px solid #ffc6c6" : "1px solid #cbd5e1",
});

// key=value parser for context
function parseCtx(raw: string) {
  const m: Record<string, string> = {};
  raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      m[(k || "").trim()] = (rest.join("=") || "").trim();
    });
  return m;
}

// simple template renderer
function renderTemplate(tpl: string, ctx: Record<string, string>) {
  let out = tpl;
  for (const [k, v] of Object.entries(ctx)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export default function Notifications() {
  // Data
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [settings, setSettings] = useState<BotSettings | null>(null);

  // State: list filters / selection
  const [filterChannel, setFilterChannel] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Editor form
  const emptyForm: Omit<Tpl, "id"> = {
    channel: "custom",
    name: "",
    template: "",
    is_active: true,
  };
  const [form, setForm] = useState<Omit<Tpl, "id">>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  // Manual send
  const [sendChannel, setSendChannel] = useState<string>("custom");
  const [sendTplId, setSendTplId] = useState<number | "">("");
  const [sendText, setSendText] = useState<string>("");
  const [sendCtx, setSendCtx] = useState<string>("title=Başlık\nbody=İçerik");

  // ---- Loaders ----
  async function loadAll() {
    setErr(""); setMsg("");
    try {
      const [list, sets] = await Promise.all([
        api<Tpl[]>("/admin-notify/templates"),
        api<BotSettings>("/admin-bot/settings"),
      ]);
      setTpls(list);
      setSettings(sets);
      if (!selectedId && list.length) {
        setSelectedId(list[0].id);
        setForm({
          channel: list[0].channel,
          name: list[0].name,
          template: list[0].template,
          is_active: list[0].is_active,
        });
      }
    } catch (e: any) {
      setErr(e?.message || "Veriler alınamadı");
    }
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  // ---- Derived list (filter + search) ----
  const list = useMemo(() => {
    const f = filterChannel ? tpls.filter((t) => t.channel === filterChannel) : tpls;
    const q = search.trim().toLowerCase();
    if (!q) return f;
    return f.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.template.toLowerCase().includes(q) ||
        t.channel.toLowerCase().includes(q)
    );
  }, [tpls, filterChannel, search]);

  // ---- Handlers ----
  function selectTpl(id: number) {
    const t = tpls.find((x) => x.id === id);
    if (!t) return;
    setSelectedId(id);
    setForm({ channel: t.channel, name: t.name, template: t.template, is_active: t.is_active });
    setSendChannel(t.channel); setSendTplId(t.id); // quick pick
  }

  async function saveTpl() {
    setSaving(true); setErr(""); setMsg("");
    try {
      if (selectedId) {
        const updated = await api<Tpl>(`/admin-notify/templates/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
        setTpls(tpls.map((t) => (t.id === selectedId ? updated : t)));
        setMsg("Şablon güncellendi.");
      } else {
        const created = await api<Tpl>(`/admin-notify/templates`, {
          method: "POST",
          body: JSON.stringify(form),
        });
        setTpls([created, ...tpls]);
        setSelectedId(created.id);
        setMsg("Şablon eklendi.");
      }
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally { setSaving(false); }
  }

  async function deleteTpl() {
    if (!selectedId || !confirm("Şablon silinsin mi?")) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      await api(`/admin-notify/templates/${selectedId}`, { method: "DELETE" });
      const next = tpls.filter((t) => t.id !== selectedId);
      setTpls(next);
      setSelectedId(next[0]?.id || null);
      if (next[0]) setForm({ channel: next[0].channel, name: next[0].name, template: next[0].template, is_active: next[0].is_active });
      else setForm(emptyForm);
      setMsg("Silindi.");
    } catch (e: any) {
      setErr(e?.message || "Silinemedi");
    } finally { setSaving(false); }
  }

  async function duplicateTpl() {
    if (!selectedId) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      const created = await api<Tpl>(`/admin-notify/templates`, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          name: form.name + " (kopya)",
        }),
      });
      setTpls([created, ...tpls]);
      setSelectedId(created.id);
      setForm({ channel: created.channel, name: created.name, template: created.template, is_active: created.is_active });
      setMsg("Kopyalandı.");
    } catch (e: any) {
      setErr(e?.message || "Kopyalanamadı");
    } finally { setSaving(false); }
  }

  async function toggleActive(next: boolean) {
    setSaving(true); setErr(""); setMsg("");
    try {
      const updated = await api<Tpl>(`/admin-notify/templates/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...form, is_active: next }),
      });
      setTpls(tpls.map((t) => (t.id === selectedId ? updated : t)));
      setForm({ ...form, is_active: next });
      setMsg(next ? "Aktifleştirildi." : "Pasifleştirildi.");
    } catch (e: any) {
      setErr(e?.message || "Değiştirilemedi");
    } finally { setSaving(false); }
  }

  async function sendManual() {
    setSaving(true); setErr(""); setMsg("");
    try {
      const body: any = { channel: sendChannel };
      if (sendTplId) body.template_id = Number(sendTplId);
      if (sendText.trim()) body.text = sendText.trim();
      const obj = parseCtx(sendCtx);
      if (Object.keys(obj).length) body.context = obj;
      await api(`/admin-notify/manual`, { method: "POST", body: JSON.stringify(body) });
      setMsg("Gönderildi.");
    } catch (e: any) {
      setErr(e?.message || "Gönderilemedi (kanal kapalı olabilir).");
    } finally { setSaving(false); }
  }

  // ---- Styles ----
  const container: React.CSSProperties = { maxWidth: 1200, margin: "0 auto", padding: 16, display: "grid", gap: 12 };
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "340px 1fr", gap: 12, minHeight: 540 };
  const leftCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 10, display: "grid", gap: 8 };
  const rightCard: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 12 };
  const row: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
  const listBox: React.CSSProperties = { border: "1px solid #eef1f5", borderRadius: 10, overflow: "auto", maxHeight: 440 };
  const itemRow = (active: boolean): React.CSSProperties => ({
    padding: "10px 12px",
    borderBottom: "1px solid #f2f4f8",
    background: active ? "#eef3ff" : "#fff",
    cursor: "pointer",
  });
  const btn = (kind: "primary" | "ghost" | "danger" | "success"): React.CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 8,
    cursor: "pointer",
    border:
      kind === "primary" ? "1px solid #3b82f6" : kind === "danger" ? "1px solid #ef4444" : kind === "success" ? "1px solid #22c55e" : "1px solid #e5e7eb",
    background: kind === "primary" ? "#3b82f6" : kind === "danger" ? "#ef4444" : kind === "success" ? "#22c55e" : "#fff",
    color: kind === "ghost" ? "#111" : "#fff",
  });

  // ---- Live preview for manual send ----
  const selectedTpl = useMemo(() => tpls.find((t) => t.id === sendTplId), [tpls, sendTplId]);
  const manualPreview = useMemo(() => {
    const ctx = parseCtx(sendCtx);
    if (sendText.trim()) return sendText;
    if (selectedTpl) return renderTemplate(selectedTpl.template, ctx);
    return "—";
  }, [sendText, selectedTpl, sendCtx]);

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Bildirim Yönetimi</h1>

      {/* Üst: Manuel Gönder (temiz ve net) */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", padding: 12, display: "grid", gap: 10 }}>
        <div style={row}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Manuel Bildirim</div>
            {/* Bayrak özeti */}
            {settings && (
              <>
                <span style={chip(settings.admin_tasks_tg_enabled ? "Admin Görevleri AÇIK" : "Admin Görevleri KAPALI", settings.admin_tasks_tg_enabled ? "ok" : "warn")} />
                <span style={chip(settings.bonus_tg_enabled ? "Bonus AÇIK" : "Bonus KAPALI", settings.bonus_tg_enabled ? "ok" : "warn")} />
                <span style={chip(settings.finance_tg_enabled ? "Finans AÇIK" : "Finans KAPALI", settings.finance_tg_enabled ? "ok" : "warn")} />
              </>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>Şablon ya da düz metin seç; context ile değişkenleri doldur.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))", gap: 8 }}>
          <label>
            Kanal
            <select value={sendChannel} onChange={(e) => setSendChannel(e.target.value)}>
              {CHANNELS.map((c) => (
                <option key={c.v} value={c.v}>{c.label}</option>
              ))}
            </select>
          </label>
          <label>
            Şablon (opsiyonel)
            <select value={sendTplId} onChange={(e) => setSendTplId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">—</option>
              {tpls
                .filter((t) => t.is_active && (t.channel === sendChannel || sendChannel === "custom"))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Context (key=value, satır satır)
            <textarea rows={3} value={sendCtx} onChange={(e) => setSendCtx(e.target.value)} />
          </label>
        </div>

        <label>
          Metin (opsiyonel — şablon seçili değilse kullanılır)
          <textarea rows={4} value={sendText} onChange={(e) => setSendText(e.target.value)} />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 8, alignItems: "center" }}>
          <div style={{ border: "1px dashed #d1d5db", borderRadius: 8, background: "#f8fafc", padding: 10, whiteSpace: "pre-wrap" }}>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Önizleme</div>
            <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
              {manualPreview}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "end" }}>
            <button style={btn("ghost")} onClick={loadAll} disabled={saving}>
              Yenile
            </button>
            <button style={btn("primary")} onClick={sendManual} disabled={saving}>
              Gönder
            </button>
          </div>
        </div>

        {msg && <div style={{ color: "#0a6d37", fontSize: 12 }}>{msg}</div>}
        {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
      </div>

      {/* Alt: Şablon Galerisi + Editör  */}
      <div style={grid}>
        {/* LEFT: Şablon listesi */}
        <div style={leftCard}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} title="Kanal">
                <option value="">Hepsi</option>
                {CHANNELS.map((c) => (
                  <option key={c.v} value={c.v}>{c.label}</option>
                ))}
              </select>
              <input
                placeholder="Şablon ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>

            <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
              <span style={chip(`${tpls.length} kayıt`, "muted")} />
              {filterChannel && <span style={chip(`Filtre: ${CHANNELS.find(c=>c.v===filterChannel)?.label}`, "muted")} />}
            </div>

            <div style={listBox}>
              {list.map((t) => (
                <div key={t.id} style={itemRow(t.id === selectedId)} onClick={() => selectTpl(t.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        [{CHANNELS.find((c) => c.v === t.channel)?.label}] {t.is_active ? "• Aktif" : "• Pasif"}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {Math.min(t.template.length, 140)} ch
                    </div>
                  </div>
                </div>
              ))}
              {!list.length && <div style={{ padding: 12, color: "#94a3b8" }}>Kayıt yok.</div>}
            </div>

            <button
              style={btn("success")}
              onClick={() => {
                setSelectedId(null);
                setForm(emptyForm);
              }}
            >
              + Yeni Şablon
            </button>
          </div>
        </div>

        {/* RIGHT: Editör paneli */}
        <div style={rightCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {selectedId ? "Şablon Düzenle" : "Yeni Şablon"}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {selectedId && (
                <>
                  <button style={btn("ghost")} onClick={duplicateTpl} disabled={saving}>
                    Kopyala
                  </button>
                  <button style={btn("danger")} onClick={deleteTpl} disabled={saving}>
                    Sil
                  </button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))" }}>
            <label>
              Kanal
              <select
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
              >
                {CHANNELS.map((c) => (
                  <option key={c.v} value={c.v}>{c.label}</option>
                ))}
              </select>
            </label>
            <label>
              Ad
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
            </label>
            <label style={{ alignSelf: "end" }}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />{" "}
              Aktif
            </label>
          </div>

          <label>
            Şablon Metni
            <textarea
              rows={8}
              value={form.template}
              onChange={(e) => setForm({ ...form, template: e.target.value })}
              placeholder={"📣 {title}\n{body}"}
            />
          </label>

          {/* Editor actions + inline preview */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 8 }}>
            <div style={{ border: "1px dashed #d1d5db", borderRadius: 8, background: "#f8fafc", padding: 10 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Önizleme (örnek context ile)</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {renderTemplate(form.template, { title: "Örnek Başlık", body: "Örnek içerik" })}
              </pre>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "start", justifyContent: "end" }}>
              <button style={btn("ghost")} onClick={loadAll} disabled={saving}>Yenile</button>
              <button style={btn("primary")} onClick={saveTpl} disabled={saving || !form.name.trim() || !form.template.trim()}>
                {selectedId ? "Güncelle" : "Ekle"}
              </button>
              <button style={btn("success")} onClick={() => toggleActive(!form.is_active)} disabled={!selectedId || saving}>
                {form.is_active ? "Pasifleştir" : "Aktifleştir"}
              </button>
            </div>
          </div>

          {msg && <div style={{ color: "#0a6d37", fontSize: 12 }}>{msg}</div>}
          {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}
