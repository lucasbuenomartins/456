# 9. Roadmap, escopo da Etapa 1 e critérios de aceite

## Roadmap

| Etapa | Entrega utilizável | Situação |
|---|---|---|
| **1** | Núcleo, design system, permissões, contratação de módulos, painel do SaaS, tours e novidades, **clientes** | ✅ entregue |
| 2 | Serviços, profissionais, salas/equipamentos, agenda completa, atendimento (chegada → conclusão), pacotes sem financeiro | próxima |
| 3 | Anamnese configurável, prontuário, evolução, fotos, termos, rascunho com sincronização no servidor | |
| 4 | Financeiro (vendas, recebimentos, caixa, comissões), pacotes com venda, estoque e compras, primeiros relatórios | |
| 5 | CRM (pipeline, tarefas, inativos, retornos), métricas de conversão e retenção | |
| 6 | Integrações (WhatsApp/SMS, pagamentos), automações, portal com autoagendamento | |

**Ajuste de sequência justificado**: o cadastro de **clientes** entrou na Etapa 1 (estava na 2) porque é a identidade única de toda a plataforma e a melhor jornada real para validar isolamento, permissões, rascunhos, idempotência e tours desde o início. Serviços e profissionais ficaram na Etapa 2 porque suas regras (duração, preparação, recursos) nascem junto com a agenda.

## Escopo da Etapa 1

**Funciona (persistência real, validação no servidor, responsivo, com tour):**
- Login, escolha de clínica (mesmo login em várias), convite com link, aceite, perfil e troca de senha.
- Isolamento por empresa (RLS), funções e permissões por unidade, proteção contra escalada de privilégio.
- Clientes: lista com busca sem acento, filtros persistentes, aniversariantes, etiquetas e inativação em lote, exportação CSV; cadastro com aviso de duplicidade, rascunho automático, idempotência e concorrência otimista; ficha com contato rápido, consentimentos de comunicação e histórico.
- Configurações: empresa, unidades (com limite do plano), equipe e convites, funções, plano e módulos (uso e histórico), histórico de alterações, exportação de dados e regras de guarda.
- Início por permissões; busca global `Ctrl+K`; atalhos de teclado; avisos de conta somente leitura/teste/sem conexão.
- Painel do SaaS: empresas (criar, ativar, suspender, cancelar), trocar plano, ativar/desativar módulos com dependências, planos e limites, cadastro de novidades com público e tour.
- Tours em todas as telas; novidades após o login com tour da novidade.

**Demonstração ou dependente de integração (sinalizado na interface):**
- Módulos Agenda, Prontuário, Financeiro, Estoque, CRM, Relatórios: menu e abas da ficha mostram "Em breve/Em construção" quando contratados — sem dados fictícios.
- Convite e "esqueci minha senha": sem envio automático; o link é compartilhado manualmente (copiar/WhatsApp). E-mail não é usado para contato.
- Cobrança do plano: sem gateway.
- Dados do `seed` são de demonstração (senha fixa); não usar em produção.

## Critérios de aceite da Etapa 1 e como foram verificados

| # | Critério | Verificação |
|---|---|---|
| A1 | Uma empresa não lê, altera, inativa nem vincula dados de outra, nem por ID direto | `apps/api/test/isolation.test.ts` (API + banco com RLS) |
| A2 | Sem contexto de empresa, o banco não devolve nenhuma linha | idem |
| A3 | Histórico de auditoria e situação/plano da conta não podem ser alterados pela aplicação | idem (privilégios do papel) |
| A4 | Rotas exigem sessão; sessão da clínica não acessa o painel e vice-versa; CSRF bloqueado | `permissions.test.ts` |
| A5 | Permissões por função e por unidade; dados de saúde fora das funções comerciais; sem escalada de privilégio | `permissions.test.ts` + e2e "profissional consulta mas não cadastra" |
| A6 | Contratação validada no servidor: módulo não contratado, somente leitura, dependências obrigatórias, limites do plano | `permissions.test.ts` + e2e "clínica sem o módulo" |
| A7 | Conta suspensa: consulta e exporta, não altera; reativação devolve tudo | `permissions.test.ts` + e2e `zz-admin.spec.ts` |
| A8 | Mudança de plano mantém módulos removidos em somente leitura por 90 dias | `permissions.test.ts` |
| A9 | Duplo envio não duplica cliente; edição simultânea detectada; CPF único; duplicidade avisada | `clients.test.ts` + e2e |
| A10 | Formulário não se perde ao trocar de tela ou sem conexão; o usuário vê o que não foi enviado | e2e "rascunho é recuperado", "sem conexão" |
| A11 | Tour abre no primeiro acesso de cada tela, uma vez, respeita dispensa/conclusão, fica no servidor por usuário, tela e versão, e reabre pela Ajuda | e2e `onboarding.spec.ts` + `tours-news.test.ts` + `shared/test/rules.test.ts` |
| A12 | Toda tela tem tour com elementos existentes | `apps/web/src/tours/coverage.test.ts` |
| A13 | Novidades após o login sem repetição, por público, com "Conhecer novidade" iniciando o tour certo, sem sobrepor tours | e2e `onboarding.spec.ts` + `tours-news.test.ts` |
| A14 | Desktop, tablet e celular sem rolagem horizontal nas jornadas principais; tour dentro da tela; botões ≥ 40 px | e2e `responsive.spec.ts` (3 projetos) |

## Critério de qualidade para as próximas etapas (definição de pronto por tela)

1. Jornada principal concluída em poucos passos, testada em desktop, tablet e celular (e2e).
2. Validação no servidor + mensagens junto aos campos.
3. Estados de carregamento, vazio, erro e sucesso.
4. Permissão e módulo validados no servidor (teste de API).
5. Tour com `useScreen` e âncoras `data-tour` (teste de cobertura passa).
6. Auditoria das ações relevantes; operações críticas idempotentes.
7. O que for demonstração ou depender de integração, sinalizado.
