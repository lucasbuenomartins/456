import type { PermissionKey } from "@clinica/shared";
import { Building2, Download, History, KeyRound, MapPin, Package, Users, type LucideIcon } from "lucide-react";
import type { Session } from "../../app/session";

export interface SettingsPage {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  anyPermission: PermissionKey[];
}

export const SETTINGS_PAGES: SettingsPage[] = [
  { to: "/configuracoes/empresa", label: "Dados da empresa", description: "Nome, documento e contato", icon: Building2, anyPermission: ["company.manage"] },
  { to: "/configuracoes/unidades", label: "Unidades", description: "Endereços da clínica", icon: MapPin, anyPermission: ["units.manage"] },
  { to: "/configuracoes/equipe", label: "Equipe", description: "Pessoas, convites e acessos", icon: Users, anyPermission: ["team.read"] },
  { to: "/configuracoes/funcoes", label: "Funções e permissões", description: "O que cada função pode fazer", icon: KeyRound, anyPermission: ["team.read", "roles.manage"] },
  { to: "/configuracoes/plano", label: "Plano e módulos", description: "Contratação, uso e limites", icon: Package, anyPermission: ["plan.read"] },
  { to: "/configuracoes/historico", label: "Histórico de alterações", description: "Quem fez o quê e quando", icon: History, anyPermission: ["audit.read"] },
  { to: "/configuracoes/dados", label: "Dados e exportação", description: "Cópia dos dados e regras de guarda", icon: Download, anyPermission: ["data.export"] },
];

export function settingsPages(session: Session): SettingsPage[] {
  return SETTINGS_PAGES.filter((p) => p.anyPermission.some((perm) => session.can(perm)));
}
