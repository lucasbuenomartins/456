import { SCREENS, TOUR_MAP, screenTourId, shouldAutoStart, type ScreenId, type TourStateEntry, type TourStatus } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { api } from "../lib/api";
import { TOUR_DEFINITIONS } from "./definitions";
import { TourOverlay } from "./TourOverlay";
import type { TourStep } from "./types";

export type TourSource = "auto" | "manual" | "news";

interface ActiveTour {
  tourId: string;
  version: number;
  screen: string;
  steps: TourStep[];
  index: number;
  source: TourSource;
}

interface TourContextValue {
  screen: ScreenId | null;
  /** A tela informa quando terminou de carregar (o tour espera para não apontar para o vazio). */
  setScreen: (screen: ScreenId | null, ready: boolean) => void;
  start: (tourId: string, source?: TourSource) => void;
  /** Inicia o tour da tela atual (menu Ajuda → Ver tour desta tela). */
  startCurrentScreenTour: () => void;
  /** Bloqueia aberturas automáticas (ex.: enquanto as novidades do login estão na tela). */
  suspend: (key: string) => void;
  resume: (key: string) => void;
  active: boolean;
  resetAll: () => Promise<void>;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTours(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("TourProvider ausente");
  return ctx;
}

/** Navega para uma tela e inicia o tour indicado ao chegar (usado pelas novidades). */
export function useNavigateWithTour() {
  const navigate = useNavigate();
  return useCallback((path: string, tourId: string | null) => navigate(path, { state: tourId ? { startTour: tourId } : undefined }), [navigate]);
}

/**
 * Registra a tela atual. Toda página chama este hook com seu identificador estável.
 * - Define o título da aba.
 * - Abre o tour de primeiro acesso, quando aplicável.
 */
export function useScreen(screen: ScreenId, opts: { ready?: boolean; title?: string } = {}) {
  const { setScreen } = useTours();
  const ready = opts.ready ?? true;
  const title = opts.title ?? SCREENS[screen].title;
  useEffect(() => {
    document.title = `${title} · Lumi`;
  }, [title]);
  useEffect(() => {
    setScreen(screen, ready);
  }, [screen, ready, setScreen]);
  useEffect(() => () => setScreen(null, false), [setScreen]);
}

interface Filters {
  can: (permission: NonNullable<TourStep["permission"]>) => boolean;
  hasModule: (module: NonNullable<TourStep["module"]>) => boolean;
}

/** Usuário está digitando ou com uma janela aberta: não interromper com tour automático. */
function userIsBusy(): boolean {
  const el = document.activeElement as HTMLElement | null;
  const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) && el.getAttribute("type") !== "checkbox";
  const dialogOpen = !!document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  return typing || dialogOpen;
}

