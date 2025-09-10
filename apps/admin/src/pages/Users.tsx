import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/apiClient";

type Role = "super_admin" | "admin" | "manager" | "employee";
type User = { id: number; email: string; role: Role; team_scope_id: number | null; is_active: boolean };

export default function Users() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rows, setRows] = useState<User[]>([]);

  async function load() {
    try {
      const data = await apiGet<User[]>("/users");
      setRows(data);
    } catch (e: any) {
      setErr(e?.message || "Liste alınamadı");
    }
  }

  useEffect(() => { load(); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!email || !password) { setErr("E-posta ve parola zorunludur."); return; }
    setLoading(true);
    try {
      await apiPost<User>("/users", { email, password, role });
      setOk("Kullanıcı oluşturuldu.");
      setEmail(""); setPassword(""); setRole("admin");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Oluşturma başarısız.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1>Kullanıcılar</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto", gap: 8, alignItems: "center" }}>
        <input placeholder="E-posta" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input placeholder="Parola" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        <select value={role} onChange={(e)=>setRole(e.target.value as Role)}>
          <option value="admin">admin</option>
          <option value="manager">manager</option>
          <option value="employee">employee</option>
          <option value="super_admin">super_admin</option>
        </select>
        <button type="submit" disabled={loading}>{loading ? "Kaydediliyor…" : "Kullanıcı Ekle"}</button>
      </form>

      {err && <div style={{ color: "#b00020", fontSize: 12 }}>{err}</div>}
      {ok && <div style={{ color: "green", fontSize: 12 }}>{ok}</div>}

      <div style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={{ textAlign: "left", padding: 8 }}>ID</th>
              <th style={{ textAlign: "left", padding: 8 }}>E-posta</th>
              <th style={{ textAlign: "left", padding: 8 }}>Rol</th>
              <th style={{ textAlign: "left", padding: 8 }}>Aktif</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid #f1f1f1" }}>
                <td style={{ padding: 8 }}>{r.id}</td>
                <td style={{ padding: 8 }}>{r.email}</td>
                <td style={{ padding: 8 }}>{r.role}</td>
                <td style={{ padding: 8 }}>{r.is_active ? "✅" : "❌"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 12, color: "#777" }}>Kayıt yok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
