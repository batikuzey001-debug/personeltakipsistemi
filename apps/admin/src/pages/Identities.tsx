// apps/admin/src/pages/Identities.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import Loading from "../components/Loading";
import Alert from "../components/Alert";

type IdentityRow = {
  id?: number;
  provider?: string;
  username?: string;
  external_id?: string;
  employee_id?: number | string;
  employee_code?: string;
  employee_name?: string;
  created_at?: string;
  [k: string]: any;
};

// ✅ Zip’te kök liste uç yok; mevcut uç: GET /identities/pending
const PATH = "/identities/pending";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();
  const order = params.get("order") || "provider";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const q = params.get("q") || "";
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    if ("q" in patch) next.set("offset", "0");
    setParams(next, { replace: true });
  };
  return { order, limit, offset, q, set };
}

export default function Identities() {
  const { order, limit, offset, q, set } = useQueryDefaults();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<IdentityRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr(null);
    api.get<ApiListResponse<IdentityRow>>(PATH, { order, limit, offset, q: q || undefined })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [order, limit, offset, q]);

  const columns: Column<IdentityRow>[] = [
    { key: "provider", header: "Sağlayıcı", width: 140 },
    { key: "username", header: "Kullanıcı Adı", width: 220 },
    { key: "external_id", header: "External ID", width: 200 },
    { key: "employee_name", header: "Personel", width: 240, render: r => <span>{r.employee_name || ""} {r.employee_code ? <span style={{opacity:.6}}>({r.employee_code})</span> : ""}</span> },
    ...(data?.rows?.some(r => r.created_at) ? [{ key: "created_at", header: "Eklendi", width: 180 } as Column<IdentityRow>] : []),
  ];

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = (offset > 0);
  const hasNext = (offset + limit < total);

  return (
    <div>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
        <strong>Kişi Eşleştirme (Bekleyen)</strong>
        <div style={{ flex:1 }} />
        <ExportCSVButton filename="identities-pending" rows={rows} />
      </div>

      <div style={{ display:"flex", gap:8, alignItems:"center", margin:"8px 0 12px" }}>
        <input
          placeholder="Ara (username, external id, ad/kod)"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          style={{ padding:"6px 8px", border:"1px solid #ddd", borderRadius:8, background:"#fff", minWidth:260 }}
        />
        <label style={{ fontSize:12, opacity:.7 }}>Sırala:</label>
        <select
          value={order}
          onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={{ padding:"6px 8px", border:"1px solid #ddd", borderRadius:8 }}
        >
          <option value="provider">Sağlayıcı</option>
          <option value="username">Kullanıcı Adı</option>
          <option value="external_id">External ID</option>
          <option value="employee_name">Personel</option>
          <option value="-created_at">Eklendi (yeni→eski)</option>
          <option value="created_at">Eklendi (eski→yeni)</option>
        </select>

        <label style={{ fontSize:12, opacity:.7 }}>Sayfa boyutu:</label>
        <select
          value={String(limit)}
          onChange={(e) => set({ limit: Number(e.target.value), offset: 0 })}
          style={{ padding:"6px 8px", border:"1px solid #ddd", borderRadius:8 }}
        >
          {[25, 50, 100, 250].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {err && <Alert variant="error" title="Kimlikler yüklenemedi">{err}</Alert>}

      <Table columns={columns} data={rows} />

      <div style={{ display:"flex", gap:8, alignItems:"center", marginTop:12 }}>
        <button disabled={!hasPrev} onClick={() => hasPrev && set({ offset: Math.max(0, offset - limit) })} style={navBtn(!hasPrev)}>◀ Önceki</button>
        <button disabled={!hasNext} onClick={() => hasNext && set({ offset: offset + limit })} style={navBtn(!hasNext)}>Sonraki ▶</button>
        <div style={{ marginLeft:8, opacity:.7 }}>Toplam: {total} • Gösterilen: {rows.length} • Offset: {offset}</div>
      </div>
    </div>
  );
}
function navBtn(disabled:boolean): React.CSSProperties {
  return { padding:"6px 10px", border:"1px solid #ddd", borderRadius:8, background: disabled ? "#f1f1f1" : "#f7f7f7", cursor: disabled ? "default" : "pointer" };
}
