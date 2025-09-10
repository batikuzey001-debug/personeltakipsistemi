const API = import.meta.env.VITE_API_BASE_URL as string;

export async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const token = localStorage.getItem("token") || "";
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}
