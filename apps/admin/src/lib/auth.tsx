import React, { createContext, useContext, useEffect, useState } from "react";

type Role = "super_admin" | "admin" | "manager" | "employee";
type AuthState = { role: Role | null; email: string | null; token: string | null; ready: boolean };

type Ctx = {
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<Ctx | null>(null);
const API = import.meta.env.VITE_API_BASE_URL as string;

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ role: null, email: null, token: null, ready: false });

  // Sayfa yenilemede localStorage'daki token'ı yükle
  useEffect(() => {
    const token = localStorage.getItem("token");
    const email = localStorage.getItem("email");
    const role = localStorage.getItem("role") as Role | null;
    setAuth({ token, email, role, ready: true });
  }, []);

  const login = async (email: string, password: string) => {
    if (!API) throw new Error("API URL tanımlı değil (VITE_API_BASE_URL).");
    const t = await api<{ access_token: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    const me = await api<{ id: number; email: string; role: Role }>("/auth/me", {
      headers: { Authorization: `Bearer ${t.access_token}` }
    });
    localStorage.setItem("token", t.access_token);
    localStorage.setItem("email", me.email);
    localStorage.setItem("role", me.role);
    setAuth({ token: t.access_token, email: me.email, role: me.role, ready: true });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("email");
    localStorage.removeItem("role");
    setAuth({ role: null, email: null, token: null, ready: true });
  };

  return <AuthContext.Provider value={{ auth, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { auth } = useAuth();
  // Token var ama rol henüz yüklenmediyse kısa bir "loading"
  if (!auth.ready) return <div style={{ padding: 24 }}>Yükleniyor…</div>;
  if (!auth.role || !roles.includes(auth.role)) {
    // Yetkisiz → girişe yönlendir
    window.location.replace("/login");
    return null;
  }
  return <>{children}</>;
}
