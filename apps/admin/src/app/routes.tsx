import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import Reports from "../pages/Reports";
import Personel from "../pages/Personel";

export const routes = [
  { path: "/login", element: <Login /> },
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/reports", element: <Reports /> },
  { path: "/personel", element: <Personel /> },
];
