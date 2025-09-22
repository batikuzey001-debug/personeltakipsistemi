// apps/admin/src/lib/api.ts
// Neden: API isteklerini tek yerden yönetmek, token eklemek.

export type FinanceCloseRow = {
  employee_id: string;
  employee_name: string;
  count: number;
  avg_first_response_sec?: number | null;
  avg_resolution_sec?: number | null;
  trend_pct?: number | null;
  profile_url?: string | null;
};

export type FinanceCloseReport = {
  range_from: string; // ISO
  range_to: string;   // ISO (exclusive)
  total_records: number;
  rows: FinanceCloseRow[];
};

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  // Neden: Lokal geliştirme için yedek.
  "https://personel-takip-api-production.up.railway.app";

function authHeaders() {
  const token = localStorage.getItem("token");
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function fetchFinanceCloseTime(params: {
  frm?: string; // YYYY-MM-DD
  to?: string;  // YYYY-MM-DD (exclusive)
  order?:
    | "cnt_desc"
    | "cnt_asc"
    | "first_asc"
    | "first_desc"
    | "res_asc"
    | "res_desc"
    | "name_asc"
    | "name_desc";
  limit?: number; // 1..500
}): Promise<FinanceCloseReport> {
  const qs = new URLSearchParams();
  if (params.frm) qs.set("frm", params.frm);
  if (params.to) qs.set("to", params.to);
  if (params.order) qs.set("order", params.order);
  if (params.limit) qs.set("limit", String(params.limit));

  const res = await fetch(
    `${API_BASE}/reports/finance/close-time?${qs.toString()}`,
    { headers: { "Content-Type": "application/json", ...authHeaders() } }
  );
  if (!res.ok) {
    // Neden: Eksik token / 422 / 500 hataları hızlı teşhis için.
    const text = await res.text();
    throw new Error(`Finance report failed (${res.status}): ${text}`);
  }
  return (await res.json()) as FinanceCloseReport;
}

export function secondsToHms(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sec = Math.max(0, Math.round(value));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function downloadCsv(rows: FinanceCloseRow[], filename = "finance_report.csv") {
  const header = [
    "employee_id",
    "employee_name",
    "count",
    "avg_first_response_sec",
    "avg_resolution_sec",
    "trend_pct",
    "profile_url",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const vals = [
      r.employee_id,
      r.employee_name?.replaceAll(",", " "),
      String(r.count ?? ""),
      r.avg_first_response_sec != null ? String(Math.round(r.avg_first_response_sec)) : "",
      r.avg_resolution_sec != null ? String(Math.round(r.avg_resolution_sec)) : "",
      r.trend_pct != null ? String(r.trend_pct) : "",
      r.profile_url ?? "",
    ];
    lines.push(vals.join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}
