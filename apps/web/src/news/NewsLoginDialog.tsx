import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../app/session";
import { api } from "../lib/api";
import { useNavigateWithTour, useTours } from "../tours/TourProvider";
import { Button, Dialog } from "../ui";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  benefit: string;
  version: string;
  publishedAt: string;
  module: string | null;
  targetPath: string | null;
  tourId: string | null;
  state: "seen" | "opened" | "later" | "dismissed" | null;
}

export const sendReceipt = (id: string, action: "seen" | "opened" | "later" | "dismissed") =>
  api(`/api/news/${id}/receipt`, { body: { action } }).catch(() => undefined);

/**
 * Novidades após o login.
 * - Aparece uma vez por sessão do navegador, só com novidades ainda não vistas.
 * - Enquanto está aberta, nenhum tour abre sozinho (sem sobreposição).
 * - "Conhecer novidade" leva à tela e inicia o tour da novidade.
 */
export function NewsLoginDialog() {
  const session = useSession();
  const tours = useTours();
  const qc = useQueryClient();
  const navigateWithTour = useNavigateWithTour();
  const flag = `lumi:news-shown:${session.me.user.id}`;
  const [alreadyShown] = useState(() => {
    try {
      return sessionStorage.getItem(flag) === "1";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const handled = useRef(false);

  const pending = useQuery({
    queryKey: ["news-pending"],
    queryFn: () => api<{ items: NewsItem[]; more: number }>("/api/news/pending"),
    enabled: !alreadyShown,
    staleTime: Infinity,
  });
  const items = pending.data?.items ?? [];

  // Suspende tours automáticos enquanto decide/mostra as novidades.
  useEffect(() => {
    if (alreadyShown) return;
    if (pending.isLoading || open) tours.suspend("news");
    else tours.resume("news");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.isLoading, open, alreadyShown]);

  useEffect(() => {
    if (items.length > 0 && !handled.current) {
      setOpen(true);
      try {
        sessionStorage.setItem(flag, "1");
      } catch {
        /* ignora */
      }
    }
  }, [items.length, flag]);

  const finish = async (action: "seen" | "later" | "dismissed", except?: string) => {
    handled.current = true;
    setOpen(false);
    await Promise.all(items.filter((i) => i.id !== except).map((i) => sendReceipt(i.id, action)));
    qc.invalidateQueries({ queryKey: ["news"] });
  };

  const learn = async (item: NewsItem) => {
    // Navega antes de fechar a janela: nenhum tour automático da tela atual chega a abrir.
    handled.current = true;
    if (item.targetPath) navigateWithTour(item.targetPath, item.tourId);
    await sendReceipt(item.id, "opened");
    // As demais voltam em um próximo login (adiadas), sem se perder.
    await finish("later", item.id);
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && finish("dismissed")}
      title={items.length > 1 ? `${items.length} novidades para você` : "Novidade para você"}
      description="Melhorias recentes que ajudam no seu dia a dia."
      footer={
        <>
          <Button variant="secondary" onClick={() => finish("later")}>
            Ver depois
          </Button>
          <Button variant={items.some((i) => i.targetPath) ? "secondary" : "primary"} onClick={() => finish("seen")}>
            Entendi
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3" data-testid="news-login-list">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="flex-1">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{item.summary}</p>
                <p className="mt-1 text-sm text-ink">
                  <span className="font-medium">Para você: </span>
                  {item.benefit}
                </p>
                {item.targetPath && (
                  <Button className="mt-3" size="sm" onClick={() => learn(item)}>
                    Conhecer novidade <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {(pending.data?.more ?? 0) > 0 && (
        <p className="mt-3 text-sm text-ink-subtle">E mais {pending.data!.more} na central de novidades.</p>
      )}
    </Dialog>
  );
}
