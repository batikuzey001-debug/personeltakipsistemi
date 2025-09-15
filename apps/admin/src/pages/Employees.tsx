// apps/admin/src/pages/Employees.tsx
import React, { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Employee = {
  employee_id: string;
  full_name: string;
  email?: string | null;
  team_id?: number | null;
  title?: string | null;
  hired_at?: string | null; // ISO (YYYY-MM-DD) ya da null
  status: string;
  // API şemamızda varsa aşağıdakileri de gösterebiliriz (nullable olabilir)
  // telegram_username?: string | null;
  // phone?: string | null;
};

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

export default function Employees() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [q, setQ] = useState("");
  const [teamId, setTeamId] = useState<string>("");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (teamId.trim()) params.set("team_id", teamId.trim());
      params.set("limit", String(limit));
      params.set("offset", "0");
      const data = await apiGet<Employee[]>(`/employees?${params.toString()}`);
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Liste alınamadı");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Personeller</h1>

      {/* Filtreler */}
      <form onSubmit={onSearch} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          placeholder="Ara (ad / e-posta)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 8, minWidth: 260 }}
        />
        <input
          placeholder="Takım ID (ops.)"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          style={{ padding: 8, width: 140 }}
        />
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ padding: 8 }}>
          {[20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="submit" disabled={loading}>
          {loading ? "Yükleniyor…" : "Listele"}
        </button>
        {err && <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span>}
      </form>

      {/* Tablo */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>Employee ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>Ad Soyad</th>
              <th style={{ textAlign: "left", padding: 8 }}>Ünvan</th>
              <th style={{ textAlign: "left", padding: 8 }}>Takım ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>İşe Başlama</th>
              <th style={{ textAlign: "left", padding: 8 }}>Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee_id} style={{ borderTop: "1px solid #f1f1f1" }}>
                <td style={{ padding: 8, fontFamily: "monospace" }}>{r.employee_id}</td>
                <td style={{ padding: 8 }}>{r.full_name}</td>
                <td style={{ padding: 8 }}>{r.title ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.team_id ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.hired_at ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.status}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#777" }}>
                  Kayıt yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: "#666" }}>
        Not: Liste, API <code>/employees</code> ucundan canlı çekilir. Yeni bağladığın RD-xxx kayıtlar burada görünür.
      </div>
    </div>
  );
}
