# 8. Direção visual, design system, tours e novidades

## Direção visual

- **Acolhedora e delicada ("fofa"), sem perder a seriedade**: tons de rosa como cor principal, lilás como destaque pontual, fundo levemente rosado.
- **Formas arredondadas**: botões em pílula, cantos generosos (14–30 px), ícones Phosphor em estilo *duotone* (traço arredondado com preenchimento suave), logo em coração.
- **Fonte**: Poppins (geométrica e arredondada), corpo 15–16 px (nunca < 13 px), títulos 24–28 px, números tabulares em valores e datas.
- **Pouco ruído**: cartões só quando agrupam algo; nada de gráfico sem decisão associada; uma ação primária por tela.
- **Toque confortável**: alvos ≥ 44 px no celular/tablet; barra de ações fixa no rodapé dos formulários.

## Temas

Dois temas: **claro** (padrão) e **escuro**, além de **Automático** (segue o aparelho). A escolha fica em Meu perfil → Aparência ou no menu da conta, e vale para o aparelho. O tema é aplicado antes da primeira pintura (sem piscar). Todas as cores vêm de tokens, redefinidos em `:root[data-theme="dark"]`.

## Tokens (`apps/web/src/styles/index.css`)

| Token | Uso | Contraste sobre a superfície (claro / escuro) |
|---|---|---|
| `ink` | texto principal | 16:1 / 15:1 |
| `ink-muted` | texto secundário | 8:1 / 10:1 |
| `ink-subtle` | legendas, dicas | 5,6:1 / 6,5:1 |
| `primary` (rosa #BE185D / #F47CBA) | ações, links, foco | 6:1 / 7:1 |
| `primary-ink` | texto sobre botão primário | 6:1 / 7:1 |
| `accent` (lilás) | novidades, destaques | 7:1 / 9:1 |
| `success` / `warning` / `danger` / `info` (+ `-soft`) | estados e avisos | ≥ 4,5:1 |
| `surface`, `surface-muted`, `bg`, `border`, `overlay`, `shadow` | camadas | — |

Foco visível em todos os elementos (contorno de 3 px). Respeita `prefers-reduced-motion`. Ícones centralizados em `apps/web/src/ui/icons.ts` (trocar a biblioteca exige mexer só nesse arquivo).

## Componentes (`apps/web/src/ui`)

| Componente | Padrão |
|---|---|
| `Button`, `ButtonLink`, `IconButton` | primary / secondary / ghost / subtle / danger; estado de carregamento com texto ("Salvando…"); ícone-botão sempre com rótulo acessível |
| `Field` + `Input`/`Select`/`Textarea`/`Checkbox`/`Switch`/`ChoiceGroup` | rótulo sempre visível, "(opcional)" explícito, dica abaixo, **erro junto ao campo** com `aria-invalid` e `aria-describedby`; select nativo (melhor no celular) |
| `FormSection`, seção recolhível | divulgação progressiva ("Mais informações") |
| `PageHeader` | trilha (onde estou), título, descrição (o que faço aqui), ação principal (próximo passo) |
| `DataTable` | tabela no desktop, **lista de cartões no celular** (sem rolagem horizontal), seleção para ações em lote, abrir com Enter |
| `BulkBar`, `Pagination`, `SearchInput`, filtros em chips | filtros persistentes por usuário |
| `Dialog` (bottom sheet no celular), `ConfirmDialog` | confirmação para ações difíceis de desfazer, com consequência explicada |
| `Callout`, `Badge`, `Toast` | atenção, estados, confirmação de ação |
| `EmptyState`, `ErrorState`, `LoadingRows`/`Skeleton`, `SaveStatus` | **todo** carregamento, vazio, erro e sincronização tem estado próprio |

Linguagem: "Clientes", "Novo cliente", "Salvar cliente", "Receber pagamento", "Materiais utilizados". Mensagens de erro dizem o que fazer ("Use DDD + número, como (11) 98765-4321").

## Tours guiados

**Arquivos**: catálogo e regras em `packages/shared/src/tours.ts`; textos em `apps/web/src/tours/definitions.ts`; motor em `apps/web/src/tours/TourProvider.tsx` e `TourOverlay.tsx`; estado no servidor (`tour_progress`, `/api/tours`).

**Como uma tela participa**
1. Chama `useScreen("<id da tela>", { ready })` — registra a tela e espera os dados carregarem.
2. Marca elementos com `data-tour="<tela>.<elemento>"` (ou `tourId` nos componentes). Nunca seletores CSS ou posição.
3. Define os passos no catálogo; passos podem exigir `permission`, `module` ou dispositivo, e ter `mobileAnchor`.

**Regras de exibição**
| Situação | Comportamento |
|---|---|
| Primeiro acesso do usuário à tela | Abre sozinho após a tela carregar (700 ms) |
| Usuário digitando ou com janela aberta | Não interrompe; tenta na próxima visita |
| Concluído ou dispensado | Não volta a abrir sozinho |
| Interrompido (trocou de tela) | Volta a abrir uma vez (máx. 2 exibições) |
| Nova versão do tour | Só reabre se marcada como mudança grande (`reshowOnNewVersion`); mudanças menores viram novidade |
| Elemento ausente (sem permissão, lista vazia, tela pequena) | Passo pulado sem erro; tela vazia usa o estado vazio como âncora |
| Ajuda → "Ver tour desta tela" | Reabre a qualquer momento |
| Meu perfil → "Rever explicações das telas" | Reinicia todos |

O cartão **não é modal**: destaca o elemento (sem bloquear cliques), aceita teclado (←/→, Esc), recebe foco para leitores de tela e vira cartão inferior no celular. Estados registrados no servidor: primeira exibição (`seen` + contagem), `completed`, `dismissed`, com versão.

**Critério de conclusão de toda tela**: teste automatizado (`apps/web/src/tours/coverage.test.ts`) falha se uma tela não tiver tour, se um tour não tiver conteúdo, se um passo apontar para um elemento que não existe no código ou se a tela não registrar `useScreen`.

Exceção: telas públicas (login, escolher clínica, aceitar convite) não têm usuário identificado; usam ajuda escrita na própria tela.

## Novidades

**Cadastro** (painel do SaaS → Novidades): título, o que mudou, benefício prático, versão, data de publicação, situação (rascunho/publicada/arquivada), público por **módulo** e **permissão**, tela de destino e tour da novidade (o servidor valida que o tour pertence à tela). Estatísticas de abertas/vistas/adiadas/dispensadas.

**Após o login**
- Uma janela com até **3** novidades não vistas e relevantes (módulo contratado + permissão); as demais ficam na central.
- **Conhecer novidade** → registra "aberta", leva à tela e inicia o tour da novidade.
- **Ver depois** → volta no próximo login após 12 h, no máximo 2 vezes; depois só na central.
- **Entendi** → vista. **Fechar** → dispensada. Nenhuma volta a aparecer no login depois disso.
- Novidades publicadas antes de a pessoa entrar no sistema não aparecem no login dela (ela aprende pelos tours de primeiro acesso), se assim marcado.

**Concorrência entre tours (sem sobreposição)**
1. Um tour por vez.
2. Enquanto a janela de novidades está aberta (ou carregando), nenhum tour abre sozinho.
3. Pedido explícito (Conhecer novidade) tem prioridade sobre o tour de primeiro acesso; o de primeiro acesso daquela tela fica para a próxima visita.
4. Trocar de tela encerra o tour atual.
