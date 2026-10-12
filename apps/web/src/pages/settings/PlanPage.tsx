import { MODULES, MODULE_STATUS_LABEL, type ModuleKey, type ModuleStatus } from "@clinica/shared";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useSession } from "../../app/session";
import { api } from "../../lib/api";
import { formatDate, formatDateTime, formatMoney } from "../../lib/format";
import { useScreen } from "../../tours/TourProvider";
import { Badge, Callout, Card, ErrorState, LoadingRows, type Tone } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface PlanInfo {
  plan: { name: string; description: string | null; monthlyPriceCents: number; limits: { units: number | null; users: number | null; clients: number | null } };
  status: string;
  access: string;
  trialEndsAt: string | null;
  dataAvailableUntil: string | null;
  usage: { units: number; users: number; clients: number };
  modules: {
    key: ModuleKey;
    name: string;
    description: string;
    requires: ModuleKey[];
    enhancedBy: Partial<Record<ModuleKey, string>>;
    availability: "disponivel" | "em_construcao" | "futuro";
    status: ModuleStatus;
    readOnlyUntil: string | null;
  }[];
  history: { kind: string; subject: string | null; fromValue: string | null; toValue: string | null; reason: string | null; createdAt: string }[];
}

const STATUS_TONE: Record<ModuleStatus, Tone> = { active: "success", trial: "info", read_only: "warning", disabled: "neutral" };
const ACCOUNT_LABEL: Record<string, string> = { trial: "Em teste", active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada" };

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular text-ink-muted">
          {used.toLocaleString("pt-BR")} {limit ? `de ${limit.toLocaleString("pt-BR")}` : "· sem limite"}
        </span>
      </div>
      {limit && (
        <div className="h-2 rounded-full bg-surface-sunken" role="progressbar" aria-valuenow={used} aria-valuemax={limit} aria-label={label}>
          <div className={clsx("h-2 rounded-full", pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function PlanPage() {
  const session = useSession();
  const q = useQuery({ queryKey: ["plan"], queryFn: () => api<PlanInfo>("/api/settings/plan") });
  useScreen("settings.plan", { ready: !q.isLoading });
  const d = q.data;
  const contracted = (m: PlanInfo["modules"][number]) => m.status !== "disabled";

  return (
    <SettingsLayout title="Plano e módulos" description="O que sua clínica contratou, o uso atual e o que cada módulo faz.">
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card title="Seu plano" tourId="settings.plan.summary">
              <p className="text-2xl font-semibold">{d!.plan.name}</p>
              {d!.plan.description && <p className="mt-1 text-sm text-ink-muted">{d!.plan.description}</p>}
              <p className="mt-3 text-sm">
                <span className="font-medium">{formatMoney(d!.plan.monthlyPriceCents)}</span> <span className="text-ink-subtle">por mês</span>
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm">
                Situação da conta: <Badge tone={d!.status === "active" ? "success" : d!.status === "trial" ? "info" : "warning"}>{ACCOUNT_LABEL[d!.status]}</Badge>
              </p>
              {d!.trialEndsAt && <p className="mt-1 text-sm text-ink-subtle">Teste até {formatDate(d!.trialEndsAt)}</p>}
              <p className="mt-4 text-xs text-ink-subtle">
                Para mudar de plano ou contratar módulos, fale com o suporte da plataforma. A cobrança automática depende de integração com meio de pagamento, prevista para uma etapa futura.
              </p>
            </Card>
            <Card title="Uso do plano" tourId="settings.plan.usage">
              <div className="flex flex-col gap-4">
                <UsageBar label="Unidades ativas" used={d!.usage.units} limit={d!.plan.limits.units} />
                <UsageBar label="Pessoas na equipe (inclui convites)" used={d!.usage.users} limit={d!.plan.limits.users} />
                <UsageBar label="Clientes ativos" used={d!.usage.clients} limit={d!.plan.limits.clients} />
              </div>
            </Card>
          </div>

          <section data-tour="settings.plan.modules">
            <h2 className="mb-3 text-lg font-semibold">Módulos</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {d!.modules.map((m) => {
                const extras = Object.entries(m.enhancedBy) as [ModuleKey, string][];
                return (
                  <li key={m.key} className={clsx("card flex flex-col gap-2 p-4", !contracted(m) && "bg-surface-muted/60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="flex-1 font-semibold">{m.name}</h3>
                      <Badge tone={STATUS_TONE[m.status]} dot>{MODULE_STATUS_LABEL[m.status]}</Badge>
                      {m.availability === "em_construcao" && <Badge>Em construção</Badge>}
                      {m.availability === "futuro" && <Badge>Etapa futura</Badge>}
                    </div>
                    <p className="text-sm text-ink-muted">{m.description}</p>
                    {m.status === "read_only" && m.readOnlyUntil && (
                      <Callout tone="warning">Disponível para consulta e exportação até {formatDate(m.readOnlyUntil)}. Depois disso, os dados ficam guardados, mas o módulo deixa de aparecer.</Callout>
                    )}
                    {m.requires.filter((r) => r !== "core").length > 0 && (
                      <p className="text-xs text-ink-subtle">Precisa de: {m.requires.filter((r) => r !== "core").map((r) => MODULES[r].name).join(", ")}</p>
                    )}
                    {extras.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-primary">Junto com outros módulos</summary>
                        <ul className="mt-2 flex flex-col gap-1.5">
                          {extras.map(([other, text]) => (
                            <li key={other} className="flex gap-2">
                              <Badge tone={session.hasModule(other) ? "success" : "neutral"}>{MODULES[other].name}</Badge>
                              <span className="text-ink-muted">{text}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {d!.history.length > 0 && (
            <Card title="Histórico da contratação">
              <ul className="divide-y divide-border text-sm">
                {d!.history.map((h, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
                    <span>
                      {h.kind === "module" && h.subject ? `${MODULES[h.subject as ModuleKey]?.name ?? h.subject}: ` : h.kind === "plan" ? "Plano: " : h.kind === "status" ? "Situação: " : ""}
                      {h.fromValue && `${MODULE_STATUS_LABEL[h.fromValue as ModuleStatus] ?? ACCOUNT_LABEL[h.fromValue] ?? h.fromValue} → `}
                      {MODULE_STATUS_LABEL[h.toValue as ModuleStatus] ?? ACCOUNT_LABEL[h.toValue ?? ""] ?? h.toValue}
                      {h.reason && <span className="text-ink-subtle"> — {h.reason}</span>}
                    </span>
                    <span className="text-ink-subtle">{formatDateTime(h.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </SettingsLayout>
  );
}
