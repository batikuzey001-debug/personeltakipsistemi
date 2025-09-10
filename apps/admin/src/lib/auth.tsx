import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

type Role = "super_admin" | "admin" | "manager" | "employee";
type AuthState = { role: Role | null; email: string | null };

type Ctx = {
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ role: null, email: null });

  useEffect(() => {
    const role = localStorage.getItem("role") as Role | null;
    const email = localStorage.getItem("email");
    if (role) setAuth({ role, email: email ?? null });
  }, []);

  const login = async (email: string, _password: string) => {
    // Neden: v1'de mock; gerçek API gelince burası değişecek.
    localStorage.setItem("role", "super_admin");
    localStorage.setItem("email", email);
    setAuth({ role: "super_admin", email });
  };

  const logout = () => {
    localStorage.removeItem("role");
    localStorage.removeItem("email");
    setAuth({ role: null, email: null });
  };

  return (
    <AuthContext.Provider value={{ auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider missing");
  return ctx;
}

export function RequireRole({
  roles,
  children
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { auth } = useAuth();
  const location = useLocation();
  if (!auth.role || !roles.includes(auth.role)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

export function useLogoutRedirect() {
  const nav = useNavigate();
  const { logout } = useAuth();
  return () => {
    logout();
    nav("/login", { replace: true });
  };
}
