# 2. Mapa de módulos, dependências e comercialização

Fonte de verdade no código: `packages/shared/src/modules.ts` (catálogo, dependências, estados) e `packages/shared/src/permissions.ts` (permissões por módulo).

## Módulos

| Módulo | Chave | Contém | Etapa |
|---|---|---|---|
| Núcleo da plataforma | `core` | Clientes (identidade única), equipe, unidades, funções e permissões, serviços, configurações, auditoria, tours, novidades, exportação | 1 (serviços na 2) |
| Agenda e atendimento | `agenda` | Agenda dia/semana/mês, profissionais, salas, equipamentos, disponibilidade, conflitos, recorrência, lista de espera, confirmação/chegada/início/conclusão, faltas, pacotes de sessões | 2 |
| Anamnese e prontuário | `prontuario` | Modelos de anamnese, histórico de saúde, alergias, evolução, fotos, termos versionados, adendos, auditoria | 3 |
| ERP e financeiro | `financeiro` | Vendas, orçamentos, contas a pagar/receber, caixa, fluxo, comissões, inadimplência | 4 |
| Estoque e compras | `estoque` | Produtos/materiais, movimentações, lotes/validade, inventário, compras, ficha de consumo | 4 |
| Relatórios e indicadores | `relatorios` | Indicadores dos módulos contratados | 4–5 |
| CRM e relacionamento | `crm` | Pipeline, tarefas, interações, segmentos, inativos, aniversários, consentimentos | 5 |
| Portal do cliente | `portal` | Autoagendamento com as mesmas regras da agenda | 6 |

## Matriz de dependências

**Obrigatória** = sem ela o módulo não funciona (validado no servidor ao ativar/desativar).
**Amplia** = funciona sem, mas ganha integração automática quando ambos estão contratados.

| Módulo ↓ / depende de → | Núcleo | Agenda | Prontuário | Financeiro | Estoque | CRM |
|---|---|---|---|---|---|---|
| **Agenda** | Obrigatória | — | Amplia: anamnese/evolução no atendimento, alertas de saúde na agenda | Amplia: cobrança nasce do atendimento; pacote vendido vira saldo | Amplia: consumo previsto/real e baixa na conclusão | Amplia: tarefas de retorno, faltas |
| **Prontuário** | Obrigatória | Amplia: vincula registros ao atendimento | — | — | Amplia: materiais junto à evolução | — |
| **Financeiro** | Obrigatória | Amplia | — | — | Amplia: venda de produto baixa estoque; compra gera conta a pagar | Amplia: follow-up de orçamento |
| **Estoque** | Obrigatória | Amplia | — | Amplia | — | — |
| **CRM** | Obrigatória | Amplia: inativos por último atendimento | — | Amplia: orçamentos, pacotes perto do fim | — | — |
| **Relatórios** | Obrigatória | Amplia | — | Amplia | Amplia | Amplia |
| **Portal** | Obrigatória | **Obrigatória** | Amplia: anamnese antes da consulta | Amplia: pagamento antecipado (depende de gateway) | — | — |

Exemplos pedidos, garantidos pela matriz:
- Agenda funciona sem o financeiro (o atendimento conclui sem gerar cobrança).
- Anamnese funciona sem o CRM.
- Estoque funciona sem o prontuário (saídas manuais por consumo).
- Contratados juntos, compartilham dados automaticamente pelos eventos de integração (ver `05-arquitetura.md`).

## Estados de um módulo por empresa

| Estado | Ler | Escrever | Menu | Quando |
|---|---|---|---|---|
| `active` | sim | sim | sim | Contratado |
| `trial` | sim | sim | sim | Período de teste |
| `read_only` | sim | **não** | sim, com aviso | Desativado há menos de 90 dias, ou conta suspensa |
| `disabled` | não | não | não | Nunca contratado, ou fim do prazo de consulta |

Regras:
- O servidor valida em toda requisição: **situação da conta** → **módulo** → **permissão** (ver `apps/api/src/app.ts`).
- Desativar um módulo **nunca apaga dados**. Reativar devolve o acesso.
- Dados de um módulo desativado continuam referenciados por outros (ex.: agenda mostra "venda registrada" mesmo sem o financeiro ativo), apenas em leitura.
- Não é possível desativar um módulo do qual outro ativo depende (ex.: Agenda com Portal ativo) — erro `has_dependents`.
- Não é possível ativar um módulo sem suas dependências obrigatórias — erro `missing_dependency`.

## Planos e limites

| Plano (seed) | Módulos | Unidades | Pessoas | Clientes ativos |
|---|---|---|---|---|
| Essencial | Núcleo + Agenda | 1 | 5 | 2.000 |
| Profissional | + Prontuário + Financeiro | 3 | 15 | sem limite |
| Completo | + Estoque + CRM + Relatórios | sem limite | sem limite | sem limite |

- Limites validados no servidor (`plan_limit`) ao criar unidade, convidar pessoa, cadastrar/reativar cliente.
- Módulos avulsos (`source = addon`) podem ser ativados fora do plano.
- Mudar os módulos de um plano **não** altera empresas existentes (evita perda de acesso inesperada); vale para novas contratações e trocas de plano.

## Ciclo de vida da conta

```
            criar (painel)                ativar
   ──────────────► trial ───────────────────────► active
                     │ fim do teste                 │  ▲
                     ▼                              │  │ reativar
               somente leitura            suspender ▼  │
                                              suspended (somente leitura + exportação)
                                                    │
                                          cancelar  ▼
                                              cancelled (exportação por 90 dias → bloqueio)
```

Toda mudança exige motivo, gera registro em `tenant_history` e aparece no histórico da clínica (auditoria com autor "suporte da plataforma"). Suspender ou cancelar encerra as sessões abertas para valer imediatamente.

## Acesso e exportação após desativar

| Situação | O que a clínica pode fazer |
|---|---|
| Módulo em `read_only` | Consultar e exportar os dados do módulo por 90 dias |
| Módulo `disabled` após o prazo | Dados guardados; exportação sob solicitação ao suporte; reativação restaura |
| Conta `suspended` | Consultar e exportar tudo; nada pode ser criado/alterado |
| Conta `cancelled` | Exportar por 90 dias; após isso, acesso bloqueado e retenção conforme contrato (prontuário segue prazo legal — Q2) |
