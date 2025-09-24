// apps/admin/src/pages/AdminBotSettings.tsx
import React, { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_BASE_URL as string) || "https://personel-takip-api-production.up.railway.app";

type BotSettings = {
  admin_tasks_tg_enabled: boolean;
  bonus_tg_enabled: boolean;
  finance_tg_enabled: boolean;
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

export default function AdminBotSettings() {
  const [data, setData] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");

  async function load() {
    setMsg(""); setErr(""); setLoading(true);
    try { setData(await api<BotSettings>("/admin-bot/settings")); }
    catch(e:any){ setErr(e?.message || "Ayarlar alınamadı"); }
    finally{ setLoading(false); }
  }

  async function save(partial: Partial<BotSettings>) {
    setMsg(""); setErr(""); setLoading(true);
    try {
      const next = await api<BotSettings>("/admin-bot/settings", { method:"PUT", body: JSON.stringify(partial) });
      setData(next); setMsg("Ayar kaydedildi.");
    } catch(e:any){ setErr(e?.message || "Kaydedilemedi"); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ load(); }, []);

  const container: React.CSSProperties = { maxWidth: 760, margin:"0 auto", padding:16, display:"grid", gap:12 };
  const card: React.CSSProperties = { border:"1px solid #e5e7eb", borderRadius:12, padding:16, background:"#fff" };
  const row: React.CSSProperties = { display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"8px 0" };
  const subtitle: React.CSSProperties = { fontSize:12, color:"#666" };

  return (
    <div style={container}>
      <h1 style={{ margin:0, fontSize:20 }}>Bot İşlemleri</h1>

      <div style={card}>
        <div style={row}>
          <div>
            <div style={{ fontWeight:600 }}>Admin Görevleri Bildirimleri</div>
            <div style={subtitle}>Tick/şift/gün sonu mesajları</div>
          </div>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
            <input
              type="checkbox"
              checked={!!data?.admin_tasks_tg_enabled}
              onChange={(e)=>save({ admin_tasks_tg_enabled: e.target.checked })}
              disabled={!data || loading}
            />
            {data?.admin_tasks_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>

        <hr style={{ border:"none", borderTop:"1px solid #eee", margin:"8px 0" }}/>

        <div style={row}>
          <div>
            <div style={{ fontWeight:600 }}>Bonus Bildirimleri</div>
            <div style={subtitle}>Bonus rapor/işlem bildirimleri</div>
          </div>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
            <input
              type="checkbox"
              checked={!!data?.bonus_tg_enabled}
              onChange={(e)=>save({ bonus_tg_enabled: e.target.checked })}
              disabled={!data || loading}
            />
            {data?.bonus_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>

        <div style={row}>
          <div>
            <div style={{ fontWeight:600 }}>Finans Bildirimleri</div>
            <div style={subtitle}>Finans rapor/işlem bildirimleri</div>
          </div>
          <label style={{ display:"inline-flex", alignItems:"center", gap:8 }}>
            <input
              type="checkbox"
              checked={!!data?.finance_tg_enabled}
              onChange={(e)=>save({ finance_tg_enabled: e.target.checked })}
              disabled={!data || loading}
            />
            {data?.finance_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
      </div>

      {msg && <div style={{ color:"#0a6d37", fontSize:12 }}>{msg}</div>}
      {err && <div style={{ color:"#b00020", fontSize:12 }}>{err}</div>}
    </div>
  );
}
