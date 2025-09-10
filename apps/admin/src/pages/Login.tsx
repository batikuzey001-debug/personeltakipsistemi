import { FormEvent, useState } from "react";
import { useAuth } from "@lib/auth";
import { useLocation, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("superadmin@example.com");
  const [password, setPassword] = useState("123456");
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/dashboard";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await login(email, password);
    nav(from, { replace: true });
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <form onSubmit={onSubmit} style={{ width: 360, padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Giriş (Mock)</h2>
        <label style={{ display: "block", marginBottom: 8 }}>
          E-posta
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          Parola
          <input
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        <button type="submit" style={{ width: "100%", padding: 10, marginTop: 12 }}>
          Giriş Yap
        </button>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
          Not: Şimdilik mock giriş; otomatik olarak <b>super_admin</b> rolü atanır.
        </p>
      </form>
    </div>
  );
}
