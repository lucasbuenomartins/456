import { clsx } from "clsx";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  success: (message: string, action?: ToastItem["action"]) => void;
  error: (message: string, action?: ToastItem["action"]) => void;
  info: (message: string, action?: ToastItem["action"]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("ToastProvider ausente");
  return ctx;
}

const icons = { success: CheckCircle2, error: XCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (tone: ToastTone, message: string, action?: ToastItem["action"]) => {
      const id = ++seq.current;
      setItems((all) => [...all.slice(-2), { id, tone, message, action }]);
      // Erros ficam mais tempo; mensagens com ação também.
      setTimeout(() => dismiss(id), tone === "error" || action ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, a) => push("success", m, a),
      error: (m, a) => push("error", m, a),
      info: (m, a) => push("info", m, a),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
      >
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-ink-inverse shadow-pop animate-slide-up"
            >
              <Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", t.tone === "success" && "text-emerald-300", t.tone === "error" && "text-red-300")} aria-hidden />
              <p className="flex-1">{t.message}</p>
              {t.action && (
                <button
                  className="font-semibold text-teal-200 underline-offset-2 hover:underline"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button aria-label="Fechar aviso" onClick={() => dismiss(t.id)} className="-m-1 rounded p-1 text-ink-inverse/70 hover:text-ink-inverse">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
