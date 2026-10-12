import { MODULES, MODULE_STATUS_LABEL, type ModuleKey, type ModuleStatus } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2 } from "../ui/icons";
import { useState } from "react";
import { useParams } from "react-router";
import { ApiError, api } from "../lib/api";
import { formatDate, formatDateTime } from "../lib/format";
import { useScreen } from "../tours/TourProvider";
import { Badge, Button, Callout, Card, DescriptionList, Dialog, ErrorState, Field, Input, LoadingRows, PageHeader, Select, Textarea, useToast } from "../ui";
import { TENANT_STATUS, type Plan } from "./TenantsPage";

interface Detail {
  tenant: { id: string; name: string; document: string | null; status: string; trialEndsAt: string | null; dataAvailableUntil: string | null; createdAt: string };
  plan: { id: string; name: string; modules: string[] };
  usage: { members: number; units: number; clients: number };
  modules: { key: ModuleKey; name: string; requires: ModuleKey[]; availability: string; status: ModuleStatus; source: string | null; readOnlyUntil: string | null }[];
  history: { id: string; kind: string; subject: string | null; fromValue: string | null; toValue: string | null; reason: string | null; createdAt: string; actorName: string | null }[];
  pendingOwnerInvite: { email: string; expiresAt: string } | null;
}

type PendingChange =
  | { kind: "status"; status: "active" | "suspended" | "cancelled"; title: string; description: string }
  | { kind: "plan"; planId: string; title: string; description: string }
  | { kind: "module"; module: ModuleKey; status: ModuleStatus; title: string; description: string };

