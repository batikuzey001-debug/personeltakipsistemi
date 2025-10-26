// apps/admin/src/pages/Employees.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import Loading from "../components/Loading";
import Alert from "../components/Alert";
import { deptLabels, roleLabels, statusLabels, labelOf } from "../lib/labels";
import { formatDateTime } from "../lib/format";

type EmployeeRow = {
  id?: number;
  code?: string;
  name?: string;
  dept?: string;
  role?: string;
  status?: string;
  created_at?: string;
  last_active_at?: string;
  [k: string]: any;
};

const PATH = "/employees";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();
  const order = params.get("order") || "name";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const q = params.get("q") || "";
  const dept = params.get("dept") || "";
  const role = params.get("role") || "";
  const status = params.get("status") || "";
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    if ("q" in patch || "dept" in patch || "role" in patch || "status" in patch) next.set("offset", "0");
    setParams(next, { replace: true });
  };
  return { order, limit, offset, q, dept, role, status, set };
}

export default function Employees() {
  const { order, limit, offset, q, dept, role, status, set } = useQueryDefaults();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<EmployeeRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    api
      .get<ApiListResponse<EmployeeRow>>(PATH, {
        order,
        limit,
        offset,
        q: q || undefined,
        dept: dept || undefined,
        role: role || undefined,
        status: status || undefined,
      })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [order, limit, offset, q, dept, role, status]);

  const columns: Column<EmployeeRow>[] = [
    { key: "name", header: "Ad Soyad" },
    { key: "code", header: "Kod", width: 100 },
    {
      key: "dept",
      header: "Departman",
      width: 120,
      render: (r) => labelOf(deptLabels, r.dept),
    },
    {
      key: "role",
      header: "Rol",
      width: 140,
      render: (r) => labelOf(roleLabels, r.role),
    },
    {
      key: "status",
      header: "Durum",
      width: 110,
      render: (r) => labelOf(statusLabels, r.status),
    },
    ...(data?.rows?.some((r) => r.last_active_at)
      ? [
          {
            key: "last_active_at",
            header: "Son Aktivite",
            width: 180,
            render: (r: EmployeeRow) => formatDateTime(r.last_active_at),
          } as Column<EmployeeRow>,
        ]
      : []),
    ...(data?.rows?.some((r) => r.created_at)
      ? [
          {
            key: "created_at",
            header: "Oluşturulma",
            width: 180,
            render: (r: EmployeeRow) => formatDateTime(r.created_at),
          } as Column<EmployeeRow>,
        ]
      : []),
  ];

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div>
      {/* Üst çubuk */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <strong>Personel</strong>
        <div style={{ flex: 1 }} />
        <ExportCSVButton filename={`personel_listesi`} rows={rows} />
      </div>

      {/* Filtreler */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 12px" }}>
        <input
          placeholder="Ara (ad, kod)"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          style={inputStyle}
        />

        <select value={dept} onChange={(e) => set({ dept: e.target.value })} style={inputStyle}>
          <option value="">Departman (hepsi)</option>
          <option value="livechat">{deptLabels.livechat}</option>
          <option value="bonus">{deptLabels.bonus}</option>
          <option value="finance">{deptLabels.finance}</option>
          <option value="admin">{deptLabels.admin}</option>
          <option value="other">{deptLabels.other}</option>
        </select>

        <select value={role} onChange={(e) => set({ role: e.target.value })} style={inputStyle}>
          <option value="">Rol (hepsi)</option>
          <option value="super_admin">{roleLabels.super_admin}</option>
          <option value="admin">{roleLabels.admin}</option>
          <option value="viewer">{roleLabels.viewer}</option>
          <option value="employee">{roleLabels.employee}</option>
        </select>

        <select value={status} onChange={(e) => set({ status: e.target.value })} style={inputStyle}>
          <option value="">{statusLabels[""] ?? "Durum (hepsi)"}</option>
          <option value="active">{statusLabels.active}</option>
          <option value="passive">{statusLabels.passive}</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select
          value={order}
          onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={inputStyle}
        >
          <option value="name">Ad</option>
          <option value="code">Kod</option>
          <option value="dept">Departman</option>
          <option value="role">Rol</option>
          <option value="status">Durum</option>
          <option value="-created_at">Oluşturulma (yeni→eski)</option>
          <option value="created_at">Oluşturulma (eski→yeni)</option>
          <option value="-last_active_at">Son Aktivite (yeni→eski)</option>
          <option value="last_active_at">Son Aktivite (eski→yeni)</option>
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
      {err && <Alert variant="error" title="Personel listesi yüklenemedi">{err}</Alert>}

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
