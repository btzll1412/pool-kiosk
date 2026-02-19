import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./admin/layout/Layout";
import Login from "./admin/pages/Login";
import Dashboard from "./admin/pages/Dashboard";
import MembersList from "./admin/pages/Members/MembersList";
import MemberDetail from "./admin/pages/Members/MemberDetail";
import MemberForm from "./admin/pages/Members/MemberForm";
import PlansList from "./admin/pages/Plans/PlansList";
import TransactionsList from "./admin/pages/Transactions/TransactionsList";
import RevenueReport from "./admin/pages/Reports/RevenueReport";
import SwimReport from "./admin/pages/Reports/SwimReport";
import Settings from "./admin/pages/Settings/Settings";
import KioskApp from "./kiosk/KioskApp";

function ProtectedRoute({ children }) {
  const { authed } = useAuth();
  if (!authed) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: "0.75rem",
              padding: "0.75rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
            },
            success: {
              style: {
                background: "#f0fdf4",
                color: "#166534",
                border: "1px solid #bbf7d0",
              },
            },
            error: {
              style: {
                background: "#fef2f2",
                color: "#991b1b",
                border: "1px solid #fecaca",
              },
            },
          }}
        />

        <Routes>
          <Route path="/kiosk" element={<KioskApp />} />

          <Route path="/admin/login" element={<Login />} />

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="members" element={<MembersList />} />
            <Route path="members/new" element={<MemberForm />} />
            <Route path="members/:id" element={<MemberDetail />} />
            <Route path="members/:id/edit" element={<MemberForm />} />
            <Route path="plans" element={<PlansList />} />
            <Route path="transactions" element={<TransactionsList />} />
            <Route path="reports" element={<RevenueReport />} />
            <Route path="reports/swims" element={<SwimReport />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/kiosk" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
