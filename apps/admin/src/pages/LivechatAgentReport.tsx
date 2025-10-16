// apps/admin/src/pages/LivechatAgentReport.tsx
import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

type Row = {
  agent_email: string;
  total_chats: number;
  first_response_time_sec: number | null;  // FRT
  avg_response_time_sec: number | null;    // ART (gün geneli)
  avg_handle_time_sec: number | null;      // AHT
  csat_percent: number | null;
  csat_good?: number | null;
  csat_bad?: number | null;
  csat_total?: number | null;
  logged_in_hours?: number;
  accepting_hours?: number;
  not_accepting_hours?: number;
  chatting_hours?: number;
  transfer_out?: number;
  supervised_chats?: number;
  internal_msg_count?: number;
};

function fmtSec(v: number | null | undefined) {
  if (v == null || isNaN(v as number)) return "-";
  const s = Math.round(Number(v));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtH(v?: number | null) {
  if (v == null || isNaN(v as number)) return "-";
  return Number(v).toFixed(2);
}

export default function LivechatAgentReport() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`${API}/report/daily?date=${date}`);
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setRows((j?.rows || []) as Row[]);
    } catch (e: any) {
      setErr(e?.message || "Hata");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const f = (rows || []).filter(x =>
      q ? x.agent_email.toLowerCase().includes(q.toLowerCase()) : true
    );
    return f.sort((a, b) => (b.total_chats || 0) - (a.total_chats || 0));
  }, [rows, q]);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-3">Rapor • Canlı Destek (Günlük)</h1>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border px-2 py-1"/>
        <button onClick={load} className="border px-3 py-1">Yenile</button>
        <input
          placeholder="E-posta ara"
          value={q}
          onChange={e=>setQ(e.target.value)}
          className="border px-2 py-1 ml-auto"
          style={{minWidth:220}}
        />
      </div>

      {loading && <div>Yükleniyor…</div>}
      {err && <div className="mb-2" style={{color:"#b91c1c"}}>Hata: {err}</div>}

      <table className="w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 text-left">Agent (e-posta)</th>
            <th className="p-2 text-center">Chat</th>
            <th className="p-2 text-center">FRT</th>
            <th className="p-2 text-center">ART</th>
            <th className="p-2 text-center">AHT</th>
            <th className="p-2 text-center">CSAT %</th>
            <th className="p-2 text-center">İyi/Kötü</th>
            <th className="p-2 text-center">Online h</th>
            <th className="p-2 text-center">Accepting h</th>
            <th className="p-2 text-center">Not-accepting h</th>
            <th className="p-2 text-center">Chatting h</th>
            <th className="p-2 text-center">Transfer-out</th>
            <th className="p-2 text-center">Supervise</th>
            <th className="p-2 text-center">İç yazışma</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(r => (
            <tr key={r.agent_email} className="border-t">
              <td className="p-2">{r.agent_email}</td>
              <td className="p-2 text-center">{r.total_chats ?? 0}</td>
              <td className="p-2 text-center">{fmtSec(r.first_response_time_sec)}</td>
              <td className="p-2 text-center">{fmtSec(r.avg_response_time_sec)}</td>
              <td className="p-2 text-center">{fmtSec(r.avg_handle_time_sec)}</td>
              <td className="p-2 text-center">
                {r.csat_percent != null ? `${r.csat_percent.toFixed(2)}%` : "-"}
              </td>
              <td className="p-2 text-center">
                {(r.csat_good ?? 0)}/{(r.csat_bad ?? 0)}
              </td>
              <td className="p-2 text-center">{fmtH(r.logged_in_hours)}</td>
              <td className="p-2 text-center">{fmtH(r.accepting_hours)}</td>
              <td className="p-2 text-center">{fmtH(r.not_accepting_hours)}</td>
              <td className="p-2 text-center">{fmtH(r.chatting_hours)}</td>
              <td className="p-2 text-center">{r.transfer_out ?? 0}</td>
              <td className="p-2 text-center">{r.supervised_chats ?? 0}</td>
              <td className="p-2 text-center">{r.internal_msg_count ?? 0}</td>
            </tr>
          ))}
          {!loading && !err && filtered.length === 0 && (
            <tr><td className="p-2 text-center" colSpan={14}>Kayıt yok</td></tr>
          )}
        </tbody>
      </table>

      <div className="text-xs text-gray-500 mt-2">
        Kaynak: Reports API v3.6 + Chat Summary v3.5 • Gün: {date}
      </div>
    </div>
  );
}
