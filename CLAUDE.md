# Lumi — contexto do projeto para o Claude

SaaS para clínicas de estética (ERP, CRM, agenda, atendimento, anamnese/prontuário), vendido por módulos. Toda a comunicação com a pessoa usuária é em **português do Brasil**, em linguagem simples (ela não é desenvolvedora; usa Windows e VS Code).

Leia `docs/` antes de propor mudanças grandes: visão e premissas (01), módulos e dependências (02), permissões (03), jornadas (04), arquitetura (05), modelo de dados (06), regras de negócio das próximas etapas (07), design system/tours/novidades (08), etapas e critérios (09).

## Situação

- **Etapa 1 entregue**: núcleo multi-tenant, permissões por função/unidade, contratação de módulos, painel do SaaS (`/admin`), tours guiados em todas as telas, novidades após o login, cadastro de clientes completo.
- **Próxima: Etapa 2** — serviços, profissionais, salas/equipamentos, agenda com bloqueio de conflito no banco (EXCLUDE gist), atendimento (chegada → conclusão), pacotes de sessões sem financeiro. Regras em `docs/07-regras-de-negocio.md`.
- Branch de trabalho: `claude/saas-clinicas-estetica-gtdb2q`.

## Decisões do cliente (não reverter sem pedir)

- Visual "fofo": tons de **rosa** (primária), lilás como destaque, cantos bem arredondados, botões em pílula, ícones **Phosphor duotone** (centralizados em `apps/web/src/ui/icons.ts`), logo em coração.
- Fonte **Poppins**.
- **Dois temas: claro e escuro** (+ automático). Cores sempre por tokens em `apps/web/src/styles/index.css`; nunca cor literal em componente.
- **E-mail não é canal de contato** com cliente: consentimentos só WhatsApp e SMS; e-mail é só login (e campo opcional de cadastro).
- Nome provisório "Lumi".

## Regras de engenharia

- Monorepo pnpm: `apps/api` (Fastify + Drizzle + PostgreSQL com RLS), `apps/web` (React + Vite + Tailwind + Radix), `packages/shared` (catálogos de módulos, permissões, tours, novidades, schemas Zod), `e2e` (Playwright).
- Toda rota da API declara `config: { permission, module?, realm?, public?, allowReadOnly? }`; o hook global nega por padrão. Nunca confiar só em esconder menu.
- Dados de empresa sempre via `withTenant()` (RLS). Conexão admin só para auth e painel do SaaS.
- Ações críticas: auditoria (`audit()`), idempotência (`Idempotency-Key`), concorrência otimista (`version`).
- **Toda tela nova**: chamar `useScreen("<id>")`, registrar em `SCREENS`/`TOURS` (`packages/shared/src/tours.ts`), escrever o tour em `apps/web/src/tours/definitions.ts` e marcar elementos com `data-tour`. O teste `apps/web/src/tours/coverage.test.ts` falha se faltar.
- Não apresentar como pronto o que depende de integração externa (WhatsApp/SMS, pagamento, nota fiscal); sinalizar "Em breve"/"depende de integração".
- Migrações: `pnpm --filter @clinica/api db:generate` para tabelas; SQL manual (RLS, grants, constraints) em novo arquivo em `apps/api/drizzle/` registrado no `meta/_journal.json`.

## Comandos

```bash
docker compose up -d          # banco local (ou pnpm db:setup no Linux com PostgreSQL)
pnpm db:migrate && pnpm db:seed
pnpm dev                      # API :3333, web :5173
pnpm typecheck
pnpm test                     # shared, api (PostgreSQL real), web
pnpm e2e                      # Playwright (desktop, tablet, celular)
```

Usuários de demonstração (senha `Senha@123`): ana@bellapele.com.br (responsável), carla@ (secretária), julia@ (profissional, 2 clínicas), marcos@ (financeiro), paula@ (comercial), roberto@ (gestor) — todos `@bellapele.com.br`; bianca@aurora.com.br; painel: admin@plataforma.local.

## Ambiente da pessoa usuária

- Windows + VS Code + PowerShell. Projeto em `C:\projetos\456`.
- Já foi preciso liberar scripts: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.
- Banco local via Docker Desktop (`docker compose up -d`); o Docker Desktop precisa estar aberto.
- Explique em passos curtos, um comando por vez, e peça print quando algo der errado.

## Histórico de decisões (em ordem)

1. Planejamento completo em `docs/` e Etapa 1 implementada e testada (54 testes unitários/API + 13 ponta a ponta).
2. Pedido: "contato por e-mail não" → removido como canal de contato.
3. Pedido: ícones mais redondinhos, visual fofo, mais tons de rosa, dois temas → paleta rosa/lilás, Phosphor duotone, cantos arredondados, temas claro/escuro/automático.
4. Pedido: fonte Poppins → aplicada.
5. Pedido: rodar no próprio computador → `docker-compose.yml`, `scripts/instalar-windows.ps1` e instruções no README.

## Como continuar

Antes de cada etapa: resumir o plano em linguagem simples e confirmar prioridades. Ao concluir: rodar `pnpm typecheck`, `pnpm test` e `pnpm e2e`, informar o que funciona, como foi verificado e o que ainda é demonstração ou depende de integração, e fazer commit na branch de trabalho.
