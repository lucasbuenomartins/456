import { clsx } from "clsx";
import { ChevronRight } from "../../ui/icons";
import type { ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router";
import { Guard } from "../../app/Guard";
import { useSession } from "../../app/session";
import { useIsMobile } from "../../lib/hooks";
import { EmptyState, PageHeader } from "../../ui";
import { AuditPage } from "./AuditPage";
import { CompanyPage } from "./CompanyPage";
import { DataPage } from "./DataPage";
import { PlanPage } from "./PlanPage";
import { RolesPage } from "./RolesPage";
import { settingsPages } from "./settingsPages";
import { TeamPage } from "./TeamPage";
import { UnitsPage } from "./UnitsPage";

/** Layout das configurações: menu lateral no desktop; no celular, lista → tela. */
export function SettingsLayout({ title, description, actions, children, tourId }: { title: string; description?: string; actions?: ReactNode; children: ReactNode; tourId?: string }) {
  const session = useSession();
  const pages = settingsPages(session);
  return (
    <>
      <PageHeader title={title} description={description} crumbs={[{ label: "Configurações", to: "/configuracoes" }, { label: title }]} actions={actions} tourId={tourId} />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Seções de configurações" className="hidden lg:block" data-tour="settings.nav">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {pages.map((p) => (
              <li key={p.to}>
                <NavLink
                  to={p.to}
                  className={({ isActive }) =>
                    clsx("flex min-h-[40px] items-center gap-2.5 rounded-lg px-3 text-[0.9375rem]", isActive ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:bg-surface-muted hover:text-ink")
                  }
                >
                  <p.icon className="h-4 w-4" aria-hidden />
                  {p.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}

function SettingsIndex() {
  const session = useSession();
  const pages = settingsPages(session);
  const isMobile = useIsMobile();
  const location = useLocation();
  if (pages.length === 0) {
    return <EmptyState title="Nenhuma configuração disponível" description="Sua função não permite alterar configurações." />;
  }
  // No desktop, abre direto a primeira seção.
  if (!isMobile && location.pathname.replace(/\/$/, "") === "/configuracoes") return <Navigate to={pages[0]!.to} replace />;
  return (
    <>
      <PageHeader title="Configurações" description="Empresa, equipe, permissões e plano." />
      <ul className="card divide-y divide-border" data-tour="settings.nav">
        {pages.map((p) => (
          <li key={p.to}>
            <Link to={p.to} className="flex min-h-[64px] items-center gap-3 px-4">
              <p.icon className="h-5 w-5 text-primary" aria-hidden />
              <span className="flex-1">
                <span className="block font-medium">{p.label}</span>
                <span className="block text-sm text-ink-subtle">{p.description}</span>
              </span>
              <ChevronRight className="h-5 w-5 text-ink-subtle" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SettingsRoutes() {
  return (
    <Routes>
      <Route index element={<SettingsIndex />} />
      <Route path="empresa" element={<Guard permission="company.manage"><CompanyPage /></Guard>} />
      <Route path="unidades" element={<Guard permission="units.manage"><UnitsPage /></Guard>} />
      <Route path="equipe" element={<Guard permission="team.read"><TeamPage /></Guard>} />
      <Route path="funcoes" element={<Guard anyPermission={["team.read", "roles.manage"]}><RolesPage /></Guard>} />
      <Route path="plano" element={<Guard permission="plan.read"><PlanPage /></Guard>} />
      <Route path="historico" element={<Guard permission="audit.read"><AuditPage /></Guard>} />
      <Route path="dados" element={<Guard permission="data.export"><DataPage /></Guard>} />
      <Route path="*" element={<Navigate to="/configuracoes" replace />} />
    </Routes>
  );
}
