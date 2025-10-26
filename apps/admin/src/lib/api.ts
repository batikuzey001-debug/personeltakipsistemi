// apps/admin/src/lib/api.ts
// Tek noktadan API erişimi + path join + opsiyonel prefix
// ENV:
//   VITE_API_BASE_URL = https://api.domain.com   (ya da aynı origin için boş)
//   VITE_API_PREFIX   = /api                     (backend uçları /api altında ise; root'taysa boş bırak)

// Base ve prefix'te sondaki / işaretlerini temizle
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "";
const API_BASE = RAW_BASE.replace(/\/+$/, "");
const API_PREFIX = ((import.meta.env.VITE_API_PREFIX as string) || "").replace(/\/+$/, "");

type Meta = { from?: string; to?: string; generated_at?: string };
export type ApiListResponse<T> = { rows: T[]; total: number; meta: Meta };

/** path'i güvenle birleştir: "/reports/daily" -> "/api/reports/daily" (prefix varsa) */
function withPrefix(path: string): string {
  const clean = `/${String(path || "").replace(/^\/+/, "")}`;
  return API_PREFIX ? `${API_PREFIX}${clean}` : clean;
}

/** boş/undefined/null query paramlarını atla, string'e çevir */
function buildQuery(params?: Record<string, unknown>) {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function request<T>(
  path: string,
  params?: Record<string, unknown>,
  init?: RequestInit
): Promise<T> {
  const token = localStorage.getItem("token") || "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Eğer API_BASE boşsa (aynı origin) sadece prefix+path kullanılır
  const url = `${API_BASE}${withPrefix(path)}${buildQuery(params)}`;

  const r = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
  });

  if (!r.ok) {
    // Hata gövdesini göstermeye çalış
    let msg = `${r.status} ${r.statusText}`;
    try {
      const text = await r.text();
      if (text) msg = text;
    } catch {}
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>(path, params, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, undefined, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, undefined, {
      method: "PUT",
      body: body != null ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>(path, params, { method: "DELETE" }),
};

export { API_BASE, API_PREFIX };
