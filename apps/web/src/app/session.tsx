import { MODULES, PERMISSION_MAP, canReadModule, canWriteModule, type ModuleKey, type ModuleStatus, type PermissionKey, type PlanLimits } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "../lib/api";

export interface Me {
  user: { id: string; name: string; email: string; createdAt: string };
  tenant: {
    id: string;
    name: string;
    status: "trial" | "active" | "suspended" | "cancelled";
    access: "full" | "read_only";
    trialEndsAt: string | null;
    dataAvailableUntil: string | null;
    plan: { id: string; name: string; limits: PlanLimits } | null;
  };
  membership: { isOwner: boolean; jobTitle: string | null; roles: string[] };
  units: { id: string; name: string }[];
  currentUnitId: string | null;
  permissions: { tenantWide: string[]; byUnit: Record<string, string[]> };
  modules: { key: ModuleKey; name: string; status: ModuleStatus; availability: string }[];
}

export interface Session {
  me: Me;
  /** Permissão na unidade atual (ou em toda a empresa). Espelha a regra do servidor. */
  can: (perm: PermissionKey) => boolean;
  moduleStatus: (m: ModuleKey) => ModuleStatus;
  hasModule: (m: ModuleKey) => boolean;
  canWrite: (m: ModuleKey) => boolean;
  readOnly: boolean;
  currentUnit: { id: string; name: string } | null;
  /** Prefixo para preferências guardadas neste aparelho. */
  storageKey: (name: string) => string;
  refresh: () => Promise<unknown>;
}

const SessionContext = createContext<Session | null>(null);

export const meQueryKey = ["me"] as const;

export function useMeQuery() {
  return useQuery({ queryKey: meQueryKey, queryFn: () => api<Me>("/api/me", { silent401: true }), retry: false, staleTime: 60_000 });
}

export function buildSession(me: Me, refresh: () => Promise<unknown>): Session {
  const unitPerms = me.currentUnitId ? me.permissions.byUnit[me.currentUnitId] ?? [] : Object.values(me.permissions.byUnit).flat();
  const all = new Set([...me.permissions.tenantWide, ...unitPerms]);
  const status = (m: ModuleKey) => me.modules.find((x) => x.key === m)?.status ?? "disabled";
  return {
    me,
    can: (perm) => {
      const def = PERMISSION_MAP[perm];
      if (!def) return false;
      if (def.scope === "tenant") return me.permissions.tenantWide.includes(perm);
      // Recursos da empresa (clientes): basta ter em alguma unidade.
      return all.has(perm) || Object.values(me.permissions.byUnit).some((list) => list.includes(perm));
    },
    moduleStatus: status,
    hasModule: (m) => canReadModule(status(m)),
    canWrite: (m) => me.tenant.access === "full" && canWriteModule(status(m)),
    readOnly: me.tenant.access !== "full",
    currentUnit: me.units.find((u) => u.id === me.currentUnitId) ?? null,
    storageKey: (name) => `lumi:${me.tenant.id}:${me.user.id}:${name}`,
    refresh,
  };
}

export function SessionProvider({ me, children }: { me: Me; children: ReactNode }) {
  const qc = useQueryClient();
  const value = useMemo(() => buildSession(me, () => qc.invalidateQueries({ queryKey: meQueryKey })), [me, qc]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("SessionProvider ausente");
  return s;
}

export function moduleName(m: ModuleKey) {
  return MODULES[m].name;
}
