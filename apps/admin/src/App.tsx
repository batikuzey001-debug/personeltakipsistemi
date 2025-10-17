// apps/admin/src/App.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import KPIs from "./pages/KPIs";
import Scores from "./pages/Scores";
import Users from "./pages/Users";
import IdentitiesPage from "./pages/Identities";
import EmployeeDetail from "./pages/EmployeeDetail";
import EmployeeProfile from "./pages/EmployeeProfile";
import Layout from "./components/Layout";
import { RequireRole } from "./lib/auth";
import ReportsDaily from "./pages/ReportsDaily";
import AdminTasks from "./pages/AdminTasks";
import AdminTaskTemplates from "./pages/AdminTaskTemplates";
import AdminBotSettings from "./pages/AdminBotSettings";
import Notifications from "./pages/Notifications";
import ShiftPlanner from "./pages/ShiftPlanner";
import LivechatAgentReport from "./pages/LivechatAgentReport";
import LivechatMissed from "./pages/LivechatMissed";

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, info: any) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ maxWidth: 960, margin: "4rem auto", padding: 16, border: "1px solid #f0dada", borderRadius: 12, background: "#fff" }}>
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

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<Protected><Layout><Dashboard /></Layout></Protected>} />
        <Route path="/employees" element={<Protected><Layout><Employees /></Layout></Protected>} />
        <Route path="/kpis" element={<Protected><Layout><KPIs /></Layout></Protected>} />
        <Route path="/scores" element={<Protected><Layout><Scores /></Layout></Protected>} />
        <Route path="/users" element={<Protected><Layout><Users /></Layout></Protected>} />
        <Route path="/identities" element={<Protected><Layout><IdentitiesPage /></Layout></Protected>} />

        <Route path="/employee-detail" element={<Protected><Layout><EmployeeDetail /></Layout></Protected>} />
        <Route path="/employees/:employee_id" element={<Protected><Layout><EmployeeProfile /></Layout></Protected>} />

        <Route path="/reports/daily" element={<Protected><Layout><ReportsDaily /></Layout></Protected>} />
        <Route path="/reports/livechat" element={<Protected><Layout><LivechatAgentReport /></Layout></Protected>} />
        <Route path="/livechat/missed" element={<Protected><Layout><LivechatMissed /></Layout></Protected>} />

        <Route path="/admin/tasks" element={<Protected><Layout><AdminTasks /></Layout></Protected>} />
        <Route path="/admin/tasks/templates" element={<Protected><Layout><AdminTaskTemplates /></Layout></Protected>} />
        <Route path="/shift-planner" element={<Protected><Layout><ShiftPlanner /></Layout></Protected>} />

        <Route path="/admin/bot" element={<Protected><Layout><AdminBotSettings /></Layout></Protected>} />
        <Route path="/admin/notifications" element={<Protected><Layout><Notifications /></Layout></Protected>} />

        <Route path="/reports/bonus/close-time" element={<Navigate to="/reports/daily" replace />} />
        <Route path="/reports/finance/close-time" element={<Navigate to="/reports/daily" replace />} />

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
