// apps/admin/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import KPIs from "./pages/KPIs";
import Scores from "./pages/Scores";
import Users from "./pages/Users";             // Super Admin için kullanıcı yönetimi
import IdentitiesPage from "./pages/Identities"; // Kişi Eşleştirme (pending → employee bağlama)
import Layout from "./components/Layout";
import { RequireRole } from "./lib/auth";

function Protected({ children }: { children: React.ReactNode }) {
  // V1: sadece super_admin erişir; ileride rol bazlı genişletilecek.
  return <RequireRole roles={["super_admin"]}>{children}</RequireRole>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <Protected>
            <Layout>
              <Dashboard />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/employees"
        element={
          <Protected>
            <Layout>
              <Employees />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/kpis"
        element={
          <Protected>
            <Layout>
              <KPIs />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/scores"
        element={
          <Protected>
            <Layout>
              <Scores />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/users"
        element={
          <Protected>
            <Layout>
              <Users />
            </Layout>
          </Protected>
        }
      />

      <Route
        path="/identities"
        element={
          <Protected>
            <Layout>
              <IdentitiesPage />
            </Layout>
          </Protected>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
