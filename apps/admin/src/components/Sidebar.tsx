// apps/admin/src/components/Sidebar.tsx
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 8,
  textDecoration: "none",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export default function Sidebar() {
  const { auth } = useAuth();

  const base = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/employees", label: "Personeller" },
  ];

  const adminOnly = [
    { to: "/identities", label: "Kişi Eşleştirme" },
    { to: "/reports/bonus/close-time", label: "Rapor • Bonus Kapanış" },
    { to: "/reports/finance/close-time", label: "Rapor • Finans Kapanış" }, // ← EKLENDİ
    { to: "/users", label: "Kullanıcılar" },
  ];

  const items = auth.role === "super_admin" ? [...base, ...adminOnly] : base;

  return (
    <aside
      style={{
        width: 220,
        borderRight: "1px solid #eee",
        padding: 12,
        boxSizing: "border-box",
        height: "100%",
        overflowY: "auto",
        background: "#fff",
      }}
    >
      <nav>
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            style={({ isActive }) => ({
              ...linkStyle,
              background: isActive ? "#f2f2f2" : "transparent",
              color: "#111",
            })}
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
