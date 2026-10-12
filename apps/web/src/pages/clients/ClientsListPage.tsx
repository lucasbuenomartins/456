import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { Cake, Download, MessageCircle, SlidersHorizontal, Tag, UserPlus, UserRoundX, Users, UserCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { age, formatDate, formatPhoneBR } from "../../lib/format";
import { useDebounced, useHotkey, useIsMobile, usePersistentState } from "../../lib/hooks";
import { useScreen } from "../../tours/TourProvider";
import {
  Avatar,
  Badge,
  BulkBar,
  Button,
  ButtonLink,
  buttonClass,
  ConfirmDialog,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  useToast,
  type Column,
} from "../../ui";

export interface ClientSummary {
  id: string;
  fullName: string;
  socialName: string | null;
  phone: string;
  phoneIsWhatsapp: boolean;
  email: string | null;
  birthDate: string | null;
  tags: string[];
  status: "active" | "inactive";
  createdAt: string;
}

interface ListResponse {
  items: ClientSummary[];
  total: number;
  page: number;
  pageSize: number;
  availableTags: string[];
}

interface Filters {
  status: "active" | "inactive" | "all";
  tag: string;
  birthdayMonth: number | null;
  sort: "name" | "-created";
}

const DEFAULT_FILTERS: Filters = { status: "active", tag: "", birthdayMonth: null, sort: "name" };
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function ClientsListPage() {
  const session = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = usePersistentState<Filters>(session.storageKey("clients.filters"), DEFAULT_FILTERS);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagDialog, setTagDialog] = useState<null | "add_tag" | "remove_tag">(null);
  const [statusDialog, setStatusDialog] = useState<null | "activate" | "deactivate">(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [showFilters, setShowFilters] = useState(false);
  const dq = useDebounced(q.trim(), 250);

  // Atalho vindo do Início: "Aniversariantes".
  useEffect(() => {
    if (params.get("filtro") === "aniversariantes") {
      setFilters((f) => ({ ...f, birthdayMonth: new Date().getMonth() + 1, status: "active" }));
      params.delete("filtro");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [dq, filters]);

  const query = useQuery({
    queryKey: ["clients", dq, filters, page],
    queryFn: () => {
      const sp = new URLSearchParams({ status: filters.status, sort: filters.sort, page: String(page), pageSize: "25" });
      if (dq) sp.set("q", dq);
      if (filters.tag) sp.set("tag", filters.tag);
      if (filters.birthdayMonth) sp.set("birthdayMonth", String(filters.birthdayMonth));
      return api<ListResponse>(`/api/clients?${sp}`);
    },
    placeholderData: keepPreviousData,
  });

  const canCreate = session.can("clients.create") && session.canWrite("core");
  const canBulk = session.can("clients.update") && session.canWrite("core");
  useScreen("clients.list", { ready: !query.isLoading });
  useHotkey("/", () => searchRef.current?.focus());
  useHotkey("n", () => canCreate && navigate("/clientes/novo"));

  const bulk = useMutation({
    mutationFn: (body: { action: string; tag?: string }) => api<{ updated: number }>("/api/clients/bulk", { body: { ...body, ids: [...selected] } }),
    onSuccess: (r, v) => {
      const label = { add_tag: "receberam a etiqueta", remove_tag: "ficaram sem a etiqueta", activate: "reativados", deactivate: "inativados" }[v.action];
      toast.success(`${r.updated} cliente(s) ${label}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Não foi possível concluir."),
  });

  const activeFilterCount = (filters.status !== "active" ? 1 : 0) + (filters.tag ? 1 : 0) + (filters.birthdayMonth ? 1 : 0);
  const hasFilters = activeFilterCount > 0;
  const data = query.data;

  const columns: Column<ClientSummary>[] = [
    {
      key: "name",
      header: "Nome",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.fullName} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium">{c.fullName}</p>
            {c.socialName && <p className="truncate text-sm text-ink-subtle">Prefere: {c.socialName}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Telefone",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap tabular">
          {formatPhoneBR(c.phone)}
          {c.phoneIsWhatsapp && <MessageCircle className="h-4 w-4 text-success" aria-label="WhatsApp" />}
        </span>
      ),
    },
    {
      key: "birth",
      header: "Nascimento",
      cell: (c) => (c.birthDate ? <span className="whitespace-nowrap tabular">{formatDate(c.birthDate)} <span className="text-ink-subtle">({age(c.birthDate)} anos)</span></span> : <span className="text-ink-subtle">—</span>),
    },
    {
      key: "tags",
      header: "Etiquetas",
      cell: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <Badge key={t} tone="primary">{t}</Badge>
          ))}
        </div>
      ),
    },
    { key: "status", header: "Situação", cell: (c) => (c.status === "active" ? <Badge tone="success" dot>Ativo</Badge> : <Badge dot>Inativo</Badge>) },
  ];

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro único de clientes, usado em toda a plataforma."
        actions={
          <>
            {session.can("clients.export") && (
              <a href="/api/clients/export.csv" download className={buttonClass("secondary", "md", "hidden sm:inline-flex")} data-tour="clients.list.export">
                <Download className="h-4 w-4" aria-hidden />
                Exportar
              </a>
            )}
            {canCreate && (
              <ButtonLink to="/clientes/novo" icon={<UserPlus className="h-4 w-4" />} data-tour="clients.list.new" className="flex-1 sm:flex-none" title="Atalho: N">
                Novo cliente
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="card">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:p-4">
          <div data-tour="clients.list.search">
            <SearchInput
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClear={() => setQ("")}
              loading={query.isFetching && !query.isLoading}
              placeholder="Buscar por nome ou telefone…"
              aria-label="Buscar clientes por nome ou telefone"
            />
          </div>
          {isMobile && (
            <div className="flex items-center justify-between" data-tour="clients.list.filters">
              <Button size="sm" variant="secondary" icon={<SlidersHorizontal className="h-4 w-4" />} aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}>
                Filtros{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </Button>
              {data && <span className="text-sm text-ink-subtle">{data.total.toLocaleString("pt-BR")} cliente(s)</span>}
            </div>
          )}
          <div className={clsx("flex flex-wrap items-center gap-2", isMobile && !showFilters && "hidden")} data-tour={isMobile ? undefined : "clients.list.filters"} role="group" aria-label="Filtros">
            <div className="inline-flex rounded-lg border border-border-strong p-0.5" role="radiogroup" aria-label="Situação">
              {(["active", "inactive", "all"] as const).map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={filters.status === s}
                  onClick={() => setFilters((f) => ({ ...f, status: s }))}
                  className={clsx("min-h-[38px] rounded-md px-3 text-sm", filters.status === s ? "bg-primary-soft font-medium text-primary" : "text-ink-muted hover:text-ink")}
                >
                  {{ active: "Ativos", inactive: "Inativos", all: "Todos" }[s]}
                </button>
              ))}
            </div>
            <button
              aria-pressed={!!filters.birthdayMonth}
              onClick={() => setFilters((f) => ({ ...f, birthdayMonth: f.birthdayMonth ? null : new Date().getMonth() + 1 }))}
              className={clsx(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm",
                filters.birthdayMonth ? "border-primary bg-primary-soft font-medium text-primary" : "border-border-strong text-ink-muted hover:bg-surface-muted",
              )}
            >
              <Cake className="h-4 w-4" aria-hidden />
              {filters.birthdayMonth ? `Aniversariantes de ${MONTHS[filters.birthdayMonth - 1]}` : "Aniversariantes do mês"}
            </button>
            {(data?.availableTags.length ?? 0) > 0 && (
              <Select aria-label="Etiqueta" value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))} className="!h-10 !w-auto min-w-[150px]">
                <option value="">Todas as etiquetas</option>
                {data!.availableTags.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            )}
            <Select aria-label="Ordenar" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as Filters["sort"] }))} className="!h-10 !w-auto">
              <option value="name">Ordem alfabética</option>
              <option value="-created">Mais recentes</option>
            </Select>
            {hasFilters && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-2 text-sm text-primary hover:underline">
                <X className="h-4 w-4" aria-hidden /> Limpar filtros
              </button>
            )}
            {data && !isMobile && <span className="ml-auto text-sm text-ink-subtle" aria-live="polite">{data.total.toLocaleString("pt-BR")} cliente(s)</span>}
          </div>
        </div>

        {query.isLoading ? (
          <LoadingRows />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : data && data.items.length === 0 ? (
          dq || hasFilters ? (
            <EmptyState
              tourId="clients.list.table"
              icon={<Users className="h-6 w-6" />}
              title={dq ? `Nenhum cliente encontrado para "${dq}"` : "Nenhum cliente com estes filtros"}
              description={dq ? "Confira a grafia ou busque pelo telefone." : "Tente limpar os filtros."}
              action={
                dq && canCreate ? (
                  <ButtonLink to={`/clientes/novo?nome=${encodeURIComponent(/\d/.test(dq) ? "" : dq)}&telefone=${encodeURIComponent(/\d/.test(dq) ? dq : "")}`} icon={<UserPlus className="h-4 w-4" />}>
                    Cadastrar novo cliente
                  </ButtonLink>
                ) : hasFilters ? (
                  <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Limpar filtros</Button>
                ) : undefined
              }
            />
          ) : (
            <EmptyState
              tourId="clients.list.table"
              icon={<Users className="h-6 w-6" />}
              title="Nenhum cliente cadastrado ainda"
              description="Comece cadastrando o primeiro cliente. Leva menos de um minuto."
              action={canCreate ? <ButtonLink to="/clientes/novo" icon={<UserPlus className="h-4 w-4" />}>Cadastrar cliente</ButtonLink> : undefined}
            />
          )
        ) : (
          data && (
            <>
              <DataTable
                caption="Lista de clientes"
                tourId="clients.list.table"
                columns={columns}
                rows={data.items}
                rowId={(c) => c.id}
                onOpen={(c) => navigate(`/clientes/${c.id}`)}
                selectable={canBulk && !isMobile}
                selected={selected}
                onSelectedChange={setSelected}
                mobileRow={(c) => (
                  <>
                    <Avatar name={c.fullName} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.fullName}</span>
                      <span className="flex items-center gap-1.5 text-sm text-ink-subtle tabular">
                        {formatPhoneBR(c.phone)}
                        {c.phoneIsWhatsapp && <MessageCircle className="h-3.5 w-3.5 text-success" aria-label="WhatsApp" />}
                      </span>
                    </span>
                    {c.status === "inactive" && <Badge>Inativo</Badge>}
                    {c.tags[0] && <Badge tone="primary">{c.tags[0]}</Badge>}
                  </>
                )}
              />
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )
        )}
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button size="sm" variant="secondary" icon={<Tag className="h-4 w-4" />} onClick={() => setTagDialog("add_tag")}>
          Etiquetar
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setTagDialog("remove_tag")}>
          Remover etiqueta
        </Button>
        {session.can("clients.deactivate") && (
          filters.status === "inactive" ? (
            <Button size="sm" variant="secondary" icon={<UserCheck className="h-4 w-4" />} onClick={() => setStatusDialog("activate")}>
              Reativar
            </Button>
          ) : (
            <Button size="sm" variant="secondary" icon={<UserRoundX className="h-4 w-4" />} onClick={() => setStatusDialog("deactivate")}>
              Inativar
            </Button>
          )
        )}
      </BulkBar>

      <TagDialog
        mode={tagDialog}
        tags={data?.availableTags ?? []}
        count={selected.size}
        onClose={() => setTagDialog(null)}
        onConfirm={async (tag) => {
          await bulk.mutateAsync({ action: tagDialog!, tag });
          setTagDialog(null);
        }}
      />
      <ConfirmDialog
        open={statusDialog !== null}
        onOpenChange={(o) => !o && setStatusDialog(null)}
        title={statusDialog === "deactivate" ? `Inativar ${selected.size} cliente(s)?` : `Reativar ${selected.size} cliente(s)?`}
        description={
          statusDialog === "deactivate"
            ? "Clientes inativos não aparecem nas buscas padrão, mas todo o histórico é mantido. Você pode reativar depois."
            : "Os clientes voltam a aparecer nas buscas."
        }
        confirmLabel={statusDialog === "deactivate" ? "Inativar" : "Reativar"}
        onConfirm={() => bulk.mutateAsync({ action: statusDialog! })}
      />
    </>
  );
}

function TagDialog({
  mode,
  tags,
  count,
  onClose,
  onConfirm,
}: {
  mode: null | "add_tag" | "remove_tag";
  tags: string[];
  count: number;
  onClose: () => void;
  onConfirm: (tag: string) => Promise<void>;
}) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setTag("");
    setError(undefined);
  }, [mode]);
  return (
    <Dialog
      open={mode !== null}
      onOpenChange={(o) => !o && onClose()}
      title={mode === "add_tag" ? `Etiquetar ${count} cliente(s)` : `Remover etiqueta de ${count} cliente(s)`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (!tag.trim()) return setError("Informe a etiqueta.");
              setBusy(true);
              try {
                await onConfirm(tag.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === "add_tag" ? "Aplicar etiqueta" : "Remover"}
          </Button>
        </>
      }
    >
      <Field label="Etiqueta" error={error} hint="Ex.: VIP, Pacote, Retorno">
        <Input value={tag} onChange={(e) => setTag(e.target.value)} list="tag-options" maxLength={40} autoFocus />
      </Field>
      <datalist id="tag-options">
        {tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, 12).map((t) => (
            <button key={t} type="button" onClick={() => setTag(t)} className="rounded-full border border-border-strong px-3 py-1 text-sm hover:bg-surface-muted">
              {t}
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
