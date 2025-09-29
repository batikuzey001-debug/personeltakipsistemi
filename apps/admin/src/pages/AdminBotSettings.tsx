// apps/admin/src/pages/AdminBotSettings.tsx
import React, { useEffect, useState } from "react";
const API =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  "https://personel-takip-api-production.up.railway.app";

type BotSettings = {
  admin_tasks_tg_enabled: boolean;
  bonus_tg_enabled: boolean;
  finance_tg_enabled: boolean;
  attendance_tg_enabled?: boolean;
};

type KtItem = {
  correlation_id: string;
  employee_id?: string | null;
  origin_ts: string;
  first_ts: string;
  first_sec: number;
};
type KtResp = { threshold_sec: number; count: number; items: KtItem[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const r = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

function ymdIST() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}
function yesterdayIST() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// IST helpers
const IST_TZ = "Europe/Istanbul";
const fmtIST = (iso?: string) =>
  iso
    ? new Intl.DateTimeFormat("tr-TR", {
        timeZone: IST_TZ,
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "—";
const fmtMMSS = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

export default function AdminBotSettings() {
  const [data, setData] = useState<BotSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Manuel tetik formları
  const [dToday, setDToday] = useState(ymdIST());
  const [dYest, setDYest] = useState(yesterdayIST());
  const [shift, setShift] = useState<"Sabah" | "Öğlen" | "Akşam" | "Gece">("Sabah");
  const [slaFirst, setSlaFirst] = useState<number>(60);

  // Bonus 2 saatlik: bitiş (IST) ve uyarı eşiği %
  const [bonus2hEnd, setBonus2hEnd] = useState<string>(""); // YYYY-MM-DDTHH:MM (boş=şimdi)
  const [bonus2hWarn, setBonus2hWarn] = useState<number>(25);

  // Gün içi KT>threshold liste paneli
  const [ktList, setKtList] = useState<KtItem[] | null>(null);
  const [ktTitle, setKtTitle] = useState<string>("");

  async function load() {
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      setData(await api<BotSettings>("/admin-bot/settings"));
    } catch (e: any) {
      setErr(e?.message || "Ayarlar alınamadı");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(partial: Partial<BotSettings>) {
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      const res = await api<BotSettings>("/admin-bot/settings", {
        method: "PUT",
        body: JSON.stringify(partial),
      });
      setData(res);
      setMsg("Ayar kaydedildi.");
    } catch (e: any) {
      setErr(e?.message || "Kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  // Manuel tetik helpers
  async function post(path: string) {
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      await api(path, { method: "POST" });
      setMsg("Tetik gönderildi.");
    } catch (e: any) {
      setErr(e?.message || "Tetik gönderilemedi.");
    } finally {
      setLoading(false);
    }
  }

  // Gün içi İlk KT > threshold listele
  async function fetchKtOver(threshold: number) {
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      const res = await api<KtResp>(`/admin-bot/bonus/kt-over-today?threshold_sec=${threshold}`);
      setKtList(res.items || []);
      setKtTitle(`Gün içi İlk KT > ${threshold} sn — ${res.count} kayıt`);
    } catch (e: any) {
      setErr(e?.message || "Liste alınamadı.");
      setKtList(null);
      setKtTitle("");
    } finally {
      setLoading(false);
    }
  }

  const container: React.CSSProperties = {
    maxWidth: 900,
    margin: "0 auto",
    padding: 16,
    display: "grid",
    gap: 12,
  };
  const card: React.CSSProperties = {
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    display: "grid",
    gap: 10,
  };
  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  };
  const listHead: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 100px 100px 80px",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    color: "#374151",
    padding: "4px 2px",
  };
  const listRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 100px 100px 80px",
    gap: 8,
    fontSize: 12,
    padding: "6px 2px",
    borderTop: "1px solid #f3f4f6",
  };

  return (
    <div style={container}>
      <h1 style={{ margin: 0, fontSize: 20 }}>Bot İşlemleri</h1>

      {/* Toggle ayarları */}
      <div style={card}>
        <div style={row}>
          <div>
            <b>Admin Görevleri Bildirimleri</b>
            <div style={{ fontSize: 12, color: "#666" }}>Tick/Shift/Gün Sonu</div>
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!data?.admin_tasks_tg_enabled}
              onChange={(e) => save({ admin_tasks_tg_enabled: e.target.checked })}
            />{" "}
            {data?.admin_tasks_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
        <div style={row}>
          <div>
            <b>Bonus Bildirimleri</b>
            <div style={{ fontSize: 12, color: "#666" }}>Gün Sonu + 2 Saatlik Özet</div>
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!data?.bonus_tg_enabled}
              onChange={(e) => save({ bonus_tg_enabled: e.target.checked })}
            />{" "}
            {data?.bonus_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
        <div style={row}>
          <div>
            <b>Finans Bildirimleri</b>
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!data?.finance_tg_enabled}
              onChange={(e) => save({ finance_tg_enabled: e.target.checked })}
            />{" "}
            {data?.finance_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
        <div style={row}>
          <div>
            <b>Mesai (Attendance) Bildirimleri</b>
          </div>
          <label>
            <input
              type="checkbox"
              checked={!!data?.attendance_tg_enabled}
              onChange={(e) => save({ attendance_tg_enabled: e.target.checked })}
            />{" "}
            {data?.attendance_tg_enabled ? "Açık" : "Kapalı"}
          </label>
        </div>
      </div>

      {/* Manuel tetikleme */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Manuel Tetikleme</div>

        {/* Bonus Gün Sonu */}
        <div style={row}>
          <div>Bonus Gün Sonu — Tarih (dün varsayılan)</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={dYest} onChange={(e) => setDYest(e.target.value)} />
            <label style={{ fontSize: 12, color: "#666" }}>SLA İlk KT (sn)</label>
            <input
              type="number"
              min={1}
              max={3600}
              value={slaFirst}
              onChange={(e) => setSlaFirst(Math.max(1, Number(e.target.value || 60)))}
              style={{ width: 80 }}
            />
            <button
              onClick={() =>
                post(
                  `/admin-bot/trigger/bonus/daily?d=${encodeURIComponent(
                    dYest
                  )}&sla_first_sec=${slaFirst}`
                )
              }
            >
              Gönder
            </button>
          </div>
        </div>

        {/* Bonus 2 Saatlik Özet */}
        <div style={row}>
          <div>Bonus — 2 Saatlik Özet</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#666" }}>Bitiş (IST) YYYY-MM-DDTHH:MM</label>
            <input
              type="text"
              placeholder="boş= şimdi"
              value={bonus2hEnd}
              onChange={(e) => setBonus2hEnd(e.target.value)}
              style={{ width: 190 }}
            />
            <label style={{ fontSize: 12, color: "#666" }}>SLA İlk KT</label>
            <input
              type="number"
              min={1}
              max={3600}
              value={slaFirst}
              onChange={(e) => setSlaFirst(Math.max(1, Number(e.target.value || 60)))}
              style={{ width: 80 }}
            />
            <label style={{ fontSize: 12, color: "#666" }}>Uyarı Eşiği %</label>
            <input
              type="number"
              min={1}
              max={100}
              value={bonus2hWarn}
              onChange={(e) => setBonus2hWarn(Math.max(1, Number(e.target.value || 25)))}
              style={{ width: 70 }}
            />
            <button
              onClick={() => {
                const qs = new URLSearchParams();
                if (bonus2hEnd.trim()) qs.set("end", bonus2hEnd.trim());
                qs.set("kt30_sec", String(slaFirst)); // backend param ismi: kt30_sec (eşik)
                post(`/admin-bot/trigger/bonus/periodic?${qs.toString()}`);
              }}
            >
              Gönder
            </button>
          </div>
        </div>

        {/* Admin Tasks Gün Sonu */}
        <div style={row}>
          <div>Admin Görevleri — Gün Sonu</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={dYest} onChange={(e) => setDYest(e.target.value)} />
            <button onClick={() => post(`/admin-bot/trigger/admin-tasks/day-end?d=${encodeURIComponent(dYest)}`)}>
              Gönder
            </button>
          </div>
        </div>

        {/* Admin Tasks Vardiya Sonu */}
        <div style={row}>
          <div>Admin Görevleri — Vardiya Sonu</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={shift} onChange={(e) => setShift(e.target.value as any)}>
              <option>Sabah</option>
              <option>Öğlen</option>
              <option>Akşam</option>
              <option>Gece</option>
            </select>
            <input type="date" value={dToday} onChange={(e) => setDToday(e.target.value)} />
            <button
              onClick={() =>
                post(
                  `/admin-bot/trigger/admin-tasks/shift-end?shift=${encodeURIComponent(
                    shift
                  )}&d=${encodeURIComponent(dToday)}`
                )
              }
            >
              Gönder
            </button>
          </div>
        </div>

        {/* Attendance Günlük */}
        <div style={row}>
          <div>Mesai (Attendance) — Günlük Yoklama</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="date" value={dToday} onChange={(e) => setDToday(e.target.value)} />
            <button onClick={() => post(`/admin-bot/trigger/attendance/daily?d=${encodeURIComponent(dToday)}`)}>
              Gönder
            </button>
          </div>
        </div>

        {/* BONUS: Gün içi İlk KT aşımı (30 sn / 60 sn) */}
        <div style={{ ...row, borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
          <div>
            <b>Bonus — Gün içi İlk KT İhlalleri</b>
            <div style={{ fontSize: 12, color: "#666" }}>İlk yanıt (reply_first − origin) süresi eşiği</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fetchKtOver(30)}>&gt; 30 sn</button>
            <button onClick={() => fetchKtOver(60)}>&gt; 60 sn</button>
          </div>
        </div>

        {/* Liste (varsa) */}
        {ktList && (
          <div style={{ border: "1px solid #eef0f4", borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{ktTitle}</div>
            <div style={listHead}>
              <div>Correlation • Personel</div>
              <div>Origin</div>
              <div>İlk KT</div>
              <div>Δ (dk:ss)</div>
            </div>
            {(ktList || []).map((it) => (
              <div key={`${it.correlation_id}-${it.first_ts}`} style={listRow}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.correlation_id} {it.employee_id ? `• ${it.employee_id}` : ""}
                </div>
                <div>{fmtIST(it.origin_ts)}</div>
                <div>{fmtIST(it.first_ts)}</div>
                <div style={{ fontWeight: 700 }}>{fmtMMSS(it.first_sec)}</div>
              </div>
            ))}
            {!ktList.length && <div style={{ fontSize: 12, color: "#6b7280" }}>Kayıt yok.</div>}
          </div>
        )}

        {msg && <div style={{ color: "#0a6d37", fontSize: 12 }}>{msg}</div>}
        {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
      </div>
    </div>
  );
}
