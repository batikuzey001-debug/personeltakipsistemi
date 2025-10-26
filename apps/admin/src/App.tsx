// apps/admin/src/App.tsx
import React from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import KPIs from "./pages/KPIs";
import Scores from "./pages/Scores";
import Users from "./pages/Users";
import IdentitiesPage from "./pages/Identities";
import EmployeeProfile from "./pages/EmployeeProfile";
import Layout from "./components/Layout";
import { RequireRole } from "./lib/auth";

// Konsolide sayfalar
import Reports from "./pages/Reports";
import Personel from "./pages/Personel";

// Bağımsız modüller
import AdminTasks from "./pages/AdminTasks";
import AdminTaskTemplates from "./pages/AdminTaskTemplates";
import AdminBotSettings from "./pages/AdminBotSettings";
import Notifications from "./pages/Notifications";
import ShiftPlanner from "./pages/ShiftPlanner";
import LivechatMissed from "./pages/LivechatMissed";

// Teşhis sayfası (geçici/opsiyonel)
import Diag from "./pages/Diag";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            maxWidth: 960,
            margin: "4rem auto",
            padding: 16,
            border: "1px solid #f0dada",
            borderRadius: 12,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0 }}>Bir şeyler ters gitti</h2>
          <p style={{ color: "#6b7280" }}>Sayfa yüklenirken hata oluştu. Lütfen sayfayı yenileyin.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Protected({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["super_admin"]}>{children}</RequireRole>;
}

// /employees/:employee_id -> /personel?tab=profile&id=...
function EmployeeIdRedirect() {
  const { employee_id } = useParams();
  const id = employee_id ?? "";
  return <Navigate to={`/personel?tab=profile&id=${encodeURIComponent(id)}`} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Protected */}
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

        {/* Konsolide sayfalar */}
        <Route
          path="/reports"
          element={
            <Protected>
              <Layout>
                <Reports />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/personel"
          element={
            <Protected>
              <Layout>
                <Personel />
              </Layout>
            </Protected>
          }
        />

        {/* Bağımsız modüller */}
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
          path="/admin/tasks"
          element={
            <Protected>
              <Layout>
                <AdminTasks />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/admin/tasks/templates"
          element={
            <Protected>
              <Layout>
                <AdminTaskTemplates />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/admin/bot"
          element={
            <Protected>
              <Layout>
                <AdminBotSettings />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <Protected>
              <Layout>
                <Notifications />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/shift-planner"
          element={
            <Protected>
              <Layout>
                <ShiftPlanner />
              </Layout>
            </Protected>
          }
        />
        <Route
          path="/livechat/missed"
          element={
            <Protected>
              <Layout>
                <LivechatMissed />
              </Layout>
            </Protected>
          }
        />

        {/* Teşhis (geçici) */}
        <Route
          path="/diag"
          element={
            <Protected>
              <Layout>
                <Diag />
              </Layout>
            </Protected>
          }
        />

        {/* Profil ekranını eski rotalardan da destekle */}
        <Route path="/employee-detail" element={<Navigate to="/personel?tab=profile" replace />} />
        <Route path="/employees/:employee_id" element={<EmployeeIdRedirect />} />

        {/* Legacy yönlendirmeler */}
        <Route path="/employees" element={<Navigate to="/personel" replace />} />
        <Route path="/reports/daily" element={<Navigate to="/reports?tab=daily" replace />} />
        <Route path="/reports/livechat" element={<Navigate to="/reports?tab=livechat" replace />} />
        <Route path="/reports/bonus/close-time" element={<Navigate to="/reports?tab=bonus" replace />} />
        <Route path="/reports/finance/close-time" element={<Navigate to="/reports?tab=finance" replace />} />

        {/* Root & 404 */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
