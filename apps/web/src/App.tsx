import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { ClinicApp } from "./app/ClinicApp";
import { AcceptInvitePage } from "./pages/auth/AcceptInvitePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SelectTenantPage } from "./pages/auth/SelectTenantPage";
import { FullScreenLoading } from "./app/ClinicApp";

// O painel do SaaS é carregado só por quem o acessa.
const AdminApp = lazy(() => import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })));

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/escolher-clinica" element={<SelectTenantPage />} />
      <Route path="/convite/:token" element={<AcceptInvitePage />} />
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={<FullScreenLoading />}>
            <AdminApp />
          </Suspense>
        }
      />
      <Route path="/login" element={<Navigate to="/entrar" replace />} />
      <Route path="/*" element={<ClinicApp />} />
    </Routes>
  );
}
