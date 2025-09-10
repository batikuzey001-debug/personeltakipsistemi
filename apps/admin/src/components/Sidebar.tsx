import { NavLink } from "react-router-dom";

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: "10px 12px",
  borderRadius: 8,
  textDecoration: "none"
};

export default function Sidebar() {
  const items = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/employees", label: "Personeller" },
    { to: "/kpis", label: "KPI'lar" },
    { to: "/scores", label: "Skorlar" }
  ];
  return (
    <aside style={{ width: 220, borderRight: "1px solid #eee", padding: 12 }}>
      <nav>
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            style={({ isActive }) => ({
              ...linkStyle,
              background: isActive ? "#f2f2f2" : "transparent",
              color: "#111"
            })}
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
