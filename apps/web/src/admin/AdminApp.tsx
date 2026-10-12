import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Building2, CircleHelp, LogOut, Package, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router";
import { ApiError, api } from "../lib/api";
import { PasswordInput } from "../pages/auth/LoginPage";
import { AuthLayout } from "../pages/auth/AuthLayout";
import { TourProvider, useTours } from "../tours/TourProvider";
import { Button, Callout, ErrorState, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger, Spinner } from "../ui";
import { NewsAdminPage } from "./NewsAdminPage";
import { PlansPage } from "./PlansPage";
import { TenantDetailPage } from "./TenantDetailPage";
import { TenantsPage } from "./TenantsPage";

const allow = { can: () => true, hasModule: () => true };

function AdminLogin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    document.title = "Painel da plataforma · Entrar";
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/auth/login", { body: { email, password }, silent401: true });
      qc.removeQueries({ queryKey: ["admin-me"] });
      navigate("/admin/empresas", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthLayout title="Painel da plataforma" subtitle="Acesso restrito à equipe que administra o SaaS.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="E-mail">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
        </Field>
        <Field label="Senha">
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <Button type="submit" size="lg" loading={busy}>
          Entrar no painel
        </Button>
      </form>
    </AuthLayout>
  );
}

function AdminShell() {
  const navigate = useNavigate();
  const tours = useTours();
  const links = [
    { to: "/admin/empresas", label: "Empresas", icon: Building2 },
    { to: "/admin/planos", label: "Planos", icon: Package },
    { to: "/admin/novidades", label: "Novidades", icon: Sparkles },
  ];
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-ink text-ink-inverse">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <span className="mr-4 text-sm font-semibold">Lumi · Painel da plataforma</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label="Painel">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => clsx("inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 text-sm", isActive ? "bg-white/15 font-medium" : "text-white/75 hover:bg-white/10")}
              >
                <l.icon className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">{l.label}</span>
              </NavLink>
            ))}
          </nav>
          <Menu>
            <MenuTrigger className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10" aria-label="Ajuda">
              <CircleHelp className="h-5 w-5" aria-hidden />
            </MenuTrigger>
            <MenuContent>
              <MenuItem icon={<Sparkles />} onSelect={() => tours.startCurrentScreenTour()}>
                Ver tour desta tela
              </MenuItem>
            </MenuContent>
          </Menu>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-white/80 hover:bg-white/10"
            onClick={async () => {
              await api("/api/admin/auth/logout", { body: {} });
              navigate("/admin/entrar", { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function AdminProtected() {
  const me = useQuery({ queryKey: ["admin-me"], queryFn: () => api("/api/admin/me", { silent401: true }), retry: false });
  if (me.isLoading)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  if (me.error instanceof ApiError && me.error.status === 401) return <Navigate to="/admin/entrar" replace />;
  if (me.error) return <ErrorState error={me.error} onRetry={() => me.refetch()} />;
  return (
    <TourProvider realm="platform" filters={allow}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<Navigate to="empresas" replace />} />
          <Route path="empresas" element={<TenantsPage />} />
          <Route path="empresas/:id" element={<TenantDetailPage />} />
          <Route path="planos" element={<PlansPage />} />
          <Route path="novidades" element={<NewsAdminPage />} />
          <Route path="*" element={<Navigate to="empresas" replace />} />
        </Route>
      </Routes>
    </TourProvider>
  );
}

export function AdminApp() {
  return (
    <Routes>
      <Route path="entrar" element={<AdminLogin />} />
      <Route path="*" element={<AdminProtected />} />
    </Routes>
  );
}
