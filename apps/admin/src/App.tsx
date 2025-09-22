// apps/admin/src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import KPIs from "./pages/KPIs";
import Scores from "./pages/Scores";
import Users from "./pages/Users";
import IdentitiesPage from "./pages/Identities";
import EmployeeDetail from "./pages/EmployeeDetail";   // eski genel detay (opsiyonel)
import EmployeeProfile from "./pages/EmployeeProfile";  // Kişi sayfası
import Layout from "./components/Layout";
import { RequireRole } from "./lib/auth";
import ReportBonusClose from "./pages/ReportBonusClose"; // Bonus kapanış raporu
import ReportsFinance from "./pages/ReportsFinance";      // Finans kapanış raporu (EKLENDİ)

function Protected({ children }: { children: React.ReactNode }) {
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

      {/* Eski genel sayfa (opsiyonel) */}
      <Route
        path="/employee-detail"
        element={
          <Protected>
            <Layout>
              <EmployeeDetail />
            </Layout>
          </Protected>
        }
      />

      {/* Kişi profili /employees/:employee_id */}
      <Route
        path="/employees/:employee_id"
        element={
          <Protected>
            <Layout>
              <EmployeeProfile />
            </Layout>
          </Protected>
        }
      />

      {/* Bonus: Kapanış Süreleri */}
      <Route
        path="/reports/bonus/close-time"
        element={
          <Protected>
            <Layout>
              <ReportBonusClose />
            </Layout>
          </Protected>
        }
      />

      {/* Finans: Kapanış Süreleri (YENİ) */}
      <Route
        path="/reports/finance/close-time"
        element={
          <Protected>
            <Layout>
              <ReportsFinance />
            </Layout>
          </Protected>
        }
      />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
