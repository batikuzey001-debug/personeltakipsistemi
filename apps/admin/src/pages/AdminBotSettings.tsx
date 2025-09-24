// apps/admin/src/pages/AdminBotSettings.tsx
import React, { useEffect, useState } from "react";
const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";

type BotSettings = { admin_tasks_tg_enabled: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, "Content-Type":"application/json" }, ...init });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export default function AdminBotSettings() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>(""); const [err, setErr] = useState<string>("");

  async function load() {
    setErr(""); setMsg(""); setLoading(true);
    try { setSettings(await api<BotSettings>("/admin-bot/settings")); }
    catch(e:any){ setErr(e?.message || "Ayarlar alınamadı"); }
    finally{ setLoading(false); }
  }
  async function save(next: Partial<BotSettings>) {
    if (!settings) return;
    setErr(""); setMsg(""); setLoading(true);
    try {
      const body = { ...settings, ...next };
      const res = await api<BotSettings>("/admin-bot/settings", { method:"PUT", body: JSON.stringify(body) });
      setSettings(res); setMsg("Ayar kaydedildi.");
    } catch(e:any){ setErr(e?.message || "Kaydedilemedi"); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); }, []);

  const container: React.CSSProperties = { maxWidth: 720, margin:"0 auto", padding:16, display:"grid", gap:12 };
  const card: React.CSSProperties = { border:"1px solid #e5e7eb", borderRadius:12, padding:16, background:"#fff" };
  const row: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 };

  return (
    <div style={container}>
      <h1 style={{ margin:0, fontSize:20 }}>Bot İşlemleri</h1>

      <div style={card}>
        <div style={row}>
          <div>
            <div style={{ fontWeight:600 }}>Admin Görevleri Bildirimleri</div>
            <div style={{ fontSize:12, color:"#666" }}>
              Kapatıldığında tick/şift/gün sonu dahil tüm Telegram mesajları durur.
            </div>
          </div>

          <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
            <input
              type="checkbox"
              checked={!!settings?.admin_tasks_tg_enabled}
              onChange={(e)=>save({ admin_tasks_tg_enabled: e.target.checked })}
              disabled={!settings || loading}
            />
            {settings?.admin_tasks_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
      </div>

      {msg && <div style={{ color:"#0a6d37", fontSize:12 }}>{msg}</div>}
      {err && <div style={{ color:"#b00020", fontSize:12 }}>{err}</div>}
    </div>
  );
}
