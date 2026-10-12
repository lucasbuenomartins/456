import { Navigate, Route, Routes } from "react-router";
import { AdminApp } from "./admin/AdminApp";
import { ClinicApp } from "./app/ClinicApp";
import { AcceptInvitePage } from "./pages/auth/AcceptInvitePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { SelectTenantPage } from "./pages/auth/SelectTenantPage";

export function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/escolher-clinica" element={<SelectTenantPage />} />
      <Route path="/convite/:token" element={<AcceptInvitePage />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/login" element={<Navigate to="/entrar" replace />} />
      <Route path="/*" element={<ClinicApp />} />
    </Routes>
  );
}
