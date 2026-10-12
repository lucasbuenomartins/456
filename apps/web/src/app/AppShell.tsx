import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Bell, Building, ChevronDown, CircleHelp, Keyboard, LogOut, Menu as MenuIcon, Moon, Repeat, Search, Sparkles, Sun, UserRound, WifiOff } from "../ui/icons";
import { useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { NewsLoginDialog } from "../news/NewsLoginDialog";
import { useTheme } from "../lib/theme";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useHotkey, useOnline } from "../lib/hooks";
import { useTours } from "../tours/TourProvider";
import { Avatar, Badge, Dialog, Kbd, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, useToast } from "../ui";
import { CommandPalette } from "./CommandPalette";
import { visibleNav, type NavItem } from "./nav";
import { meQueryKey, useSession } from "./session";

function SideLink({ item, compact }: { item: NavItem; compact?: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        clsx(
          "group flex items-center rounded-lg text-[0.9375rem] transition-colors",
          compact ? "flex-col gap-1 px-1 py-2 text-[0.6875rem] text-center" : "min-h-[40px] gap-3 px-3",
          isActive ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
        )
      }
    >
      <item.icon className={clsx("shrink-0", compact ? "h-5 w-5" : "h-[18px] w-[18px]")} aria-hidden />
      <span className={compact ? "leading-tight" : "min-w-0 flex-1 truncate"}>{item.label}</span>
      {item.comingSoon && !compact && (
        <Badge tone="neutral" className="!px-2 !text-[0.6875rem]">
          Em breve
        </Badge>
      )}
    </NavLink>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-lg" aria-label={`${name} — Início`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-ink">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <path d="M16 25.5s-8.5-5.2-8.5-11.2A4.9 4.9 0 0 1 16 11.4a4.9 4.9 0 0 1 8.5 2.9c0 6-8.5 11.2-8.5 11.2z" fill="currentColor" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">Lumi</span>
        <span className="block max-w-[150px] truncate text-xs text-ink-subtle">{name}</span>
      </span>
    </Link>
  );
}

