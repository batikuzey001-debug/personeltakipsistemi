import { FormEvent, useState } from "react";
import { useAuth } from "../lib/auth";
import { useLocation, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || "/dashboard";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (e: any) {
      setErr(e?.message || "Giriş başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <form onSubmit={onSubmit} style={{ width: 360, padding: 24, border: "1px solid #eee", borderRadius: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>Giriş</h2>

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

        <button type="submit" disabled={loading} style={{ width: "100%", padding: 10, marginTop: 12 }}>
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>

        {err && (
          <div style={{ marginTop: 10, color: "#b00020", fontSize: 12 }}>
            {err}
          </div>
        )}

        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 12 }}>
          Not: API adresi <code>VITE_API_BASE_URL</code> ile yapılandırılır.
        </p>
      </form>
    </div>
  );
}
