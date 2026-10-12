import { MODULES, type ModuleKey } from "@clinica/shared";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Cake, CheckCircle2, Circle, ClipboardList, MessageCircle, Search, UserPlus, Users, Wallet, CalendarDays, Boxes, HeartHandshake } from "../../ui/icons";
import { Link } from "react-router";
import { useSession } from "../../app/session";
import { api } from "../../lib/api";
import { formatDate, formatPhoneBR, relativeTime, whatsappLink } from "../../lib/format";
import { useScreen } from "../../tours/TourProvider";
import { Avatar, Badge, ButtonLink, Card, Callout, ErrorState, LoadingRows } from "../../ui";

interface Dashboard {
  clients?: {
    total: number;
    birthdaysToday: { id: string; fullName: string; phone: string; birthDate: string; phoneIsWhatsapp: boolean }[];
    birthdaysMonth: { id: string; fullName: string; birthDate: string }[];
    recent: { id: string; fullName: string; phone: string; createdAt: string }[];
  };
  invites?: { pending: number; expired: number };
  setup?: { key: string; done: boolean; to: string; label: string }[];
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** O que cada perfil verá aqui quando os módulos das próximas etapas forem entregues. */
const UPCOMING: { module: ModuleKey; icon: typeof CalendarDays; text: string; permission: Parameters<ReturnType<typeof useSession>["can"]>[0][] }[] = [
  { module: "agenda", icon: CalendarDays, text: "Agenda do dia, confirmações pendentes e chegadas", permission: ["agenda.read_all", "agenda.read_own"] },
  { module: "prontuario", icon: ClipboardList, text: "Próximos atendimentos e registros a finalizar", permission: ["clinical.read"] },
  { module: "financeiro", icon: Wallet, text: "Recebimentos do dia, contas a pagar e caixa", permission: ["finance.read"] },
  { module: "estoque", icon: Boxes, text: "Materiais abaixo do mínimo e validades próximas", permission: ["stock.read"] },
  { module: "crm", icon: HeartHandshake, text: "Tarefas de contato e clientes para reativar", permission: ["crm.read"] },
];

export function HomePage() {
  const session = useSession();
  const dash = useQuery({ queryKey: ["dashboard", session.me.currentUnitId], queryFn: () => api<Dashboard>("/api/dashboard") });
  useScreen("home", { ready: !dash.isLoading });

  const d = dash.data;
  const firstName = session.me.user.name.split(" ").find((p) => !/^dra?\.?$/i.test(p)) ?? session.me.user.name;
  const setupPending = d?.setup?.filter((s) => !s.done) ?? [];
  const attention: { tone: "warning" | "info" | "danger"; title: string; body?: string; action?: { label: string; to: string } }[] = [];
  if (d?.invites?.expired) {
    attention.push({ tone: "warning", title: `${d.invites.expired} convite(s) expirado(s)`, body: "A pessoa não conseguiu entrar a tempo. Gere um novo convite.", action: { label: "Ver equipe", to: "/configuracoes/equipe" } });
  }
  if (d?.clients?.birthdaysToday.length) {
    attention.push({ tone: "info", title: `${d.clients.birthdaysToday.length} aniversariante(s) hoje`, body: "Que tal mandar uma mensagem?" });
  }
  const upcoming = UPCOMING.filter((u) => session.hasModule(u.module) && u.permission.some((p) => session.can(p)));

  return (
    <div className="flex flex-col gap-5">
      <header data-tour="home.greeting">
        <p className="text-sm text-ink-subtle">
          {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}
          {session.currentUnit && ` · ${session.currentUnit.name}`}
        </p>
        <h1 className="mt-0.5 text-[1.6rem] font-semibold sm:text-[1.85rem]">
          {greeting()}, {firstName}
        </h1>
      </header>

      {dash.error && <ErrorState error={dash.error} onRetry={() => dash.refetch()} />}

      <section aria-labelledby="atencao" data-tour="home.attention" className="flex flex-col gap-2">
        <h2 id="atencao" className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Precisa da sua atenção
        </h2>
        {dash.isLoading ? (
          <LoadingRows rows={1} />
        ) : attention.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-[0.9375rem] text-ink-muted">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> Tudo em dia por aqui.
          </div>
        ) : (
          attention.map((a, i) => (
            <Callout key={i} tone={a.tone} title={a.title} action={a.action && <ButtonLink to={a.action.to} size="sm" variant="secondary">{a.action.label}</ButtonLink>}>
              {a.body}
            </Callout>
          ))
        )}
      </section>

      <section aria-label="Atalhos" data-tour="home.shortcuts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {session.can("clients.create") && session.canWrite("core") && (
          <Shortcut to="/clientes/novo" icon={<UserPlus className="h-5 w-5" />} label="Cadastrar cliente" primary />
        )}
        {session.can("clients.read") && <Shortcut to="/clientes" icon={<Search className="h-5 w-5" />} label="Buscar cliente" />}
        {session.can("team.manage") && <Shortcut to="/configuracoes/equipe" icon={<Users className="h-5 w-5" />} label="Convidar pessoa" />}
        {session.can("clients.read") && <Shortcut to="/clientes?filtro=aniversariantes" icon={<Cake className="h-5 w-5" />} label="Aniversariantes" />}
      </section>

      {setupPending.length > 0 && (
        <Card title="Primeiros passos" tourId="home.setup" action={<Badge tone="primary">{(d!.setup!.length - setupPending.length)} de {d!.setup!.length}</Badge>}>
          <ul className="flex flex-col gap-1">
            {d!.setup!.map((s) => (
              <li key={s.key}>
                <Link to={s.to} className={clsx("flex min-h-touch items-center gap-3 rounded-lg px-2 hover:bg-surface-muted", s.done && "text-ink-subtle line-through")}>
                  {s.done ? <CheckCircle2 className="h-5 w-5 text-success" aria-label="Concluído" /> : <Circle className="h-5 w-5 text-border-strong" aria-label="Pendente" />}
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {d?.clients && (
          <Card title="Aniversariantes do mês" tourId="home.birthdays" padded={false}>
            {d.clients.birthdaysMonth.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-subtle">Nenhum aniversariante este mês.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {d.clients.birthdaysMonth.map((c) => {
                  const today = d.clients!.birthdaysToday.find((t) => t.id === c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <Avatar name={c.fullName} size="sm" />
                      <Link to={`/clientes/${c.id}`} className="flex-1 truncate hover:underline">
                        {c.fullName}
                      </Link>
                      {today ? <Badge tone="accent">Hoje</Badge> : <span className="text-sm text-ink-subtle tabular">{formatDate(c.birthDate).slice(0, 5)}</span>}
                      {today?.phoneIsWhatsapp && (
                        <a href={whatsappLink(today.phone)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-success hover:bg-success-soft" aria-label={`Abrir WhatsApp de ${c.fullName}`}>
                          <MessageCircle className="h-5 w-5" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {d?.clients && (
          <Card title="Cadastrados recentemente" tourId="home.recent-clients" padded={false} action={<Link to="/clientes" className="text-sm text-primary hover:underline">Ver todos ({d.clients.total})</Link>}>
            {d.clients.recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-subtle">Nenhum cliente ainda.</p>
            ) : (
              <ul className="divide-y divide-border">
                {d.clients.recent.map((c) => (
                  <li key={c.id}>
                    <Link to={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-muted sm:px-5">
                      <Avatar name={c.fullName} size="sm" />
                      <span className="flex-1 truncate">{c.fullName}</span>
                      <span className="hidden text-sm text-ink-subtle sm:inline tabular">{formatPhoneBR(c.phone)}</span>
                      <span className="text-xs text-ink-subtle">{relativeTime(c.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {upcoming.length > 0 && (
        <Card title="Chegando nas próximas etapas" tourId="home.coming-soon">
          <p className="mb-3 text-sm text-ink-muted">Sua clínica contratou estes módulos. Quando forem liberados, este painel mostrará:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {upcoming.map((u) => (
              <li key={u.module} className="flex items-start gap-3 rounded-lg bg-surface-muted px-3 py-2.5 text-sm">
                <u.icon className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                <span>
                  <span className="font-medium">{MODULES[u.module].name}:</span> {u.text}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Shortcut({ to, icon, label, primary }: { to: string; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={clsx(
        "flex min-h-[88px] flex-col justify-between gap-2 rounded-xl border p-4 text-[0.9375rem] font-medium transition-colors",
        primary ? "border-primary bg-primary text-primary-ink hover:bg-primary-hover" : "border-border bg-surface hover:border-primary/40 hover:bg-primary-soft",
      )}
    >
      <span className={primary ? "" : "text-primary"}>{icon}</span>
      {label}
    </Link>
  );
}
