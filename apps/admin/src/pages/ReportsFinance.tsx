// apps/admin/src/pages/ReportsFinance.tsx
import { useEffect, useMemo, useState } from "react";
import {
  fetchFinanceCloseTime,
  secondsToHms,
  downloadCsv,
  type FinanceCloseRow,
} from "../lib/api";

// Neden: Tarih input defaultlarını “son 7 gün”e ayarlamak.
function defaultRange() {
  const to = new Date(); // bugün
  const frm = new Date(to);
  frm.setDate(to.getDate() - 6);
  // YYYY-MM-DD
  const f = frm.toISOString().slice(0, 10);
  const t = to.toISOString().slice(0, 10);
  return { frm: f, to: t };
}

const ORDERS = [
  { v: "cnt_desc", l: "İşlem ↓" },
  { v: "cnt_asc", l: "İşlem ↑" },
  { v: "first_asc", l: "İlk Yanıt ↓" },
  { v: "first_desc", l: "İlk Yanıt ↑" },
  { v: "res_asc", l: "Sonuçlandırma ↓" },
  { v: "res_desc", l: "Sonuçlandırma ↑" },
  { v: "name_asc", l: "İsim A→Z" },
  { v: "name_desc", l: "İsim Z→A" },
] as const;

export default function ReportsFinance() {
  const d = defaultRange();
  const [frm, setFrm] = useState(d.frm);
  const [to, setTo] = useState(d.to);
  const [order, setOrder] = useState<typeof ORDERS[number]["v"]>("cnt_desc");
  const [limit, setLimit] = useState(200);
  const [rows, setRows] = useState<FinanceCloseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canFetch = useMemo(() => !!frm && !!to, [frm, to]);

  async function load() {
    if (!canFetch) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchFinanceCloseTime({
        frm,
        // API 'to' paramı exclusive; kullanıcıya anlaşılır olması için aynı günü veririz.
        to,
        order,
        limit,
      });
      setRows(data.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Finans Raporu — Kapanış Süreleri</h1>
        <p className="text-sm opacity-70">
          Kanal: <b>finans</b> · Departman filtreli: <b>Finans</b> · Kayıtlar: kapanışı olan iş parçaları
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">Başlangıç (frm)</label>
          <input
            type="date"
            className="w-full rounded-md border px-3 py-2 bg-white/5"
            value={frm}
            onChange={(e) => setFrm(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Bitiş (to)</label>
          <input
            type="date"
            className="w-full rounded-md border px-3 py-2 bg-white/5"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Sıralama</label>
          <select
            className="w-full rounded-md border px-3 py-2 bg-white/5"
            value={order}
            onChange={(e) => setOrder(e.target.value as any)}
          >
            {ORDERS.map((o) => (
              <option key={o.v} value={o.v}>
                {o.l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">Limit</label>
          <input
            type="number"
            min={1}
            max={500}
            className="w-full rounded-md border px-3 py-2 bg-white/5"
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value || 1))))}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="rounded-md px-4 py-2 border shadow hover:opacity-90"
            disabled={loading || !canFetch}
            title="Filtrelerle getir"
          >
            {loading ? "Yükleniyor..." : "Raporu Getir"}
          </button>
          <button
            onClick={() => downloadCsv(rows, "finance_report.csv")}
            className="rounded-md px-4 py-2 border shadow hover:opacity-90"
            disabled={!rows.length}
            title="CSV olarak indir"
          >
            CSV İndir
          </button>
        </div>
      </section>

      {err && (
        <div className="p-3 rounded-md border border-red-400/50 bg-red-500/10 text-red-200">
          {err}
        </div>
      )}

      <section className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left bg-white/5">
            <tr>
              <th className="p-2">Personel</th>
              <th className="p-2">İşlem</th>
              <th className="p-2">Ø İlk Yanıt</th>
              <th className="p-2">Ø Sonuçlandırma</th>
              <th className="p-2">Trend</th>
              <th className="p-2">Profil</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length && !loading ? (
              <tr>
                <td className="p-3 opacity-70" colSpan={6}>
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-white/10">
                  <td className="p-2">{r.employee_name} <span className="opacity-60">({r.employee_id})</span></td>
                  <td className="p-2">{r.count}</td>
                  <td className="p-2">{secondsToHms(r.avg_first_response_sec)}</td>
                  <td className="p-2">{secondsToHms(r.avg_resolution_sec)}</td>
                  <td className="p-2">
                    {r.trend_pct == null ? "—" : (
                      <span className={Number(r.trend_pct) >= 0 ? "text-green-400" : "text-red-400"}>
                        {r.trend_pct}%
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.profile_url ? (
                      <a className="underline" href={r.profile_url}>Aç</a>
                    ) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
