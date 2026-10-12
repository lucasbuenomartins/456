# 6. Modelo de dados

Schema implementado: `apps/api/src/db/schema.ts` + migrações em `apps/api/drizzle/`. Toda tabela de empresa tem `tenant_id` e política RLS.

## Implementado (Etapa 1)

```
platform_users ─< platform_sessions                 (painel do SaaS — sem RLS, só conexão admin)
plans ─< tenants ─< tenant_modules                  (contratação; app só lê)
                 ─< tenant_history                  (situação, plano, módulos: quem, quando, motivo)
users ─< sessions                                   (login global; sessão guarda empresa e unidade atual)
users ─< memberships >─ tenants                     (vínculo pessoa × empresa; is_owner; status)
memberships ─< membership_roles >─ roles            (função por unidade; unit_id NULL = todas)
tenants ─< units
tenants ─< invites                                  (token com hash; atribuições; validade; is_owner)
tenants ─< clients ─< client_consents               (identidade única; consentimentos append-only)
tenants ─< audit_events                             (append-only)
tenants ─< idempotency_keys
users  ─< tour_progress                             (realm, tour, versão, status, vezes exibido)
news ─< news_receipts >─ users                      (seen | opened | later | dismissed; adiamentos)
```

### Tabelas principais

| Tabela | Campos-chave | Regras |
|---|---|---|
| `tenants` | name, document, status, plan_id, trial_ends_at, data_available_until | status ∈ trial/active/suspended/cancelled; app altera só dados cadastrais |
| `tenant_modules` | (tenant_id, module), status, source, read_only_until | status ∈ active/trial/read_only/disabled |
| `memberships` | tenant_id, user_id, status, is_owner, job_title | único (tenant_id, user_id) |
| `roles` | tenant_id, name, permissions[], template_key | nome único por empresa |
| `membership_roles` | membership_id, role_id, unit_id | único (membership, role, unit) com NULLS NOT DISTINCT; FKs compostas por empresa |
| `clients` | full_name, social_name, phone, phone_is_whatsapp, email, birth_date, cpf, origin, preferred_unit_id, tags[], address, status, search_text, version | CPF único por empresa (quando informado); busca trigram em `search_text` (sem acentos) |
| `client_consents` | client_id, channel, purpose, granted, source, recorded_by, recorded_at | estado atual = último por canal; finalidade "marketing" (atendimento e imagem ficam no prontuário) |
| `audit_events` | actor_kind, actor_id, actor_name, action, entity_type, entity_id, unit_id, summary, changes | sem UPDATE/DELETE para a aplicação; valores sensíveis nunca gravados |
| `tour_progress` | realm, user_id, tour_id, version, status, times_shown, first_seen_at, completed_at, dismissed_at | único (realm, user, tour) |
| `news` | title, summary, benefit, version, published_at, status, module, required_permission, target_path, tour_id, show_to_existing_users_only | app só vê publicadas com data ≤ agora (RLS) |

## Planejado (Etapas 2–6)

### Núcleo — serviços (Etapa 2)
`services` (nome, categoria, duração, preço, preparação_min, limpeza_min, retorno_em_dias, ativo) · `service_resources` (tipo de sala/equipamento exigido) · `professional_services` (quem faz o quê, duração/preço próprios).

### Agenda (Etapa 2)
| Tabela | Observações |
|---|---|
| `professionals` | vínculo opcional com `memberships`; unidades onde atende |
| `rooms`, `equipment` | por unidade; equipamento reutilizável (não consumível) |
| `work_schedules` | dia da semana, faixas, intervalos, por profissional e unidade |
| `schedule_blocks` | folgas, feriados, bloqueios (profissional, sala, equipamento ou unidade) |
| `appointments` | client_id, service_id, unit_id, status (agendado → confirmado → chegou → em_atendimento → concluído / faltou / cancelado), starts_at, ends_at, buffer_before/after, series_id (recorrência), package_id, origin (recepção, portal), override_reason, version |
| `appointment_resources` | (appointment_id, resource_type, resource_id, period tstzrange) + **EXCLUDE gist** contra sobreposição; liberado ao cancelar |
| `appointment_events` | histórico de mudanças de status/horário (quem, quando, motivo) |
| `waitlist_entries` | cliente, serviço, profissional preferido, janelas aceitas, prioridade |
| `client_packages` | cliente, serviço(s), sessões contratadas, validade, status, sale_id (se financeiro) |
| `package_ledger` | +N (contratação), −1 (consumo por atendimento, idempotente por appointment), +1 (estorno de consumo), ajuste com motivo |
| `reminders` | agendamento, canal, status (pendente/enviado manualmente/enviado/falhou) — envio automático depende de integração |

### Prontuário (Etapa 3)
| Tabela | Observações |
|---|---|
| `form_templates` / `form_template_versions` | perguntas, tipos, obrigatoriedade, condições (JSON Schema próprio); revisão por profissional habilitado; versão imutável após publicação |
| `clinical_records` | client_id, appointment_id?, template_version_id, status (rascunho/finalizado), answers JSONB, author, finalized_at, hash do conteúdo |
| `clinical_addenda` | correções pós-finalização: registro_id, texto, autor, data |
| `health_alerts` | alergias, medicamentos, contraindicações informadas (derivadas da anamnese finalizada, com origem) |
| `evolutions` | por atendimento: texto, parâmetros do procedimento, materiais citados |
| `photos` | objeto no storage, tipo (antes/depois), região, consent_id, autor; acesso por URL assinada |
| `consent_terms` / `consent_term_versions` | tipos separados: atendimento, uso de imagem, comunicação |
| `consent_acceptances` | versão aceita, cliente, forma (aceite em tela/assinatura via provedor), evidências (data, usuário, dispositivo) |
| `clinical_access_log` | quem abriu qual prontuário e quando |
| `client_drafts` | rascunho no servidor por (usuário, formulário, registro), com versão, para sincronizar entre aparelhos |

### Financeiro (Etapa 4)
`sales` (orçamento → venda; itens de serviço, produto, pacote) · `sale_items` · `receivables` (parcelas: valor, vencimento, status) · `payments` (recebimentos parciais, forma, caixa) · `refunds` · `cash_sessions` (abertura, fechamento, diferença) · `payables` · `suppliers` · `cost_centers` · `categories` · `commission_rules` · `commission_entries` · `payment_methods`. Valores sempre em centavos (inteiros).

### Estoque (Etapa 4)
`products` (venda ou material; unidade de medida; controla lote?) · `stock_lots` (lote, validade) · `stock_balances` (unidade, produto, lote — derivado) · `stock_movements` (entrada, saída, ajuste, transferência, consumo; idempotency_key; reversal_of) · `consumption_sheets` (ficha prevista por serviço) · `purchase_orders` / `purchase_receipts` · `inventories` / `inventory_counts`.

### CRM (Etapa 5)
`opportunities` (pipeline, estágio, valor, responsável, origem) · `tasks` (responsável, vencimento, cliente, origem automática/manual) · `interactions` (canal, resumo, autor) · `segments` (filtros salvos) · preferências de comunicação reaproveitam `client_consents`.

### Integração (Etapa 2+)
`domain_events` (outbox: tipo, payload, tenant, status, tentativas, erro) · `event_consumptions` (event_id, consumidor — único).
