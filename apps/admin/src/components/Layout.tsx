// apps/admin/src/components/Layout.tsx
import React from "react";
import { NavLink } from "react-router-dom"; // ← menü linkleri için
import { useAuth } from "../lib/auth";
import Sidebar from "./Sidebar";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { auth, logout } = useAuth();
  const brand = (import.meta as any).env?.VITE_PANEL_BRAND_NAME || "Personel Panel";

  return (
    <div style={{ display: "grid", gridTemplateRows: "56px 1fr", height: "100vh" }}>
      {/* Üst Bar */}
      <header style={{ display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #eee" }}>
        <strong style={{ marginRight: "auto" }}>{brand}</strong>
        <span style={{ marginRight: 12, fontSize: 12, opacity: 0.7 }}>
          Rol: {auth.role ?? "-"} • {auth.email ?? "-"}
        </span>
        <button
          onClick={() => {
            logout();
            window.location.href = "/login";
          }}
        >
          Çıkış
        </button>
      </header>

      {/* İçerik Alanı */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", height: "100%" }}>
        {/* Sidebar + Ek Rapor Linkleri */}
        <div style={{ borderRight: "1px solid #eee", height: "100%", overflowY: "auto" }}>
          <Sidebar />
          {/* Bonus/Finans raporları için sabit menü bölümü (Sidebar'a ek) */}
          <div style={{ padding: 12, borderTop: "1px solid #eee" }}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>Raporlar</div>
            <nav style={{ display: "grid", gap: 6 }}>
              <NavLink
                to="/reports/bonus/close-time"
                style={({ isActive }) => ({
                  padding: "8px 10px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: isActive ? "#111" : "#333",
                  background: isActive ? "#e9eefc" : "transparent",
                })}
              >
                Bonus Raporu
              </NavLink>
              <NavLink
                to="/reports/finance/close-time"
                style={({ isActive }) => ({
                  padding: "8px 10px",
                  borderRadius: 8,
                  textDecoration: "none",
                  color: isActive ? "#111" : "#333",
                  background: isActive ? "#e9eefc" : "transparent",
                })}
              >
                Finans Raporu
              </NavLink>
            </nav>
          </div>
        </div>

        {/* Sayfa İçeriği */}
        <main style={{ padding: 16 }}>{children}</main>
      </div>
    </div>
  );
}
