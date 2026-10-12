import { READ_ONLY_GRACE_DAYS } from "@clinica/shared";
import { Download, FileSpreadsheet } from "../../ui/icons";
import { useSession } from "../../app/session";
import { useScreen } from "../../tours/TourProvider";
import { Card, buttonClass } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

export function DataPage() {
  const session = useSession();
  useScreen("settings.data");
  return (
    <SettingsLayout title="Dados e exportação" description="Os dados pertencem à sua clínica. Exporte quando precisar.">
      <div className="flex flex-col gap-5">
        <Card title="Exportar dados" tourId="settings.data.export">
          <p className="mb-4 text-sm text-ink-muted">
            Gera um arquivo com empresa, unidades, equipe, funções, clientes e autorizações de contato. Dados dos demais módulos são exportados dentro de cada módulo, conforme forem liberados. Toda exportação fica registrada no histórico.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="/api/settings/export" download className={buttonClass("primary")}>
              <Download className="h-4 w-4" aria-hidden /> Exportar tudo (JSON)
            </a>
            {session.can("clients.export") && (
              <a href="/api/clients/export.csv" download className={buttonClass("secondary")}>
                <FileSpreadsheet className="h-4 w-4" aria-hidden /> Clientes em planilha (CSV)
              </a>
            )}
          </div>
        </Card>
        <Card title="Regras de guarda e acesso" tourId="settings.data.rules">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-ink-muted">
            <li>
              <strong className="text-ink">Módulo desativado:</strong> fica em modo somente leitura por {READ_ONLY_GRACE_DAYS} dias, para consulta e exportação. Depois disso deixa de aparecer, mas os dados continuam guardados e voltam se o módulo for reativado.
            </li>
            <li>
              <strong className="text-ink">Conta suspensa:</strong> todos podem consultar e exportar, mas não é possível cadastrar ou alterar.
            </li>
            <li>
              <strong className="text-ink">Conta cancelada:</strong> os dados ficam disponíveis para exportação por {READ_ONLY_GRACE_DAYS} dias. Prontuários e registros com prazo legal de guarda seguem a política de retenção definida em contrato.
            </li>
            <li>
              <strong className="text-ink">Histórico de alterações:</strong> não pode ser editado nem apagado por ninguém da clínica.
            </li>
          </ul>
          <p className="mt-4 text-xs text-ink-subtle">
            Estes recursos apoiam o cumprimento da LGPD, mas não garantem conformidade por si só. Prazos de guarda devem ser validados com assessoria jurídica.
          </p>
        </Card>
      </div>
    </SettingsLayout>
  );
}
