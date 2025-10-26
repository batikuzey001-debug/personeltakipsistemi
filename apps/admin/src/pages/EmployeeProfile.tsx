// apps/admin/src/pages/EmployeeProfile.tsx
import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, ApiListResponse } from "../lib/api";
import Loading from "../components/Loading";
import Alert from "../components/Alert";
import Table, { Column } from "../components/Table";
import ExportCSVButton from "../components/ExportCSVButton";
import { formatPercent, formatSecondsToMmSs, formatTL } from "../lib/format";
import { deptLabels, roleLabels, labelOf } from "../lib/labels";

type Employee = {
  id: number;
  code: string;
  name: string;
  dept: string;
  role: string;
  status: string;
  created_at?: string;
  last_active_at?: string;
  [k: string]: any;
};

type StatKpis = {
  range_from?: string;
  range_to?: string;
  handled_count?: number;
  missed_count?: number;
  avg_first_sec?: number;
  avg_close_sec?: number;
  availability_rate?: number;
  approve_rate?: number;
  reject_rate?: number;
  total_amount?: number;
  avg_amount?: number;
  [k: string]: any;
};

type EventRow = {
  ts?: string;
  type?: string;
  message?: string;
  correlation_id?: string;
  actor_employee_name?: string;
  actor_employee_code?: string;
  [k: string]: any;
};

const PATH_EMP = (id: number) => `/employees/${id}`;
const PATH_EMP_BY_CODE = (code: string) => `/employees/by-code/${encodeURIComponent(code)}`;
const PATH_STATS = (id: number) => `/employees/${id}/stats`;
const PATH_EVENTS = (id: number) => `/employees/${id}/events`;

