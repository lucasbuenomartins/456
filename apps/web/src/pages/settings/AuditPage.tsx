import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useScreen } from "../../tours/TourProvider";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingRows, Select } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface AuditEvent {
  id: string;
  actorKind: string;
  actorName: string | null;
  action: string;
  entityType: string;
  summary: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
}

const ENTITY_LABEL: Record<string, string> = {
  client: "Clientes",
  company: "Empresa e conta",
  unit: "Unidades",
  role: "Funções",
  membership: "Equipe",
  invite: "Convites",
  user: "Usuários",
};

function describeChanges(changes: Record<string, unknown> | null): string | null {
  if (!changes) return null;
  const keys = Object.keys(changes).filter((k) => k !== "ids");
  if (!keys.length) return null;
  return `Campos: ${keys.join(", ")}`;
}

export function AuditPage() {
  const [entityType, setEntityType] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["audit", entityType],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      if (pageParam) sp.set("before", pageParam);
      if (entityType) sp.set("entityType", entityType);
      return api<{ items: AuditEvent[]; nextBefore: string | null }>(`/api/settings/audit?${sp}`);
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  useScreen("settings.audit", { ready: !q.isLoading });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SettingsLayout title="Histórico de alterações" description="Registro de ações importantes. Não pode ser alterado nem apagado.">
      <div className="mb-4 flex flex-wrap items-center gap-2" data-tour="settings.audit.filters">
        <Select aria-label="Tipo de registro" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="!w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(ENTITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
      </div>
      <Card padded={false} tourId="settings.audit.list">
        {q.isLoading ? (
          <LoadingRows />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum registro" description="Quando alguém alterar algo importante, aparecerá aqui." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4 sm:px-5">
                <span className="shrink-0 text-sm text-ink-subtle tabular sm:w-36">{formatDateTime(e.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem]">{e.summary}</p>
                  <p className="text-sm text-ink-subtle">
                    {e.actorName ?? "Sistema"}
                    {describeChanges(e.changes) && ` · ${describeChanges(e.changes)}`}
                  </p>
                </div>
                <Badge tone={e.actorKind === "platform" ? "accent" : "neutral"}>{ENTITY_LABEL[e.entityType] ?? e.entityType}</Badge>
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <div className="border-t border-border p-3 text-center">
            <Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Carregar mais
            </Button>
          </div>
        )}
      </Card>
    </SettingsLayout>
  );
}
