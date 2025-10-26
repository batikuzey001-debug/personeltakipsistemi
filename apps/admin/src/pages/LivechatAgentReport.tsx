// apps/admin/src/pages/LivechatAgentReport.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import { formatSecondsToMmSs, formatPercent } from "../lib/format";
import Loading from "../components/Loading";
import Alert from "../components/Alert";
import { useColumnVisibility, ColumnVisibilityControls } from "../components/ColumnVisibility";

type AgentRow = {
  date?: string;
  employee_code?: string;
  employee_name?: string;
  dept?: string;
  handled_count?: number;
  missed_count?: number;
  first_response_sec?: number;
  close_sec?: number;
  online_sec?: number;
  availability_rate?: number;
  csat_rate?: number;
  [k: string]: any;
};

const PATH = "/reports/livechat/agents";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const defaultFrom = useMemo(() => { const a = new Date(today); a.setDate(a.getDate() - 6); return toStr(a); }, [today]);
  const defaultTo = useMemo(() => toStr(today), [today]);
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const order = params.get("order") || "-handled_count";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "") ? next.delete(k) : next.set(k, String(v)));
    setParams(next, { replace: true });
  };
  return { from, to, order, limit, offset, set };
}

export default function LivechatAgentReport() {
  const { from, to, order, limit, offset, set } = useQueryDefaults();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<AgentRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr(null);
    api.get<ApiListResponse<AgentRow>>(PATH, { from, to, order, limit, offset, tz: "Europe/Istanbul" })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [from, to, order, limit, offset]);

  const columns: Column<AgentRow>[] = [
    { key: "employee_name", header: "Personel" },
    { key: "employee_code", header: "Kod", width: 100 },
    { key: "handled_count", header: "Sonuçlanan", width: 110 },
    { key: "missed_count", header: "Kaçırılan", width: 100 },
    { key: "first_response_sec", header: "Ø İlk Yanıt", render: (r) => r.first_response_sec != null ? formatSecondsToMmSs(r.first_response_sec) : "" },
    { key: "close_sec", header: "Ø Sonuçlandırma", render: (r) => r.close_sec != null ? formatSecondsToMmSs(r.close_sec) : "" },
    { key: "online_sec", header: "Online", render: (r) => r.online_sec != null ? formatSecondsToMmSs(r.online_sec) : "" },
    { key: "availability_rate", header: "Ulaşılabilirlik", render: (r) => <b style={{ color: "#0a7" }}>{formatPercent(r.availability_rate)}</b> },
    ...(data?.rows?.some((r) => r.csat_rate != null) ? [{ key: "csat_rate", header: "CSAT", render: (r: AgentRow) => <b>{formatPercent(r.csat_rate)}</b> } as Column<AgentRow>] : []),
  ];

  const storageKey = "cols:reports:livechat-agents";
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
        <ExportCSVButton filename={`livechat-agents_${from}_${to}`} rows={rows} />
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0 12px" }}>
        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select value={order} onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8 }}>
          <option value="-handled_count">Sonuçlanan (azalan)</option>
          <option value="handled_count">Sonuçlanan (artan)</option>
          <option value="-missed_count">Kaçırılan (azalan)</option>
          <option value="missed_count">Kaçırılan (artan)</option>
          <option value="-first_response_sec">Ø İlk Yanıt (azalan)</option>
          <option value="first_response_sec">Ø İlk Yanıt (artan)</option>
          <option value="-close_sec">Ø Sonuçlandırma (azalan)</option>
          <option value="close_sec">Ø Sonuçlandırma (artan)</option>
          <option value="-online_sec">Online Süre (azalan)</option>
          <option value="online_sec">Online Süre (artan)</option>
          <option value="-availability_rate">Ulaşılabilirlik (azalan)</option>
          <option value="availability_rate">Ulaşılabilirlik (artan)</option>
          <option value="-csat_rate">CSAT (azalan)</option>
          <option value="csat_rate">CSAT (artan)</option>
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
