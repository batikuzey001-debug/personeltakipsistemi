// apps/admin/src/pages/Identities.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;
const DEPARTMENTS = ["Call Center", "Canlı", "Finans", "Bonus", "Admin"] as const;

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function apiPost<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && String(v).length > 0) qs.set(k, String(v));
  });
  const r = await fetch(`${API}${path}?${qs.toString()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

type Pending = {
  actor_key: string;
  hint_name?: string;
  hint_team?: string;
  inserted_at: string;
};

function deriveName(actor_key: string, hint_name?: string) {
  if (hint_name && hint_name.trim()) return hint_name.trim();
  if (actor_key.startsWith("uname:@")) return actor_key.slice(7); // @user
  return ""; // boş bırak, UI doldurtacak
}

function deriveUsername(actor_key: string) {
  return actor_key.startsWith("uname:@") ? actor_key.slice(6) : ""; // @user (başında @ ile)
}

function deriveUid(actor_key: string) {
  return actor_key.startsWith("uid:") ? actor_key.slice(4) : "";
}

export default function IdentitiesPage() {
  const [rows, setRows] = useState<Pending[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(null);
    setOk(null);
    setLoading(true);
    try {
      const data = await apiGet<Pending[]>("/identities/pending");
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createAndBind(actor_key: string, employee_id: string, full_name: string, department: string) {
    setErr(null);
    setOk(null);

    // Zorunlu alanlar: full_name (boşsa actor_key’ten türet), department (seçiniz)
    const nameFinal = (full_name || "").trim() || deriveName(actor_key) || "Personel";
    if (!department || !DEPARTMENTS.includes(department as any)) {
      setErr("Lütfen bir departman seçin.");
      return;
    }

    // Paramlar: employee_id boşsa göndermeyelim → RD-xxx otomatik
    const params: Record<string, string> = {
      actor_key,
      create_full_name: nameFinal,
      create_department: department,
      retro_days: "14",
    };
    if (employee_id && employee_id.trim()) params.employee_id = employee_id.trim();

    try {
      await apiPost("/identities/bind", params);
      setOk(
        employee_id && employee_id.trim()
          ? `Oluşturuldu ve bağlandı: ${employee_id.trim()}`
          : `Oluşturuldu ve bağlandı (otomatik RD-xxx)`
      );
      await load();
    } catch (e: any) {
      // “Failed to fetch” görürseniz Network’te CORS/401 bakın — burada gerçek hata mesajını gösteriyoruz.
      setErr(e?.message || "Oluştur/bağla başarısız");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Kişi Eşleştirme (Pending)</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={load} disabled={loading}>
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
        {ok && <span style={{ color: "green", fontSize: 13 }}>{ok}</span>}
        {err && <span style={{ color: "#b00020", fontSize: 13 }}>{err}</span>}
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>actor_key</th>
              <th style={{ textAlign: "left", padding: 8 }}>İsim İpucu</th>
              <th style={{ textAlign: "left", padding: 8 }}>Oluştur + Bağla</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keySafe = r.actor_key.replace(/[^a-zA-Z0-9@:_-]/g, "");
              const defaultName = deriveName(r.actor_key, r.hint_name);
              const uname = deriveUsername(r.actor_key);
              const uid = deriveUid(r.actor_key);

              return (
                <tr key={r.actor_key} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8, fontFamily: "monospace" }}>{r.actor_key}</td>
                  <td style={{ padding: 8 }}>{defaultName || "-"}</td>
                  <td style={{ padding: 8 }}>
                    {/* Tek form: yalnızca “Oluştur + Bağla” */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const emp = (e.currentTarget.elements.namedItem(`newid_${keySafe}`) as HTMLInputElement).value.trim();
                        const name = (e.currentTarget.elements.namedItem(`newname_${keySafe}`) as HTMLInputElement).value.trim();
                        const dept = (e.currentTarget.elements.namedItem(`newdept_${keySafe}`) as HTMLSelectElement).value;
                        createAndBind(r.actor_key, emp, name, dept);
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "200px 200px 180px auto", gap: 6, alignItems: "center" }}>
                        <input
                          name={`newid_${keySafe}`}
                          placeholder="(boş = otomatik RD-xxx)"
                          aria-label="Employee ID"
                        />
                        <input
                          name={`newname_${keySafe}`}
                          defaultValue={defaultName}
                          placeholder="Ad Soyad"
                          required
                          aria-label="Ad Soyad"
                        />
                        <select name={`newdept_${keySafe}`} defaultValue="" aria-label="Departman">
                          <option value="">Departman (seç)</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                        <button type="submit">Oluştur + Bağla</button>
                      </div>

                      {/* Otomatik doldurulacak Telegram alanları önizleme */}
                      <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                        Telegram ID: <b>{uid || "-"}</b> • Username: <b>{uname || "-"}</b>
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: 12, color: "#777" }}>
                  Bekleyen kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
