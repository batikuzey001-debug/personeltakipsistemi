import { useAuth } from "../lib/auth";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();

  function handleLogout() {
    logout();                 // token'ı temizle
    window.location.href = "/login"; // güvenli yönlendirme
  }

  const brand = (import.meta as any).env?.VITE_PANEL_BRAND_NAME || "Personel Panel";

  return (
    <div style={{ display: "grid", gridTemplateRows: "56px 1fr", height: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #eee" }}>
        <strong style={{ marginRight: "auto" }}>{brand}</strong>
        <span style={{ marginRight: 12, fontSize: 12, opacity: 0.7 }}>
          Rol: {auth.role ?? "-"} • {auth.email ?? "-"}
        </span>
        <button onClick={handleLogout}>Çıkış</button>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100%" }}>
        {/* Sidebar ayrı dosyadaysa import dizinini kontrol et */}
        {/* @ts-ignore */}
        { /* eslint-disable-next-line */ }
        {React.createElement(require("../components/Sidebar").default)}
        <main style={{ padding: 16 }}>{children}</main>
      </div>
    </div>
  );
}
