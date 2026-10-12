import { createTenantSchema } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Copy, Plus } from "../ui/icons";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { useScreen } from "../tours/TourProvider";
import { Badge, Button, Callout, DataTable, Dialog, EmptyState, ErrorState, Field, Input, LoadingRows, PageHeader, SearchInput, Select, useToast, type Tone } from "../ui";

export const TENANT_STATUS: Record<string, { label: string; tone: Tone }> = {
  trial: { label: "Em teste", tone: "info" },
  active: { label: "Ativa", tone: "success" },
  suspended: { label: "Suspensa", tone: "warning" },
  cancelled: { label: "Cancelada", tone: "danger" },
};

interface TenantRow {
  id: string;
  name: string;
  document: string | null;
  status: string;
  planName: string;
  members: number;
  modules: string[];
  createdAt: string;
  trialEndsAt: string | null;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function TenantsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q, 250);
  const [creating, setCreating] = useState(false);
  const list = useQuery({
    queryKey: ["admin-tenants", dq, status],
    queryFn: () => api<{ items: TenantRow[] }>(`/api/admin/tenants?${new URLSearchParams({ q: dq, status })}`),
  });
  useScreen("admin.tenants", { ready: !list.isLoading, title: "Empresas" });

  return (
    <>
      <PageHeader
        title="Empresas clientes"
        description="Clínicas que usam a plataforma."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} data-tour="admin.tenants.new">
            Nova empresa
          </Button>
        }
      />
      <div className="card">
        <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Buscar por nome ou documento" className="flex-1" aria-label="Buscar empresas" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação" className="sm:!w-48">
            <option value="">Todas as situações</option>
            {Object.entries(TENANT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </div>
        {list.isLoading ? (
          <LoadingRows />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data!.items.length === 0 ? (
          <EmptyState icon={<Building2 className="h-6 w-6" />} title="Nenhuma empresa encontrada" tourId="admin.tenants.list" />
        ) : (
          <DataTable
            caption="Empresas"
            tourId="admin.tenants.list"
            rows={list.data!.items}
            rowId={(t) => t.id}
            onOpen={(t) => navigate(`/admin/empresas/${t.id}`)}
            columns={[
              { key: "name", header: "Empresa", cell: (t) => <span className="font-medium">{t.name}</span> },
              { key: "plan", header: "Plano", cell: (t) => t.planName },
              { key: "status", header: "Situação", cell: (t) => <Badge tone={TENANT_STATUS[t.status]?.tone} dot>{TENANT_STATUS[t.status]?.label}</Badge> },
              { key: "members", header: "Pessoas", numeric: true, cell: (t) => t.members },
              { key: "modules", header: "Módulos ativos", cell: (t) => <span className="text-sm text-ink-muted">{t.modules.filter((m) => m !== "core").join(", ") || "—"}</span> },
              { key: "created", header: "Desde", cell: (t) => formatDate(t.createdAt) },
            ]}
            mobileRow={(t) => (
              <span className="flex flex-1 items-center justify-between gap-2">
                <span>
                  <span className="block font-medium">{t.name}</span>
                  <span className="text-sm text-ink-subtle">{t.planName}</span>
                </span>
                <Badge tone={TENANT_STATUS[t.status]?.tone}>{TENANT_STATUS[t.status]?.label}</Badge>
              </span>
            )}
          />
        )}
      </div>
      {creating && <CreateTenantDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateTenantDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => api<{ items: Plan[] }>("/api/admin/plans") });
  const [form, setForm] = useState({ name: "", document: "", planId: "", trialDays: 14, firstUnitName: "Unidade principal", ownerName: "", ownerEmail: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; ownerInviteUrl: string } | null>(null);

  const submit = async () => {
    const payload = {
      name: form.name,
      document: form.document || null,
      planId: form.planId,
      trialDays: Number(form.trialDays),
      firstUnitName: form.firstUnitName,
      owner: { name: form.ownerName, email: form.ownerEmail },
    };
    const parsed = createTenantSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    setFormError(null);
    try {
      const r = await api<{ id: string; ownerInviteUrl: string }>("/api/admin/tenants", { body: payload });
      setResult(r);
      qc.invalidateQueries({ queryKey: ["admin-tenants"] });
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        setFormError(Object.keys(e.fields).length ? null : e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()} title="Empresa criada" description="Envie o link abaixo ao responsável pela conta. Ele vale por 7 dias." footer={<Button onClick={onClose}>Concluir</Button>}>
        <div className="flex gap-2">
          <Input readOnly value={result.ownerInviteUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Link de convite" />
          <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(result.ownerInviteUrl).then(() => toast.success("Link copiado."))}>
            Copiar
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nova empresa"
      description="Cria a empresa com unidade, funções-modelo e módulos do plano."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={submit}>Criar empresa</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {formError && <Callout tone="danger">{formError}</Callout>}
        <Field label="Nome da clínica" error={errors.name} required>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CNPJ ou CPF" error={errors.document} optional>
            <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
          </Field>
          <Field label="Primeira unidade" error={errors.firstUnitName}>
            <Input value={form.firstUnitName} onChange={(e) => setForm({ ...form, firstUnitName: e.target.value })} />
          </Field>
          <Field label="Plano" error={errors.planId} required>
            <Select value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
              <option value="">Escolha</option>
              {plans.data?.items.filter((p) => p.isActive).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dias de teste" error={errors.trialDays} hint="0 = ativa sem teste">
            <Input type="number" min={0} max={90} value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: Number(e.target.value) })} />
          </Field>
          <Field label="Responsável pela conta" error={errors["owner.name"]} required>
            <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </Field>
          <Field label="E-mail do responsável" error={errors["owner.email"]} required>
            <Input type="email" value={form.ownerEmail} onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
