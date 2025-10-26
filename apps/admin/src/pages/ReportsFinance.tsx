// apps/admin/src/pages/ReportsFinance.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import { formatPercent, formatTL } from "../lib/format";

type FinanceRow = {
  date?: string;              // "2025-10-26"
  employee_code?: string;     // "RD-202"
  employee_name?: string;     // "Nehir"
  dept?: string;              // "finance"
  count?: number;             // işlem adedi
  total_amount?: number;      // toplam tutar
  avg_amount?: number;        // ortalama tutar
  approve_rate?: number;      // 0..1 veya 0..100
  reject_rate?: number;       // 0..1 veya 0..100
  pending_count?: number;     // bekleyen işlem (opsiyon)
  [k: string]: any;
};

// Sende farklıysa değiştir:
const PATH = "/reports/finance";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();

  const today = useMemo(() => new Date(), []);
  const toStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const defaultFrom = useMemo(() => {
    const a = new Date(today);
    a.setDate(a.getDate() - 6);
    return toStr(a);
  }, [today]);
  const defaultTo = useMemo(() => toStr(today), [today]);

  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const order = params.get("order") || "-total_amount";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);

  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    setParams(next, { replace: true });
  };

  return { from, to, order, limit, offset, set };
}

export default function ReportsFinance() {
  const { from, to, order, limit, offset, set } = useQueryDefaults();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<FinanceRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    api
      .get<ApiListResponse<FinanceRow>>(PATH, {
        from,
        to,
        order,      // ör: "-total_amount" | "count"
        limit,
        offset,
        tz: "Europe/Istanbul",
      })
      .then((resp) => {
        if (!mounted) return;
        setData(resp);
      })
      .catch((e) => {
        if (!mounted) return;
        setErr(e?.message || "Hata");
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [from, to, order, limit, offset]);

  const columns: Column<FinanceRow>[] = [
    { key: "employee_name", header: "Personel" },
    { key: "employee_code", header: "Kod", width: 100 },
    { key: "count", header: "İşlem", width: 90 },
    {
      key: "total_amount",
      header: "Toplam Tutar",
      render: (r) => formatTL(r.total_amount),
    },
    {
      key: "avg_amount",
      header: "Ø Tutar",
      render: (r) => formatTL(r.avg_amount),
    },
    {
      key: "approve_rate",
      header: "Onay",
      render: (r) => <b style={{ color: "#0a7" }}>{formatPercent(r.approve_rate)}</b>,
    },
    {
      key: "reject_rate",
      header: "Ret",
      render: (r) => <b style={{ color: "#c33" }}>{formatPercent(r.reject_rate)}</b>,
    },
    ...(data?.rows?.some((r) => r.pending_count != null)
      ? [
          {
            key: "pending_count",
            header: "Bekleyen",
            render: (r: FinanceRow) => (r.pending_count ?? "") as any,
          } as Column<FinanceRow>,
        ]
      : []),
  ];

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <strong>Aralık:</strong>
        <span>
          {from} → {to}
        </span>
        <div style={{ flex: 1 }} />
        <ExportCSVButton filename={`finans-raporu_${from}_${to}`} rows={rows} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select
          value={order}
          onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
        >
          <option value="-total_amount">Toplam Tutar (azalan)</option>
          <option value="total_amount">Toplam Tutar (artan)</option>
          <option value="-count">İşlem (azalan)</option>
          <option value="count">İşlem (artan)</option>
          <option value="-approve_rate">Onay (azalan)</option>
          <option value="approve_rate">Onay (artan)</option>
          <option value="-reject_rate">Ret (azalan)</option>
          <option value="reject_rate">Ret (artan)</option>
          <option value="-avg_amount">Ø Tutar (azalan)</option>
          <option value="avg_amount">Ø Tutar (artan)</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7, marginLeft: 12 }}>Sayfa boyutu:</label>
        <select
          value={String(limit)}
          onChange={(e) => set({ limit: Number(e.target.value), offset: 0 })}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}
        >
          {[25, 50, 100, 250].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {loading && <div>Yükleniyor…</div>}
      {err && <div style={{ color: "#c33", marginBottom: 8 }}>Hata: {err}</div>}

      <Table columns={columns} data={rows} />

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

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "6px 10px",
    border: "1px solid #ddd",
    borderRadius: 8,
    background: disabled ? "#f1f1f1" : "#f7f7f7",
    cursor: disabled ? "default" : "pointer",
  };
}
