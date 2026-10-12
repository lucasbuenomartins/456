# 5. Arquitetura

## Stack e motivos

| Camada | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript em todo o projeto | Um só idioma; tipos e validações compartilhados entre API e telas |
| Monorepo | pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`, `e2e`) | Catálogos (módulos, permissões, tours) e schemas em um único lugar |
| API | Node 22 + Fastify 5 | Rápido, simples, bom ecossistema de segurança (helmet, rate limit, cookies) |
| Banco | PostgreSQL 16 | Transações, RLS para multi-tenant, *exclusion constraints* (conflitos de agenda), JSONB, busca trigram |
| ORM | Drizzle | SQL explícito e tipado; migrações em SQL versionado (inclusive as escritas à mão para RLS) |
| Validação | Zod (em `packages/shared`) | Mesmas regras e mensagens no formulário e no servidor |
| Web | React 19 + Vite + React Router 7 + TanStack Query | Produtividade, cache e estados de carregamento consistentes |
| UI | Tailwind (tokens CSS) + Radix (diálogo, menu, abas) | Acessibilidade de teclado/leitor de tela pronta; visual próprio |
| Testes | Vitest (API contra PostgreSQL real; regras compartilhadas) + Playwright (desktop, tablet, celular) | Valida isolamento, permissões e jornadas de verdade |

## Monólito modular

```
apps/api/src
├── app.ts                 # hooks: CSRF, autenticação, situação da conta, módulo, permissão (nega por padrão)
├── lib/                   # access (can, contexto), audit, idempotency, errors, security
├── db/                    # schema Drizzle, conexões (app × admin), migrações, seed
└── modules/
    ├── auth/              # login, sessão, escolha de clínica, convites
    ├── me/                # perfil, unidade atual, senha
    ├── clients/           # identidade única do cliente  ← núcleo
    ├── settings/          # empresa, unidades, equipe, funções, plano, auditoria, exportação ← núcleo
    ├── dashboard/         # resumo do Início por permissão
    ├── tours/ · news/     # infraestrutura de tours e novidades
    └── admin/             # painel do SaaS: empresas, planos, módulos, novidades, provisionamento
