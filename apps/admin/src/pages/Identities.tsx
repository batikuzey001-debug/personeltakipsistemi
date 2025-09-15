// apps/admin/src/pages/Identities.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

async function apiPost<T>(
  path: string,
  params: Record<string, string | number | null | undefined>
): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length > 0) qs.set(k, String(v));
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

  async function bindExisting(actor_key: string, employee_id: string) {
    setErr(null);
    setOk(null);
    if (!employee_id.trim()) {
      setErr("employee_id zorunludur");
      return;
    }
    try {
      await apiPost("/identities/bind", { actor_key, employee_id, retro_days: 14 });
      setOk(`${actor_key} → ${employee_id} bağlandı`);
      await load();
    } catch (e: any) {
      setErr(e?.message || "Bağlanamadı");
    }
  }

  async function createAndBind(
    actor_key: string,
    employee_id: string,   // boş bırakılabilir → RD-xxx otomatik atanır
    full_name: string,
    department?: string
  ) {
    setErr(null);
    setOk(null);
    if (!full_name.trim()) {
      setErr("Yeni kayıt için Ad Soyad zorunludur");
      return;
    }
    try {
      const params: Record<string, string | number> = {
        actor_key,
        create_full_name: full_name,
        retro_days: 14,
      };
      // Backend param adı create_team olarak kalıyor; biz UI'da “Departman” gösteriyoruz
      if (department && department.trim()) params.create_team = department.trim();
      if (employee_id && employee_id.trim()) params.employee_id = employee_id.trim();

      await apiPost("/identities/bind", params);
      setOk(
        employee_id && employee_id.trim()
          ? `Oluşturuldu ve bağlandı: ${employee_id.trim()}`
          : `Oluşturuldu ve bağlandı (otomatik RD-xxx)`
      );
      await load();
    } catch (e: any) {
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
              <th style={{ textAlign: "left", padding: 8 }}>Bağla (mevcut)</th>
              <th style={{ textAlign: "left", padding: 8 }}>Oluştur + Bağla (yeni)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const keySafe = r.actor_key.replace(/[^a-zA-Z0-9@:_-]/g, "");
              return (
                <tr key={r.actor_key} style={{ borderTop: "1px solid #f1f1f1" }}>
                  <td style={{ padding: 8, fontFamily: "monospace" }}>{r.actor_key}</td>
                  <td style={{ padding: 8 }}>{r.hint_name || "-"}</td>

                  {/* Mevcut employee'e bağla */}
                  <td style={{ padding: 8 }}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const emp = (e.currentTarget.elements.namedItem(
                          `emp_${keySafe}`
                        ) as HTMLInputElement).value.trim();
                        bindExisting(r.actor_key, emp);
                      }}
                    >
                      <input
                        name={`emp_${keySafe}`}
                        placeholder="employee_id"
                        style={{ width: 160, marginRight: 6 }}
                      />
                      <button type="submit">Bağla</button>
                    </form>
                  </td>

                  {/* Yeni employee oluştur + bağla */}
                  <td style={{ padding: 8 }}>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const emp = (e.currentTarget.elements.namedItem(
                          `newid_${keySafe}`
                        ) as HTMLInputElement).value.trim();
                        const name = (e.currentTarget.elements.namedItem(
                          `newname_${keySafe}`
                        ) as HTMLInputElement).value.trim();
                        const dept = (e.currentTarget.elements.namedItem(
                          `newteam_${keySafe}`   // param adı backend uyumu için sabit kaldı
                        ) as HTMLInputElement)?.value?.trim();
                        createAndBind(r.actor_key, emp, name, dept);
                      }}
                    >
                      <input
                        name={`newid_${keySafe}`}
                        placeholder="(boş bırak = otomatik RD-xxx)"
                        style={{ width: 200, marginRight: 6 }}
                      />
                      <input
                        name={`newname_${keySafe}`}
                        placeholder="Ad Soyad"
                        defaultValue={r.hint_name || ""}
                        style={{ width: 180, marginRight: 6 }}
                        required
                      />
                      <input
                        name={`newteam_${keySafe}`}
                        placeholder="Departman (ops.)"  // <-- Takım yerine Departman
                        style={{ width: 160, marginRight: 6 }}
                      />
                      <button type="submit">Oluştur + Bağla</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 12, color: "#777" }}>
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
