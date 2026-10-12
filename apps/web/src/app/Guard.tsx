import { MODULES, PERMISSION_MAP, type ModuleKey, type PermissionKey } from "@clinica/shared";
import { Lock, PackageX } from "../ui/icons";
import type { ReactNode } from "react";
import { ButtonLink, EmptyState } from "../ui";
import { useSession } from "./session";

/**
 * Proteção de rota no frontend (experiência). A proteção real está no servidor,
 * que valida contratação, situação da conta e permissões em toda requisição.
 */
export function Guard({
  module,
  permission,
  anyPermission,
  write,
  children,
}: {
  module?: ModuleKey;
  permission?: PermissionKey;
  anyPermission?: PermissionKey[];
  /** Tela de cadastro/edição: bloqueada em modo somente leitura. */
  write?: boolean;
  children: ReactNode;
}) {
  const session = useSession();
  const mod = module ?? (permission ? PERMISSION_MAP[permission]?.module : undefined) ?? "core";
  if (!session.hasModule(mod)) {
    return (
      <EmptyState
        icon={<PackageX className="h-6 w-6" />}
        title={`O módulo ${MODULES[mod].name} não está contratado`}
        description="Esta área faz parte de um módulo que a sua clínica ainda não contratou. O responsável pela conta pode ver os detalhes em Configurações → Plano e módulos."
        action={<ButtonLink to="/" variant="secondary">Voltar ao início</ButtonLink>}
      />
    );
  }
  const perms = [...(permission ? [permission] : []), ...(anyPermission ?? [])];
  if (perms.length && !perms.some((p) => session.can(p))) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Você não tem acesso a esta área"
        description="Se precisar usar esta área, peça ao administrador da clínica para ajustar a sua função."
        action={<ButtonLink to="/" variant="secondary">Voltar ao início</ButtonLink>}
      />
    );
  }
  if (write && !session.canWrite(mod)) {
    return (
      <EmptyState
        icon={<Lock className="h-6 w-6" />}
        title="Modo somente leitura"
        description="No momento é possível apenas consultar e exportar dados. Fale com o responsável pela conta."
        action={<ButtonLink to="/" variant="secondary">Voltar ao início</ButtonLink>}
      />
    );
  }
  return <>{children}</>;
}
