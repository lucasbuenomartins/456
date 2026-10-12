import { MODULES, type ModuleKey } from "@clinica/shared";
import { Construction, MapPinOff } from "lucide-react";
import { useEffect } from "react";
import { ButtonLink, Card, EmptyState, PageHeader } from "../../ui";

const STAGE_DETAILS: Partial<Record<ModuleKey, string[]>> = {
  agenda: [
    "Agenda diária, semanal e mensal por profissional, sala e equipamento",
    "Bloqueio de conflitos, inclusive quando duas pessoas agendam ao mesmo tempo",
    "Confirmação, chegada, início, conclusão e faltas",
    "Lista de espera, recorrência e pacotes de sessões",
  ],
  prontuario: [
    "Modelos de anamnese configuráveis, com perguntas condicionais",
    "Evolução por atendimento, fotos de antes e depois com autorização",
    "Termos versionados e registros finalizados preservados (correção por adendo)",
    "Rascunho automático que funciona mesmo com conexão instável",
  ],
  financeiro: ["Vendas, recebimentos parciais e parcelados", "Caixa diário e fechamento", "Contas a pagar e a receber, comissões e inadimplência"],
  estoque: ["Produtos e materiais por unidade, lotes e validade", "Ficha de consumo por procedimento e baixa integrada ao atendimento", "Compras, inventário e histórico de movimentações"],
  crm: ["Pipeline de oportunidades e tarefas", "Clientes inativos, aniversários e retornos", "Preferências e consentimentos de comunicação"],
  relatorios: ["Indicadores por período e unidade, apenas dos módulos contratados"],
};

/** Módulo contratado cuja interface ainda não foi entregue (transparência com o cliente). */
export function ModuleComingSoonPage({ module }: { module: ModuleKey }) {
  const def = MODULES[module];
  useEffect(() => {
    document.title = `${def.name} · Lumi`;
  }, [def.name]);
  return (
    <>
      <PageHeader title={def.name} description={def.description} />
      <Card>
        <EmptyState
          icon={<Construction className="h-6 w-6" />}
          title="Este módulo está em construção"
          description={`Ele está contratado pela sua clínica e será liberado na etapa ${def.stage} do produto. Veja o que vem por aí:`}
        />
        <ul className="mx-auto mb-6 flex max-w-lg list-disc flex-col gap-1.5 pl-6 text-sm text-ink-muted">
          {(STAGE_DETAILS[module] ?? []).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function NotFoundPage() {
  useEffect(() => {
    document.title = "Página não encontrada · Lumi";
  }, []);
  return (
    <EmptyState
      icon={<MapPinOff className="h-6 w-6" />}
      title="Não encontramos esta página"
      description="O endereço pode ter mudado. Use o menu ou a busca para continuar."
      action={<ButtonLink to="/">Ir para o início</ButtonLink>}
    />
  );
}
