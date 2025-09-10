import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@pages/Login";
import Dashboard from "@pages/Dashboard";
import Layout from "@components/Layout";
import { RequireRole } from "@lib/auth";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <RequireRole roles={["super_admin"]}>
            <Layout>
              <Dashboard />
            </Layout>
          </RequireRole>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
