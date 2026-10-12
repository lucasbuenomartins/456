import * as RTabs from "@radix-ui/react-tabs";
import { clsx } from "clsx";
import { ChevronRight, CloudOff, Cloud, Loader2, Search, X } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";
import { relativeTime } from "../lib/format";

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Cabeçalho padrão de toda tela: responde "Onde estou?" (trilha e título),
 * "O que posso fazer aqui?" (descrição) e "Qual a próxima ação?" (ação principal à direita).
 */
export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  tourId,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  tourId?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between" data-tour={tourId}>
      <div className="min-w-0">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Você está em" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-subtle">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {c.to ? (
                    <Link to={c.to} className="rounded hover:text-ink hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                  {i < crumbs.length - 1 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-[1.5rem] font-semibold leading-tight sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[0.9375rem] text-ink-muted">{description}</p>}
        {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}

export function Card({ title, action, children, className, tourId, padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tourId?: string; padded?: boolean }) {
  return (
    <section className={clsx("card", className)} data-tour={tourId}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          {typeof title === "string" ? <h2 className="text-base font-semibold">{title}</h2> : title}
          {action}
        </header>
      )}
      <div className={clsx(padded && "p-4 sm:p-5")}>{children}</div>
    </section>
  );
}

export const SearchInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { onClear?: () => void; loading?: boolean }>(
  function SearchInput({ className, onClear, loading, value, ...rest }, ref) {
    return (
      <div className={clsx("relative", className)}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" aria-hidden />
        <input
          ref={ref}
          type="search"
          value={value}
          className="block h-12 w-full rounded-xl border border-border-strong bg-surface pl-10 pr-10 text-base text-ink placeholder:text-ink-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 sm:h-11 [&::-webkit-search-cancel-button]:hidden"
          {...rest}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-subtle" aria-hidden />
        ) : (
          value &&
          onClear && (
            <button type="button" onClick={onClear} aria-label="Limpar busca" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-ink-subtle hover:bg-surface-muted hover:text-ink">
              <X className="h-4 w-4" />
            </button>
          )
        )}
      </div>
    );
  },
);

export function Tabs({
  value,
  onValueChange,
  items,
  children,
  tourId,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: ReactNode; badge?: ReactNode }[];
  children: ReactNode;
  tourId?: string;
}) {
  return (
    <RTabs.Root value={value} onValueChange={onValueChange}>
      <RTabs.List className="mb-4 flex gap-1 overflow-x-auto border-b border-border" aria-label="Seções" data-tour={tourId}>
        {items.map((i) => (
          <RTabs.Trigger
            key={i.value}
            value={i.value}
            className="-mb-px flex min-h-touch items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-[0.9375rem] text-ink-muted hover:text-ink data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-primary"
          >
            {i.label}
            {i.badge}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {children}
    </RTabs.Root>
  );
}
export const TabPanel = RTabs.Content;

/** Indica onde estão os dados: salvos no servidor, só neste aparelho ou sem conexão. */
export function SaveStatus({
  state,
  savedAt,
}: {
  state: "saved" | "draft_local" | "saving" | "offline" | "unsaved" | "error";
  savedAt?: string | null;
}) {
  const map = {
    saved: { icon: Cloud, text: "Salvo", cls: "text-success" },
    saving: { icon: Loader2, text: "Salvando…", cls: "text-ink-subtle" },
    draft_local: { icon: Cloud, text: `Rascunho guardado neste aparelho${savedAt ? ` ${relativeTime(savedAt)}` : ""} — ainda não enviado`, cls: "text-warning" },
    offline: { icon: CloudOff, text: "Sem conexão — rascunho guardado neste aparelho", cls: "text-warning" },
    unsaved: { icon: Cloud, text: "Alterações não salvas", cls: "text-ink-subtle" },
    error: { icon: CloudOff, text: "Não foi possível guardar o rascunho neste aparelho", cls: "text-danger" },
  }[state];
  const Icon = map.icon;
  return (
    <span role="status" aria-live="polite" className={clsx("inline-flex items-center gap-1.5 text-sm", map.cls)}>
      <Icon className={clsx("h-4 w-4", state === "saving" && "animate-spin")} aria-hidden />
      {map.text}
    </span>
  );
}

export function DescriptionList({ items, className }: { items: { label: string; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-sm text-ink-subtle">{i.label}</dt>
          <dd className="mt-0.5 break-words text-[0.9375rem] text-ink">{i.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
