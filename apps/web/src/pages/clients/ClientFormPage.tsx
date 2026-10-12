import { CLIENT_ORIGINS, CLIENT_ORIGIN_LABEL, clientInputSchema, formatCpf, formatPhoneBR, onlyDigits } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MessageCircle, Plus, X } from "../../ui/icons";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useSession } from "../../app/session";
import { ApiError, api, newIdempotencyKey } from "../../lib/api";
import { useDraft } from "../../lib/draft";
import { formatDateTime } from "../../lib/format";
import { useBeforeUnload, useDebounced, useHotkey, useOnline } from "../../lib/hooks";
import { useScreen } from "../../tours/TourProvider";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Checkbox,
  ChoiceGroup,
  Dialog,
  ErrorState,
  Field,
  FormSection,
  Input,
  LoadingRows,
  PageHeader,
  SaveStatus,
  Select,
  Switch,
  Textarea,
  useToast,
} from "../../ui";
import type { ClientDetail } from "./ClientDetailPage";

interface FormState {
  fullName: string;
  socialName: string;
  phone: string;
  phoneIsWhatsapp: boolean;
  email: string;
  birthDate: string;
  cpf: string;
  origin: (typeof CLIENT_ORIGINS)[number] | null;
  preferredUnitId: string;
  notes: string;
  tags: string[];
  address: { zipCode: string; street: string; number: string; complement: string; district: string; city: string; state: string };
  consents: { whatsapp: boolean; sms: boolean };
}

const EMPTY: FormState = {
  fullName: "",
  socialName: "",
  phone: "",
  phoneIsWhatsapp: true,
  email: "",
  birthDate: "",
  cpf: "",
  origin: null,
  preferredUnitId: "",
  notes: "",
  tags: [],
  address: { zipCode: "", street: "", number: "", complement: "", district: "", city: "", state: "" },
  consents: { whatsapp: false, sms: false },
};

interface Candidate {
  id: string;
  fullName: string;
  phone: string;
  birthDate: string | null;
  status: string;
  matchedBy: string[];
}

function fromDetail(d: ClientDetail): FormState {
  const c = d.client;
  return {
    fullName: c.fullName,
    socialName: c.socialName ?? "",
    phone: formatPhoneBR(c.phone),
    phoneIsWhatsapp: c.phoneIsWhatsapp,
    email: c.email ?? "",
    birthDate: c.birthDate ?? "",
    cpf: c.cpf ? (c.cpfMasked ? c.cpf : formatCpf(c.cpf)) : "",
    origin: (c.origin as FormState["origin"]) ?? null,
    preferredUnitId: c.preferredUnitId ?? "",
    notes: c.notes ?? "",
    tags: c.tags,
    address: { ...EMPTY.address, ...Object.fromEntries(Object.entries(c.address ?? {}).map(([k, v]) => [k, v ?? ""])) },
    consents: Object.fromEntries(d.consents.map((x) => [x.channel, x.granted])) as FormState["consents"],
  };
}

function toPayload(f: FormState) {
  return {
    ...f,
    socialName: f.socialName || null,
    email: f.email || null,
    birthDate: f.birthDate || null,
    cpf: f.cpf && !f.cpf.includes("*") ? f.cpf : null,
    preferredUnitId: f.preferredUnitId || null,
    notes: f.notes || null,
  };
}

const matchLabel: Record<string, string> = { phone: "mesmo telefone", cpf: "mesmo CPF", name_birth: "mesmo nome e nascimento" };

