// apps/admin/src/lib/api.ts
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";

type Meta = { from?: string; to?: string; generated_at?: string };
export type ApiListResponse<T> = { rows: T[]; total: number; meta: Meta };

function buildQuery(params?: Record<string, unknown>) {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
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
  const controller = new AbortController();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `${API_BASE}${path}${buildQuery(params)}`;
  const r = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers || {}) },
    signal: controller.signal,
  });
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const t = await r.text();
      if (t) msg = t;
    } catch {}
    throw new Error(msg);
  }
  // JSON parse hızlı olsun diye orjson varsa backend zaten application/json döner
  return (await r.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>(path, params, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, undefined, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
};

export { API_BASE };
