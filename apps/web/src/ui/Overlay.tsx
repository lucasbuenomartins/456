import * as RDialog from "@radix-ui/react-dialog";
import * as RMenu from "@radix-ui/react-dropdown-menu";
import { clsx } from "clsx";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * Janela modal. No celular ocupa a parte de baixo da tela (bottom sheet),
 * com botões ao alcance do polegar.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  tourId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  tourId?: string;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[70] bg-ink/40 animate-fade-in" />
        <RDialog.Content
          data-tour={tourId}
          className={clsx(
            "fixed z-[71] flex max-h-[92dvh] flex-col bg-surface shadow-pop animate-slide-up focus:outline-none",
            "inset-x-0 bottom-0 rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
            { sm: "sm:w-[420px]", md: "sm:w-[560px]", lg: "sm:w-[760px]" }[size],
          )}
        >
          <div className="flex items-start gap-4 border-b border-border px-5 py-4">
            <div className="flex-1">
              <RDialog.Title className="text-lg font-semibold">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-0.5 text-sm text-ink-muted">{description}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{typeof title === "string" ? title : "Janela"}</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="-m-2 rounded-lg p-2 text-ink-subtle hover:bg-surface-muted hover:text-ink" aria-label="Fechar">
              <X className="h-5 w-5" />
            </RDialog.Close>
          </div>
          {children && <div className="overflow-y-auto px-5 py-4">{children}</div>}
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Confirmação explícita para ações sensíveis ou difíceis de desfazer. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  onConfirm: () => Promise<unknown> | void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

export const Menu = RMenu.Root;
export const MenuTrigger = RMenu.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <RMenu.Portal>
      <RMenu.Content
        align={align}
        sideOffset={6}
        className="z-[75] min-w-[220px] rounded-xl border border-border bg-surface p-1.5 shadow-pop animate-fade-in"
      >
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  icon,
  danger,
  disabled,
  shortcut,
}: {
  children: ReactNode;
  onSelect?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: ReactNode;
}) {
  return (
    <RMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={clsx(
        "flex min-h-touch sm:min-h-[38px] cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-[0.9375rem] outline-none",
        "data-[highlighted]:bg-surface-muted data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        danger ? "text-danger" : "text-ink",
      )}
    >
      {icon && <span className="text-ink-subtle [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-ink-subtle">{shortcut}</span>}
    </RMenu.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ink-subtle">{children}</RMenu.Label>;
}

export function MenuSeparator() {
  return <RMenu.Separator className="my-1 h-px bg-border" />;
}
