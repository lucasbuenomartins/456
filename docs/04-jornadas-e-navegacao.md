# 4. Jornadas principais e mapa de navegação

## Jornadas

Legenda: ✅ entregue na Etapa 1 · 🔜 etapa indicada.

### J1. Primeiro acesso da clínica ✅
1. Suporte cria a empresa no painel (plano, teste, responsável) → recebe link de convite.
2. Responsável abre o link, cria a senha e entra.
3. Início mostra **Primeiros passos** (dados da empresa, endereço da unidade, convidar equipe, primeiro cliente) e o tour do Início.
4. Convida a equipe escolhendo função e unidade → copia o link ou envia por WhatsApp (link `wa.me`, envio manual).

### J2. Cadastro rápido de cliente (secretária) ✅
1. `Clientes` → **Novo cliente** (atalho `N`) — ou, na busca sem resultado, **Cadastrar novo cliente** já preenche o que foi digitado.
2. Nome + telefone (WhatsApp marcado por padrão) → **Salvar cliente** (`Ctrl+Enter`).
3. Se o telefone/CPF/nome+nascimento já existir: aviso enquanto digita e confirmação explícita ao salvar ("Abrir ficha" ou "É outra pessoa").
4. Abre a ficha com ações de contato (Ligar, WhatsApp). E-mail não é canal de contato.

Proteções: rascunho automático neste aparelho, aviso de sem conexão, idempotência (duplo clique não cria dois), concorrência otimista na edição.

### J3. Encontrar um cliente durante uma ligação ✅
`Ctrl+K` (ou lupa no celular) → digita parte do nome ou telefone, sem acentos → Enter abre a ficha.

### J4. Gestor ajusta acessos ✅
`Configurações → Equipe` → Alterar funções (por unidade) → aviso se a combinação dá acesso a dados de saúde → registro no histórico.

### J5. Suporte suspende/reativa uma conta ✅
`Painel → Empresas → empresa → Suspender` (motivo obrigatório) → clínica entra em somente leitura com aviso no topo → `Ativar`.

### J6. Novidade após o login ✅
Login → janela com até 3 novidades → **Conhecer novidade** leva à tela e inicia o tour da novidade; **Ver depois** adia; fechar dispensa. Tudo fica na Central de novidades.

### J7. Agendamento (secretária) 🔜 Etapa 2
Buscar/cadastrar cliente (mesma busca da J3) → serviço → profissional (ou "qualquer") → horário livre (já considera intervalo, preparação/limpeza, sala e equipamento) → confirmar. Meta: ≤ 5 interações para cliente existente.

### J8. Atendimento completo 🔜 Etapas 2–5
1. Recepção registra **chegada** (agenda).
2. Profissional abre o atendimento no tablet: alertas de saúde no topo, histórico, **anamnese** em etapas curtas com salvamento automático.
3. Registra **evolução**, **fotos** (câmera do aparelho, com autorização de imagem) e **materiais utilizados** (pré-preenchidos pela ficha de consumo).
4. **Concluir atendimento** → conforme módulos e regras: consome sessão do pacote, baixa estoque, gera cobrança pendente, cria tarefa de retorno no CRM.
5. Tela de conclusão mostra o resultado de cada integração (feito / pendente / falhou com "tentar de novo").

### J9. Receber pagamento 🔜 Etapa 4
Da agenda ou do financeiro: cobrança pendente → forma de pagamento (parcial/parcelado) → recibo. Venda, recebido e pendente sempre exibidos separadamente.

## Mapa de navegação

```
Clínica (/)
├── Início                                   home
├── Agenda                 [agenda]          🔜 (página "em construção" se contratado)
├── Clientes                                 clients.list
│   ├── Novo cliente                         clients.form
│   └── Ficha do cliente                     clients.detail
│       ├── Dados · Autorizações · Histórico
│       └── Agendamentos [agenda] · Prontuário [prontuario] · Financeiro [financeiro] · Relacionamento [crm]  (abas por módulo)
├── Prontuário             [prontuario]      🔜
├── Financeiro             [financeiro]      🔜
├── Estoque                [estoque]         🔜
├── Relacionamento         [crm]             🔜
├── Relatórios             [relatorios]      🔜
├── Configurações
│   ├── Dados da empresa                     settings.company
│   ├── Unidades                             settings.units
│   ├── Equipe (pessoas e convites)          settings.team
│   ├── Funções e permissões                 settings.roles
│   ├── Plano e módulos                      settings.plan
│   ├── Histórico de alterações              settings.audit
│   └── Dados e exportação                   settings.data
├── Novidades (sino)                         news.center
├── Ajuda: Ver tour desta tela · Central de novidades · Atalhos
└── Conta: Meu perfil (profile) · Trocar de clínica · Sair

Público: /entrar · /escolher-clinica · /convite/:token
Painel do SaaS (/admin): Empresas (admin.tenants) → Empresa (admin.tenant) · Planos (admin.plans) · Novidades (admin.news)
```

No máximo dois níveis de menu. Desktop: menu lateral completo; tablet: trilho de ícones com rótulo; celular: barra inferior (Início, Agenda, Clientes, Mais).

## Atalhos de teclado (desktop)

| Atalho | Ação |
|---|---|
| `Ctrl+K` | Buscar telas e clientes |
| `/` | Ir para a busca da lista |
| `N` | Novo cadastro na lista |
| `E` | Editar (na ficha) |
| `Ctrl+Enter` | Salvar formulário |
| `Esc` | Fechar janela ou tour |
| `?` | Lista de atalhos |