export function TourProvider({
  children,
  realm,
  filters,
}: {
  children: ReactNode;
  realm: "clinic" | "platform";
  filters: Filters;
}) {
  const base = realm === "platform" ? "/api/admin/tours" : "/api/tours";
  const qc = useQueryClient();
  const location = useLocation();
  const stateQuery = useQuery({
    queryKey: ["tours", realm],
    queryFn: () => api<{ items: TourStateEntry[] }>(`${base}/state`),
    staleTime: Infinity,
  });

  const [screen, setScreenState] = useState<{ id: ScreenId | null; ready: boolean }>({ id: null, ready: false });
  const [active, setActive] = useState<ActiveTour | null>(null);
  const [suspended, setSuspended] = useState<Set<string>>(new Set());
  /** Telas cujo tour automático já foi decidido nesta visita (evita reabrir a cada render). */
  const decidedForVisit = useRef<string | null>(null);

  const isMobile = typeof window !== "undefined" && window.matchMedia?.("(max-width: 639px)").matches;

  const record = useCallback(
    (tourId: string, version: number, status: TourStatus) => {
      // Atualiza o estado local na hora; o servidor é a fonte de verdade.
      qc.setQueryData<{ items: TourStateEntry[] }>(["tours", realm], (old) => {
        const items = [...(old?.items ?? [])];
        const i = items.findIndex((x) => x.tourId === tourId);
        const prev = items[i];
        const next: TourStateEntry =
          status === "seen"
            ? { tourId, version, status: prev && prev.status !== "seen" && prev.version >= version ? prev.status : "seen", timesShown: (prev?.timesShown ?? 0) + 1 }
            : { tourId, version, status: prev?.status === "completed" && status === "dismissed" ? "completed" : status, timesShown: prev?.timesShown ?? 1 };
        if (i >= 0) items[i] = next;
        else items.push(next);
        return { items };
      });
      // Falha ao registrar não deve atrapalhar o uso; tenta novamente no próximo evento.
      api(`${base}/${encodeURIComponent(tourId)}/events`, { body: { version, status } }).catch(() => undefined);
    },
    [base, qc, realm],
  );

  const resolveSteps = useCallback(
    (tourId: string): TourStep[] => {
      const def = TOUR_DEFINITIONS[tourId];
      if (!def) return [];
      return def.steps.filter((s) => {
        if (s.permission && !filters.can(s.permission)) return false;
        if (s.module && !filters.hasModule(s.module)) return false;
        if (s.device === "desktop" && isMobile) return false;
        if (s.device === "mobile" && !isMobile) return false;
        return true;
      });
    },
    [filters, isMobile],
  );

  const start = useCallback(
    (tourId: string, source: TourSource = "manual") => {
      const entry = TOUR_MAP[tourId];
      const steps = resolveSteps(tourId);
      if (!entry || steps.length === 0) return;
      setActive({ tourId, version: entry.version, screen: entry.screen, steps, index: 0, source });
      record(tourId, entry.version, "seen");
    },
    [record, resolveSteps],
  );

  const setScreen = useCallback((id: ScreenId | null, ready: boolean) => {
    setScreenState((prev) => (prev.id === id && prev.ready === ready ? prev : { id, ready }));
  }, []);

  // Trocar de tela encerra o tour em andamento (fica registrado como "visto", não concluído).
  useEffect(() => {
    if (active && screen.id && active.screen !== screen.id) setActive(null);
  }, [screen.id, active]);

  /** Pedido explícito de tour (vindo de "Conhecer novidade"), consumido uma única vez por navegação. */
  const consumedRequest = useRef<string | null>(null);

  // Decide o tour desta visita: pedido explícito (novidade) > primeiro acesso.
  useEffect(() => {
    if (!screen.id || !screen.ready || !stateQuery.data || active) return;
    const visitKey = `${screen.id}|${location.key}`;
    if (decidedForVisit.current === visitKey) return;

    const requested = (location.state as { startTour?: string } | null)?.startTour;
    if (requested && consumedRequest.current !== location.key) {
      consumedRequest.current = location.key;
      decidedForVisit.current = visitKey;
      const done = stateQuery.data.items.find((i) => i.tourId === requested && (i.status === "completed" || i.status === "dismissed"));
      // Recarregar a página mantém o pedido no histórico: não repete um tour já concluído.
      if (!done || TOUR_MAP[requested]?.kind === "update") {
        if (!done) start(requested, "news");
        return;
      }
    }

    if (suspended.size > 0) return;
    const entry = TOUR_MAP[screenTourId(screen.id)];
    if (!entry) return;
    const state = stateQuery.data.items.find((i) => i.tourId === entry.id);
    if (!shouldAutoStart(entry, state)) {
      decidedForVisit.current = visitKey;
      return;
    }
    const t = setTimeout(() => {
      // Não interrompe quem já começou a digitar ou abriu uma janela: tenta na próxima visita.
      decidedForVisit.current = visitKey;
      if (userIsBusy()) return;
      start(entry.id, "auto");
    }, 700);
    return () => clearTimeout(t);
  }, [screen, stateQuery.data, active, suspended, location.key, location.state, start]);

  const close = useCallback(
    (status: "completed" | "dismissed") => {
      if (!active) return;
      record(active.tourId, active.version, status);
      setActive(null);
    },
    [active, record],
  );

  const value = useMemo<TourContextValue>(
    () => ({
      screen: screen.id,
      setScreen,
      start,
      startCurrentScreenTour: () => {
        if (screen.id) start(screenTourId(screen.id), "manual");
      },
      suspend: (key) => setSuspended((s) => new Set(s).add(key)),
      resume: (key) =>
        setSuspended((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        }),
      active: !!active,
      resetAll: async () => {
        await api(`${base}/reset`, { body: {} });
        qc.setQueryData(["tours", realm], { items: [] });
        decidedForVisit.current = null;
      },
    }),
    [screen.id, setScreen, start, active, qc, realm, base],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={active.tourId}
          steps={active.steps}
          index={active.index}
          onIndex={(index) => setActive((a) => (a ? { ...a, index } : a))}
          onFinish={() => close("completed")}
          onDismiss={() => close("dismissed")}
        />
      )}
    </TourContext.Provider>
  );
}