/** Traduz códigos de situação (conta ou módulo) para o rótulo exibido. */
const label = (v: string | null) => (v ? (TENANT_STATUS[v]?.label ?? MODULE_STATUS_LABEL[v as ModuleStatus] ?? v) : "");

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-tenant", id], queryFn: () => api<Detail>(`/api/admin/tenants/${id}`) });
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<{ items: Plan[] }>("/api/admin/plans") });
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  useScreen("admin.tenant", { ready: !q.isLoading, title: q.data?.tenant.name ?? "Empresa" });

  if (q.isLoading) return <LoadingRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const st = TENANT_STATUS[d.tenant.status]!;

  const apply = async () => {
    if (!pending) return;
    if (reason.trim().length < 3) return setError("Explique o motivo (aparece no histórico da clínica).");
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === "status") await api(`/api/admin/tenants/${id}/status`, { body: { status: pending.status, reason } });
      if (pending.kind === "plan") await api(`/api/admin/tenants/${id}/plan`, { body: { planId: pending.planId, reason } });
      if (pending.kind === "module") await api(`/api/admin/tenants/${id}/modules/${pending.module}`, { method: "PUT", body: { status: pending.status, reason } });
      await qc.invalidateQueries({ queryKey: ["admin-tenant", id] });
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
      toast.success("Alteração aplicada.");
      setPending(null);
      setReason("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível aplicar.");
    } finally {
      setBusy(false);
    }
  };

  const ask = (p: PendingChange) => {
    setReason("");
    setError(null);
    setPending(p);
  };

  return (
    <>
      <PageHeader
        title={d.tenant.name}
        crumbs={[{ label: "Empresas", to: "/admin/empresas" }, { label: d.tenant.name }]}
        meta={
          <>
            <Badge tone={st.tone} dot>{st.label}</Badge>
            <Badge>Plano {d.plan.name}</Badge>
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Situação da conta" tourId="admin.tenant.status" className="lg:col-span-2">
          <DescriptionList
            items={[
              { label: "Desde", value: formatDate(d.tenant.createdAt) },
              { label: "Teste até", value: d.tenant.trialEndsAt ? formatDate(d.tenant.trialEndsAt) : null },
              { label: "Dados disponíveis até", value: d.tenant.dataAvailableUntil ? formatDate(d.tenant.dataAvailableUntil) : null },
              { label: "Uso", value: `${d.usage.units} unidade(s) · ${d.usage.members} pessoa(s) · ${d.usage.clients} cliente(s) ativos` },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {d.tenant.status !== "active" && (
              <Button onClick={() => ask({ kind: "status", status: "active", title: "Ativar conta", description: "A clínica volta a usar todos os recursos. Módulos em teste passam a ativos." })}>
                Ativar
              </Button>
            )}
            {d.tenant.status !== "suspended" && d.tenant.status !== "cancelled" && (
              <Button variant="secondary" onClick={() => ask({ kind: "status", status: "suspended", title: "Suspender conta", description: "A clínica fica em somente leitura: consulta e exportação continuam disponíveis. As sessões abertas são encerradas." })}>
                Suspender
              </Button>
            )}
            {d.tenant.status !== "cancelled" && (
              <Button variant="danger" onClick={() => ask({ kind: "status", status: "cancelled", title: "Cancelar conta", description: "A clínica perde o acesso operacional. Os dados ficam disponíveis para exportação por 90 dias." })}>
                Cancelar
              </Button>
            )}
          </div>
          {d.pendingOwnerInvite && (
            <Callout tone="info" className="mt-4" title="Responsável ainda não aceitou o convite" action={
              <Button size="sm" variant="secondary" icon={<Link2 className="h-4 w-4" />} onClick={async () => {
                const r = await api<{ ownerInviteUrl: string }>(`/api/admin/tenants/${id}/owner-invite`, { body: {} });
                setInviteUrl(r.ownerInviteUrl);
              }}>
                Gerar novo link
              </Button>
            }>
              {d.pendingOwnerInvite.email} · expira em {formatDate(d.pendingOwnerInvite.expiresAt)}
            </Callout>
          )}
          {inviteUrl && (
            <div className="mt-3 flex gap-2">
              <Input readOnly value={inviteUrl} aria-label="Novo link de convite" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => toast.success("Link copiado."))}>
                Copiar
              </Button>
            </div>
          )}
        </Card>

        <Card title="Plano" tourId="admin.tenant.plan">
          <Field label="Trocar plano" hint="Módulos que saem do plano ficam 90 dias em somente leitura.">
            <Select
              value={d.plan.id}
              onChange={(e) => {
                const p = plans.data?.items.find((x) => x.id === e.target.value);
                if (p) ask({ kind: "plan", planId: p.id, title: `Trocar para o plano ${p.name}`, description: "Os módulos serão ajustados ao novo plano. Módulos avulsos não mudam." });
              }}
            >
              {plans.data?.items.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.isActive}>{p.name}</option>
              ))}
            </Select>
          </Field>
        </Card>
      </div>

      <Card title="Módulos" tourId="admin.tenant.modules" className="mt-5" padded={false}>
        <ul className="divide-y divide-border">
          {d.modules.filter((m) => m.key !== "core").map((m) => (
            <li key={m.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
              <div className="flex-1">
                <p className="font-medium">
                  {m.name} {m.source === "addon" && <Badge>Avulso</Badge>}
                </p>
                <p className="text-sm text-ink-subtle">
                  {m.requires.filter((r) => r !== "core").length > 0 && `Exige: ${m.requires.filter((r) => r !== "core").map((r) => MODULES[r].name).join(", ")}. `}
                  {m.readOnlyUntil && `Somente leitura até ${formatDate(m.readOnlyUntil)}.`}
                </p>
              </div>
              <Select
                aria-label={`Situação do módulo ${m.name}`}
                value={m.status}
                className="sm:!w-48"
                onChange={(e) => {
                  const status = e.target.value as ModuleStatus;
                  ask({
                    kind: "module",
                    module: m.key,
                    status,
                    title: `${m.name}: ${MODULE_STATUS_LABEL[status]}`,
                    description:
                      status === "read_only"
                        ? "A clínica poderá consultar e exportar por 90 dias, sem cadastrar ou alterar."
                        : status === "disabled"
                          ? "O módulo deixa de aparecer imediatamente. Os dados continuam guardados."
                          : "O módulo fica disponível para uso.",
                  });
                }}
              >
                {(["active", "trial", "read_only", "disabled"] as ModuleStatus[]).map((s) => (
                  <option key={s} value={s}>{MODULE_STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Histórico" tourId="admin.tenant.history" className="mt-5" padded={false}>
        <ul className="divide-y divide-border text-sm">
          {d.history.map((h) => (
            <li key={h.id} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between sm:px-5">
              <span>
                <span className="font-medium">{{ created: "Criação", status: "Situação", plan: "Plano", module: "Módulo" }[h.kind] ?? h.kind}</span>
                {h.subject && ` ${MODULES[h.subject as ModuleKey]?.name ?? h.subject}`}: {h.fromValue && `${label(h.fromValue)} → `}
                {label(h.toValue)}
                {h.reason && <span className="text-ink-subtle"> — {h.reason}</span>}
              </span>
              <span className="text-ink-subtle">
                {formatDateTime(h.createdAt)} {h.actorName && `· ${h.actorName}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Dialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.title ?? ""}
        description={pending?.description}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>Cancelar</Button>
            <Button loading={busy} onClick={apply} variant={pending?.kind === "status" && pending.status === "cancelled" ? "danger" : "primary"}>
              Confirmar
            </Button>
          </>
        }
      >
        {error && <Callout tone="danger" className="mb-3">{error}</Callout>}
        <Field label="Motivo" required hint="Fica registrado no histórico e visível para a clínica.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} autoFocus />
        </Field>
      </Dialog>
    </>
  );
}
