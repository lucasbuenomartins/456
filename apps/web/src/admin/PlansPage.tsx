import { MODULES, MODULE_KEYS, type ModuleKey } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "../ui/icons";
import { useState } from "react";
import { ApiError, api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useScreen } from "../tours/TourProvider";
import { Badge, Button, Callout, Checkbox, Dialog, ErrorState, Field, Input, LoadingRows, PageHeader, Switch, Textarea, useToast } from "../ui";

interface PlanFull {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  modules: ModuleKey[];
  limits: { units: number | null; users: number | null; clients: number | null; storageMb: number | null };
  isActive: boolean;
  tenantsCount: number;
}

const limitLabel = (v: number | null) => (v === null ? "Sem limite" : v.toLocaleString("pt-BR"));

export function PlansPage() {
  const q = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<{ items: PlanFull[] }>("/api/admin/plans") });
  const [editing, setEditing] = useState<PlanFull | "new" | null>(null);
  useScreen("admin.plans", { ready: !q.isLoading, title: "Planos" });
  return (
    <>
      <PageHeader title="Planos" description="Módulos incluídos e limites de uso." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>Novo plano</Button>} />
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-3" data-tour="admin.plans.list">
          {q.data!.items.map((p) => (
            <li key={p.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <h2 className="flex-1 text-lg font-semibold">{p.name}</h2>
                {!p.isActive && <Badge>Inativo</Badge>}
              </div>
              <p className="text-2xl font-semibold">{formatMoney(p.monthlyPriceCents)}<span className="text-sm font-normal text-ink-subtle">/mês</span></p>
              <p className="text-sm text-ink-muted">{p.description}</p>
              <div className="flex flex-wrap gap-1">
                {p.modules.filter((m) => m !== "core").map((m) => (
                  <Badge key={m} tone="primary">{MODULES[m].name}</Badge>
                ))}
              </div>
              <p className="text-sm text-ink-subtle">
                Unidades: {limitLabel(p.limits.units)} · Pessoas: {limitLabel(p.limits.users)} · Clientes: {limitLabel(p.limits.clients)}
              </p>
              <p className="text-sm text-ink-subtle">{p.tenantsCount} empresa(s)</p>
              <Button variant="secondary" onClick={() => setEditing(p)} className="mt-auto">Editar</Button>
            </li>
          ))}
        </ul>
      )}
      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PlanDialog({ plan, onClose }: { plan: PlanFull | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: plan ? (plan.monthlyPriceCents / 100).toFixed(2) : "0.00",
    modules: new Set<ModuleKey>(plan?.modules ?? ["core"]),
    units: plan?.limits.units?.toString() ?? "",
    users: plan?.limits.users?.toString() ?? "",
    clients: plan?.limits.clients?.toString() ?? "",
    storageMb: plan?.limits.storageMb?.toString() ?? "",
    isActive: plan?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const num = (v: string) => (v.trim() === "" ? null : Math.max(1, Math.round(Number(v))));

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        code: f.code,
        name: f.name,
        description: f.description || null,
        monthlyPriceCents: Math.round(Number(f.price.replace(",", ".")) * 100) || 0,
        modules: [...f.modules],
        limits: { units: num(f.units), users: num(f.users), clients: num(f.clients), storageMb: num(f.storageMb) },
        isActive: f.isActive,
      };
      if (plan) await api(`/api/admin/plans/${plan.id}`, { method: "PUT", body });
      else await api("/api/admin/plans", { body });
      qc.invalidateQueries({ queryKey: ["admin-plans"] });
      toast.success("Plano salvo.");
      onClose();
    } catch (e) {
      if (e instanceof ApiError) setErrors({ ...e.fields, _: Object.keys(e.fields).length ? "" : e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={plan ? `Editar ${plan.name}` : "Novo plano"} size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Salvar plano</Button></>}>
      <div className="grid gap-4">
        {errors._ && <Callout tone="danger">{errors._}</Callout>}
        {plan && plan.tenantsCount > 0 && (
          <Callout tone="info">Mudanças nos módulos valem para novas contratações e trocas de plano. Empresas atuais não perdem acesso automaticamente.</Callout>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Código" error={errors.code} required hint="ex.: profissional">
            <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} disabled={!!plan} />
          </Field>
          <Field label="Nome" error={errors.name} required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Preço mensal (R$)" error={errors.monthlyPriceCents}>
            <Input inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          </Field>
        </div>
        <Field label="Descrição" optional>
          <Textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Módulos incluídos</legend>
          <div className="grid sm:grid-cols-2">
            {MODULE_KEYS.map((m) => (
              <Checkbox
                key={m}
                label={MODULES[m].name}
                description={MODULES[m].requires.filter((r) => r !== "core").length ? `Exige ${MODULES[m].requires.filter((r) => r !== "core").map((r) => MODULES[r].name).join(", ")}` : undefined}
                checked={f.modules.has(m)}
                disabled={m === "core"}
                onChange={() => {
                  const n = new Set(f.modules);
                  if (n.has(m)) n.delete(m);
                  else {
                    n.add(m);
                    MODULES[m].requires.forEach((r) => n.add(r));
                  }
                  setF({ ...f, modules: n });
                }}
              />
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-4">
          {(["units", "users", "clients", "storageMb"] as const).map((k) => (
            <Field key={k} label={{ units: "Unidades", users: "Pessoas", clients: "Clientes ativos", storageMb: "Armazenamento (MB)" }[k]} hint="Vazio = sem limite">
              <Input inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, "") })} />
            </Field>
          ))}
        </div>
        <Switch checked={f.isActive} onChange={(v) => setF({ ...f, isActive: v })} label="Plano disponível para novas contratações" />
      </div>
    </Dialog>
  );
}
