import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/react-dom";
import { clsx } from "clsx";
import { ArrowLeft, ArrowRight, Sparkles, X } from "../ui/icons";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../lib/hooks";
import type { TourStep } from "./types";

const FIND_TIMEOUT_MS = 1500;

function findAnchor(step: TourStep, mobile: boolean): HTMLElement | null {
  const ids = mobile && step.mobileAnchor ? [step.mobileAnchor, step.anchor] : [step.anchor];
  for (const id of ids) {
    if (!id) continue;
    const els = document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`);
    for (const el of els) {
      // Ignora elementos ocultos (ex.: menu lateral escondido no celular).
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width > 0 && r.height > 0 && style.visibility !== "hidden" && style.display !== "none") return el;
    }
  }
  return null;
}

/**
 * Cartão do tour. Não é modal: a tela continua utilizável (não bloqueia tarefas urgentes).
 * Passos cujo elemento não existe (sem permissão, lista vazia, tela pequena) são pulados.
 */
export function TourOverlay({
  steps,
  index,
  onIndex,
  onFinish,
  onDismiss,
}: {
  steps: TourStep[];
  index: number;
  onIndex: (i: number) => void;
  onFinish: () => void;
  onDismiss: () => void;
}) {
  const mobile = useIsMobile();
  const step = steps[index]!;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [searching, setSearching] = useState(Boolean(step.anchor));
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const titleId = "tour-title";

  const go = useCallback(
    (delta: 1 | -1) => {
      direction.current = delta;
      const next = index + delta;
      if (next >= steps.length) onFinish();
      else if (next >= 0) onIndex(next);
    },
    [index, steps.length, onFinish, onIndex],
  );

  // Procura o elemento do passo, esperando um pouco por conteúdo que ainda está carregando.
  useEffect(() => {
    setAnchor(null);
    setRect(null);
    if (!step.anchor) {
      setSearching(false);
      return;
    }
    setSearching(true);
    const startedAt = Date.now();
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const el = findAnchor(step, mobile);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setAnchor(el);
        setSearching(false);
      } else if (Date.now() - startedAt > FIND_TIMEOUT_MS) {
        setSearching(false);
        // Elemento indisponível: segue para o próximo passo sem quebrar a navegação.
        const next = index + direction.current;
        if (next >= steps.length) onFinish();
        else if (next < 0) onIndex(0);
        else onIndex(next);
      } else {
        setTimeout(tick, 100);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [step, mobile, index, steps.length, onFinish, onIndex]);

  // Posiciona o destaque e o cartão, acompanhando rolagem e redimensionamento.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!anchor || !card) return;
    return autoUpdate(anchor, card, () => {
      setRect(anchor.getBoundingClientRect());
      if (mobile) return;
      computePosition(anchor, card, {
        placement: step.placement ?? "bottom",
        strategy: "fixed",
        middleware: [offset(14), flip({ padding: 12 }), shift({ padding: 12 })],
      }).then(({ x, y }) => {
        // Elementos muito altos (ex.: uma tabela inteira) não deixam espaço acima nem abaixo:
        // mantém o cartão sempre dentro da tela.
        const margin = 12;
        const maxY = window.innerHeight - card.offsetHeight - margin;
        const maxX = window.innerWidth - card.offsetWidth - margin;
        Object.assign(card.style, {
          left: `${Math.max(margin, Math.min(x, maxX))}px`,
          top: `${Math.max(margin, Math.min(y, maxY))}px`,
        });
      });
    });
  }, [anchor, mobile, step.placement]);

  // Foco no cartão a cada passo, para leitores de tela e teclado.
  useEffect(() => {
    if (!searching) cardRef.current?.focus({ preventScroll: true });
  }, [index, searching]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
      const inCard = cardRef.current?.contains(document.activeElement);
      if (!inCard) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onDismiss]);

  if (searching) return null;

  const centered = !anchor;
  const isLast = index === steps.length - 1;
  const pad = 6;

  return createPortal(
    <>
      {rect && (
        <div
          aria-hidden
          className="tour-spotlight"
          style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
        />
      )}
      <div
        key={index}
        ref={cardRef}
        style={anchor && !mobile ? { left: -9999, top: 0 } : undefined}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="tour-card"
        className={clsx(
          "fixed z-[65] w-[min(360px,calc(100vw-24px))] rounded-2xl border border-border bg-surface p-5 shadow-pop focus:outline-none animate-slide-up",
          mobile && "!inset-x-3 !bottom-[calc(76px+env(safe-area-inset-bottom))] !top-auto !left-3 !w-auto",
          !mobile && centered && "bottom-6 right-6",
        )}
      >
        <div className="mb-2 flex items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-xs font-medium text-ink-subtle">
              Passo {index + 1} de {steps.length}
            </p>
            <h2 id={titleId} className="text-base font-semibold leading-snug">
              {step.title}
            </h2>
          </div>
          <button onClick={onDismiss} aria-label="Fechar tour" className="-m-1.5 rounded-lg p-1.5 text-ink-subtle hover:bg-surface-muted hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-[0.9375rem] text-ink-muted">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {index === 0 ? (
            <button onClick={onDismiss} className="min-h-touch rounded-lg px-3 text-sm text-ink-muted hover:bg-surface-muted sm:min-h-[38px]">
              Pular tour
            </button>
          ) : (
            <button
              onClick={() => go(-1)}
              className="inline-flex min-h-touch items-center gap-1 rounded-lg px-3 text-sm text-ink-muted hover:bg-surface-muted sm:min-h-[38px]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
            </button>
          )}
          <div className="ml-auto flex items-center gap-1" aria-hidden>
            {steps.map((_, i) => (
              <span key={i} className={clsx("h-1.5 rounded-full transition-all", i === index ? "w-4 bg-primary" : "w-1.5 bg-border-strong")} />
            ))}
          </div>
          <button
            onClick={() => go(1)}
            className="inline-flex min-h-touch items-center gap-1 rounded-lg bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-hover sm:min-h-[38px]"
          >
            {isLast ? "Concluir" : "Próximo"}
            {!isLast && <ArrowRight className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
