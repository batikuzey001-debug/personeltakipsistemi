// apps/admin/src/pages/ReportBonusClose.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import { formatSecondsToMmSs, formatPercent, formatTL } from "../lib/format";
import Loading from "../components/Loading";
import Alert from "../components/Alert";
import { useColumnVisibility, ColumnVisibilityControls } from "../components/ColumnVisibility";

type BonusRow = {
  date?: string;
  employee_code?: string;
  employee_name?: string;
  count?: number;
  avg_first_sec?: number;
  avg_close_sec?: number;
  approve_rate?: number;
  reject_rate?: number;
  total_amount?: number;
  avg_amount?: number;
  dept?: string;
  [k: string]: any;
};

const PATH = "/reports/bonus/close-time";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const defaultFrom = useMemo(() => { const a = new Date(today); a.setDate(a.getDate() - 6); return toStr(a); }, [today]);
  const defaultTo = useMemo(() => toStr(today), [today]);
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const order = params.get("order") || "-count";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "") ? next.delete(k) : next.set(k, String(v)));
    setParams(next, { replace: true });
  };
  return { from, to, order, limit, offset, set };
}

export default function ReportBonusClose() {
  const { from, to, order, limit, offset, set } = useQueryDefaults();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<BonusRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr(null);
    api.get<ApiListResponse<BonusRow>>(PATH, { from, to, order, limit, offset, tz: "Europe/Istanbul" })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [from, to, order, limit, offset]);

  const columns: Column<BonusRow>[] = [
    { key: "employee_name", header: "Personel" },
    { key: "employee_code", header: "Kod" },
    { key: "count", header: "İşlem" },
    { key: "avg_first_sec", header: "Ø İlk Yanıt", render: (r) => r.avg_first_sec != null ? formatSecondsToMmSs(r.avg_first_sec) : "" },
    { key: "avg_close_sec", header: "Ø Sonuçlandırma", render: (r) => r.avg_close_sec != null ? formatSecondsToMmSs(r.avg_close_sec) : "" },
    { key: "approve_rate", header: "Onay", render: (r) => <b style={{ color: "#0a7" }}>{formatPercent(r.approve_rate)}</b> },
    { key: "reject_rate", header: "Ret", render: (r) => <b style={{ color: "#c33" }}>{formatPercent(r.reject_rate)}</b> },
    { key: "total_amount", header: "Toplam", render: (r) => formatTL(r.total_amount) },
    { key: "avg_amount", header: "Ø Tutar", render: (r) => formatTL(r.avg_amount) },
  ];

  const storageKey = "cols:reports:bonus-close";
  const allKeys = columns.map((c) => String(c.key));
  const { visible, toggle, showAll, hideAll } = useColumnVisibility(allKeys, storageKey);
  const visibleColumns = columns.filter((c) => visible[String(c.key)] !== false);

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <strong>Aralık:</strong><span>{from} → {to}</span>
        <div style={{ flex: 1 }} />
        <ColumnVisibilityControls
          columns={columns.map((c) => ({ key: String(c.key), header: c.header }))}
          visible={visible}
          toggle={toggle}
          showAll={showAll}
          hideAll={hideAll}
        />
        <ExportCSVButton filename={`bonus-close_${from}_${to}`} rows={rows} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select value={order} onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}>
          <option value="-count">İşlem (azalan)</option>
          <option value="count">İşlem (artan)</option>
          <option value="-avg_first_sec">Ø İlk Yanıt (azalan)</option>
          <option value="avg_first_sec">Ø İlk Yanıt (artan)</option>
          <option value="-avg_close_sec">Ø Sonuçlandırma (azalan)</option>
          <option value="avg_close_sec">Ø Sonuçlandırma (artan)</option>
          <option value="-approve_rate">Onay (azalan)</option>
          <option value="approve_rate">Onay (artan)</option>
          <option value="-total_amount">Toplam Tutar (azalan)</option>
          <option value="total_amount">Toplam Tutar (artan)</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7, marginLeft: 12 }}>Sayfa boyutu:</label>
        <select value={String(limit)} onChange={(e) => set({ limit: Number(e.target.value), offset: 0 })}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}>
          {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {err && <Alert variant="error" title="Rapor yüklenemedi">{err}</Alert>}

      <Table columns={visibleColumns} data={rows} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button disabled={!hasPrev} onClick={() => hasPrev && set({ offset: Math.max(0, offset - limit) })} style={navBtnStyle(!hasPrev)}>◀ Önceki</button>
        <button disabled={!hasNext} onClick={() => hasNext && set({ offset: offset + limit })} style={navBtnStyle(!hasNext)}>Sonraki ▶</button>
        <div style={{ marginLeft: 8, opacity: 0.7 }}>Toplam: {total} • Gösterilen: {rows.length} • Offset: {offset}</div>
      </div>
    </div>
  );
}

function navBtnStyle(disabled: boolean): React.CSSProperties {
  return { padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: disabled ? "#f1f1f1" : "#f7f7f7", cursor: "default" };
}
