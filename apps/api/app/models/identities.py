import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}
async function apiPost<T>(path: string, params: Record<string,string|number|null|undefined>): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k,v]) => {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  });
  const r = await fetch(`${API}${path}?${qs.toString()}`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

type Pending = { actor_key: string; hint_name?: string; hint_team?: string; inserted_at: string };

export default function IdentitiesPage() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function load() {
    setErr(null); setOk(null);
    try { setRows(await apiGet<Pending[]>("/identities/pending")); }
    catch (e: any) { setErr(e?.message || "Liste alınamadı"); }
  }
  useEffect(() => { load(); }, []);

  async function bindExisting(actor_key: string, employee_id: string) {
    setErr(null); setOk(null);
    try {
      await apiPost("/identities/bind", { actor_key, employee_id, retro_days: 14 });
      setOk(`${actor_key} -> ${employee_id} bağlandı`);
      await load();
    } catch (e: any) { setErr(e?.message || "Bağlanamadı"); }
  }
  async function createAndBind(actor_key: string, employee_id: string, full_name: string, team?: string) {
    setErr(null); setOk(null);
    try {
      await apiPost("/identities/bind", {
        actor_key,
        create_employee_id: employee_id,
        create_full_name: full_name,
        create_team: team || "",
        retro_days: 14
      });
      setOk(`Oluşturuldu ve bağlandı: ${employee_id}`);
      await load();
    } catch (e: any) { setErr(e?.message || "Oluştur/bağla başarısız"); }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Kişi Eşleştirme (Pending)</h1>
      {err && <div style={{ color: "#b00020" }}>{err}</div>}
      {ok && <div style={{ color: "green" }}>{ok}</div>}

      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>actor_key</th>
              <th style={{ textAlign: "left", padding: 8 }}>İsim ipucu</th>
              <th style={{ textAlign: "left", padding: 8 }}>Bağla (mevcut)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Oluştur + Bağla (yeni)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keySafe = r.actor_key.replace(/[^a-zA-Z0-9@:_-]/g, "");
              return (
                <tr key={r.actor_key} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8 }}>{r.actor_key}</td>
                  <td style={{ padding: 8 }}>{r.hint_name || "-"}</td>
                  <td style={{ padding: 8 }}>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      // @ts-ignore
                      const emp = (e.currentTarget.elements.namedItem(`emp_${keySafe}`) as HTMLInputElement).value.trim();
                      if (emp) bindExisting(r.actor_key, emp);
                    }}>
                      <input name={`emp_${keySafe}`} placeholder="employee_id" style={{ width: 160, marginRight: 6 }} />
                      <button type="submit">Bağla</button>
                    </form>
                  </td>
                  <td style={{ padding: 8 }}>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      // @ts-ignore
                      const emp = (e.currentTarget.elements.namedItem(`newid_${keySafe}`) as HTMLInputElement).value.trim();
                      // @ts-ignore
                      const name = (e.currentTarget.elements.namedItem(`newname_${keySafe}`) as HTMLInputElement).value.trim();
                      if (emp && name) createAndBind(r.actor_key, emp, name);
                    }}>
                      <input name={`newid_${keySafe}`} placeholder="yeni employee_id" style={{ width: 160, marginRight: 6 }} />
                      <input name={`newname_${keySafe}`} placeholder="Ad Soyad" style={{ width: 160, marginRight: 6 }} defaultValue={r.hint_name || ""} />
                      <button type="submit">Oluştur+Bağla</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: "#777" }}>Bekleyen kayıt yok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
