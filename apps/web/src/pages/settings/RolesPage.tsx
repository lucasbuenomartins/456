import { MODULES, PERMISSIONS, type PermissionDefinition } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, ShieldAlert, Trash2 } from "../../ui/icons";
import { useMemo, useState } from "react";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { useScreen } from "../../tours/TourProvider";
import { Badge, Button, Callout, Checkbox, ConfirmDialog, Dialog, ErrorState, Field, Input, LoadingRows, Textarea, useToast } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface Role {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  templateKey: string | null;
  membersCount: number;
}

const isSensitive = (perms: string[]) => perms.some((p) => PERMISSIONS.find((x) => x.key === p && "sensitive" in x && x.sensitive));

export function RolesPage() {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["roles"], queryFn: () => api<{ items: Role[] }>("/api/settings/roles") });
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  useScreen("settings.roles", { ready: !q.isLoading });
  const canManage = session.can("roles.manage") && session.canWrite("core");

  return (
    <SettingsLayout
      title="Funções e permissões"
      description="Uma função reúne o que a pessoa pode ver e fazer. Atribua funções às pessoas em Equipe."
      actions={
        canManage && (
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")} data-tour="settings.roles.new">
            Nova função
          </Button>
        )
      }
    >
      <Callout tone="info" className="mb-4">
        <span data-tour="settings.roles.sensitive" className="inline-flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-warning" aria-hidden />
          Funções marcadas com <Badge tone="warning">Dados de saúde</Badge> dão acesso a anamnese, evolução e fotos.
        </span>
      </Callout>
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <ul className="card divide-y divide-border" data-tour="settings.roles.list">
          {q.data!.items.map((r) => (
            <li key={r.id}>
              <button onClick={() => setEditing(r)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-muted sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {r.name}
                    {isSensitive(r.permissions) && <Badge tone="warning">Dados de saúde</Badge>}
                  </p>
                  {r.description && <p className="text-sm text-ink-subtle">{r.description}</p>}
                </div>
                <span className="hidden text-sm text-ink-subtle sm:block">
                  {r.membersCount} pessoa{r.membersCount === 1 ? "" : "s"} · {r.permissions.length} permissões
                </span>
                <ChevronRight className="h-5 w-5 text-ink-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          readOnly={!canManage}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["roles"] });
            session.refresh();
            toast.success("Função salva.");
            setEditing(null);
          }}
        />
      )}
    </SettingsLayout>
  );
}

function RoleDialog({ role, readOnly, onClose, onSaved }: { role: Role | null; readOnly: boolean; onClose: () => void; onSaved: () => void }) {
  const session = useSession();
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const p of PERMISSIONS) {
      const key = `${p.module}|${p.group}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, []);

  const toggle = (k: string) => {
    const n = new Set(perms);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setPerms(n);
  };

  const save = async () => {
    if (name.trim().length < 2) return setErrors({ name: "Informe o nome da função." });
    setBusy(true);
    setFormError(null);
    try {
      const body = { name, description: description || null, permissions: [...perms] };
      if (role) await api(`/api/settings/roles/${role.id}`, { method: "PUT", body });
      else await api("/api/settings/roles", { body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        setFormError(Object.keys(e.fields).length ? null : e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        size="lg"
        title={role ? role.name : "Nova função"}
        description={role ? `${role.membersCount} pessoa(s) com esta função.` : "Escolha o que quem tiver esta função poderá fazer."}
        footer={
          readOnly ? (
            <Button variant="secondary" onClick={onClose}>Fechar</Button>
          ) : (
            <>
              {role && role.membersCount === 0 && (
                <Button variant="ghost" className="sm:mr-auto text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)}>
                  Excluir função
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button loading={busy} onClick={save}>Salvar função</Button>
            </>
          )
        }
      >
        <div className="grid gap-4">
          {formError && <Callout tone="danger">{formError}</Callout>}
          {!readOnly && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" error={errors.name} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Descrição" optional>
                <Textarea rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          )}
          {groups.map(([key, list]) => {
            const module = list[0]!.module;
            const contracted = session.hasModule(module);
            return (
              <fieldset key={key} className="rounded-xl border border-border p-3">
                <legend className="px-1 text-sm font-semibold">
                  {list[0]!.group}
                  {!contracted && <span className="ml-2 font-normal text-ink-subtle">({MODULES[module].name} — não contratado)</span>}
                </legend>
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {list.map((p) => (
                    <Checkbox
                      key={p.key}
                      checked={perms.has(p.key)}
                      disabled={readOnly}
                      onChange={() => toggle(p.key)}
                      label={
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {p.label}
                          {p.sensitive && <Badge tone="warning">Dados de saúde</Badge>}
                          {p.scope === "tenant" && <Badge>Toda a empresa</Badge>}
                        </span>
                      }
                      description={p.description}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
          <p className="text-xs text-ink-subtle">
            Permissões “Toda a empresa” só valem quando a função é atribuída a “Todas as unidades”. Você só pode conceder permissões que você mesmo possui.
          </p>
        </div>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir a função ${role?.name}?`}
        confirmLabel="Excluir"
        tone="danger"
        onConfirm={async () => {
          try {
            await api(`/api/settings/roles/${role!.id}`, { method: "DELETE" });
            onSaved();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Não foi possível excluir.");
          }
        }}
      />
    </>
  );
}
