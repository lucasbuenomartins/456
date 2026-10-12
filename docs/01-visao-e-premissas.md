# 1. Visão do produto e premissas

## Visão

**Lumi** (nome provisório) é um SaaS para clínicas e estabelecimentos de estética que reúne agenda, atendimento, prontuário, financeiro, estoque e relacionamento em uma única plataforma, vendida por módulos.

> Uma secretária, um profissional de estética ou um gestor com pouca familiaridade com tecnologia conclui suas tarefas com clareza, rapidez e poucos passos.

### Para quem

| Perfil | Onde trabalha | O que mais faz | O que precisa da ferramenta |
|---|---|---|---|
| Secretária / recepção | Desktop no balcão, celular às vezes | Cadastrar, agendar, confirmar, receber | Velocidade, busca rápida, poucos cliques, nada se perde |
| Profissional de estética | Tablet/celular na sala | Consultar histórico, preencher anamnese, evolução, fotos | Botões grandes, formulários curtos, salvamento automático, alertas visíveis |
| Gestor / proprietário | Desktop e celular | Acompanhar operação, equipe, resultados | Visão do que precisa de atenção, permissões claras |
| Financeiro | Desktop | Recebimentos, pagamentos, caixa, comissões | Tabelas legíveis, filtros, exportação, rastreabilidade |
| Comercial / relacionamento | Celular e tablet | Contatos, tarefas, oportunidades | Lista de quem contatar, registro rápido de interação |
| Suporte da plataforma (SaaS) | Desktop | Ativar, suspender, trocar plano, anunciar novidades | Painel separado, histórico de tudo que fez |

### Princípios de produto

1. **Uma identidade de cliente** em toda a plataforma (agenda, CRM, prontuário e financeiro leem o mesmo cadastro).
2. **Módulos independentes, integrados quando juntos**: cada módulo funciona só com o núcleo; contratados juntos, trocam informação automaticamente.
3. **O servidor decide** contratação, situação da conta e permissão. Esconder menu é só experiência.
4. **Nada se perde**: rascunhos automáticos, aviso de falta de conexão, operações idempotentes.
5. **Honestidade**: o que é demonstração, depende de integração externa ou ainda não foi construído aparece como tal ("Em breve", "Em construção", "depende de integração").
6. **Cada tela responde**: onde estou, o que posso fazer, qual a próxima ação, o que precisa de atenção.
7. **Aprender no contexto**: tour curto no primeiro acesso a cada tela; novidades com tour próprio.

## Premissas assumidas (decisões reversíveis)

| # | Premissa | Por quê | Como reverter |
|---|---|---|---|
| P1 | Nome provisório "Lumi" e paleta verde-azulada | Precisava de identidade para o design system | Tokens em `apps/web/src/styles/index.css` e textos |
| P2 | Mercado inicial: Brasil, pt-BR, fuso America/Sao_Paulo, moeda BRL | Pedido em pt-BR | Fuso por unidade já existe no modelo |
| P3 | Empresa (tenant) → várias unidades; clientes pertencem à empresa (compartilhados entre unidades) | Cliente costuma ser atendido em mais de uma unidade | Filtro por unidade preferida já existe |
| P4 | Uma pessoa pode trabalhar em várias clínicas com o mesmo login (escolhe a clínica ao entrar) | Profissionais autônomos atendem em mais de um lugar | — |
| P5 | Funções (roles) por empresa, criadas a partir de modelos editáveis; atribuídas por unidade ou "todas as unidades" | Pedido: permissões por função, unidade e ação | — |
| P6 | O responsável pela conta (owner) tem sempre todas as permissões | Evita a clínica perder acesso à própria conta | — |
| P7 | Envio por WhatsApp/SMS **não** está integrado: convites geram link para compartilhar manualmente. **E-mail não é canal de contato** (decisão do cliente); o e-mail serve só para login e, opcionalmente, como dado de cadastro | Sem integração real, não fingimos envio | Interface de envio prevista (Etapa 6) |
| P8 | Cobrança do SaaS manual (sem gateway) | Idem | Interface de cobrança prevista |
| P9 | Módulo desativado: 90 dias em somente leitura (consulta e exportação), depois oculto com dados preservados | Pedido: regras claras após desativação | Constante `READ_ONLY_GRACE_DAYS` |
| P10 | Conta cancelada: 90 dias para exportação; prontuários seguem a política de retenção contratual | Prazos legais variam; precisam de validação jurídica | Ver pergunta Q2 |
| P11 | Novidades: no máximo 3 no login; "Ver depois" volta no próximo login após 12 h, até 2 vezes | Evita repetição incômoda | Constantes em `packages/shared/src/news.ts` |
| P12 | Arquitetura de monólito modular (sem microserviços) | Velocidade e manutenção | — |

## Perguntas em aberto (não bloquearam a Etapa 1)

| # | Pergunta | Impacto | Quando decidir |
|---|---|---|---|
| Q1 | Qual provedor de WhatsApp (API oficial/BSP) e SMS? | Lembretes, convites, recuperação de senha | Antes da Etapa 6 (lembretes podem ser manuais até lá) |
| Q2 | Prazos de retenção de prontuário e imagens adotados no contrato | Exclusão após cancelamento | Antes da Etapa 3 — validar com assessoria jurídica |
| Q3 | Assinatura de termos: aceite simples na tela ou assinatura eletrônica com provedor? | Validade dos termos; não afirmaremos validade jurídica | Antes da Etapa 3 |
| Q4 | Emissão fiscal (NFS-e) e meio de pagamento (gateway/TEF) desejados | Financeiro | Antes da Etapa 4 (interfaces já previstas) |
| Q5 | Comissões: regras mais comuns dos clientes-alvo (por serviço, por profissional, sobre recebido ou vendido?) | Modelo de comissões | Etapa 4 |
| Q6 | Hospedagem preferida (região de dados no Brasil?) | Infra, backups | Antes do primeiro cliente real |
