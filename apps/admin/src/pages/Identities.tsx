// apps/admin/src/pages/Identities.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import Loading from "../components/Loading";
import Alert from "../components/Alert";

type IdentityRow = {
  id?: number;
  provider?: string;           // "telegram" | "livechat" | "email" ...
  username?: string;           // "@nick" ya da LC username
  external_id?: string;        // provider'a özgü id
  employee_id?: number;
  employee_code?: string;      // "RD-001"
  employee_name?: string;      // "İlker"
  created_at?: string;         // ISO
  [k: string]: any;
};

// Backend uç adresin farklıysa değiştir:
const PATH = "/identities";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();

  const order = params.get("order") || "provider";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const provider = params.get("provider") || "";
  const q = params.get("q") || ""; // username / external_id / employee_name / code

  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    if ("provider" in patch || "q" in patch) next.set("offset", "0");
    setParams(next, { replace: true });
  };

  return { order, limit, offset, provider, q, set };
}

function isoToLocal(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("tr-TR");
    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

const providerLabels: Record<string, string> = {
  telegram: "Telegram",
  livechat: "LiveChat",
  email: "E-posta",
};

export default function Identities() {
  const { order, limit, offset, provider, q, set } = useQueryDefaults();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<IdentityRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    api
      .get<ApiListResponse<IdentityRow>>(PATH, {
        order,
        limit,
        offset,
        provider: provider || undefined,
        q: q || undefined,
      })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [order, limit, offset, provider, q]);

  const columns: Column<IdentityRow>[] = [
    {
      key: "provider",
      header: "Sağlayıcı",
      width: 140,
      render: (r) => (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#fafafa",
            fontWeight: 700,
          }}
        >
          {providerLabels[r.provider || ""] || r.provider || ""}
        </span>
      ),
    },
    { key: "username", header: "Kullanıcı Adı", width: 220 },
    { key: "external_id", header: "External ID", width: 200 },
    {
      key: "employee_name",
      header: "Personel",
      render: (r) => (
        <span>
          {r.employee_name || ""}
          {r.employee_code ? <span style={{ opacity: 0.6 }}> ({r.employee_code})</span> : ""}
        </span>
      ),
      width: 260,
    },
    { key: "created_at", header: "Eklendi", width: 180, render: (r) => isoToLocal(r.created_at) },
  ];

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div>
      {/* Üst çubuk */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <strong>Kişi Eşleştirme</strong>
        <div style={{ flex: 1 }} />
        <ExportCSVButton filename="identities" rows={rows} />
      </div>

      {/* Filtreler */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 12px" }}>
        <select
          value={provider}
          onChange={(e) => set({ provider: e.target.value })}
          style={inputStyle}
        >
          <option value="">Sağlayıcı (hepsi)</option>
          <option value="telegram">Telegram</option>
          <option value="livechat">LiveChat</option>
          <option value="email">E-posta</option>
        </select>

        <input
          placeholder="Ara (username, external id, ad/kod)"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          style={{ ...inputStyle, minWidth: 260 }}
        />

        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select
          value={order}
          onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={inputStyle}
        >
          <option value="provider">Sağlayıcı</option>
          <option value="username">Kullanıcı Adı</option>
          <option value="external_id">External ID</option>
          <option value="employee_name">Personel</option>
          <option value="-created_at">Eklendi (yeni→eski)</option>
          <option value="created_at">Eklendi (eski→yeni)</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7 }}>Sayfa boyutu:</label>
        <select
          value={String(limit)}
          onChange={(e) => set({ limit: Number(e.target.value), offset: 0 })}
          style={inputStyle}
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {loading && <Loading />}
      {err && <Alert variant="error" title="Kimlikler yüklenemedi">{err}</Alert>}

      <Table columns={columns} data={rows} />

      {/* Sayfalama */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button
          disabled={!hasPrev}
          onClick={() => hasPrev && set({ offset: Math.max(0, offset - limit) })}
          style={navBtnStyle(!hasPrev)}
        >
          ◀ Önceki
        </button>
        <button
          disabled={!hasNext}
          onClick={() => hasNext && set({ offset: offset + limit })}
          style={navBtnStyle(!hasNext)}
        >
          Sonraki ▶
        </button>
        <div style={{ marginLeft: 8, opacity: 0.7 }}>
          Toplam: {total} • Gösterilen: {rows.length} • Offset: {offset}
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 8px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "#fff",
};

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: disabled ? "#f1f1f1" : "#f7f7f7",
    cursor: disabled ? "default" : "pointer",
  };
}
