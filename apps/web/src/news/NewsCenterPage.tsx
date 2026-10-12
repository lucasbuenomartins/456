import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useNavigateWithTour, useScreen } from "../tours/TourProvider";
import { Badge, Button, EmptyState, ErrorState, LoadingRows, PageHeader } from "../ui";
import { sendReceipt, type NewsItem } from "./NewsLoginDialog";

export function NewsCenterPage() {
  const qc = useQueryClient();
  const navigateWithTour = useNavigateWithTour();
  const q = useQuery({ queryKey: ["news"], queryFn: () => api<{ items: NewsItem[]; unread: number }>("/api/news") });
  useScreen("news.center", { ready: !q.isLoading });

  // Ao abrir a central, as novidades listadas contam como vistas.
  useEffect(() => {
    const unseen = q.data?.items.filter((i) => i.state === null || i.state === "later") ?? [];
    if (unseen.length === 0) return;
    const t = setTimeout(() => {
      Promise.all(unseen.map((i) => sendReceipt(i.id, "seen"))).then(() => qc.invalidateQueries({ queryKey: ["news"] }));
    }, 1500);
    return () => clearTimeout(t);
  }, [q.data, qc]);

  return (
    <>
      <PageHeader title="Novidades" description="Melhorias do sistema que fazem sentido para você e sua clínica." />
      {q.isLoading ? (
        <LoadingRows />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState icon={<Sparkles className="h-6 w-6" />} title="Nenhuma novidade por enquanto" description="Quando lançarmos melhorias, elas aparecerão aqui." />
      ) : (
        <ul className="flex flex-col gap-3" data-tour="news.center.list">
          {q.data!.items.map((n) => (
            <li key={n.id} className="card flex flex-col gap-2 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex-1 text-base font-semibold">{n.title}</h2>
                {(n.state === null || n.state === "later") && <Badge tone="accent">Nova</Badge>}
                <span className="text-sm text-ink-subtle">
                  {formatDate(n.publishedAt)} · versão {n.version}
                </span>
              </div>
              <p className="text-[0.9375rem] text-ink-muted">{n.summary}</p>
              <p className="text-[0.9375rem]">
                <span className="font-medium">Para você: </span>
                {n.benefit}
              </p>
              {n.targetPath && (
                <div>
                  <Button
                    size="sm"
                    variant="subtle"
                    onClick={async () => {
                      await sendReceipt(n.id, "opened");
                      qc.invalidateQueries({ queryKey: ["news"] });
                      navigateWithTour(n.targetPath!, n.tourId);
                    }}
                  >
                    Conhecer novidade <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