```

Próximos módulos entram como novas pastas em `modules/` (agenda, clinical, finance, stock, crm, reports), cada uma com rotas, serviços e tabelas próprias. **Regra de fronteira**: um módulo não escreve nas tabelas de outro; integra por **eventos de domínio** (abaixo). Microserviços só se houver necessidade concreta (ex.: processamento de imagens pesado).

## Multi-tenant e isolamento

1. **Banco compartilhado, coluna `tenant_id`** em toda tabela de empresa.
2. **Row Level Security** (`drizzle/0001_security.sql`): políticas `tenant_id = app_tenant_id()`; sem contexto, nenhuma linha aparece.
3. **Dois papéis de banco**:
   - `clinica_app` (sem `BYPASSRLS`): usado pelas rotas das clínicas. Cada requisição roda em transação com `set_config('app.tenant_id', …, true)`.
   - `clinica_owner`: migrações, autenticação (antes de saber a empresa) e painel do SaaS.
4. **Privilégios mínimos**: a aplicação não altera `tenants.status/plan`, `tenant_modules` (só leitura), não altera nem apaga `audit_events` e `client_consents` (somente inclusão).
5. **Chaves compostas** (`tenant_id, id`) impedem vincular unidade/função/cliente de outra empresa.
6. Testes provam: leitura/alteração por ID de outra empresa → 404; inserção com `tenant_id` alheio → recusada pelo banco; sem contexto → zero linhas.

## Autorização (servidor)

Cada rota declara `config: { permission, module?, realm?, public?, allowReadOnly? }`. O hook global:
1. Rota pública? segue. Senão exige sessão (clínica, sessão sem clínica, ou plataforma).
2. Escrita com conta suspensa/cancelada/teste vencido → `403 tenant_read_only`.
3. Módulo não contratado → `403 module_not_contracted`; escrita em módulo `read_only` → `403 module_read_only`.
4. Permissão ausente → `403 forbidden`.
5. Verificações de unidade e de objeto (ex.: CPF mascarado sem `clients.documents.read`) dentro do serviço.

## Sessões e segurança

- Senhas com Argon2id; tokens de sessão aleatórios (256 bits) guardados como SHA-256; cookie `httpOnly`, `SameSite=Lax` (`Strict` no painel), `Secure` em produção.
- CSRF: requisições de escrita com `Origin` diferente do app são recusadas.
- Rate limit em login, convites e troca de senha; mensagem de erro de login não revela se o e-mail existe (e tempo constante).
- Trocar a senha encerra as outras sessões; suspender/cancelar conta encerra as sessões da empresa.
- Logs sem cookies/cabeçalhos de autenticação e sem corpo de requisição; auditoria não grava valores de campos sensíveis (CPF, observações, endereço → "(alterado)").
- Exportação CSV protegida contra injeção de fórmula.

## Concorrência e operações repetidas

| Problema | Solução | Onde |
|---|---|---|
| Duplo clique / reenvio após falha de rede | `Idempotency-Key` reservado na mesma transação; a segunda requisição espera e devolve a mesma resposta | `lib/idempotency.ts` (clientes; padrão para vendas, recebimentos, baixas) |
| Duas pessoas editando o mesmo cadastro | Versão otimista (`version`) → `409 stale` com orientação | clientes |
| Corrida em valores únicos (CPF) | Índice único parcial + tradução de `23505` em mensagem amigável | clientes |
| **Dois agendamentos no mesmo horário** (Etapa 2) | `EXCLUDE USING gist (resource_id WITH =, tstzrange(start, end_with_cleanup) WITH &&)` por profissional, sala e equipamento + `SERIALIZABLE`/retry; exceções só com `agenda.override` e auditoria | `appointments`, `appointment_resources` |
| Saldo de sessões e estoque (Etapa 4) | Livro-razão (ledger) append-only + `SELECT … FOR UPDATE` no saldo + chave de idempotência por atendimento | `package_ledger`, `stock_movements` |

## Integração entre módulos (Etapas 2+)

Padrão **outbox transacional**:
1. A operação de origem (ex.: concluir atendimento) grava o próprio estado e um evento em `domain_events` **na mesma transação** (`appointment.completed`, com `idempotency_key = appointment_id`).
2. Um *worker* (no mesmo processo inicialmente) entrega o evento aos módulos **contratados** que o assinam: pacote (consumir sessão), estoque (baixar materiais), financeiro (gerar cobrança), CRM (tarefa de retorno).
3. Cada assinante registra `event_id` processado (`UNIQUE`) → reprocessar não duplica.
4. Falha fica visível: o atendimento mostra "Estoque: falhou — tentar de novo"; o gestor vê pendências no Início. Nada mostra "concluído" sem estar concluído.
5. Correção: estornos/reversões como novos lançamentos (nunca apagar), com autor e motivo.

| Ação | Automática | Exige confirmação |
|---|---|---|
| Consumir sessão do pacote ao concluir | sim (se o atendimento é de pacote) | — |
| Baixar materiais previstos | — | sim: profissional confirma/ajusta "Materiais utilizados" antes de concluir |
| Gerar cobrança pendente | sim (se financeiro contratado) | recebimento sempre manual |
| Tarefa de retorno no CRM | sim, se o serviço tem "retorno em X dias" | — |
| Encaixe fora das regras da agenda | — | sim, com permissão `agenda.override` e motivo |

## Arquivos e fotos (Etapa 3)

Armazenamento de objetos (S3 compatível) com chave por empresa, sem URL pública: download por URL assinada de curta duração após checagem de `clinical.photos` e autorização de imagem; miniaturas geradas no servidor; metadados EXIF de localização removidos.

## Backups e restauração (operação)

- PostgreSQL gerenciado com PITR (recuperação a um ponto no tempo), retenção mínima de 14 dias, réplica em outra zona.
- Teste de restauração mensal em ambiente separado (procedimento documentado no runbook antes do primeiro cliente).
- Restauração de **uma** empresa: exportação lógica por `tenant_id` (mesma rotina da exportação de dados).
- Objetos (fotos) com versionamento e bloqueio de exclusão por 30 dias.

## Integrações externas (interfaces previstas, não implementadas)

| Interface | Uso | Situação |
|---|---|---|
| `MessageSender` (WhatsApp/SMS) | Convites, lembretes, recuperação de acesso, campanhas com consentimento | Etapa 6 — hoje: link para envio manual |
| `PaymentProvider` | Cobrança do SaaS, pagamento no portal | Futuro |
| `FiscalProvider` | NFS-e | Futuro |
| `BankReconciliation` | Conciliação bancária | Futuro (conciliação manual na Etapa 4) |
| `SignatureProvider` | Assinatura eletrônica de termos | A definir (Q3) |

## Ambientes

- `pnpm db:setup` cria papéis e bancos locais; `pnpm db:migrate`; `pnpm db:seed` (dados de demonstração, senha fixa — só desenvolvimento).
- Produção: variáveis em `.env.example`; `COOKIE_SECURE=true`; TLS no balanceador; `APP_ORIGIN` exato.
