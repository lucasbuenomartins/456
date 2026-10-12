# 7. Regras de negócio das próximas etapas

Definidas agora para que a Etapa 1 (núcleo) já sustente o restante. Itens marcados **(validar)** dependem de confirmação com clínicas reais.

## Agenda e atendimento (Etapa 2)

**Disponibilidade** = horário de trabalho do profissional − intervalos − folgas/bloqueios − agendamentos existentes, considerando:
- duração do serviço (ou duração específica do profissional) + **preparação** antes + **limpeza** depois;
- sala e equipamentos exigidos pelo serviço, livres no período inteiro (incluindo preparação/limpeza);
- unidade do atendimento.

**Conflitos**: impedidos no banco (restrição de exclusão por recurso e período) — vale também para duas secretárias reservando o mesmo horário ao mesmo tempo: a segunda recebe "Este horário acabou de ser ocupado" com sugestões próximas.

**Exceções (encaixe)**: só com `agenda.override`, motivo obrigatório, registro no histórico do agendamento e na auditoria. Encaixe nunca sobrepõe **equipamento** (limitação física); sobrepor profissional/sala é permitido como exceção.

**Status**: agendado → confirmado → chegou → em atendimento → concluído. Saídas: cancelado (com motivo, por cliente/clínica), faltou (marcado após tolerância configurável), reagendado (gera novo agendamento ligado ao anterior).

**Recorrência**: série semanal/quinzenal/mensal com N ocorrências; conflito em uma ocorrência é mostrado antes de confirmar (pular, escolher outro horário).

**Lista de espera**: ao cancelar, a agenda sugere quem está na lista para aquele serviço/janela; contato é manual (até a integração de mensagens).

**Autoagendamento futuro**: o portal chama **o mesmo serviço de disponibilidade e reserva**; regras adicionais (antecedência mínima, serviços liberados, sinal) só restringem, nunca relaxam.

**Lembretes**: registro do lembrete e do status; até a integração, a recepção usa "Enviar pelo WhatsApp" (abre conversa com texto pronto) e marca como enviado.

## Pacotes de sessões (Etapas 2 e 4)

| Momento | Sem financeiro | Com financeiro |
|---|---|---|
| Venda/criação | Recepção registra pacote (serviço, nº de sessões, validade) | Pacote nasce da venda; saldo liberado conforme regra: na venda **(validar: ou só após 1º pagamento)** |
| Pagamento | — | Parcelas independentes do consumo; inadimplência gera alerta, não bloqueia automaticamente |
| Uso | Concluir atendimento vinculado ao pacote consome 1 sessão (idempotente por atendimento) | igual |
| Falta | Configurável: consome ou não a sessão (padrão: não consome) | igual |
| Correção | Reabrir/estornar atendimento devolve a sessão (lançamento +1 com motivo) | igual |
| Cancelamento do pacote | Sessões restantes canceladas | Reembolso proporcional: (valor pago − sessões usadas × preço unitário de referência − multa configurável), gera estorno no financeiro; sempre com confirmação |
| Validade | Vencido: sessões não usadas ficam bloqueadas; gestor pode prorrogar com motivo | igual |

Saldo = soma do `package_ledger` (nunca editado diretamente).

## Financeiro (Etapa 4)

- **Venda realizada** (competência) ≠ **valor recebido** (caixa) ≠ **valor pendente** (a receber). Telas e relatórios sempre mostram os três separados.
- Recebimentos parciais e parcelados; desconto na venda (com limite por permissão) ou no recebimento.
- Estorno de recebimento e reembolso ao cliente são lançamentos novos, com motivo e permissão `finance.refund`.
- Caixa diário por unidade: abertura com saldo, recebimentos/sangrias, fechamento com conferência por forma de pagamento; diferença registrada.
- Comissões: regra por profissional × serviço/produto, percentual ou valor fixo, base "vendido" ou "recebido" **(validar Q5)**; estorno recalcula.
- Conciliação: importação de extrato/relatório da maquininha (CSV) com marcação manual; integração bancária fica para depois.
- Emissão fiscal e processamento de pagamentos: **não** prometidos; interfaces previstas.

## Estoque (Etapa 4)

- Consumíveis (seringa, ativo, luva) ≠ equipamentos reutilizáveis (laser, cadeira — pertencem à agenda como recurso).
- **Ficha de consumo** por serviço = previsão. **Consumo real** registrado no atendimento (profissional confirma/ajusta).
- **Momento da baixa**: na conclusão do atendimento, para os itens confirmados. Uma única baixa por atendimento (chave de idempotência = atendimento + item).
- **Correção**: editar o consumo de um atendimento concluído gera movimento de reversão + nova saída (nunca altera o movimento original).
- Lote/validade: sugere FEFO (vence primeiro, sai primeiro); bloqueia lote vencido salvo exceção com permissão.
- Estoque negativo: proibido por padrão; configurável por empresa com alerta.
- Transferência entre unidades = saída + entrada ligadas.

## Prontuário (Etapa 3)

- Modelos de anamnese **configuráveis** pela clínica e revisados por profissional habilitado — o sistema não traz protocolos clínicos prontos nem faz sugestões diagnósticas. Exemplos de modelos (se oferecidos) são marcados como "exemplo, revise antes de usar".
- Rascunho → **finalização** (autor, data, hash do conteúdo). Após finalizar, nada é editado: correções por **adendo** ou nova versão.
- Alertas (alergias, medicamentos, contraindicações informadas) aparecem no topo do atendimento e na agenda para quem tem `clinical.read`.
- Fotos exigem consentimento de uso de imagem vigente; acesso só com `clinical.photos`; cada visualização registrada.
- Consentimentos separados: atendimento, uso de imagem, comunicação comercial (este já existe no núcleo).
- O registro de aceite é evidência (quem, quando, versão, dispositivo). **Não** afirmamos validade jurídica de assinatura sem provedor apropriado (Q3).
- Usuários comerciais (sem `clinical.*`) não veem nada clínico — nem em busca, nem em exportações.

## CRM (Etapa 5)

- Ações manuais (registrar interação, abrir WhatsApp com texto pronto) são distintas de **automações** (só quando a integração existir); a interface rotula claramente.
- Comunicação comercial só para canais com consentimento vigente; o histórico de consentimento já existe no núcleo.
- Inativos: sem atendimento há X dias (configurável) — exige Agenda; sem Agenda, usa data do último contato registrado.
