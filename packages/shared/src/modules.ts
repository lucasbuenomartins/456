/**
 * Catálogo de módulos comercializáveis.
 *
 * - `requires`: dependências OBRIGATÓRIAS para o módulo funcionar.
 * - `enhancedBy`: módulos que apenas AMPLIAM a experiência quando contratados juntos.
 *
 * O núcleo (`core`) está sempre presente e não pode ser desativado.
 */
export const MODULE_KEYS = [
  "core",
  "agenda",
  "financeiro",
  "estoque",
  "crm",
  "prontuario",
  "relatorios",
  "portal",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ModuleAvailability = "disponivel" | "em_construcao" | "futuro";

export interface ModuleDefinition {
  key: ModuleKey;
  name: string;
  description: string;
  requires: ModuleKey[];
  enhancedBy: Partial<Record<ModuleKey, string>>;
  /** Situação de implementação no produto (transparência para o cliente e para o time). */
  availability: ModuleAvailability;
  /** Etapa do roadmap em que o módulo é entregue. */
  stage: number;
}

export const MODULES: Record<ModuleKey, ModuleDefinition> = {
  core: {
    key: "core",
    name: "Núcleo da plataforma",
    description:
      "Clientes, equipe, unidades, funções e permissões, serviços, configurações, ajuda e novidades.",
    requires: [],
    enhancedBy: {},
    availability: "disponivel",
    stage: 1,
  },
  agenda: {
    key: "agenda",
    name: "Agenda e atendimento",
    description:
      "Agendamentos, disponibilidade de profissionais, salas e equipamentos, confirmações, chegadas, lista de espera e pacotes de sessões.",
    requires: ["core"],
    enhancedBy: {
      financeiro: "Ao concluir o atendimento, gera a cobrança e permite receber pagamento na própria agenda.",
      estoque: "Mostra os materiais previstos do procedimento e dá baixa do consumo real ao concluir.",
      prontuario: "Abre anamnese e evolução direto do agendamento e mostra alertas de saúde na agenda.",
      crm: "Cria tarefas de retorno e acompanha clientes que faltaram ou estão sem agendar.",
    },
    availability: "em_construcao",
    stage: 2,
  },
  prontuario: {
    key: "prontuario",
    name: "Anamnese e prontuário",
    description:
      "Modelos de anamnese, histórico de saúde, evolução, fotos de antes e depois, termos e consentimentos versionados.",
    requires: ["core"],
    enhancedBy: {
      agenda: "Vincula anamnese e evolução ao atendimento agendado.",
      estoque: "Registra os materiais utilizados junto da evolução.",
    },
    availability: "em_construcao",
    stage: 3,
  },
  financeiro: {
    key: "financeiro",
    name: "ERP e financeiro",
    description:
      "Vendas, orçamentos, contas a pagar e receber, caixa, fluxo de caixa, comissões e inadimplência.",
    requires: ["core"],
    enhancedBy: {
      agenda: "Cobranças nascem dos atendimentos; pacotes vendidos viram saldo de sessões.",
      estoque: "Venda de produtos baixa o estoque; compras geram contas a pagar.",
      crm: "Orçamentos em aberto viram tarefas de follow-up.",
    },
    availability: "em_construcao",
    stage: 4,
  },
  estoque: {
    key: "estoque",
    name: "Estoque e compras",
    description:
      "Produtos e materiais, entradas, saídas, transferências, lotes e validade, inventário e compras.",
    requires: ["core"],
    enhancedBy: {
      agenda: "Baixa automática do consumo real ao concluir o atendimento.",
      financeiro: "Compras recebidas geram contas a pagar; vendas de produtos baixam o estoque.",
    },
    availability: "em_construcao",
    stage: 4,
  },
  crm: {
    key: "crm",
    name: "CRM e relacionamento",
    description:
      "Oportunidades, tarefas, interações, segmentações, aniversários, inativos e consentimentos de comunicação.",
    requires: ["core"],
    enhancedBy: {
      agenda: "Identifica clientes inativos e cria lembretes de retorno a partir dos atendimentos.",
      financeiro: "Acompanha orçamentos e pacotes perto do fim.",
    },
    availability: "em_construcao",
    stage: 5,
  },
  relatorios: {
    key: "relatorios",
    name: "Relatórios e indicadores",
    description:
      "Indicadores por período e unidade. Mostra apenas os relatórios dos módulos contratados.",
    requires: ["core"],
    enhancedBy: {
      agenda: "Ocupação, faltas e atendimentos por profissional.",
      financeiro: "Faturamento, recebimentos, inadimplência e comissões.",
      estoque: "Consumo, giro e validade.",
      crm: "Conversão e retenção.",
    },
    availability: "em_construcao",
    stage: 4,
  },
  portal: {
    key: "portal",
    name: "Portal do cliente e autoagendamento",
    description:
      "Autoagendamento pelo cliente usando as mesmas regras de disponibilidade da agenda.",
    requires: ["core", "agenda"],
    enhancedBy: {
      financeiro: "Pagamento antecipado (depende de integração com meio de pagamento).",
      prontuario: "Preenchimento da anamnese antes da consulta.",
    },
    availability: "futuro",
    stage: 6,
  },
};

/** Estados de um módulo para uma empresa. */
export const MODULE_STATUSES = ["active", "trial", "read_only", "disabled"] as const;
export type ModuleStatus = (typeof MODULE_STATUSES)[number];

export const MODULE_STATUS_LABEL: Record<ModuleStatus, string> = {
  active: "Ativo",
  trial: "Em teste",
  read_only: "Somente leitura",
  disabled: "Não contratado",
};

/** Dias em que um módulo desativado continua disponível para consulta e exportação. */
export const READ_ONLY_GRACE_DAYS = 90;

export function canReadModule(status: ModuleStatus | undefined): boolean {
  return status === "active" || status === "trial" || status === "read_only";
}

export function canWriteModule(status: ModuleStatus | undefined): boolean {
  return status === "active" || status === "trial";
}

/**
 * Valida um conjunto de módulos contratados: devolve as dependências obrigatórias que faltam.
 */
export function missingDependencies(modules: ModuleKey[]): { module: ModuleKey; missing: ModuleKey[] }[] {
  const set = new Set<ModuleKey>([...modules, "core"]);
  const problems: { module: ModuleKey; missing: ModuleKey[] }[] = [];
  for (const m of set) {
    const missing = MODULES[m].requires.filter((r) => !set.has(r));
    if (missing.length) problems.push({ module: m, missing });
  }
  return problems;
}

/** Módulos que deixariam de funcionar se `module` fosse desativado. */
export function dependentsOf(module: ModuleKey, active: ModuleKey[]): ModuleKey[] {
  return active.filter((m) => m !== module && MODULES[m].requires.includes(module));
}
