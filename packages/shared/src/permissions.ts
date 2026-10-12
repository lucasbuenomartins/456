import type { ModuleKey } from "./modules";

/**
 * Catálogo de permissões. Formato: `recurso.acao`.
 *
 * `sensitive`: dá acesso a dados de saúde ou imagem. Nunca é concedida
 * automaticamente a funções comerciais e exige confirmação ao ser atribuída.
 *
 * `scope`:
 *   - "tenant": vale para toda a empresa; só é concedida por funções atribuídas a "Todas as unidades".
 *   - "unit": vale na unidade em que a função foi atribuída.
 */
export interface PermissionDefinition {
  key: string;
  module: ModuleKey;
  group: string;
  label: string;
  description?: string;
  sensitive?: boolean;
  scope: "tenant" | "unit";
}

const p = (
  key: string,
  module: ModuleKey,
  group: string,
  label: string,
  extra: Partial<Pick<PermissionDefinition, "description" | "sensitive" | "scope">> = {},
): PermissionDefinition => ({ key, module, group, label, scope: extra.scope ?? "unit", ...extra });

export const PERMISSIONS = [
  // Núcleo — clientes
  p("clients.read", "core", "Clientes", "Ver clientes"),
  p("clients.create", "core", "Clientes", "Cadastrar clientes"),
  p("clients.update", "core", "Clientes", "Editar clientes"),
  p("clients.deactivate", "core", "Clientes", "Inativar e reativar clientes"),
  p("clients.export", "core", "Clientes", "Exportar lista de clientes", { scope: "tenant" }),
  p("clients.documents.read", "core", "Clientes", "Ver CPF e documentos completos", {
    description: "Sem esta permissão o CPF aparece mascarado.",
  }),

  // Núcleo — empresa, equipe e configurações
  p("company.manage", "core", "Empresa", "Editar dados da empresa", { scope: "tenant" }),
  p("units.manage", "core", "Empresa", "Gerenciar unidades", { scope: "tenant" }),
  p("team.read", "core", "Equipe", "Ver equipe"),
  p("team.manage", "core", "Equipe", "Convidar, editar e desativar pessoas da equipe", { scope: "tenant" }),
  p("roles.manage", "core", "Equipe", "Criar e editar funções e permissões", { scope: "tenant" }),
  p("plan.read", "core", "Plano", "Ver plano e módulos contratados", { scope: "tenant" }),
  p("audit.read", "core", "Segurança", "Ver histórico de alterações", { scope: "tenant" }),
  p("data.export", "core", "Segurança", "Exportar dados da empresa", { scope: "tenant" }),

  // Agenda (etapa 2)
  p("agenda.read_all", "agenda", "Agenda", "Ver a agenda de todos os profissionais"),
  p("agenda.read_own", "agenda", "Agenda", "Ver a própria agenda"),
  p("agenda.book", "agenda", "Agenda", "Agendar, reagendar e cancelar"),
  p("agenda.override", "agenda", "Agenda", "Agendar em exceção às regras (encaixe)", {
    description: "Permite encaixes fora das regras. Toda exceção fica registrada.",
  }),
  p("agenda.attend", "agenda", "Agenda", "Registrar chegada, início e conclusão"),
  p("agenda.configure", "agenda", "Agenda", "Configurar horários, salas e equipamentos"),
  p("services.manage", "core", "Serviços", "Gerenciar serviços e preços", { scope: "tenant" }),

  // Prontuário (etapa 3)
  p("clinical.read", "prontuario", "Prontuário", "Ver anamnese, evolução e alertas de saúde", { sensitive: true }),
  p("clinical.write", "prontuario", "Prontuário", "Preencher anamnese e evolução", { sensitive: true }),
  p("clinical.photos", "prontuario", "Prontuário", "Ver e incluir fotos de antes e depois", { sensitive: true }),
  p("clinical.export", "prontuario", "Prontuário", "Exportar prontuário", { sensitive: true, scope: "tenant" }),
  p("clinical.templates", "prontuario", "Prontuário", "Editar modelos de anamnese e termos", { scope: "tenant" }),

  // Financeiro (etapa 4)
  p("finance.read", "financeiro", "Financeiro", "Ver financeiro"),
  p("finance.sell", "financeiro", "Financeiro", "Registrar vendas e receber pagamentos"),
  p("finance.refund", "financeiro", "Financeiro", "Estornar e reembolsar"),
  p("finance.cash", "financeiro", "Financeiro", "Abrir e fechar caixa"),
  p("finance.payables", "financeiro", "Financeiro", "Contas a pagar"),
  p("finance.commissions", "financeiro", "Financeiro", "Ver e configurar comissões", { scope: "tenant" }),

  // Estoque (etapa 4)
  p("stock.read", "estoque", "Estoque", "Ver estoque"),
  p("stock.move", "estoque", "Estoque", "Registrar entradas, saídas e ajustes"),
  p("stock.purchase", "estoque", "Estoque", "Fazer compras e receber materiais"),

  // CRM (etapa 5)
  p("crm.read", "crm", "CRM", "Ver oportunidades e tarefas"),
  p("crm.write", "crm", "CRM", "Registrar interações, tarefas e oportunidades"),

  // Relatórios
  p("reports.read", "relatorios", "Relatórios", "Ver relatórios e indicadores"),
] as const satisfies readonly PermissionDefinition[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_MAP: Record<string, PermissionDefinition> = Object.fromEntries(
  PERMISSIONS.map((perm) => [perm.key, perm]),
);

export function isPermissionKey(value: string): value is PermissionKey {
  return value in PERMISSION_MAP;
}

/**
 * Modelos de função criados para cada nova empresa. São cópias editáveis:
 * a empresa pode ajustar, mas o modelo original permanece para "Restaurar padrão".
 */
export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: "admin",
    name: "Administrador",
    description: "Acesso total, inclusive plano, equipe e permissões.",
    permissions: PERMISSIONS.map((perm) => perm.key),
  },
  {
    key: "gestor",
    name: "Gestor",
    description: "Acompanha a operação, os resultados e a equipe. Não vê dados de saúde por padrão.",
    permissions: [
      "clients.read", "clients.create", "clients.update", "clients.deactivate", "clients.export",
      "company.manage", "units.manage", "team.read", "team.manage", "roles.manage", "plan.read", "audit.read", "data.export",
      "agenda.read_all", "agenda.book", "agenda.override", "agenda.attend", "agenda.configure", "services.manage",
      "finance.read", "finance.sell", "finance.refund", "finance.cash", "finance.payables", "finance.commissions",
      "stock.read", "stock.move", "stock.purchase", "crm.read", "crm.write", "reports.read",
    ],
  },
  {
    key: "recepcao",
    name: "Secretária / Recepção",
    description: "Cadastra clientes, agenda, confirma e recebe na chegada.",
    permissions: [
      "clients.read", "clients.create", "clients.update", "clients.documents.read", "team.read",
      "agenda.read_all", "agenda.book", "agenda.attend", "finance.sell", "finance.cash", "crm.read", "crm.write",
    ],
  },
  {
    key: "profissional",
    name: "Profissional de estética",
    description: "Vê a própria agenda, preenche anamnese, evolução e fotos.",
    permissions: [
      "clients.read", "team.read", "agenda.read_own", "agenda.attend",
      "clinical.read", "clinical.write", "clinical.photos", "stock.read",
    ],
  },
  {
    key: "financeiro",
    name: "Financeiro",
    description: "Recebimentos, pagamentos, caixa e comissões.",
    permissions: [
      "clients.read", "clients.documents.read", "team.read", "finance.read", "finance.sell", "finance.refund",
      "finance.cash", "finance.payables", "finance.commissions", "reports.read",
    ],
  },
  {
    key: "comercial",
    name: "Comercial / Relacionamento",
    description: "Oportunidades, tarefas e contatos. Sem acesso a dados de saúde.",
    permissions: ["clients.read", "clients.create", "clients.update", "team.read", "crm.read", "crm.write", "agenda.read_all"],
  },
  {
    key: "estoque",
    name: "Estoque",
    description: "Materiais, produtos, compras e inventário.",
    permissions: ["team.read", "stock.read", "stock.move", "stock.purchase"],
  },
];
