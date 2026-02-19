import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { checkSetupStatus } from "./api/auth";
import Layout from "./admin/layout/Layout";
import Login from "./admin/pages/Login";
import Setup from "./admin/pages/Setup";
import ForgotPassword from "./admin/pages/ForgotPassword";
import ResetPassword from "./admin/pages/ResetPassword";
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

// Component to check setup status and redirect if needed
function SetupCheck({ children }) {
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip check if already on setup page
    if (location.pathname === "/admin/setup") {
      setChecking(false);
      return;
    }

    checkSetupStatus()
      .then((data) => {
        if (data.needs_setup) {
          setNeedsSetup(true);
          navigate("/admin/setup", { replace: true });
        }
      })
      .catch(() => {
        // If check fails, continue normally
      })
      .finally(() => {
        setChecking(false);
      });
  }, [navigate, location.pathname]);

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent"></div>
      </div>
    );
  }

  if (needsSetup && location.pathname !== "/admin/setup") {
    return null;
  }

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

        <SetupCheck>
          <Routes>
            <Route path="/kiosk" element={<KioskApp />} />

            {/* Auth routes */}
            <Route path="/admin/setup" element={<Setup />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin/forgot-password" element={<ForgotPassword />} />
            <Route path="/admin/reset-password/:token" element={<ResetPassword />} />

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
        </SetupCheck>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
