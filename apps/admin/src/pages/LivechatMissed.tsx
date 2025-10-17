// =============================
// 1) apps/admin/src/pages/LivechatMissed.tsx
// =============================
import { useEffect, useMemo, useState } from "react";

const API = import.meta.env.VITE_API_BASE_URL as string;

type MissedRow = {
  chat_id: string;
  agent_email: string;
  missed_duration_sec: number | null;
  started_at: string | null;
  ended_at: string | null;
};

type MissedResp = {
  date: string;
  agent: string;
  count: number;
  rows: MissedRow[];
};

type AgentItem = { email: string; name?: string; role?: string };

function fmtSec(v: number | null | undefined) {
  if (v == null || isNaN(v as number)) return "-";
  const s = Math.round(Number(v));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function LivechatMissed() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [agent, setAgent] = useState("");
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const [resp, setResp] = useState<MissedResp | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadAgents() {
    try {
      const r = await fetch(`${API}/livechat/agents`);
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.items || j.agents || []);
      const mapped: AgentItem[] = (arr || [])
        .map((a: any) => ({ email: a.id || a.email, name: a.name || "", role: a.role || "" }))
        .filter(a => a.email && a.email.includes("@"));
      setAgents(mapped);
    } catch {
      // sessiz
    }
  }

  async function load() {
    if (!agent || !agent.includes("@")) {
      setErr("Lütfen ajan e-postası seçin.");
      return;
    }
    setLoading(true); setErr(null);
    try {
      const url = `${API}/report/missed/details?date=${encodeURIComponent(date)}&agent=${encodeURIComponent(agent)}&limit=500`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      const j = (await r.json()) as MissedResp;
      setResp(j);
    } catch (e: any) {
      setErr(e?.message || "Yüklenemedi");
      setResp(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAgents(); }, []);

  const filtered = useMemo(() => {
    const rows = resp?.rows || [];
    if (!q) return rows;
    const k = q.toLowerCase();
    return rows.filter(r =>
      (r.chat_id || "").toLowerCase().includes(k) ||
      (r.started_at || "").toLowerCase().includes(k) ||
      (r.ended_at || "").toLowerCase().includes(k)
    );
  }, [resp, q]);

  return (
    <div className="p-4" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 className="text-xl font-semibold mb-3">Canlı Destek • Missed Detay</h1>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border px-2 py-1"/>
        <input
          list="lc-agents"
          placeholder="Ajan e-posta"
          value={agent}
          onChange={e=>setAgent(e.target.value)}
          className="border px-2 py-1"
          style={{ minWidth: 280 }}
        />
        <datalist id="lc-agents">
          {agents.map(a => <option key={a.email} value={a.email}>{a.name ? `${a.name} (${a.role||""})` : a.email}</option>)}
        </datalist>
        <button onClick={load} className="border px-3 py-1">Yükle</button>

        <input
          placeholder="Tabloda ara (chat_id / tarih)"
          value={q}
          onChange={e=>setQ(e.target.value)}
          className="border px-2 py-1 ml-auto"
          style={{ minWidth: 260 }}
        />
      </div>

      {loading && <div>Yükleniyor…</div>}
      {err && <div className="mb-2" style={{ color: "#b91c1c" }}>Hata: {err}</div>}

      <div className="mb-2 text-sm text-gray-600">
        Tarih: <b>{date}</b>{agent ? <> • Agent: <b>{agent}</b></> : null}
        {resp ? <> • Kayıt: <b>{resp.count}</b></> : null}
      </div>

      <div className="border rounded overflow-hidden bg-white">
        <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Chat ID</th>
              <th className="p-2 text-left">Başlangıç</th>
              <th className="p-2 text-left">Bitiş</th>
              <th className="p-2 text-center">Missed Süre</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.chat_id} style={{ borderTop: "1px solid #eee" }}>
                <td className="p-2">{r.chat_id}</td>
                <td className="p-2">{r.started_at ?? "-"}</td>
                <td className="p-2">{r.ended_at ?? "-"}</td>
                <td className="p-2 text-center">{fmtSec(r.missed_duration_sec)}</td>
              </tr>
            ))}
            {!loading && !err && filtered.length === 0 && (
              <tr><td className="p-2 text-center" colSpan={4}>Kayıt yok</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        Kaynak: v3.5 list_chats + list_threads • Gün: {date}
      </div>
    </div>
  );
}

// =============================
// 2) apps/admin/src/App.tsx  → route ekleyin
// =============================
// import satırlarına ekleyin:
import LivechatMissed from "./pages/LivechatMissed";

// <Routes> içinde uygun yere ekleyin (Protected + Layout ile):
// <Route path="/livechat/missed" element={<Protected><Layout><LivechatMissed /></Layout></Protected>} />

// =============================
// 3) apps/admin/src/components/Sidebar.tsx  → menüye ekleyin
// =============================
// base/adminOnly dizilerine uygun bir yere ekleyin:
{ /* Örn. adminOnly dizisine: */ }
// { to: "/livechat/missed", label: "Canlı Destek • Missed" }
