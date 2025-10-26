// apps/admin/src/pages/Shifts.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import Loading from "../components/Loading";
import Alert from "../components/Alert";

type ShiftRow = {
  id?: number;
  date?: string;             // "2025-10-26"
  employee_code?: string;    // "RD-123"
  employee_name?: string;    // "Asena"
  start_ts?: string;         // ISO
  end_ts?: string;           // ISO
  duration_sec?: number;     // saniye
  status?: string;           // "planned" | "done" | "missed"
  note?: string;
  [k: string]: any;
};

// Backend uç adresin farklıysa değiştir:
const PATH = "/shifts";

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
  const order = params.get("order") || "date";
  const limit = Number(params.get("limit") || 50);
  const offset = Number(params.get("offset") || 0);
  const status = params.get("status") || "";
  const q = params.get("q") || ""; // ad, kod, not

  const set = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => {
      if (v == null || v === "") next.delete(k);
      else next.set(k, String(v));
    });
    if ("from" in patch || "to" in patch || "status" in patch || "q" in patch) next.set("offset", "0");
    setParams(next, { replace: true });
  };

  return { from, to, order, limit, offset, status, q, set };
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

function formatSecondsToHhMm(sec?: number | null) {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function Shifts() {
  const { from, to, order, limit, offset, status, q, set } = useQueryDefaults();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiListResponse<ShiftRow> | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setErr(null);
    api
      .get<ApiListResponse<ShiftRow>>(PATH, {
        from,
        to,
        order,
        limit,
        offset,
        status: status || undefined,
        q: q || undefined,
        tz: "Europe/Istanbul",
      })
      .then((resp) => mounted && setData(resp))
      .catch((e) => mounted && setErr(e?.message || "Hata"))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [from, to, order, limit, offset, status, q]);

  const columns: Column<ShiftRow>[] = [
    { key: "date", header: "Tarih", width: 110 },
    {
      key: "employee_name",
      header: "Personel",
      width: 240,
      render: (r) => (
        <span>
          {r.employee_name || ""}{" "}
          {r.employee_code ? <span style={{ opacity: 0.6 }}>({r.employee_code})</span> : ""}
        </span>
      ),
    },
    { key: "start_ts", header: "Başlangıç", width: 170, render: (r) => isoToLocal(r.start_ts) },
    { key: "end_ts", header: "Bitiş", width: 170, render: (r) => isoToLocal(r.end_ts) },
    {
      key: "duration_sec",
      header: "Süre",
      width: 90,
      render: (r) => formatSecondsToHhMm(r.duration_sec),
    },
    {
      key: "status",
      header: "Durum",
      width: 120,
      render: (r) => (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid #ddd",
            background: r.status === "done" ? "#eefaf2" : r.status === "missed" ? "#fff2f2" : "#fafafa",
            color: r.status === "done" ? "#1b7d3a" : r.status === "missed" ? "#b22323" : "#333",
            fontWeight: 700,
          }}
        >
          {r.status}
        </span>
      ),
    },
    ...(data?.rows?.some((r) => r.note)
      ? [{ key: "note", header: "Not" } as Column<ShiftRow>]
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
        <strong>Vardiya Listesi</strong>
        <div style={{ flex: 1 }} />
        <ExportCSVButton filename={`shifts_${from}_${to}`} rows={rows} />
      </div>

      {/* Filtreler */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "8px 0 12px" }}>
        <span style={{ fontWeight: 700 }}>Tarih:</span>
        <input
          type="date"
          value={from}
          onChange={(e) => set({ from: e.target.value })}
          style={inputStyle}
        />
        <span style={{ opacity: 0.6 }}>—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => set({ to: e.target.value })}
          style={inputStyle}
        />

        <select
          value={status}
          onChange={(e) => set({ status: e.target.value })}
          style={inputStyle}
        >
          <option value="">Durum (hepsi)</option>
          <option value="planned">Planlandı</option>
          <option value="done">Tamamlandı</option>
          <option value="missed">Kaçırıldı</option>
        </select>

        <input
          placeholder="Ara (ad, kod, not)"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
          style={{ ...inputStyle, minWidth: 220 }}
        />

        <label style={{ fontSize: 12, opacity: 0.7 }}>Sırala:</label>
        <select
          value={order}
          onChange={(e) => set({ order: e.target.value, offset: 0 })}
          style={inputStyle}
        >
          <option value="date">Tarih</option>
          <option value="-date">Tarih (ters)</option>
          <option value="employee_name">Personel (A→Z)</option>
          <option value="-employee_name">Personel (Z→A)</option>
          <option value="-duration_sec">Süre (uzun→kısa)</option>
          <option value="duration_sec">Süre (kısa→uzun)</option>
          <option value="status">Durum</option>
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
      {err && <Alert variant="error" title="Vardiyalar yüklenemedi">{err}</Alert>}

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