function UnitSwitcher() {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const { units, currentUnitId } = session.me;
  if (units.length <= 1) {
    return session.currentUnit ? (
      <span className="hidden items-center gap-1.5 text-sm text-ink-muted md:inline-flex" data-tour="shell.unit">
        <Building className="h-4 w-4" aria-hidden /> {session.currentUnit.name}
      </span>
    ) : null;
  }
  return (
    <Menu>
      <MenuTrigger
        className="inline-flex min-h-touch max-w-full items-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted hover:bg-surface-muted sm:min-h-[40px]"
        data-tour="shell.unit"
        aria-label={`Unidade atual: ${session.currentUnit?.name ?? "nenhuma"}. Trocar unidade`}
      >
        <Building className="h-4 w-4" aria-hidden />
        <span className="max-w-[96px] truncate sm:max-w-[180px]">{session.currentUnit?.name}</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuLabel>Trocar unidade</MenuLabel>
        {units.map((u) => (
          <MenuItem
            key={u.id}
            onSelect={async () => {
              if (u.id === currentUnitId) return;
              await api("/api/me/unit", { body: { unitId: u.id } });
              await qc.invalidateQueries();
              toast.success(`Agora você está em ${u.name}.`);
            }}
          >
            {u.name} {u.id === currentUnitId && <span className="text-xs text-primary">(atual)</span>}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const rows: [ReactNode, string][] = [
    [<><Kbd>Ctrl</Kbd> + <Kbd>K</Kbd></>, "Buscar telas e clientes"],
    [<Kbd>/</Kbd>, "Ir para a busca da lista atual"],
    [<Kbd>N</Kbd>, "Novo cadastro na lista atual"],
    [<Kbd>E</Kbd>, "Editar o cadastro aberto"],
    [<><Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd></>, "Salvar formulário"],
    [<Kbd>Esc</Kbd>, "Fechar janela ou tour"],
    [<Kbd>?</Kbd>, "Mostrar esta lista"],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Atalhos de teclado" size="sm">
      <ul className="divide-y divide-border">
        {rows.map(([k, label], i) => (
          <li key={i} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-ink-muted">{label}</span>
            <span className="flex items-center gap-1">{k}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

function StatusBanners() {
  const session = useSession();
  const online = useOnline();
  const t = session.me.tenant;
  const daysLeft = t.trialEndsAt ? Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 864e5) : null;
  return (
    <>
      {!online && (
        <div role="alert" className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm text-warning">
          <WifiOff className="h-4 w-4" aria-hidden /> Você está sem internet. Rascunhos ficam guardados neste aparelho até a conexão voltar.
        </div>
      )}
      {session.readOnly && (
        <div role="alert" className="bg-danger-soft px-4 py-2 text-center text-sm text-danger">
          {t.status === "cancelled"
            ? `Conta cancelada. Você pode consultar e exportar os dados até ${formatDate(t.dataAvailableUntil)}.`
            : t.status === "suspended"
              ? "Conta suspensa: modo somente leitura. Consulte e exporte dados; para voltar a cadastrar, fale com o responsável pela conta."
              : "O período de teste terminou: modo somente leitura. Fale com o responsável pela conta para contratar."}
        </div>
      )}
      {t.status === "trial" && !session.readOnly && daysLeft !== null && daysLeft <= 7 && (
        <div className="bg-info-soft px-4 py-2 text-center text-sm text-info">
          Período de teste: {daysLeft} dia{daysLeft === 1 ? "" : "s"} restante{daysLeft === 1 ? "" : "s"}.
        </div>
      )}
    </>
  );
}

export function AppShell() {
  const session = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const tours = useTours();
  const theme = useTheme();
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const nav = visibleNav(session);
  const mobilePrimary = nav.filter((n) => n.mobilePrimary).slice(0, 3);
  const mobileMore = nav.filter((n) => !mobilePrimary.includes(n));

  const news = useQuery({ queryKey: ["news"], queryFn: () => api<{ unread: number }>("/api/news"), staleTime: 300_000 });
  const tenants = useQuery({
    queryKey: ["my-tenants"],
    queryFn: () => api<{ tenants: { id: string; name: string }[] }>("/api/auth/tenants"),
    staleTime: Infinity,
  });

  useHotkey("mod+k", () => setPalette(true));
  useHotkey("?", () => setShortcuts(true));

  const logout = async () => {
    await api("/api/auth/logout", { body: {} });
    qc.clear();
    navigate("/entrar", { replace: true });
  };

  const unread = news.data?.unread ?? 0;

  return (
    <div className="min-h-dvh">
      <a href="#conteudo" className="sr-only-focusable fixed left-2 top-2 z-[90] rounded-lg bg-surface px-4 py-2 shadow-pop">
        Pular para o conteúdo
      </a>

      {/* Menu lateral: completo no desktop, compacto no tablet */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-border bg-surface sm:flex lg:w-64" aria-label="Menu principal">
        <div className="hidden px-4 pb-2 pt-4 lg:block">
          <Brand name={session.me.tenant.name} />
        </div>
        <div className="flex justify-center pt-4 lg:hidden">
          <Link to="/" aria-label="Início" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-ink">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path d="M16 25.5s-8.5-5.2-8.5-11.2A4.9 4.9 0 0 1 16 11.4a4.9 4.9 0 0 1 8.5 2.9c0 6-8.5 11.2-8.5 11.2z" fill="currentColor" />
            </svg>
          </Link>
        </div>
        <nav className="mt-3 flex-1 overflow-y-auto px-2 lg:px-3" data-tour="shell.nav">
          <ul className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <li key={item.to}>
                <span className="hidden lg:block">
                  <SideLink item={item} />
                </span>
                <span className="lg:hidden">
                  <SideLink item={item} compact />
                </span>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="sm:pl-20 lg:pl-64">
        <StatusBanners />
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-6">
          <Link to="/" aria-label={`${session.me.tenant.name} — Início`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-ink sm:hidden">
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path d="M16 25.5s-8.5-5.2-8.5-11.2A4.9 4.9 0 0 1 16 11.4a4.9 4.9 0 0 1 8.5 2.9c0 6-8.5 11.2-8.5 11.2z" fill="currentColor" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <UnitSwitcher />
          </div>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
            <button
              onClick={() => setPalette(true)}
              data-tour="shell.search"
              className="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-lg text-ink-muted hover:bg-surface-muted sm:h-10 sm:w-64 sm:justify-start sm:border sm:border-border-strong sm:bg-surface sm:px-3 sm:text-sm sm:text-ink-subtle"
              aria-label="Buscar telas e clientes (Ctrl+K)"
            >
              <Search className="h-4 w-4" aria-hidden />
              <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
              <span className="hidden items-center gap-0.5 sm:flex">
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
            <Link
              to="/novidades"
              data-tour="shell.news"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted sm:h-10 sm:w-10"
              aria-label={unread ? `Novidades: ${unread} não vista${unread > 1 ? "s" : ""}` : "Novidades"}
            >
              <Bell className="h-5 w-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold text-primary-ink">
                  {unread}
                </span>
              )}
            </Link>
            <Menu>
              <MenuTrigger
                data-tour="shell.help"
                className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2 text-sm text-ink-muted hover:bg-surface-muted sm:h-10 sm:px-2.5"
                aria-label="Ajuda"
              >
                <CircleHelp className="h-5 w-5" aria-hidden />
                <span className="hidden md:inline">Ajuda</span>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<Sparkles />} onSelect={() => tours.startCurrentScreenTour()} disabled={!tours.screen}>
                  Ver tour desta tela
                </MenuItem>
                <MenuItem icon={<Bell />} onSelect={() => navigate("/novidades")}>
                  Central de novidades
                </MenuItem>
                <MenuItem icon={<Keyboard />} onSelect={() => setShortcuts(true)} shortcut="?">
                  Atalhos de teclado
                </MenuItem>
              </MenuContent>
            </Menu>
            <Menu>
              <MenuTrigger className="ml-1 shrink-0 rounded-full p-0.5 hover:ring-4 hover:ring-surface-muted" aria-label="Sua conta" data-tour="shell.user">
                <Avatar name={session.me.user.name} size="sm" />
              </MenuTrigger>
              <MenuContent>
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{session.me.user.name}</p>
                  <p className="text-xs text-ink-subtle">{session.me.membership.roles.join(", ") || (session.me.membership.isOwner ? "Responsável pela conta" : "")}</p>
                </div>
                <MenuSeparator />
                <MenuItem icon={<UserRound />} onSelect={() => navigate("/meu-perfil")}>
                  Meu perfil
                </MenuItem>
                <MenuItem
                  icon={theme.resolved === "dark" ? <Sun /> : <Moon />}
                  onSelect={() => theme.setPreference(theme.resolved === "dark" ? "light" : "dark")}
                >
                  {theme.resolved === "dark" ? "Usar tema claro" : "Usar tema escuro"}
                </MenuItem>
                {(tenants.data?.tenants.length ?? 0) > 1 && (
                  <MenuItem icon={<Repeat />} onSelect={() => navigate("/escolher-clinica")}>
                    Trocar de clínica
                  </MenuItem>
                )}
                <MenuItem icon={<LogOut />} onSelect={logout}>
                  Sair
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </header>

        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 focus:outline-none sm:px-6 sm:pb-10 sm:pt-6">
          <Outlet />
        </main>
      </div>

      {/* Barra inferior no celular */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
        style={{ gridTemplateColumns: `repeat(${mobilePrimary.length + 1}, minmax(0, 1fr))` }}
        aria-label="Menu principal"
        data-tour="shell.bottom-nav"
      >
        {mobilePrimary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) => clsx("flex h-16 flex-col items-center justify-center gap-1 text-[0.75rem]", isActive ? "font-medium text-primary" : "text-ink-muted")}
          >
            <item.icon className="h-5 w-5" aria-hidden />
            {item.label}
          </NavLink>
        ))}
        <button onClick={() => setMoreOpen(true)} className="flex h-16 flex-col items-center justify-center gap-1 text-[0.75rem] text-ink-muted">
          <MenuIcon className="h-5 w-5" aria-hidden />
          Mais
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="Menu">
        <ul className="grid grid-cols-3 gap-2">
          {[...mobileMore, { to: "/novidades", label: "Novidades", icon: Bell } as NavItem, { to: "/meu-perfil", label: "Meu perfil", icon: UserRound } as NavItem].map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className="flex h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border text-center text-sm hover:bg-surface-muted"
              >
                <item.icon className="h-6 w-6 text-primary" aria-hidden />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </Dialog>

      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      <NewsLoginDialog />
    </div>
  );
}

export function useLogoutOnExpire() {
  const qc = useQueryClient();
  return () => qc.removeQueries({ queryKey: meQueryKey });
}