export function ClientFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [params] = useSearchParams();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const online = useOnline();

  const existing = useQuery({ queryKey: ["client", id], queryFn: () => api<ClientDetail>(`/api/clients/${id}`), enabled: editing });
  const initial = useMemo<FormState | null>(() => {
    if (editing) return existing.data ? fromDetail(existing.data) : null;
    return {
      ...EMPTY,
      fullName: params.get("nome") ?? "",
      phone: params.get("telefone") ? formatPhoneBR(params.get("telefone")!) : "",
      preferredUnitId: session.me.currentUnitId ?? "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, existing.data]);

  const [form, setForm] = useState<FormState | null>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState(false);
  const [duplicates, setDuplicates] = useState<Candidate[] | null>(null);
  const [stale, setStale] = useState(false);
  const idemKey = useRef(newIdempotencyKey());
  const firstErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [initial, form]);

  useScreen("clients.form", { ready: Boolean(form), title: editing ? "Editar cliente" : "Novo cliente" });

  const dirty = Boolean(form && initial && JSON.stringify(form) !== JSON.stringify(initial));
  const draft = useDraft<FormState>(form ? session.storageKey(`draft:client:${id ?? "novo"}`) : null, form as FormState, {
    enabled: dirty && !saving,
    baseVersion: existing.data?.client.version,
  });
  useBeforeUnload(dirty);

  // Aviso de possível duplicidade enquanto digita (antes de salvar).
  const dupProbe = useDebounced(
    form ? { phone: onlyDigits(form.phone), cpf: onlyDigits(form.cpf), fullName: form.fullName, birthDate: form.birthDate } : null,
    500,
  );
  const liveDup = useQuery({
    queryKey: ["dup", dupProbe, id],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (dupProbe!.phone.length >= 10) sp.set("phone", dupProbe!.phone);
      if (dupProbe!.cpf.length === 11) sp.set("cpf", dupProbe!.cpf);
      if (dupProbe!.birthDate && dupProbe!.fullName.length >= 3) {
        sp.set("fullName", dupProbe!.fullName);
        sp.set("birthDate", dupProbe!.birthDate);
      }
      if (id) sp.set("excludeId", id);
      return api<{ candidates: Candidate[] }>(`/api/clients/duplicates?${sp}`);
    },
    enabled: Boolean(dupProbe && (dupProbe.phone.length >= 10 || dupProbe.cpf.length === 11 || dupProbe.birthDate)),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: "" }));
  };
  const setAddr = (key: keyof FormState["address"], value: string) => setForm((f) => (f ? { ...f, address: { ...f.address, [key]: value } } : f));

  const focusFirstError = (fields: Record<string, string>) => {
    const first = Object.keys(fields)[0];
    firstErrorRef.current = first ?? null;
    if (!first) return;
    if (first !== "fullName" && first !== "phone" && first !== "email" && first !== "birthDate") setMore(true);
    setTimeout(() => document.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(), 50);
  };

  const submit = async (e?: FormEvent, confirmDuplicate = false) => {
    e?.preventDefault();
    if (!form || saving) return;
    setFormError(null);
    const payload = { ...toPayload(form), confirmDuplicate };
    const parsed = clientInputSchema.safeParse(payload);
    if (!parsed.success) {
      const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
      setErrors(fields);
      focusFirstError(fields);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = editing
        ? await api<{ id: string }>(`/api/clients/${id}`, { method: "PUT", body: { ...payload, version: existing.data!.client.version } })
        : await api<{ id: string }>("/api/clients", { body: payload, idempotencyKey: idemKey.current });
      draft.clear();
      idemKey.current = newIdempotencyKey();
      await qc.invalidateQueries({ queryKey: ["clients"] });
      await qc.invalidateQueries({ queryKey: ["client", saved.id] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Cadastro atualizado." : "Cliente cadastrado.");
      setForm(null);
      navigate(`/clientes/${saved.id}`, { replace: true });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.code === "possible_duplicate" || err.code === "duplicate_cpf") {
        setDuplicates((err.details.candidates as Candidate[]) ?? []);
        if (err.code === "duplicate_cpf") setErrors({ cpf: err.message });
      } else if (err.code === "stale") {
        setStale(true);
      } else if (err.code === "validation") {
        setErrors(err.fields);
        focusFirstError(err.fields);
      } else {
        setFormError(err.isNetwork ? "Sem conexão. Seus dados estão guardados neste aparelho — tente salvar de novo quando a internet voltar." : err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  useHotkey("mod+enter", () => submit());

  if (editing && existing.isLoading) return <LoadingRows />;
  if (editing && existing.error) return <ErrorState error={existing.error} onRetry={() => existing.refetch()} />;
  if (!form) return <LoadingRows />;

  const saveState = !online && dirty ? "offline" : saving ? "saving" : draft.status === "local_unavailable" ? "error" : dirty && draft.savedAt ? "draft_local" : dirty ? "unsaved" : editing ? "saved" : null;
  const unitOptions = session.me.units;
  const liveCandidates = (liveDup.data?.candidates ?? []).filter((c) => c.matchedBy.length > 0);
  const cpfLocked = form.cpf.includes("*");

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title={editing ? `Editar ${existing.data?.client.fullName}` : "Novo cliente"}
        crumbs={[{ label: "Clientes", to: "/clientes" }, ...(editing ? [{ label: existing.data!.client.fullName, to: `/clientes/${id}` }] : []), { label: editing ? "Editar" : "Novo" }]}
        description={editing ? undefined : "Só nome e telefone são obrigatórios. Complete o resto quando puder."}
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {draft.pending && (
          <Callout
            tone="warning"
            title="Encontramos um rascunho não salvo"
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setForm(draft.accept() ?? form)}>
                  Recuperar
                </Button>
                <Button size="sm" variant="secondary" onClick={draft.discard}>
                  Descartar
                </Button>
              </div>
            }
          >
            Guardado neste aparelho em {formatDateTime(draft.pending.savedAt)}.
            {editing && draft.pending.baseVersion !== undefined && draft.pending.baseVersion !== existing.data?.client.version && (
              <> Atenção: o cadastro foi alterado por outra pessoa depois desse rascunho.</>
            )}
          </Callout>
        )}

        {stale && (
          <Callout
            tone="warning"
            title="Outra pessoa alterou este cadastro enquanto você editava"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  draft.clear();
                  await existing.refetch();
                  setStale(false);
                  setForm(null);
                  toast.info("Versão atual carregada. Refaça suas alterações e salve.");
                }}
              >
                Carregar versão atual
              </Button>
            }
          >
            Para não sobrescrever o trabalho de ninguém, carregue a versão atual e refaça suas alterações.
          </Callout>
        )}

        {formError && <Callout tone="danger">{formError}</Callout>}

        <FormSection title="Essencial" className="scroll-mt-20" description={undefined}>
          <div className="grid gap-4 sm:grid-cols-2" data-tour="clients.form.essential">
            <Field label="Nome completo" error={errors.fullName} required className="sm:col-span-2">
              <Input name="fullName" value={form.fullName} onChange={(e) => set("fullName", e.target.value)} autoComplete="off" autoFocus={!editing} maxLength={160} />
            </Field>
            <Field label="Telefone (com DDD)" error={errors.phone} required>
              <Input
                name="phone"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", formatPhoneBR(e.target.value))}
                placeholder="(11) 98765-4321"
                autoComplete="off"
              />
            </Field>
            <div className="flex items-end pb-1">
              <Switch
                checked={form.phoneIsWhatsapp}
                onChange={(v) => set("phoneIsWhatsapp", v)}
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4 text-success" aria-hidden /> Este número tem WhatsApp
                  </span>
                }
              />
            </div>
            <Field label="Data de nascimento" error={errors.birthDate} optional>
              <Input name="birthDate" type="date" value={form.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birthDate", e.target.value)} />
            </Field>
            <Field label="E-mail" error={errors.email} optional hint="Apenas para cadastro; não é usado para contato.">
              <Input name="email" type="email" inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
            </Field>
          </div>

          {liveCandidates.length > 0 && !duplicates && (
            <Callout tone="warning" title="Possível cadastro repetido">
              <ul className="mt-1 flex flex-col gap-1">
                {liveCandidates.map((c) => (
                  <li key={c.id}>
                    <Link to={`/clientes/${c.id}`} className="font-medium text-primary underline" target="_blank" rel="noreferrer">
                      {c.fullName}
                    </Link>{" "}
                    — {c.matchedBy.map((m) => matchLabel[m]).join(", ")}
                    {c.status === "inactive" && " (inativo)"}
                  </li>
                ))}
              </ul>
              <p className="mt-1">Se for a mesma pessoa, use o cadastro existente para manter o histórico unificado.</p>
            </Callout>
          )}
        </FormSection>

        <section className="card" data-tour="clients.form.more">
          <button
            type="button"
            onClick={() => setMore((m) => !m)}
            aria-expanded={more}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 text-left sm:px-6"
          >
            <span>
              <span className="block text-base font-semibold">Mais informações</span>
              <span className="block text-sm text-ink-subtle">CPF, endereço, origem, etiquetas e observações</span>
            </span>
            <ChevronDown className={`h-5 w-5 text-ink-subtle transition-transform ${more ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {more && (
            <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 sm:p-6">
              <Field label="Como prefere ser chamado(a)" error={errors.socialName} optional hint="Nome social ou apelido">
                <Input name="socialName" value={form.socialName} onChange={(e) => set("socialName", e.target.value)} />
              </Field>
              <Field label="CPF" error={errors.cpf} optional hint={cpfLocked ? "Você não tem permissão para ver ou alterar o CPF completo." : undefined}>
                <Input name="cpf" inputMode="numeric" value={form.cpf} disabled={cpfLocked} onChange={(e) => set("cpf", formatCpf(e.target.value))} placeholder="000.000.000-00" />
              </Field>
              <ChoiceGroup
                className="sm:col-span-2"
                label="Como conheceu a clínica"
                value={form.origin}
                onChange={(v) => set("origin", v)}
                options={CLIENT_ORIGINS.map((o) => ({ value: o, label: CLIENT_ORIGIN_LABEL[o] }))}
              />
              {unitOptions.length > 1 && (
                <Field label="Unidade preferida" optional>
                  <Select name="preferredUnitId" value={form.preferredUnitId} onChange={(e) => set("preferredUnitId", e.target.value)}>
                    <option value="">Sem preferência</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                </Field>
              )}
              <TagsInput value={form.tags} onChange={(t) => set("tags", t)} />
              <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-6">
                <legend className="mb-2 text-sm font-medium">Endereço <span className="font-normal text-ink-subtle">(opcional)</span></legend>
                <Field label="CEP" className="sm:col-span-2">
                  <Input name="address.zipCode" inputMode="numeric" value={form.address.zipCode} onChange={(e) => setAddr("zipCode", e.target.value.replace(/\D/g, "").replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9))} />
                </Field>
                <Field label="Rua" className="sm:col-span-4">
                  <Input name="address.street" value={form.address.street} onChange={(e) => setAddr("street", e.target.value)} />
                </Field>
                <Field label="Número" className="sm:col-span-2">
                  <Input name="address.number" value={form.address.number} onChange={(e) => setAddr("number", e.target.value)} />
                </Field>
                <Field label="Complemento" className="sm:col-span-4">
                  <Input name="address.complement" value={form.address.complement} onChange={(e) => setAddr("complement", e.target.value)} />
                </Field>
                <Field label="Bairro" className="sm:col-span-2">
                  <Input name="address.district" value={form.address.district} onChange={(e) => setAddr("district", e.target.value)} />
                </Field>
                <Field label="Cidade" className="sm:col-span-3">
                  <Input name="address.city" value={form.address.city} onChange={(e) => setAddr("city", e.target.value)} />
                </Field>
                <Field label="UF" className="sm:col-span-1">
                  <Input name="address.state" value={form.address.state} maxLength={2} onChange={(e) => setAddr("state", e.target.value.toUpperCase())} />
                </Field>
              </fieldset>
              <Field label="Observações internas" error={errors.notes} optional hint="Visível apenas para a equipe. Não registre aqui informações de saúde." className="sm:col-span-2">
                <Textarea name="notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} />
              </Field>
            </div>
          )}
        </section>

        <FormSection title="Autorização de contato" description="Para mensagens de relacionamento e promoções. Marque apenas com autorização do cliente.">
          <div data-tour="clients.form.consents" className="grid gap-1 sm:grid-cols-2">
            <Checkbox label="WhatsApp" checked={form.consents.whatsapp} onChange={(e) => set("consents", { ...form.consents, whatsapp: e.target.checked })} />
            <Checkbox label="SMS" checked={form.consents.sms} onChange={(e) => set("consents", { ...form.consents, sms: e.target.checked })} />
          </div>
          <p className="text-xs text-ink-subtle">
            Guardamos a data e quem registrou. Consentimentos de atendimento e de uso de imagem ficam no prontuário, separados deste.
          </p>
        </FormSection>
      </div>

      {/* Barra de ações sempre visível */}
      <div className="sticky bottom-16 z-20 -mx-4 mt-6 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur sm:bottom-0 sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center">
          <span data-tour="clients.form.save-status" className="sm:mr-auto">
            {saveState ? <SaveStatus state={saveState} savedAt={draft.savedAt} /> : <span className="text-sm text-ink-subtle">Preencha e salve. Guardamos um rascunho enquanto você digita.</span>}
          </span>
          <div className="flex gap-2">
            <ButtonLink to={editing ? `/clientes/${id}` : "/clientes"} variant="secondary" className="flex-1 sm:flex-none">
              Cancelar
            </ButtonLink>
            <Button type="submit" loading={saving} loadingText="Salvando…" data-tour="clients.form.save" className="flex-1 sm:flex-none" title="Atalho: Ctrl+Enter">
              Salvar cliente
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={duplicates !== null}
        onOpenChange={(o) => !o && setDuplicates(null)}
        title={errors.cpf ? "CPF já cadastrado" : "Este cliente já pode estar cadastrado"}
        description={errors.cpf ? "Cada CPF pertence a um único cadastro. Abra o cadastro existente." : "Para manter um histórico único, confira antes de criar outro cadastro."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicates(null)}>
              Voltar ao formulário
            </Button>
            {!errors.cpf && (
              <Button
                onClick={() => {
                  setDuplicates(null);
                  submit(undefined, true);
                }}
              >
                É outra pessoa, cadastrar
              </Button>
            )}
          </>
        }
      >
        <ul className="flex flex-col gap-2">
          {duplicates?.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <div>
                <p className="font-medium">{c.fullName}</p>
                <p className="text-sm text-ink-subtle">
                  {formatPhoneBR(c.phone)} · {c.matchedBy.map((m) => matchLabel[m]).join(", ")}
                </p>
              </div>
              <ButtonLink size="sm" variant="secondary" to={`/clientes/${c.id}`} onClick={() => draft.clear()}>
                Abrir ficha
              </ButtonLink>
            </li>
          ))}
        </ul>
      </Dialog>
    </form>
  );
}

function TagsInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !value.includes(t) && value.length < 20) onChange([...value, t]);
    setText("");
  };
  return (
    <Field label="Etiquetas" optional hint="Ex.: VIP, Pacote, Indicação. Pressione Enter para adicionar.">
      <div>
        <div className="flex gap-2">
          <Input
            value={text}
            maxLength={40}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="secondary" onClick={add} aria-label="Adicionar etiqueta" icon={<Plus className="h-4 w-4" />} />
        </div>
        {value.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {value.map((t) => (
              <Badge key={t} tone="primary" className="!py-1">
                {t}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover etiqueta ${t}`} className="-mr-1 rounded-full p-0.5 hover:bg-primary/15">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
