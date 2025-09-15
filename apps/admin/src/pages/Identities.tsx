// apps/admin/src/pages/Identities.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;
const DEPARTMENTS = ["Call Center", "Canlı", "Finans", "Bonus", "Admin"] as const;

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function apiPostJSON<T>(path: string, body: any): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

type Pending = { actor_key: string; hint_name?: string; hint_team?: string; inserted_at: string };

function parseActor(actor_key: string) {
  if (actor_key.startsWith("uid:"))   return { uid: actor_key.slice(4),  uname: "" };
  if (actor_key.startsWith("uname:")) return { uid: "",                  uname: actor_key.slice(6) }; // "@nick"
  return { uid: "", uname: "" };
}

export default function IdentitiesPage() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null); setOk(null); setLoading(true);
    try { setRows(await apiGet<Pending[]>("/identities/pending")); }
    catch (e: any) { setErr(e?.message || "Liste alınamadı"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createAndBind(actor_key: string, employee_id: string, full_name: string, department: string) {
    setErr(null); setOk(null);
    if (!department) { setErr("Lütfen departman seçin."); return; }
    const nameFinal = (full_name || "").trim() || "Personel";
    await apiPostJSON("/identities/bind", {
      actor_key,
      create_full_name: nameFinal,
      create_department: department,
      employee_id: employee_id?.trim() || null,
      retro_days: 14,
    });
    setOk(employee_id?.trim() ? `Oluşturuldu ve bağlandı: ${employee_id.trim()}` : "Oluşturuldu ve bağlandı (otomatik RD-xxx)");
    await load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Kişi Eşleştirme (Pending)</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={load} disabled={loading}>{loading ? "Yükleniyor…" : "Yenile"}</button>
        {ok && <span style={{ color: "green", fontSize: 13 }}>{ok}</span>}
        {err && <span style={{ color: "#b00020", fontSize: 13 }}>{err}</span>}
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>actor_key</th>
              <th style={{ textAlign: "left", padding: 8 }}>İsim / Kullanıcı Adı</th>
              <th style={{ textAlign: "left", padding: 8 }}>Oluştur + Bağla</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keySafe = r.actor_key.replace(/[^a-zA-Z0-9@:_-]/g, "");
              const { uid, uname } = parseActor(r.actor_key);
              // Görünüm: Önce hint_name (mesai adı veya webhook'tan düşen isim), yoksa username (@"siz), yoksa —
              const displayName = (r.hint_name && r.hint_name.trim())
                ? r.hint_name.trim()
                : (uname ? uname.replace(/^@/, "") : "—");

              return (
                <tr key={r.actor_key} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8, fontFamily: "monospace" }}>{r.actor_key}</td>
                  <td style={{ padding: 8 }}>{displayName}</td>

                  <td style={{ padding: 8 }}>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const emp  = (e.currentTarget.elements.namedItem(`newid_${keySafe}`) as HTMLInputElement).value.trim();
                        const name = (e.currentTarget.elements.namedItem(`newname_${keySafe}`) as HTMLInputElement).value.trim();
                        const dept = (e.currentTarget.elements.namedItem(`newdept_${keySafe}`) as HTMLSelectElement).value;
                        try {
                          await createAndBind(r.actor_key, emp, name, dept);
                        } catch (ex: any) {
                          setErr(ex?.message || "Oluştur/bağla başarısız");
                        }
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "200px 200px 180px auto", gap: 6, alignItems: "center" }}>
                        <input name={`newid_${keySafe}`} placeholder="(boş = otomatik RD-xxx)" />
                        <input name={`newname_${keySafe}`} placeholder="Ad Soyad" defaultValue={displayName !== "—" ? displayName : ""} required />
                        <select name={`newdept_${keySafe}`} defaultValue="">
                          <option value="">Departman (seç)</option>
                          {DEPARTMENTS.map((d) => (<option key={d} value={d}>{d}</option>))}
                        </select>
                        <button type="submit">Oluştur + Bağla</button>
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                        Telegram ID: <b>{uid || "-"}</b> • Username: <b>{uname || "-"}</b>
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={3} style={{ padding: 12, color: "#777" }}>Bekleyen kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