function useEmployeeIdentifier() {
  const [params] = useSearchParams();
  const idParam = params.get("id");
  const codeParam = params.get("code");
  const id = idParam ? Number(idParam) : undefined;
  const code = codeParam || undefined;
  return { id, code };
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

export default function EmployeeProfile() {
  const { id: idFromUrl, code: codeFromUrl } = useEmployeeIdentifier();

  const [loadingEmp, setLoadingEmp] = useState(false);
  const [empErr, setEmpErr] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const [loadingStats, setLoadingStats] = useState(false);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [stats, setStats] = useState<StatKpis | null>(null);

  const [loadingEv, setLoadingEv] = useState(false);
  const [evErr, setEvErr] = useState<string | null>(null);
  const [events, setEvents] = useState<ApiListResponse<EventRow> | null>(null);

  // 1) Çalışan
  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!idFromUrl && !codeFromUrl) return;
      setLoadingEmp(true);
      setEmpErr(null);
      try {
        const emp: Employee = idFromUrl
          ? await api.get<Employee>(PATH_EMP(idFromUrl))
          : await api.get<Employee>(PATH_EMP_BY_CODE(codeFromUrl!));
        if (!mounted) return;
        setEmployee(emp);
      } catch (e: any) {
        if (!mounted) return;
        setEmpErr(e?.message || "Çalışan bulunamadı");
      } finally {
        mounted && setLoadingEmp(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [idFromUrl, codeFromUrl]);

  const empId = employee?.id;

  // 2) KPI
  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!empId) return;
      setLoadingStats(true);
      setStatsErr(null);
      try {
        const s = await api.get<StatKpis>(PATH_STATS(empId), { tz: "Europe/Istanbul" });
        if (!mounted) return;
        setStats(s);
      } catch (e: any) {
        if (!mounted) return;
        setStatsErr(e?.message || "İstatistikler alınamadı");
      } finally {
        mounted && setLoadingStats(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [empId]);

  // 3) Olaylar
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    let mounted = true;
    async function run() {
      if (!empId) return;
      setLoadingEv(true);
      setEvErr(null);
      try {
        const resp = await api.get<ApiListResponse<EventRow>>(PATH_EVENTS(empId), {
          limit, offset, order: "-ts", tz: "Europe/Istanbul",
        });
        if (!mounted) return;
        setEvents(resp);
      } catch (e: any) {
        if (!mounted) return;
        setEvErr(e?.message || "Olaylar alınamadı");
      } finally {
        mounted && setLoadingEv(false);
      }
    }
    run();
    return () => { mounted = false; };
  }, [empId, limit, offset]);

  const columns: Column<EventRow>[] = [
    { key: "ts", header: "Zaman", width: 180, render: (r) => (r.ts ? isoToLocal(r.ts) : "") },
    { key: "type", header: "Tip", width: 140 },
    {
      key: "message",
      header: "Mesaj",
      render: (r) => (
        <span style={{ display: "inline-block", maxWidth: 520, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {r.message || ""}
        </span>
      ),
    },
    { key: "correlation_id", header: "Korelasyon", width: 160 },
  ];

  const evRows = events?.rows || [];
  const evTotal = events?.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < evTotal;

  if (!idFromUrl && !codeFromUrl) {
    return (
      <div>
        <Alert variant="info" title="Profil seçilmedi">
          Profil görmek için önce <Link to="/personel?tab=list">Personel &gt; Liste</Link> sekmesinden bir çalışan seçin.
          Alternatif: URL’ye <code>?id=123</code> veya <code>?code=RD-001</code> ekleyebilirsiniz.
        </Alert>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Başlık */}
      <section>
        <h2 style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".3px", marginBottom: 8 }}>Çalışan Profili</h2>
        {loadingEmp && <Loading label="Profil yükleniyor…" />}
        {empErr && <Alert variant="error" title="Profil alınamadı">{empErr}</Alert>}
        {employee && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 10,
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
            }}
          >
            <Field label="Ad Soyad" value={employee.name} />
            <Field label="Kod" value={employee.code} />
            <Field label="Departman" value={labelOf(deptLabels, employee.dept)} />
            <Field label="Rol" value={labelOf(roleLabels, employee.role)} />
            <Field label="Durum" value={employee.status} />
            <Field label="Oluşturulma" value={isoToLocal(employee.created_at)} />
            <Field label="Son Aktivite" value={isoToLocal(employee.last_active_at)} />
          </div>
        )}
      </section>

      {/* KPI kartları */}
      <section>
        <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>KPI Özet</h3>
        {loadingStats && <Loading label="KPI'lar yükleniyor…" />}
        {statsErr && <Alert variant="error" title="KPI alınamadı">{statsErr}</Alert>}
        {stats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
            <Kpi title="Sonuçlanan" value={stats.handled_count ?? 0} />
            <Kpi title="Kaçırılan" value={stats.missed_count ?? 0} />
            <Kpi title="Ø İlk Yanıt" value={stats.avg_first_sec != null ? formatSecondsToMmSs(stats.avg_first_sec) : ""} />
            <Kpi title="Ø Sonuçlandırma" value={stats.avg_close_sec != null ? formatSecondsToMmSs(stats.avg_close_sec) : ""} />
            <Kpi title="Ulaşılabilirlik" value={formatPercent(stats.availability_rate)} />
            <Kpi title="Onay Oranı" value={formatPercent(stats.approve_rate)} />
            <Kpi title="Ret Oranı" value={formatPercent(stats.reject_rate)} />
            <Kpi title="Toplam Tutar" value={formatTL(stats.total_amount)} />
            <Kpi title="Ø Tutar" value={formatTL(stats.avg_amount)} />
          </div>
        )}
        {stats?.range_from && stats?.range_to && (
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>
            Aralık: {stats.range_from} → {stats.range_to}
          </div>
        )}
      </section>

      {/* Son Olaylar */}
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>Son Olaylar</h3>
          <div style={{ flex: 1 }} />
          <ExportCSVButton filename={`employee-${employee?.code || empId}-events`} rows={evRows} />
        </div>
        {loadingEv && <Loading label="Olaylar yükleniyor…" />}
        {evErr && <Alert variant="error" title="Olaylar alınamadı">{evErr}</Alert>}
        <Table columns={columns} data={evRows} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <button disabled={!hasPrev} onClick={() => hasPrev && setOffset(Math.max(0, offset - limit))} style={navBtnStyle(!hasPrev)}>◀ Önceki</button>
          <button disabled={!hasNext} onClick={() => hasNext && setOffset(offset + limit)} style={navBtnStyle(!hasNext)}>Sonraki ▶</button>
          <div style={{ marginLeft: 8, opacity: 0.7 }}>
            Toplam: {evTotal} • Gösterilen: {evRows.length} • Offset: {offset}
          </div>
          <div style={{ marginLeft: "auto" }}>
            <label style={{ fontSize: 12, opacity: 0.7, marginRight: 6 }}>Sayfa boyutu:</label>
            <select
              value={String(limit)}
              onChange={(e) => { setOffset(0); setLimit(Number(e.target.value)); }}
              style={{ padding: "6px 8px", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }}
            >
              {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 10, padding: 10, background: "#fafafa", minHeight: 56 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 700 }}>{value ?? ""}</div>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value?: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff", minHeight: 72 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{value ?? "-"}</div>
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
