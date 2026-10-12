import { TOURS } from "@clinica/shared";
import type { TourDefinition } from "./types";

/**
 * Conteúdo dos tours. Textos curtos, em linguagem simples.
 * Os elementos são encontrados pelo atributo data-tour (identificadores estáveis),
 * nunca por classes CSS ou posição na tela.
 */
const defs: TourDefinition[] = [
  {
    id: "screen.home",
    steps: [
      { title: "Este é o seu Início", body: "Aqui você vê o que precisa da sua atenção hoje e os atalhos para as tarefas mais comuns." },
      { anchor: "home.attention", title: "O que precisa de atenção", body: "Avisos importantes aparecem aqui primeiro. Se estiver vazio, está tudo em dia." },
      { anchor: "home.shortcuts", title: "Atalhos do dia a dia", body: "Comece por aqui: cadastrar cliente, buscar uma ficha e mais." },
      { anchor: "home.setup", title: "Primeiros passos", body: "Uma lista para deixar a clínica pronta para usar. Some quando tudo estiver feito.", permission: "company.manage" },
      { anchor: "shell.nav", mobileAnchor: "shell.bottom-nav", title: "Menu principal", body: "Use o menu para ir a cada área. Só aparecem as áreas que você pode usar." },
      { anchor: "shell.search", title: "Busca rápida", body: "Encontre clientes e telas digitando aqui. No computador, use também Ctrl+K." },
      { anchor: "shell.help", title: "Ajuda sempre à mão", body: "Toque em Ajuda para rever este tour quando quiser, em qualquer tela." },
    ],
  },
  {
    id: "screen.clients.list",
    steps: [
      { title: "Clientes", body: "Todos os clientes da clínica ficam aqui, num cadastro único usado em toda a plataforma." },
      { anchor: "clients.list.new", title: "Cadastrar cliente", body: "Toque aqui para cadastrar. Só nome e telefone são obrigatórios.", permission: "clients.create" },
      { anchor: "clients.list.search", title: "Buscar", body: "Digite parte do nome ou do telefone. Não precisa de acentos." },
      { anchor: "clients.list.filters", title: "Filtros", body: "Filtre por situação, etiqueta ou aniversariantes do mês. Seus filtros ficam guardados." },
      { anchor: "clients.list.table", title: "Abrir a ficha", body: "Toque em um cliente para ver a ficha completa. No computador, marque vários para ações em lote." },
      { anchor: "clients.list.export", title: "Exportar", body: "Baixe a lista em planilha quando precisar.", permission: "clients.export", device: "desktop" },
    ],
  },
  {
    id: "screen.clients.form",
    steps: [
      { title: "Cadastro rápido", body: "Preencha o essencial e salve. O restante pode ser completado depois." },
      { anchor: "clients.form.essential", title: "Só o essencial", body: "Nome e telefone bastam. Avisamos se já existir alguém com o mesmo telefone ou CPF." },
      { anchor: "clients.form.more", title: "Mais informações", body: "Endereço, origem e observações ficam aqui, quando você precisar." },
      { anchor: "clients.form.consents", title: "Autorização de contato", body: "Marque apenas se o cliente autorizou receber mensagens. A data e quem registrou ficam guardados." },
      { anchor: "clients.form.save-status", title: "Nada se perde", body: "Enquanto você digita, guardamos um rascunho neste aparelho. Se sair sem querer, é só voltar." },
      { anchor: "clients.form.save", title: "Salvar", body: "Quando terminar, toque em Salvar cliente." },
    ],
  },
  {
    id: "screen.clients.detail",
    steps: [
      { title: "Ficha do cliente", body: "Tudo sobre o cliente em um só lugar. As áreas aparecem conforme os módulos da clínica." },
      { anchor: "clients.detail.contact-actions", title: "Falar com o cliente", body: "Ligue ou abra o WhatsApp com um toque. O envio automático de mensagens chegará em uma próxima etapa." },
      { anchor: "clients.detail.edit", title: "Editar", body: "Atualize os dados quando algo mudar. Toda alteração fica registrada.", permission: "clients.update" },
      { anchor: "clients.detail.tabs", title: "Seções da ficha", body: "Dados, autorizações e histórico de alterações. Agenda e prontuário entram aqui quando forem liberados." },
    ],
  },
  {
    id: "screen.settings.company",
    steps: [
      { title: "Configurações", body: "Aqui ficam os dados da empresa, unidades, equipe e permissões." },
      { anchor: "settings.nav", title: "Seções", body: "Escolha o que deseja configurar. Você só vê o que tem permissão para alterar." },
      { anchor: "settings.company.form", title: "Dados da empresa", body: "Nome, documento e contato aparecem em comprovantes e no cadastro da conta." },
    ],
  },
  {
    id: "screen.settings.units",
    steps: [
      { title: "Unidades", body: "Cada endereço da clínica é uma unidade. A equipe pode ter funções diferentes em cada uma." },
      { anchor: "settings.units.new", title: "Nova unidade", body: "Cadastre uma nova unidade. O limite depende do seu plano.", permission: "units.manage" },
      { anchor: "settings.units.list", title: "Lista de unidades", body: "Toque em uma unidade para editar ou desativar." },
    ],
  },
  {
    id: "screen.settings.team",
    steps: [
      { title: "Equipe", body: "Quem usa o sistema e o que cada pessoa pode fazer." },
      { anchor: "settings.team.invite", title: "Convidar alguém", body: "Escolha a função e a unidade. Você recebe um link para enviar à pessoa.", permission: "team.manage" },
      { anchor: "settings.team.list", title: "Pessoas", body: "Veja as funções de cada um. Você pode alterar o acesso ou desativar quem saiu da clínica." },
      { anchor: "settings.team.invites", title: "Convites pendentes", body: "Convites ainda não aceitos. Você pode cancelar ou gerar de novo.", permission: "team.manage" },
    ],
  },
  {
    id: "screen.settings.roles",
    steps: [
      { title: "Funções e permissões", body: "Uma função é um conjunto de permissões, como Recepção ou Profissional." },
      { anchor: "settings.roles.list", title: "Funções da clínica", body: "Já criamos funções prontas. Você pode ajustá-las para o jeito da sua clínica." },
      { anchor: "settings.roles.new", title: "Nova função", body: "Crie uma função do zero, se precisar.", permission: "roles.manage" },
      { anchor: "settings.roles.sensitive", title: "Dados de saúde", body: "Permissões marcadas como sensíveis dão acesso a dados de saúde e fotos. Conceda só a quem precisa." },
    ],
  },
  {
    id: "screen.settings.plan",
    steps: [
      { title: "Plano e módulos", body: "Veja o que está contratado, o uso e o que cada módulo acrescenta." },
      { anchor: "settings.plan.usage", title: "Uso do plano", body: "Quantas unidades, pessoas e clientes você usa, e o limite do plano." },
      { anchor: "settings.plan.modules", title: "Módulos", body: "Cada módulo funciona sozinho com o núcleo. Juntos, compartilham informações automaticamente." },
    ],
  },
  {
    id: "screen.settings.audit",
    steps: [
      { title: "Histórico de alterações", body: "Registro de quem fez o quê e quando. Ninguém consegue apagar estes registros." },
      { anchor: "settings.audit.filters", title: "Filtrar", body: "Filtre por tipo de registro para encontrar mais rápido." },
      { anchor: "settings.audit.list", title: "Registros", body: "Os mais recentes aparecem primeiro. Dados sensíveis nunca são mostrados aqui." },
    ],
  },
  {
    id: "screen.settings.data",
    steps: [
      { title: "Seus dados", body: "Os dados são da sua clínica. Aqui você exporta e entende as regras de guarda." },
      { anchor: "settings.data.export", title: "Exportar", body: "Baixe uma cópia dos dados do núcleo em arquivo. A exportação fica registrada." },
      { anchor: "settings.data.rules", title: "Regras", body: "O que acontece com os dados se um módulo ou a conta for desativada." },
    ],
  },
  {
    id: "screen.news.center",
    steps: [
      { title: "Novidades", body: "Todas as melhorias do sistema que fazem sentido para você ficam guardadas aqui." },
      { anchor: "news.center.list", title: "Conhecer uma novidade", body: "Toque em Conhecer para ir à tela e ver um tour rápido da mudança." },
    ],
  },
  {
    id: "screen.profile",
    steps: [
      { title: "Meu perfil", body: "Seus dados de acesso e preferências." },
      { anchor: "profile.password", title: "Senha", body: "Troque sua senha quando quiser. As outras sessões abertas serão encerradas." },
      { anchor: "profile.tours", title: "Tours", body: "Quer rever as explicações das telas? Reative os tours aqui." },
    ],
  },
  // ---------- Painel do SaaS
  {
    id: "screen.admin.tenants",
    steps: [
      { title: "Empresas clientes", body: "Todas as clínicas que usam a plataforma, com situação e plano." },
      { anchor: "admin.tenants.new", title: "Nova empresa", body: "Cria a empresa com unidade, funções e módulos do plano, e gera o convite do responsável." },
      { anchor: "admin.tenants.list", title: "Gerenciar", body: "Abra uma empresa para ativar, suspender, trocar plano ou módulos." },
    ],
  },
  {
    id: "screen.admin.tenant",
    steps: [
      { title: "Gerenciar empresa", body: "Toda alteração exige um motivo e aparece no histórico da clínica." },
      { anchor: "admin.tenant.status", title: "Situação da conta", body: "Suspensa: somente leitura e exportação. Cancelada: dados disponíveis para exportação por 90 dias." },
      { anchor: "admin.tenant.plan", title: "Plano", body: "Ao trocar de plano, módulos que saem ficam em somente leitura por 90 dias." },
      { anchor: "admin.tenant.modules", title: "Módulos", body: "Ative ou desative módulos avulsos. Dependências obrigatórias são verificadas." },
      { anchor: "admin.tenant.history", title: "Histórico", body: "Registro de todas as mudanças de situação, plano e módulos." },
    ],
  },
  {
    id: "screen.admin.plans",
    steps: [
      { title: "Planos", body: "Módulos incluídos e limites de uso de cada plano." },
      { anchor: "admin.plans.list", title: "Editar plano", body: "Mudanças nos módulos de um plano valem para novas contratações e trocas de plano." },
    ],
  },
  {
    id: "screen.admin.news",
    steps: [
      { title: "Cadastro de novidades", body: "Anuncie melhorias para as clínicas após o login." },
      { anchor: "admin.news.new", title: "Nova novidade", body: "Defina público (módulo e permissão), tela de destino e o tour que será iniciado." },
      { anchor: "admin.news.list", title: "Acompanhar", body: "Veja quantas pessoas abriram, adiaram ou dispensaram cada novidade." },
    ],
  },
  // ---------- Tours de novidades
  {
    id: "update.clients.quick-search",
    steps: [
      { anchor: "clients.list.search", title: "Novo: busca rápida", body: "Digite parte do nome ou do telefone, sem se preocupar com acentos. O resultado aparece enquanto você digita." },
    ],
  },
  {
    id: "update.home.command-palette",
    steps: [
      { anchor: "shell.search", title: "Novo: encontre qualquer coisa", body: "Toque aqui ou pressione Ctrl+K para ir a uma tela ou abrir a ficha de um cliente." },
    ],
  },
];

export const TOUR_DEFINITIONS: Record<string, TourDefinition> = Object.fromEntries(defs.map((d) => [d.id, d]));

// Garantia em desenvolvimento: todo tour do catálogo tem conteúdo.
if (import.meta.env.DEV) {
  for (const t of TOURS) if (!TOUR_DEFINITIONS[t.id]) console.warn(`Tour sem conteúdo: ${t.id}`);
}
