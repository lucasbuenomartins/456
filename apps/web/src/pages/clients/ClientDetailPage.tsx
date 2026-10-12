import { MODULES, type ModuleKey, type PermissionKey } from "@clinica/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ClipboardList, Copy, Mail, MessageCircle, MoreHorizontal, Pencil, Phone, UserCheck, UserRoundX, Wallet, HeartHandshake } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { age, formatDate, formatDateTime, formatPhoneBR, whatsappLink } from "../../lib/format";
import { useHotkey } from "../../lib/hooks";
import { useScreen } from "../../tours/TourProvider";
import {
  Avatar,
  Badge,
  ButtonLink,
  Card,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  LoadingRows,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  TabPanel,
  Tabs,
  buttonClass,
  useToast,
} from "../../ui";

export interface ClientDetail {
  client: {
    id: string;
    fullName: string;
    socialName: string | null;
    phone: string;
    phoneIsWhatsapp: boolean;
    email: string | null;
    birthDate: string | null;
    cpf: string | null;
    cpfMasked: boolean;
    origin: string | null;
    originLabel: string | null;
    preferredUnitId: string | null;
    notes: string | null;
    tags: string[];
    address: Record<string, string | null>;
    status: "active" | "inactive";
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  createdByName: string | null;
  consents: { channel: "whatsapp" | "email" | "sms"; granted: boolean; recordedAt: string | null; recordedBy: string | null }[];
  activity: { id: string; summary: string; actorName: string | null; createdAt: string; action: string }[];
}

const CHANNEL_LABEL = { whatsapp: "WhatsApp", email: "E-mail", sms: "SMS" };

/** Abas que os próximos módulos acrescentarão à ficha, quando contratados. */
const MODULE_TABS: { module: ModuleKey; value: string; label: string; icon: typeof CalendarDays; permission: PermissionKey[]; text: string }[] = [
  { module: "agenda", value: "agenda", label: "Agendamentos", icon: CalendarDays, permission: ["agenda.read_all", "agenda.read_own"], text: "Agendamentos, faltas e pacotes de sessões deste cliente aparecerão aqui." },
  { module: "prontuario", value: "prontuario", label: "Prontuário", icon: ClipboardList, permission: ["clinical.read"], text: "Anamnese, evolução, fotos e termos aparecerão aqui, com acesso restrito a quem tem permissão." },
  { module: "financeiro", value: "financeiro", label: "Financeiro", icon: Wallet, permission: ["finance.read"], text: "Vendas, pagamentos e valores pendentes aparecerão aqui." },
  { module: "crm", value: "crm", label: "Relacionamento", icon: HeartHandshake, permission: ["crm.read"], text: "Interações, tarefas e oportunidades aparecerão aqui." },
];

export function ClientDetailPage() {
  const { id = "" } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState("resumo");
  const [confirm, setConfirm] = useState(false);
  const q = useQuery({ queryKey: ["client", id], queryFn: () => api<ClientDetail>(`/api/clients/${id}`) });
  useScreen("clients.detail", { ready: !q.isLoading, title: q.data?.client.fullName });

  const canEdit = session.can("clients.update") && session.canWrite("core");
  useHotkey("e", () => canEdit && navigate(`/clientes/${id}/editar`));

  const toggleStatus = useMutation({
    mutationFn: () => api(`/api/clients/${id}/${q.data!.client.status === "active" ? "deactivate" : "activate"}`, { body: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success(q.data!.client.status === "active" ? "Cliente inativado." : "Cliente reativado.");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir."),
  });

  if (q.isLoading) return <LoadingRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { client: c, consents, activity, createdByName } = q.data!;
  const unitName = session.me.units.find((u) => u.id === c.preferredUnitId)?.name;
  const addr = c.address ?? {};
  const addressLine = [addr.street && `${addr.street}${addr.number ? `, ${addr.number}` : ""}`, addr.complement, addr.district, addr.city && `${addr.city}${addr.state ? `/${addr.state}` : ""}`, addr.zipCode]
    .filter(Boolean)
    .join(" · ");
  const moduleTabs = MODULE_TABS.filter((t) => session.hasModule(t.module) && t.permission.some((p) => session.can(p)));
  const years = age(c.birthDate);

  return (
    <>
      <PageHeader
        tourId="clients.detail.header"
        crumbs={[{ label: "Clientes", to: "/clientes" }, { label: c.fullName }]}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={c.fullName} size="lg" />
            <span className="min-w-0">
              <span className="block truncate">{c.fullName}</span>
              {c.socialName && <span className="block text-base font-normal text-ink-muted">Prefere ser chamado(a) de {c.socialName}</span>}
            </span>
          </span>
        }
        meta={
          <>
            {c.status === "active" ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>}
            {years !== null && <Badge>{years} anos</Badge>}
            {c.tags.map((t) => (
              <Badge key={t} tone="primary">{t}</Badge>
            ))}
          </>
        }
        actions={
          <>
            {canEdit && (
              <ButtonLink to={`/clientes/${id}/editar`} icon={<Pencil className="h-4 w-4" />} data-tour="clients.detail.edit" title="Atalho: E">
                Editar
              </ButtonLink>
            )}
            {session.can("clients.deactivate") && session.canWrite("core") && (
              <Menu>
                <MenuTrigger className={buttonClass("secondary", "md", "!px-3")} aria-label="Mais ações">
                  <MoreHorizontal className="h-5 w-5" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem icon={c.status === "active" ? <UserRoundX /> : <UserCheck />} onSelect={() => setConfirm(true)} danger={c.status === "active"}>
                    {c.status === "active" ? "Inativar cliente" : "Reativar cliente"}
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap" data-tour="clients.detail.contact-actions">
        <a href={`tel:+55${c.phone}`} className={buttonClass("secondary", "md")}>
          <Phone className="h-4 w-4" aria-hidden /> Ligar
        </a>
        {c.phoneIsWhatsapp && (
          <a href={whatsappLink(c.phone)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}>
            <MessageCircle className="h-4 w-4 text-success" aria-hidden /> WhatsApp
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className={buttonClass("secondary", "md")}>
            <Mail className="h-4 w-4" aria-hidden /> E-mail
          </a>
        )}
        <button
          type="button"
          className={buttonClass("ghost", "md", "hidden sm:inline-flex")}
          onClick={() => {
            navigator.clipboard?.writeText(formatPhoneBR(c.phone)).then(() => toast.success("Telefone copiado."));
          }}
        >
          <Copy className="h-4 w-4" aria-hidden /> Copiar telefone
        </button>
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        tourId="clients.detail.tabs"
        items={[
          { value: "resumo", label: "Dados" },
          ...moduleTabs.map((t) => ({ value: t.value, label: t.label, badge: <Badge className="!text-[0.6875rem]">Em breve</Badge> })),
          { value: "autorizacoes", label: "Autorizações" },
          { value: "historico", label: "Histórico" },
        ]}
      >
        <TabPanel value="resumo">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Dados do cliente" className="lg:col-span-2">
              <DescriptionList
                items={[
                  { label: "Telefone", value: <span className="tabular">{formatPhoneBR(c.phone)}{c.phoneIsWhatsapp && " · WhatsApp"}</span> },
                  { label: "E-mail", value: c.email },
                  { label: "Nascimento", value: c.birthDate ? `${formatDate(c.birthDate)} (${years} anos)` : null },
                  { label: "CPF", value: c.cpf ? <span className="tabular">{c.cpf}{c.cpfMasked && <span className="ml-1 text-xs text-ink-subtle">(oculto para sua função)</span>}</span> : null },
                  { label: "Como conheceu", value: c.originLabel },
                  { label: "Unidade preferida", value: unitName },
                  { label: "Endereço", value: addressLine || null },
                ]}
              />
            </Card>
            <Card title="Observações internas">
              {c.notes ? <p className="whitespace-pre-wrap text-[0.9375rem]">{c.notes}</p> : <p className="text-sm text-ink-subtle">Nenhuma observação.</p>}
              <p className="mt-4 border-t border-border pt-3 text-xs text-ink-subtle">
                Cadastrado em {formatDateTime(c.createdAt)}
                {createdByName && ` por ${createdByName}`}. Última alteração em {formatDateTime(c.updatedAt)}.
              </p>
            </Card>
          </div>
        </TabPanel>

        {moduleTabs.map((t) => (
          <TabPanel key={t.value} value={t.value}>
            <Card>
              <EmptyState
                icon={<t.icon className="h-6 w-6" />}
                title={`${MODULES[t.module].name}: em construção`}
                description={`${t.text} Este módulo está contratado e será liberado na etapa ${MODULES[t.module].stage} do produto.`}
              />
            </Card>
          </TabPanel>
        ))}

        <TabPanel value="autorizacoes">
          <Card title="Autorização de contato (comunicação comercial)">
            <ul className="divide-y divide-border">
              {consents.map((x) => (
                <li key={x.channel} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="font-medium">{CHANNEL_LABEL[x.channel]}</span>
                  <span className="flex items-center gap-2 text-sm text-ink-subtle">
                    {x.granted ? <Badge tone="success">Autorizado</Badge> : <Badge>Não autorizado</Badge>}
                    {x.recordedAt && `em ${formatDateTime(x.recordedAt)}${x.recordedBy ? ` por ${x.recordedBy}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-subtle">
              Cada mudança fica registrada com data e responsável. Consentimento para atendimento e uso de imagem será registrado no prontuário.
            </p>
          </Card>
        </TabPanel>

        <TabPanel value="historico">
          <Card title="Histórico de alterações" tourId="clients.detail.activity">
            {activity.length === 0 ? (
              <p className="text-sm text-ink-subtle">Sem registros.</p>
            ) : (
              <ol className="relative ml-2 border-l border-border">
                {activity.map((a) => (
                  <li key={a.id} className="mb-4 ml-4">
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
                    <p className="text-[0.9375rem]">{a.summary}</p>
                    <p className="text-xs text-ink-subtle">
                      {formatDateTime(a.createdAt)}
                      {a.actorName && ` · ${a.actorName}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={c.status === "active" ? "Inativar cliente?" : "Reativar cliente?"}
        description={
          c.status === "active"
            ? "O cliente deixa de aparecer nas buscas padrão. Todo o histórico é mantido e você pode reativar quando quiser."
            : "O cliente volta a aparecer nas buscas."
        }
        confirmLabel={c.status === "active" ? "Inativar" : "Reativar"}
        tone={c.status === "active" ? "danger" : "primary"}
        onConfirm={() => toggleStatus.mutateAsync()}
      />
    </>
  );
}
