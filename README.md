# Lumi — gestão para clínicas de estética

SaaS modular para clínicas e estabelecimentos de estética: núcleo (clientes, equipe, unidades, permissões), agenda e atendimento, anamnese e prontuário, financeiro, estoque, CRM e relatórios — contratados separadamente ou em pacotes.

> **Situação:** Etapa 1 entregue (núcleo, design system, permissões, contratação de módulos, painel do SaaS, tours, novidades e cadastro de clientes). Os demais módulos aparecem como "Em construção" quando contratados. Veja [docs/09-etapas-e-criterios.md](docs/09-etapas-e-criterios.md).

Documentação de produto e arquitetura: [docs/](docs/README.md).

## Stack

TypeScript · pnpm workspaces · Fastify 5 · PostgreSQL 16 (RLS) · Drizzle · Zod · React 19 · Vite · React Router 7 · TanStack Query · Tailwind · Radix · Vitest · Playwright.

```
apps/api          API (monólito modular) — src/modules/<módulo>
apps/web          Aplicação web (clínicas em /, painel do SaaS em /admin)
packages/shared   Catálogo de módulos, permissões, tours, novidades, schemas e validadores
e2e               Testes ponta a ponta (desktop, tablet, celular)
docs              Produto, arquitetura, regras e critérios
```

## Como rodar no seu computador

Pré-requisitos: [Node.js 22+](https://nodejs.org), pnpm (`npm install -g pnpm`) e [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o banco de dados).

```bash
git clone https://github.com/lucasbuenomartins/456.git
cd 456
git checkout claude/saas-clinicas-estetica-gtdb2q
pnpm install
cp .env.example .env        # no Windows (PowerShell): copy .env.example .env
docker compose up -d        # sobe o PostgreSQL já com papéis e bancos criados
pnpm db:migrate
pnpm db:seed                # dados de demonstração
pnpm dev                    # API em :3333 e web em :5173
```

Sem Docker, com PostgreSQL 16 instalado no Linux: use `pnpm db:setup` no lugar de `docker compose up -d`.

Acesse http://localhost:5173. Senha de todos os usuários de demonstração: `Senha@123`.

| Quem | E-mail | O que ver |
|---|---|---|
| Responsável (Bella Pele, plano Completo, 2 unidades) | ana@bellapele.com.br | Tudo, inclusive plano e funções |
| Secretária (só Unidade Centro) | carla@bellapele.com.br | Clientes, cadastro rápido |
| Profissional (Bella Pele **e** Aurora) | julia@bellapele.com.br | Escolha de clínica; consulta sem cadastrar |
| Financeiro | marcos@bellapele.com.br | Sem exportar clientes |
| Comercial (Unidade Jardins) | paula@bellapele.com.br | CPF mascarado, sem dados de saúde |
| Gestor | roberto@bellapele.com.br | Equipe e funções, sem dados de saúde |
| Responsável (Aurora, plano Essencial, em teste) | bianca@aurora.com.br | Módulos não contratados, limite de unidades |
| Suporte da plataforma | admin@plataforma.local → http://localhost:5173/admin | Empresas, planos, módulos, novidades |

## Testes

```bash
pnpm typecheck
pnpm test                               # shared (regras), api (contra PostgreSQL real), web (cobertura de tours)
pnpm --filter @clinica/e2e test         # Playwright: sobe API e web em portas próprias com banco clinica_e2e
```

## Segurança — resumo

Isolamento por empresa com Row Level Security e papel de banco sem `BYPASSRLS`; autorização no servidor negando por padrão (sessão → situação da conta → módulo → permissão); Argon2id; cookies httpOnly; proteção CSRF por origem; rate limit em autenticação; auditoria append-only sem dados sensíveis; idempotência e concorrência otimista. Detalhes em [docs/05-arquitetura.md](docs/05-arquitetura.md). Esses recursos apoiam a LGPD, mas não garantem conformidade por si só.
