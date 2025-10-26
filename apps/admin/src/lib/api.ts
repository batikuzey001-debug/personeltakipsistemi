// apps/admin/src/lib/api.ts
// ENV:
//   VITE_API_BASE_URL = https://api.domain.com   (veya aynı origin için boş)
//   VITE_API_PREFIX   = /api                     (backend uçları /api altında ise; değilse boş)

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "";
const API_BASE = RAW_BASE.replace(/\/+$/, "");
const API_PREFIX = ((import.meta.env.VITE_API_PREFIX as string) || "").replace(/\/+$/, "");

type Meta = { from?: string; to?: string; generated_at?: string };
export type ApiListResponse<T> = { rows: T[]; total: number; meta: Meta };

function withPrefix(path: string): string {
  const clean = `/${String(path || "").replace(/^\/+/, "")}`;
  return API_PREFIX ? `${API_PREFIX}${clean}` : clean;
}

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

function joinUrl(path: string, params?: Record<string, unknown>) {
  return `${API_BASE}${withPrefix(path)}${buildQuery(params)}`;
}

async function doFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers || {}) } });

  if (!r.ok) {
    // Hata gövdesini öne çıkar
    let msg = `${r.status} ${r.statusText}`;
    try {
      const text = await r.text();
      if (text) msg = text;
    } catch {}
    const err = new Error(msg) as Error & { status?: number };
    (err as any).status = r.status;
    throw err;
  }
  return (await r.json()) as T;
}

async function request<T>(
  path: string,
  params?: Record<string, unknown>,
  init?: RequestInit
): Promise<T> {
  // 1) Normal dene
  let url = joinUrl(path, params);
  try {
    return await doFetch<T>(url, init);
  } catch (e: any) {
    // 2) 404 + /reports/... ise fallback: /report/...
    if (e?.status === 404 && /^\/?reports\//i.test(path.replace(/^\/+/, ""))) {
      const altPath = "/" + path.replace(/^\/+/, "").replace(/^reports\//i, "report/");
      const altUrl = joinUrl(altPath, params);
      try {
        return await doFetch<T>(altUrl, init);
      } catch (e2) {
        throw e2;
      }
    }
    throw e;
  }
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
