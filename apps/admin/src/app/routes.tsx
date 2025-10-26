// apps/admin/src/app/routes.tsx
import { Navigate } from "react-router-dom";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Reports from "../pages/Reports";
import Personel from "../pages/Personel";

export const routes = [
  // Esas rotalar
  { path: "/login", element: <Login /> },
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/reports", element: <Reports /> },
  { path: "/personel", element: <Personel /> },

  // Geri uyumluluk (eski linkler)
  { path: "/employees", element: <Navigate to="/personel" replace /> },
  { path: "/reports/daily", element: <Navigate to="/reports?tab=daily" replace /> },
  { path: "/reports/livechat", element: <Navigate to="/reports?tab=livechat" replace /> },

  // Kökten dashboard'a
  { path: "/", element: <Navigate to="/dashboard" replace /> },

  // 404 -> dashboard (istersen /404 yaparız)
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];
