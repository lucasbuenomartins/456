import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, CloudOff, Info, Loader2, RefreshCw, XCircle } from "./icons";
import type { ReactNode } from "react";
import { initials } from "../lib/format";
import { Button } from "./Button";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";

const badgeTone: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", badgeTone[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const calloutIcon = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

/** Aviso em destaque dentro da página (o que precisa de atenção). */
export function Callout({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof calloutIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = calloutIcon[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={clsx("flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start", badgeTone[tone], "border-current/15", className)}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <div className="flex-1 text-sm text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={clsx("text-ink-muted", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Spinner({ label = "Carregando…", className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={clsx("inline-flex items-center gap-2 text-sm text-ink-subtle", className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("animate-pulse rounded-md bg-surface-sunken", className)} />;
}

/** Estado de carregamento de listas: mantém o layout estável. */
export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-3 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tourId,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tourId?: string;
}) {
  return (
    <div className={clsx("flex flex-col items-center gap-3 px-6 py-12 text-center", className)} data-tour={tourId}>
      {icon && <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">{icon}</div>}
      <div className="max-w-sm">
        <p className="text-base font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const err = error as { message?: string; isNetwork?: boolean; status?: number };
  const network = err?.isNetwork;
  return (
    <div role="alert" className={clsx("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        {network ? <CloudOff className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
      </div>
      <div className="max-w-sm">
        <p className="text-base font-semibold">{network ? "Sem conexão" : "Não foi possível carregar"}</p>
        <p className="mt-1 text-sm text-ink-muted">{err?.message ?? "Tente novamente em instantes."}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border-strong bg-surface px-1.5 py-0.5 font-sans text-[0.75rem] text-ink-muted shadow-sm">{children}</kbd>;
}

const avatarColors = ["bg-primary-soft text-primary", "bg-accent-soft text-accent", "bg-info-soft text-info", "bg-warning-soft text-warning", "bg-success-soft text-success"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const sizeCls = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" }[size];
  return (
    <span aria-hidden className={clsx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sizeCls, avatarColors[h % avatarColors.length])}>
      {initials(name) || "?"}
    </span>
  );
}
