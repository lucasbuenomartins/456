import type { ModuleKey, PermissionKey } from "@clinica/shared";

export interface TourStep {
  /** Identificador estável do elemento (atributo data-tour). Sem anchor = cartão central. */
  anchor?: string;
  /** Alternativa no celular (ex.: botão do menu inferior em vez do menu lateral). */
  mobileAnchor?: string;
  title: string;
  body: string;
  /** Só aparece para quem tem esta permissão. */
  permission?: PermissionKey;
  /** Só aparece se o módulo estiver contratado. */
  module?: ModuleKey;
  device?: "desktop" | "mobile";
  placement?: "top" | "bottom" | "left" | "right";
}

export interface TourDefinition {
  id: string;
  steps: TourStep[];
}
