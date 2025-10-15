import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

export default function LivechatAgentReport() {
  const [rows, setRows] = useState<any[]>([]);
  const [from, setFrom] = useState<string>(new Date(Date.now()-7*864e5).toISOString().slice(0,10));
  const [to, setTo] = useState<string>(new Date().toISOString().slice(0,10));

  const load = async () => {
    const r = await fetch(`${API}/report/agents/summary?date_from=${from}&date_to=${to}`);
    const j = await r.json();
    setRows(j.rows || []);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Canlı Destek Raporu</h1>
      <div className="flex gap-2 mb-3">
        <input type="date" value={from} onChange={e=>setFrom(e.target.value)} className="border px-2 py-1"/>
        <input type="date" value={to} onChange={e=>setTo(e.target.value)} className="border px-2 py-1"/>
        <button onClick={load} className="border px-3 py-1">Yenile</button>
      </div>
      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Agent</th>
            <th className="p-2">Chat</th>
            <th className="p-2">FRT (sn)</th>
            <th className="p-2">ART (sn)</th>
            <th className="p-2">AHT (sn)</th>
            <th className="p-2">CSAT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.agent_id} className="border-t">
              <td className="p-2">{r.name || r.agent_id}</td>
              <td className="p-2 text-center">{r.total_chats}</td>
              <td className="p-2 text-center">{r.first_response_time_sec ?? "-"}</td>
              <td className="p-2 text-center">{r.avg_response_time_sec ?? "-"}</td>
              <td className="p-2 text-center">{r.avg_handle_time_sec ?? "-"}</td>
              <td className="p-2 text-center">{r.csat_avg?.toFixed?.(2) ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
