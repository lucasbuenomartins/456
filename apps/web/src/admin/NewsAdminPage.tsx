import { MODULES, type ModuleKey, type PermissionDefinition, type TourCatalogEntry } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "../ui/icons";
import { useState } from "react";
import { ApiError, api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useScreen } from "../tours/TourProvider";
import { Badge, Button, Callout, Card, Dialog, EmptyState, ErrorState, Field, Input, LoadingRows, PageHeader, Select, Switch, Textarea, useToast } from "../ui";

interface NewsRow {
  id: string;
  title: string;
  summary: string;
  benefit: string;
  version: string;
  publishedAt: string | null;
  status: "draft" | "published" | "archived";
  module: ModuleKey | null;
  requiredPermission: string | null;
  targetPath: string | null;
  tourId: string | null;
  showToExistingUsersOnly: boolean;
  stats: Record<string, number>;
}

interface Catalog {
  permissions: PermissionDefinition[];
  tours: TourCatalogEntry[];
  screens: { id: string; path: string; title: string }[];
}

const STATUS = { draft: { label: "Rascunho", tone: "neutral" }, published: { label: "Publicada", tone: "success" }, archived: { label: "Arquivada", tone: "warning" } } as const;

/** Converte ISO em valor para <input type="datetime-local"> no fuso do navegador. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function NewsAdminPage() {
  const q = useQuery({ queryKey: ["admin-news"], queryFn: () => api<{ items: NewsRow[] }>("/api/admin/news") });
  const catalog = useQuery({ queryKey: ["admin-catalog"], queryFn: () => api<Catalog>("/api/admin/catalog") });
  const [editing, setEditing] = useState<NewsRow | "new" | null>(null);
  useScreen("admin.news", { ready: !q.isLoading, title: "Novidades" });

  return (
    <>
      <PageHeader
        title="Cadastro de novidades"
        description="Anúncios exibidos após o login, filtrados por módulo e permissão."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")} data-tour="admin.news.new">Nova novidade</Button>}
      />
      <Card padded={false} tourId="admin.news.list">
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : q.data!.items.length === 0 ? (
          <EmptyState title="Nenhuma novidade cadastrada" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data!.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => setEditing(n)} className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-muted sm:px-5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-medium">{n.title}</span>
                    <Badge tone={STATUS[n.status].tone}>{STATUS[n.status].label}</Badge>
                    {n.module && <Badge tone="primary">{MODULES[n.module].name}</Badge>}
                  </span>
                  <span className="text-sm text-ink-subtle">
                    v{n.version} · {n.publishedAt ? formatDateTime(n.publishedAt) : "sem data"} · {n.targetPath ?? "sem tela"} · abertas {n.stats.opened ?? 0}, vistas {n.stats.seen ?? 0}, adiadas {n.stats.later ?? 0}, dispensadas {n.stats.dismissed ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && catalog.data && <NewsDialog item={editing === "new" ? null : editing} catalog={catalog.data} onClose={() => setEditing(null)} />}
    </>
  );
}

function NewsDialog({ item, catalog, onClose }: { item: NewsRow | null; catalog: Catalog; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    title: item?.title ?? "",
    summary: item?.summary ?? "",
    benefit: item?.benefit ?? "",
    version: item?.version ?? "",
    publishedAt: toLocalInput(item?.publishedAt ?? new Date().toISOString()),
    status: item?.status ?? ("draft" as NewsRow["status"]),
    module: item?.module ?? "",
    requiredPermission: item?.requiredPermission ?? "",
    targetPath: item?.targetPath ?? "",
    tourId: item?.tourId ?? "",
    showToExistingUsersOnly: item?.showToExistingUsersOnly ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const screen = catalog.screens.find((s) => s.path === f.targetPath);
  const tours = catalog.tours.filter((t) => t.kind === "update" && (!screen || t.screen === screen.id));

  const save = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const body = {
        ...f,
        publishedAt: f.publishedAt ? new Date(f.publishedAt).toISOString() : null,
        module: f.module || null,
        requiredPermission: f.requiredPermission || null,
        targetPath: f.targetPath || null,
        tourId: f.tourId || null,
      };
      if (item) await api(`/api/admin/news/${item.id}`, { method: "PUT", body });
      else await api("/api/admin/news", { body });
      qc.invalidateQueries({ queryKey: ["admin-news"] });
      toast.success("Novidade salva.");
      onClose();
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
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title={item ? "Editar novidade" : "Nova novidade"} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={save}>Salvar</Button></>}>
      <div className="grid gap-4">
        {formError && <Callout tone="danger">{formError}</Callout>}
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Título" error={errors.title} required className="sm:col-span-3">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Versão" error={errors.version} required>
            <Input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} />
          </Field>
        </div>
        <Field label="O que mudou" error={errors.summary} required>
          <Textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
        </Field>
        <Field label="Benefício prático" error={errors.benefit} required hint="Fale do ganho para quem usa: menos cliques, menos erros…">
          <Textarea rows={2} value={f.benefit} onChange={(e) => setF({ ...f, benefit: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Módulo (público)" optional hint="Só aparece para clínicas com o módulo contratado.">
            <Select value={f.module} onChange={(e) => setF({ ...f, module: e.target.value })}>
              <option value="">Todos</option>
              {(Object.keys(MODULES) as ModuleKey[]).map((m) => (
                <option key={m} value={m}>{MODULES[m].name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Permissão exigida (público)" error={errors.requiredPermission} optional hint="Só aparece para quem tem esta permissão.">
            <Select value={f.requiredPermission} onChange={(e) => setF({ ...f, requiredPermission: e.target.value })}>
              <option value="">Qualquer pessoa</option>
              {catalog.permissions.map((p) => (
                <option key={p.key} value={p.key}>{p.group}: {p.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tela de destino" error={errors.targetPath} optional>
            <Select value={f.targetPath} onChange={(e) => setF({ ...f, targetPath: e.target.value, tourId: "" })}>
              <option value="">Nenhuma</option>
              {catalog.screens.filter((s) => !s.path.includes(":")).map((s) => (
                <option key={s.id} value={s.path}>{s.title} ({s.path})</option>
              ))}
            </Select>
          </Field>
          <Field label="Tour da novidade" error={errors.tourId} optional hint="Iniciado ao clicar em Conhecer novidade.">
            <Select value={f.tourId} onChange={(e) => setF({ ...f, tourId: e.target.value })}>
              <option value="">Nenhum</option>
              {tours.map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </Select>
          </Field>
          <Field label="Publicação" error={errors.publishedAt} optional>
            <Input type="datetime-local" value={f.publishedAt} onChange={(e) => setF({ ...f, publishedAt: e.target.value })} />
          </Field>
          <Field label="Situação">
            <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as NewsRow["status"] })}>
              <option value="draft">Rascunho</option>
              <option value="published">Publicada</option>
              <option value="archived">Arquivada</option>
            </Select>
          </Field>
        </div>
        <Switch
          checked={f.showToExistingUsersOnly}
          onChange={(v) => setF({ ...f, showToExistingUsersOnly: v })}
          label="Mostrar no login apenas para quem já usava o sistema"
          description="Quem entrar depois da publicação conhece a tela pelo tour de primeiro acesso. A novidade continua na central."
        />
      </div>
    </Dialog>
  );
}
