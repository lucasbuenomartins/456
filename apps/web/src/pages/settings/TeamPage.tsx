import { PERMISSION_MAP } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, MessageCircle, MoreHorizontal, Plus, ShieldAlert, Trash2, UserMinus, UserPlus, UserCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { formatDate, relativeTime } from "../../lib/format";
import { useScreen } from "../../tours/TourProvider";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  ConfirmDialog,
  Dialog,
  ErrorState,
  Field,
  IconButton,
  Input,
  LoadingRows,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Select,
  useToast,
} from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface Assignment {
  roleId: string;
  roleName?: string;
  unitId: string | null;
}
interface Member {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  status: "active" | "disabled";
  jobTitle: string | null;
  isOwner: boolean;
  lastLoginAt: string | null;
  assignments: Assignment[];
}
interface Invite {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  expiresAt: string;
  expired: boolean;
  assignments: Assignment[];
}
interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export function TeamPage() {
  const session = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const team = useQuery({ queryKey: ["team"], queryFn: () => api<{ members: Member[]; invites: Invite[] }>("/api/settings/team") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<{ items: Role[] }>("/api/settings/roles") });
  const units = useQuery({ queryKey: ["units"], queryFn: () => api<{ items: { id: string; name: string; isActive: boolean }[] }>("/api/settings/units") });
  const [inviteOpen, setInviteOpen] = useState<false | Partial<Invite>>(false);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [confirm, setConfirm] = useState<{ member: Member; action: "disable" | "enable" } | null>(null);
  const [revoke, setRevoke] = useState<Invite | null>(null);
  useScreen("settings.team", { ready: !team.isLoading });

  const canManage = session.can("team.manage") && session.canWrite("core");
  const unitName = (id: string | null) => (id ? units.data?.items.find((u) => u.id === id)?.name ?? "Unidade" : "Todas as unidades");
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] });

  return (
    <SettingsLayout
      title="Equipe"
      description="Quem usa o sistema e o que cada pessoa pode fazer."
      actions={
        canManage && (
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen({})} data-tour="settings.team.invite">
            Convidar pessoa
          </Button>
        )
      }
    >
      {team.isLoading ? (
        <LoadingRows />
      ) : team.error ? (
        <ErrorState error={team.error} onRetry={() => team.refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          <Card padded={false} tourId="settings.team.list" title={`Pessoas (${team.data!.members.filter((m) => m.status === "active").length} ativas)`}>
            <ul className="divide-y divide-border">
              {team.data!.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {m.name}
                      {m.isOwner && <Badge tone="accent">Responsável pela conta</Badge>}
                      {m.status === "disabled" && <Badge tone="danger">Acesso desativado</Badge>}
                    </p>
                    <p className="text-sm text-ink-subtle">
                      {[m.jobTitle, m.email].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.assignments.map((a, i) => (
                        <Badge key={i} tone="primary">
                          {a.roleName} · {unitName(a.unitId)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {canManage && (
                    <span className="hidden text-xs text-ink-subtle md:block">Último acesso: {relativeTime(m.lastLoginAt)}</span>
                  )}
                  {canManage && !m.isOwner && m.userId !== session.me.user.id && (
                    <Menu>
                      <MenuTrigger asChild>
                        <IconButton label={`Ações para ${m.name}`}>
                          <MoreHorizontal className="h-5 w-5" />
                        </IconButton>
                      </MenuTrigger>
                      <MenuContent>
                        <MenuItem icon={<KeyRound />} onSelect={() => setEditMember(m)}>
                          Alterar funções
                        </MenuItem>
                        {m.status === "active" ? (
                          <MenuItem icon={<UserMinus />} danger onSelect={() => setConfirm({ member: m, action: "disable" })}>
                            Desativar acesso
                          </MenuItem>
                        ) : (
                          <MenuItem icon={<UserCheck />} onSelect={() => setConfirm({ member: m, action: "enable" })}>
                            Reativar acesso
                          </MenuItem>
                        )}
                      </MenuContent>
                    </Menu>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          {canManage && (
            <Card title="Convites pendentes" tourId="settings.team.invites" padded={false}>
              {team.data!.invites.length === 0 ? (
                <p className="px-5 py-4 text-sm text-ink-subtle">Nenhum convite pendente.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {team.data!.invites.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{inv.name}</p>
                        <p className="text-sm text-ink-subtle">
                          {inv.email} · {inv.expired ? <span className="text-danger">expirou em {formatDate(inv.expiresAt)}</span> : `válido até ${formatDate(inv.expiresAt)}`}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" icon={<Link2 className="h-4 w-4" />} onClick={() => setInviteOpen(inv)}>
                        Gerar novo link
                      </Button>
                      <IconButton label={`Cancelar convite de ${inv.name}`} onClick={() => setRevoke(inv)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      )}

      {inviteOpen !== false && roles.data && units.data && (
        <InviteDialog
          initial={inviteOpen}
          roles={roles.data.items}
          units={units.data.items.filter((u) => u.isActive)}
          onClose={() => setInviteOpen(false)}
          onDone={refresh}
        />
      )}
      {editMember && roles.data && units.data && (
        <AccessDialog member={editMember} roles={roles.data.items} units={units.data.items.filter((u) => u.isActive)} onClose={() => setEditMember(null)} onDone={refresh} />
      )}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "disable" ? `Desativar o acesso de ${confirm.member.name}?` : `Reativar o acesso de ${confirm?.member.name}?`}
        description={
          confirm?.action === "disable"
            ? "A pessoa não conseguirá mais entrar nesta clínica. O histórico e os registros feitos por ela são mantidos."
            : "A pessoa volta a entrar com as mesmas funções."
        }
        tone={confirm?.action === "disable" ? "danger" : "primary"}
        confirmLabel={confirm?.action === "disable" ? "Desativar" : "Reativar"}
        onConfirm={async () => {
          try {
            await api(`/api/settings/team/${confirm!.member.id}/${confirm!.action}`, { body: {} });
            toast.success(confirm!.action === "disable" ? "Acesso desativado." : "Acesso reativado.");
            refresh();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir.");
          }
        }}
      />
      <ConfirmDialog
        open={revoke !== null}
        onOpenChange={(o) => !o && setRevoke(null)}
        title="Cancelar convite?"
        description={`O link enviado para ${revoke?.name} deixará de funcionar.`}
        confirmLabel="Cancelar convite"
        tone="danger"
        onConfirm={async () => {
          await api(`/api/settings/team/invites/${revoke!.id}`, { method: "DELETE" });
          toast.success("Convite cancelado.");
          refresh();
        }}
      />
    </SettingsLayout>
  );
}

function sensitiveRoles(roles: Role[], assignments: Assignment[]) {
  return roles.filter((r) => assignments.some((a) => a.roleId === r.id) && r.permissions.some((p) => PERMISSION_MAP[p]?.sensitive));
}

function AssignmentsEditor({ value, onChange, roles, units, error }: { value: Assignment[]; onChange: (v: Assignment[]) => void; roles: Role[]; units: { id: string; name: string }[]; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">Funções <span className="text-danger">*</span></legend>
      <p className="mb-2 text-sm text-ink-subtle">Escolha a função e onde ela vale. Uma pessoa pode ter funções diferentes em cada unidade.</p>
      <ul className="flex flex-col gap-2">
        {value.map((a, i) => (
          <li key={i} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-center">
            <Select aria-label="Função" value={a.roleId} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, roleId: e.target.value } : x)))}>
              <option value="">Escolha a função</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
            <Select aria-label="Unidade" value={a.unitId ?? ""} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, unitId: e.target.value || null } : x)))}>
              <option value="">Todas as unidades</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
            {value.length > 1 && (
              <IconButton label="Remover função" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" />} onClick={() => onChange([...value, { roleId: "", unitId: null }])}>
        Adicionar outra função
      </Button>
      {error && <p className="mt-1 text-sm text-danger" role="alert">{error}</p>}
    </fieldset>
  );
}

function InviteDialog({ initial, roles, units, onClose, onDone }: { initial: Partial<Invite>; roles: Role[]; units: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [jobTitle, setJobTitle] = useState(initial.jobTitle ?? "");
  const [assignments, setAssignments] = useState<Assignment[]>(initial.assignments?.length ? initial.assignments : [{ roleId: "", unitId: null }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const toast = useToast();
  const sensitive = sensitiveRoles(roles, assignments);

  const submit = async () => {
    const valid = assignments.filter((a) => a.roleId);
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = "Informe o nome.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "E-mail inválido.";
    if (valid.length === 0) errs.assignments = "Escolha pelo menos uma função.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await api<{ inviteUrl: string }>("/api/settings/team/invites", { body: { name, email, jobTitle: jobTitle || null, assignments: valid.map(({ roleId, unitId }) => ({ roleId, unitId })) } });
      setLink(res.inviteUrl);
      onDone();
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fields);
        if (!Object.keys(e.fields).length) setFormError(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (link) {
    const text = `Olá, ${name.split(" ")[0]}! Este é o seu convite para acessar o sistema da clínica: ${link}`;
    return (
      <Dialog
        open
        onOpenChange={(o) => !o && onClose()}
        title="Convite criado"
        description="Envie o link abaixo para a pessoa. Ele vale por 7 dias e só pode ser usado uma vez."
        footer={<Button onClick={onClose}>Concluir</Button>}
      >
        <div className="flex flex-col gap-3">
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(link).then(() => toast.success("Link copiado."))}>
              Copiar link
            </Button>
            <a className="inline-flex min-h-touch items-center justify-center gap-2 rounded-lg border border-border-strong px-4 text-[0.9375rem] font-medium hover:bg-surface-muted sm:min-h-[40px]" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4 text-success" aria-hidden /> Enviar por WhatsApp
            </a>
          </div>
          <p className="text-xs text-ink-subtle">O envio automático por e-mail depende de integração que será adicionada em uma próxima etapa.</p>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={initial.id ? "Gerar novo convite" : "Convidar pessoa"}
      description="A pessoa recebe um link para criar a própria senha."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={submit}>Criar convite</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {formError && <Callout tone="danger">{formError}</Callout>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" error={errors.name} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="E-mail" error={errors.email} required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Field label="Cargo" optional hint="Ex.: Recepcionista, Biomédica">
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <AssignmentsEditor value={assignments} onChange={setAssignments} roles={roles} units={units} error={errors.assignments} />
        {sensitive.length > 0 && (
          <Callout tone="warning" title="Acesso a dados de saúde">
            A função {sensitive.map((r) => r.name).join(", ")} permite ver anamnese, evolução e fotos. Conceda apenas a quem atende os clientes.
          </Callout>
        )}
      </div>
    </Dialog>
  );
}

function AccessDialog({ member, roles, units, onClose, onDone }: { member: Member; roles: Role[]; units: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [assignments, setAssignments] = useState<Assignment[]>(member.assignments.map(({ roleId, unitId }) => ({ roleId, unitId })));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const sensitive = sensitiveRoles(roles, assignments);
  const save = async () => {
    const valid = assignments.filter((a) => a.roleId);
    if (!valid.length) return setError("Escolha pelo menos uma função.");
    setBusy(true);
    setError(null);
    try {
      await api(`/api/settings/team/${member.id}`, { method: "PUT", body: { jobTitle: jobTitle || null, assignments: valid } });
      toast.success(`Funções de ${member.name} atualizadas.`);
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Funções de ${member.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button loading={busy} onClick={save}>Salvar</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="Cargo" optional>
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <AssignmentsEditor value={assignments} onChange={setAssignments} roles={roles} units={units} />
        {sensitive.length > 0 && (
          <Callout tone="warning" title="Acesso a dados de saúde">
            <span className="inline-flex items-center gap-1"><ShieldAlert className="h-4 w-4" aria-hidden /> Esta combinação permite ver dados de saúde e fotos.</span>
          </Callout>
        )}
        <p className="text-xs text-ink-subtle">A alteração vale a partir da próxima ação da pessoa e fica registrada no histórico.</p>
      </div>
    </Dialog>
  );
}
