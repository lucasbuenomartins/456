/**
 * Catálogo de tours.
 *
 * O texto de cada passo fica no frontend (apps/web/src/tours/definitions.ts);
 * aqui ficam apenas os identificadores estáveis e as versões, para que o
 * servidor valide eventos e para que o cadastro de novidades referencie tours.
 *
 * Regras:
 * - `screen` tours: exibidos automaticamente no primeiro acesso do usuário à tela.
 * - `update` tours: associados a uma novidade; iniciados por "Conhecer novidade".
 * - Aumentar `version` de um tour de tela só o reexibe se `reshowOnNewVersion` for true
 *   (use para mudanças grandes na tela). Mudanças menores devem virar novidade.
 */
export type TourKind = "screen" | "update";

export interface TourCatalogEntry {
  id: string;
  kind: TourKind;
  /** Identificador estável da tela (ver SCREENS). */
  screen: string;
  version: number;
  title: string;
  reshowOnNewVersion?: boolean;
  /** Público: "clinic" (operação das clínicas) ou "platform" (painel do SaaS). */
  realm: "clinic" | "platform";
}

export const SCREENS = {
  // Clínica
  home: { path: "/", title: "Início" },
  "clients.list": { path: "/clientes", title: "Clientes" },
  "clients.form": { path: "/clientes/novo", title: "Cadastro de cliente" },
  "clients.detail": { path: "/clientes/:id", title: "Ficha do cliente" },
  "settings.company": { path: "/configuracoes/empresa", title: "Dados da empresa" },
  "settings.units": { path: "/configuracoes/unidades", title: "Unidades" },
  "settings.team": { path: "/configuracoes/equipe", title: "Equipe" },
  "settings.roles": { path: "/configuracoes/funcoes", title: "Funções e permissões" },
  "settings.plan": { path: "/configuracoes/plano", title: "Plano e módulos" },
  "settings.audit": { path: "/configuracoes/historico", title: "Histórico de alterações" },
  "settings.data": { path: "/configuracoes/dados", title: "Dados e exportação" },
  "news.center": { path: "/novidades", title: "Novidades" },
  profile: { path: "/meu-perfil", title: "Meu perfil" },
  // Painel do SaaS
  "admin.tenants": { path: "/admin/empresas", title: "Empresas" },
  "admin.tenant": { path: "/admin/empresas/:id", title: "Empresa" },
  "admin.plans": { path: "/admin/planos", title: "Planos" },
  "admin.news": { path: "/admin/novidades", title: "Cadastro de novidades" },
} as const;

export type ScreenId = keyof typeof SCREENS;

const screenTour = (screen: ScreenId, title: string, version = 1, realm: "clinic" | "platform" = "clinic"): TourCatalogEntry => ({
  id: `screen.${screen}`,
  kind: "screen",
  screen,
  version,
  title,
  realm,
});

export const TOURS: TourCatalogEntry[] = [
  screenTour("home", "Conheça o Início"),
  screenTour("clients.list", "Como encontrar e cadastrar clientes"),
  screenTour("clients.form", "Como cadastrar um cliente"),
  screenTour("clients.detail", "A ficha do cliente"),
  screenTour("settings.company", "Dados da empresa"),
  screenTour("settings.units", "Unidades"),
  screenTour("settings.team", "Equipe e convites"),
  screenTour("settings.roles", "Funções e permissões"),
  screenTour("settings.plan", "Plano e módulos"),
  screenTour("settings.audit", "Histórico de alterações"),
  screenTour("settings.data", "Dados e exportação"),
  screenTour("news.center", "Central de novidades"),
  screenTour("profile", "Meu perfil"),
  screenTour("admin.tenants", "Empresas clientes", 1, "platform"),
  screenTour("admin.tenant", "Gerenciar uma empresa", 1, "platform"),
  screenTour("admin.plans", "Planos", 1, "platform"),
  screenTour("admin.news", "Cadastro de novidades", 1, "platform"),
  // Tours de novidades (kind: "update")
  {
    id: "update.clients.quick-search",
    kind: "update",
    screen: "clients.list",
    version: 1,
    title: "Busca rápida de clientes",
    realm: "clinic",
  },
  {
    id: "update.home.command-palette",
    kind: "update",
    screen: "home",
    version: 1,
    title: "Atalho Ctrl+K para encontrar qualquer coisa",
    realm: "clinic",
  },
];

export const TOUR_MAP: Record<string, TourCatalogEntry> = Object.fromEntries(TOURS.map((t) => [t.id, t]));

export function screenTourId(screen: ScreenId): string {
  return `screen.${screen}`;
}

export const TOUR_STATUSES = ["seen", "completed", "dismissed"] as const;
export type TourStatus = (typeof TOUR_STATUSES)[number];

/** Quantas vezes um tour interrompido (apenas "visto") volta a abrir sozinho. */
export const TOUR_MAX_AUTO_SHOWS = 2;

export interface TourStateEntry {
  tourId: string;
  version: number;
  status: TourStatus;
  timesShown: number;
}

/**
 * Decide se um tour deve abrir automaticamente.
 * Única fonte da regra — usada pelo frontend e coberta por testes.
 */
export function shouldAutoStart(entry: TourCatalogEntry, state: TourStateEntry | undefined): boolean {
  if (entry.kind !== "screen") return false;
  if (!state) return true;
  if (state.version < entry.version && entry.reshowOnNewVersion) return true;
  if (state.status === "completed" || state.status === "dismissed") return false;
  return state.timesShown < TOUR_MAX_AUTO_SHOWS;
}
