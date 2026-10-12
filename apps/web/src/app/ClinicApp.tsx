import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { ApiError, onUnauthorized } from "../lib/api";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";
import { ClientFormPage } from "../pages/clients/ClientFormPage";
import { ClientsListPage } from "../pages/clients/ClientsListPage";
import { HomePage } from "../pages/home/HomePage";
import { ModuleComingSoonPage, NotFoundPage } from "../pages/misc/MiscPages";
import { NewsCenterPage } from "../news/NewsCenterPage";
import { ProfilePage } from "../pages/misc/ProfilePage";
import { SettingsRoutes } from "../pages/settings/SettingsRoutes";
import { TourProvider } from "../tours/TourProvider";
import { ErrorState, Spinner } from "../ui";
import { AppShell } from "./AppShell";
import { Guard } from "./Guard";
import { NAV_ITEMS } from "./nav";
import { SessionProvider, buildSession, useMeQuery } from "./session";

export function FullScreenLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}

export function ClinicApp() {
  const me = useMeQuery();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(
    () =>
      onUnauthorized(() => {
        qc.clear();
        navigate(`/entrar?voltar=${encodeURIComponent(location.pathname)}`, { replace: true });
      }),
    [navigate, qc, location.pathname],
  );

  const filters = useMemo(() => {
    if (!me.data) return { can: () => false, hasModule: () => false };
    const s = buildSession(me.data, async () => undefined);
    return { can: s.can, hasModule: s.hasModule };
  }, [me.data]);

  if (me.isLoading) return <FullScreenLoading />;
  if (me.error instanceof ApiError) {
    if (me.error.status === 401) return <Navigate to={`/entrar?voltar=${encodeURIComponent(location.pathname)}`} replace />;
    if (me.error.code === "tenant_required") return <Navigate to="/escolher-clinica" replace />;
  }
  if (me.error || !me.data) return <ErrorState error={me.error} onRetry={() => me.refetch()} className="min-h-dvh" />;

  const comingSoon = NAV_ITEMS.filter((n) => n.comingSoon);

  return (
    <SessionProvider me={me.data}>
      <TourProvider realm="clinic" filters={filters}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="clientes" element={<Guard permission="clients.read"><ClientsListPage /></Guard>} />
            <Route path="clientes/novo" element={<Guard permission="clients.create" write><ClientFormPage /></Guard>} />
            <Route path="clientes/:id" element={<Guard permission="clients.read"><ClientDetailPage /></Guard>} />
            <Route path="clientes/:id/editar" element={<Guard permission="clients.update" write><ClientFormPage /></Guard>} />
            <Route path="configuracoes/*" element={<SettingsRoutes />} />
            <Route path="novidades" element={<NewsCenterPage />} />
            <Route path="meu-perfil" element={<ProfilePage />} />
            {comingSoon.map((n) => (
              <Route key={n.to} path={n.to.slice(1)} element={<Guard module={n.module} anyPermission={n.anyPermission}><ModuleComingSoonPage module={n.module} /></Guard>} />
            ))}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </TourProvider>
    </SessionProvider>
  );
}
