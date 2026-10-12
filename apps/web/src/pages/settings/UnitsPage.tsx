import { formatPhoneBR, unitSchema } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { useScreen } from "../../tours/TourProvider";
import { Badge, Button, Callout, Dialog, EmptyState, ErrorState, Field, Input, LoadingRows, Switch, useToast } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface Unit {
  id: string;
  name: string;
  phone: string | null;
  address: Record<string, string | null>;
  isActive: boolean;
}

type UnitForm = { name: string; phone: string; isActive: boolean; address: { street: string; number: string; district: string; city: string; state: string; zipCode: string } };

const emptyForm: UnitForm = { name: "", phone: "", isActive: true, address: { street: "", number: "", district: "", city: "", state: "", zipCode: "" } };

export function UnitsPage() {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["units"], queryFn: () => api<{ items: Unit[] }>("/api/settings/units") });
  const [editing, setEditing] = useState<Unit | "new" | null>(null);
  const [form, setForm] = useState<UnitForm>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useScreen("settings.units", { ready: !q.isLoading });
  const canEdit = session.canWrite("core");
  const limit = session.me.tenant.plan?.limits.units ?? null;
  const activeCount = q.data?.items.filter((u) => u.isActive).length ?? 0;

  const open = (u: Unit | "new") => {
    setErrors({});
    setFormError(null);
    setEditing(u);
    setForm(
      u === "new"
        ? emptyForm
        : {
            name: u.name,
            phone: u.phone ? formatPhoneBR(u.phone) : "",
            isActive: u.isActive,
            address: { ...emptyForm.address, ...Object.fromEntries(Object.entries(u.address).map(([k, v]) => [k, v ?? ""])) },
          },
    );
  };

  const save = async () => {
    const payload = { ...form, phone: form.phone || null };
    const parsed = unitSchema.safeParse(payload);
    if (!parsed.success) return setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
    setBusy(true);
    setFormError(null);
    try {
      if (editing === "new") await api("/api/settings/units", { body: payload });
      else await api(`/api/settings/units/${(editing as Unit).id}`, { method: "PUT", body: payload });
      await qc.invalidateQueries({ queryKey: ["units"] });
      session.refresh();
      toast.success(editing === "new" ? "Unidade criada." : "Unidade atualizada.");
      setEditing(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(Object.keys(err.fields).length ? null : err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsLayout
      title="Unidades"
      description="Cada endereço da clínica. As funções da equipe podem valer para uma ou todas as unidades."
      actions={
        canEdit && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => open("new")} data-tour="settings.units.new" disabled={limit !== null && activeCount >= limit}>
            Nova unidade
          </Button>
        )
      }
    >
      {limit !== null && activeCount >= limit && (
        <Callout tone="info" className="mb-4">
          Seu plano permite até {limit} unidade{limit > 1 ? "s" : ""} ativa{limit > 1 ? "s" : ""}. Para incluir mais, o responsável pela conta pode solicitar a mudança de plano.
        </Callout>
      )}
      {q.isLoading ? (
        <LoadingRows rows={2} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="Nenhuma unidade" />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" data-tour="settings.units.list">
          {q.data!.items.map((u) => (
            <li key={u.id} className="card flex items-start gap-3 p-4">
              <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {u.name} {!u.isActive && <Badge>Inativa</Badge>}
                </p>
                <p className="text-sm text-ink-subtle">
                  {[u.address.street && `${u.address.street}${u.address.number ? `, ${u.address.number}` : ""}`, u.address.city].filter(Boolean).join(" · ") || "Endereço não informado"}
                </p>
                {u.phone && <p className="text-sm text-ink-subtle tabular">{formatPhoneBR(u.phone)}</p>}
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => open(u)} aria-label={`Editar ${u.name}`}>
                  Editar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === "new" ? "Nova unidade" : "Editar unidade"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={busy} onClick={save}>Salvar unidade</Button>
          </>
        }
      >
        <div className="grid gap-4">
          {formError && <Callout tone="danger">{formError}</Callout>}
          <Field label="Nome da unidade" error={errors.name} required hint="Ex.: Unidade Centro">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Telefone" error={errors.phone} optional>
            <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhoneBR(e.target.value) })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Rua" className="sm:col-span-4">
              <Input value={form.address.street} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} />
            </Field>
            <Field label="Número" className="sm:col-span-2">
              <Input value={form.address.number} onChange={(e) => setForm({ ...form, address: { ...form.address, number: e.target.value } })} />
            </Field>
            <Field label="Bairro" className="sm:col-span-2">
              <Input value={form.address.district} onChange={(e) => setForm({ ...form, address: { ...form.address, district: e.target.value } })} />
            </Field>
            <Field label="Cidade" className="sm:col-span-3">
              <Input value={form.address.city} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
            </Field>
            <Field label="UF" className="sm:col-span-1">
              <Input maxLength={2} value={form.address.state} onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value.toUpperCase() } })} />
            </Field>
          </div>
          {editing !== "new" && (
            <Switch
              checked={form.isActive}
              onChange={(v) => setForm({ ...form, isActive: v })}
              label="Unidade ativa"
              description="Unidades inativas não aparecem para seleção, mas o histórico é mantido."
            />
          )}
        </div>
      </Dialog>
    </SettingsLayout>
  );
}
