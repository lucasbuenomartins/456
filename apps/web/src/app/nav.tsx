import type { ModuleKey, PermissionKey } from "@clinica/shared";
import { BarChart3, Boxes, CalendarDays, ClipboardList, HeartHandshake, Home, Settings, Users, Wallet, type LucideIcon } from "lucide-react";
import type { Session } from "./session";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  module: ModuleKey;
  /** Basta ter uma destas permissões para ver o item. */
  anyPermission?: PermissionKey[];
  /** Módulo ainda não implementado: leva à página que explica a próxima etapa. */
  comingSoon?: boolean;
  /** Item fixo na barra inferior do celular. */
  mobilePrimary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Início", icon: Home, module: "core", mobilePrimary: true },
  { to: "/agenda", label: "Agenda", icon: CalendarDays, module: "agenda", anyPermission: ["agenda.read_all", "agenda.read_own"], comingSoon: true, mobilePrimary: true },
  { to: "/clientes", label: "Clientes", icon: Users, module: "core", anyPermission: ["clients.read"], mobilePrimary: true },
  { to: "/prontuario", label: "Prontuário", icon: ClipboardList, module: "prontuario", anyPermission: ["clinical.read"], comingSoon: true },
  { to: "/financeiro", label: "Financeiro", icon: Wallet, module: "financeiro", anyPermission: ["finance.read", "finance.sell"], comingSoon: true },
  { to: "/estoque", label: "Estoque", icon: Boxes, module: "estoque", anyPermission: ["stock.read"], comingSoon: true },
  { to: "/relacionamento", label: "Relacionamento", icon: HeartHandshake, module: "crm", anyPermission: ["crm.read"], comingSoon: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3, module: "relatorios", anyPermission: ["reports.read"], comingSoon: true },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: Settings,
    module: "core",
    anyPermission: ["company.manage", "units.manage", "team.read", "roles.manage", "plan.read", "audit.read", "data.export"],
  },
];

export function visibleNav(session: Session): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!session.hasModule(item.module)) return false;
    if (item.anyPermission && !item.anyPermission.some((p) => session.can(p))) return false;
    return true;
  });
}
