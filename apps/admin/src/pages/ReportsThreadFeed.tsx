// apps/admin/src/pages/ReportsThreadFeed.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import Loading from "../components/Loading";
import Alert from "../components/Alert";
import { useColumnVisibility, ColumnVisibilityControls } from "../components/ColumnVisibility";

type ThreadRow = {
  ts?: string;
  date?: string;
  time?: string;
  type?: string;
  actor_employee_code?: string;
  actor_employee_name?: string;
  correlation_id?: string;
  message?: string;
  meta_json?: Record<string, any>;
  [k: string]: any;
};

const PATH = "/reports/thread-feed";

function useQueryDefaults() {
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => new Date(), []);
  const toStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const defaultFrom = useMemo(() => { const a = new Date(today); a.setDate(a.getDate() - 1); return toStr(a); }, [today]);
  const defaultTo = useMemo(() => toStr(today), [today]);
  const from = params.get("from") || defaultFrom;
  const to = params.get("to") || defaultTo;
  const order = params.get("order") || "-ts";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const q = params.get("q") || "";
  const type = params.get("type") || "";
  const employee = params.get("employee") || "";
  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v == null || v === "") ? next.delete(k) : next.set(k, String(v)));
    if ("q" in patch || "type" in patch || "employee" in patch || "from" in patch || "to" in patch) next.set("offset", "0");
    setParams(next, { replace: true });
  };
  return { from, to, order, limit, offset, q, type, employee, set };
}

function shortId(id?: string) {
  if (!id) return "";
  return id.length <= 10 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`;
}
function isoToLocal(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString("tr-TR");
    const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${date} ${time}`;
  } catch { return iso; }
}

export default function ReportsThreadFeed() {
  const { from, to, order, limit, offset, q, type, employee, set } = useQueryDefaults();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<ThreadRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true); setErr(null);
    api.get<ApiListResponse<ThreadRow>>(PATH, { from, to, order, limit, offset, tz: "Europe/Istanbul", q: q || undefined, type: type || undefined, employee: employee || undefined })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [from, to, order, limit, offset, q, type, employee]);

  const columns: Column<ThreadRow>[] = [
    { key: "ts", header: "Zaman", render: (r) => isoToLocal(r.ts) || r.date || "", width: 180 },
    { key: "type", header: "Tip", width: 140 },
    {
      key: "actor_employee_name", header: "Personel", width: 220,
      render: (r) => <span>{r.actor_employee_name || ""} <span style={{ opacity: 0.6 }}>{r.actor_employee_code ? `(${r.actor_employee_code})` : ""}</span></span>,
    },
    {
      key: "message", header: "Mesaj",
      render: (r) => <span style={{ display: "inline-block", maxWidth: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.message || ""}</span>,
    },
    { key: "correlation_id", header: "Korelasyon", render: (r) => <span style={{ opacity: 0.8 }}>{shortId(r.correlation_id)}</span>, width: 140 },
  ];

  const storageKey = "cols:reports:thread-feed";
  const allKeys = columns.map((c) => String(c.key));
  const { visible, toggle, showAll, hideAll } = useColumnVisibility(allKeys, storageKey);
  const visibleColumns = columns.filter((c) => visible[String(c.key)] !== false);

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        <strong>Aralık:</strong><span>{from} → {to}</span>
        <div style={{ flex: 1 }} />
        <ColumnVisibilityControls
          columns={columns.map((c) => ({ key: String(c.key), header: c.header }))}
          visible={visible}
          toggle={toggle}
          showAll={showAll}
          hideAll={hideAll}
        />
        <ExportCSVButton filename={`thread-feed_${from}_${to}`} rows={rows} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 12px" }}>
        <input placeholder="Ara (mesaj, korelasyon, vs.)" value={q} onChange={(e) => set({ q: e.target.value })} style={inputStyle} />
        <input placeholder="Personel (kod/isim)" value={employee} onChange={(e) => set({ employee: e.target.value })} style={inputStyle} />
        <select value={type} onChange={(e) => set({ type: e.target.value })} style={{ ...inputStyle, minWidth: 200 }}>
          <option value="">Tip (hepsi)</option>
          <option value="reply_first">reply_first</option>
          <option value="reply_close">reply_close</option>
          <option value="approve">approve</option>
          <option value="reject">reject</option>
          <option value="missed">missed</option>
          <option value="note">note</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select value={order} onChange={(e) => set({ order: e.target.value, offset: 0 })} style={inputStyle}>
          <option value="-ts">Zaman (yeniden eskiye)</option>
          <option value="ts">Zaman (eskiden yeniye)</option>
          <option value="type">Tip</option>
          <option value="actor_employee_name">Personel</option>
        </select>

        <label style={{ fontSize: 12, opacity: 0.7, marginLeft: 12 }}>Sayfa boyutu:</label>
        <select value={String(limit)} onChange={(e) => set({ limit: Number(e.target.value), offset: 0 })} style={inputStyle}>
          {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {err && <Alert variant="error" title="Rapor yüklenemedi">{err}</Alert>}

      <Table columns={visibleColumns} data={rows} />

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
        <button disabled={!hasPrev} onClick={() => hasPrev && set({ offset: Math.max(0, offset - limit) })} style={navBtnStyle(!hasPrev)}>◀ Önceki</button>
        <button disabled={!hasNext} onClick={() => hasNext && set({ offset: offset + limit })} style={navBtnStyle(!hasNext)}>Sonraki ▶</button>
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
  return { padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8, background: disabled ? "#f1f1f1" : "#f7f7f7", cursor: "default" };
}
