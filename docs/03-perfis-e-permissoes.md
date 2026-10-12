# 3. Perfis e permissões

Fonte de verdade: `packages/shared/src/permissions.ts`. Regra de avaliação: `apps/api/src/lib/access.ts` (`can()`), espelhada no frontend apenas para montar a interface.

## Modelo

```
Usuário (login global) ──< Vínculo (empresa) ──< Atribuição (função + unidade | todas)
                                                     │
                                         Função (por empresa) = lista de permissões
```

- **Permissão** = `recurso.acao` (ex.: `clients.create`), pertence a um módulo.
- **Escopo**:
  - `unit`: vale na unidade da atribuição (ou em todas, se a atribuição for "Todas as unidades").
  - `tenant`: só vale com atribuição "Todas as unidades" (ex.: gerenciar equipe, exportar).
- **Sensível** (`sensitive`): dá acesso a dados de saúde e imagens (prontuário). Nunca está nas funções comerciais por padrão; a interface avisa ao atribuir.
- **Módulo**: se o módulo não está contratado, a permissão não vale (mesmo que esteja na função).
- **Responsável pela conta** (`is_owner`): todas as permissões; não pode ser desativado por outros.

### Proteções contra escalada de privilégio (servidor)
- Só é possível **conceder** permissões que você mesmo tem em "Todas as unidades" (exceto o responsável).
- Não é possível alterar ou desativar o acesso de quem tem permissões que você não tem.
- Ninguém desativa o próprio acesso.

## Funções-modelo criadas para cada empresa

| Permissão | Admin | Gestor | Recepção | Profissional | Financeiro | Comercial | Estoque |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Ver clientes | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Cadastrar / editar clientes | ✔ | ✔ | ✔ | | | ✔ | |
| Inativar clientes | ✔ | ✔ | | | | | |
| Ver CPF completo | ✔ | | ✔ | | ✔ | | |
| Exportar clientes | ✔ | ✔ | | | | | |
| Empresa, unidades, equipe, funções | ✔ | ✔ | | | | | |
| Plano, histórico, exportação geral | ✔ | ✔ | | | | | |
| Agenda: ver todos / agendar | ✔ | ✔ | ✔ | só a própria | | ver | |
| Agenda: encaixe fora da regra | ✔ | ✔ | | | | | |
| Registrar chegada / atendimento | ✔ | ✔ | ✔ | ✔ | | | |
| **Prontuário (sensível)** | ✔ | | | ✔ | | | |
| Financeiro: vender / receber / caixa | ✔ | ✔ | ✔ | | ✔ | | |
| Estornos, contas a pagar, comissões | ✔ | ✔ | | | ✔ | | |
| Estoque | ✔ | ✔ | | ver | | | ✔ |
| CRM | ✔ | ✔ | ✔ | | | ✔ | |
| Relatórios | ✔ | ✔ | | | ✔ | | |

O gestor **não** vê dados de saúde por padrão (o responsável pode criar uma função que inclua, de forma explícita).

## Painel inicial por perfil

O Início é montado por **permissões**, não pelo nome da função (funciona para funções personalizadas):

| Bloco | Aparece para quem tem | Etapa |
|---|---|---|
| Precisa da sua atenção (convites expirados, aniversariantes do dia, conta) | qualquer | 1 |
| Atalhos (cadastrar/buscar cliente, convidar pessoa) | `clients.*`, `team.manage` | 1 |
| Primeiros passos da clínica | `company.manage` | 1 |
| Aniversariantes, cadastrados recentemente | `clients.read` | 1 |
| Agenda do dia, confirmações, chegadas (secretária) | `agenda.read_all` | 2 |
| Próximos atendimentos e registros pendentes (profissional) | `agenda.read_own`, `clinical.write` | 2–3 |
| Recebimentos, pagamentos e caixa (financeiro) | `finance.*` | 4 |
| Operação, resultados e alertas (gestor) | `reports.read` | 4–5 |

Enquanto um módulo contratado não é liberado, o Início mostra "Chegando nas próximas etapas" com o que aparecerá ali — sem números fictícios.

## Painel do SaaS

Usuários da plataforma ficam em tabela própria (`platform_users`), com login, cookie e rotas separados (`/admin`, `/api/admin`). Uma sessão de clínica não acessa o painel e vice-versa (testado).
