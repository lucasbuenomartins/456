import { describe, expect, it } from "vitest";
import {
  NEWS_MAX_POSTPONES,
  TOUR_MAP,
  dependentsOf,
  isValidCnpj,
  isValidCpf,
  isValidPhoneBR,
  missingDependencies,
  shouldAutoStart,
  shouldShowAtLogin,
} from "../src";

describe("validadores", () => {
  it("CPF, CNPJ e telefone", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidPhoneBR("(11) 98765-4321")).toBe(true);
    expect(isValidPhoneBR("(11) 3456-7890")).toBe(true);
    expect(isValidPhoneBR("98765-4321")).toBe(false);
  });
});

describe("dependências de módulos", () => {
  it("portal exige agenda; agenda não depende de financeiro", () => {
    expect(missingDependencies(["portal"])).toEqual([{ module: "portal", missing: ["agenda"] }]);
    expect(missingDependencies(["agenda"])).toEqual([]);
    expect(missingDependencies(["prontuario"])).toEqual([]);
    expect(missingDependencies(["estoque"])).toEqual([]);
    expect(dependentsOf("agenda", ["agenda", "portal", "crm"])).toEqual(["portal"]);
  });
});

describe("regra de abertura automática dos tours", () => {
  const tour = TOUR_MAP["screen.clients.list"]!;
  it("abre no primeiro acesso e não reabre após conclusão ou dispensa", () => {
    expect(shouldAutoStart(tour, undefined)).toBe(true);
    expect(shouldAutoStart(tour, { tourId: tour.id, version: 1, status: "completed", timesShown: 1 })).toBe(false);
    expect(shouldAutoStart(tour, { tourId: tour.id, version: 1, status: "dismissed", timesShown: 1 })).toBe(false);
  });
  it("tour interrompido reabre no máximo uma vez", () => {
    expect(shouldAutoStart(tour, { tourId: tour.id, version: 1, status: "seen", timesShown: 1 })).toBe(true);
    expect(shouldAutoStart(tour, { tourId: tour.id, version: 1, status: "seen", timesShown: 2 })).toBe(false);
  });
  it("nova versão só reabre quando marcada como mudança grande", () => {
    const v2 = { ...tour, version: 2 };
    const done = { tourId: tour.id, version: 1, status: "completed" as const, timesShown: 1 };
    expect(shouldAutoStart(v2, done)).toBe(false);
    expect(shouldAutoStart({ ...v2, reshowOnNewVersion: true }, done)).toBe(true);
  });
  it("tours de novidade nunca abrem sozinhos", () => {
    expect(shouldAutoStart(TOUR_MAP["update.clients.quick-search"]!, undefined)).toBe(false);
  });
});

describe("novidades após o login", () => {
  const now = new Date("2026-01-10T12:00:00Z");
  it("mostra não vistas; esconde vistas, abertas e dispensadas", () => {
    expect(shouldShowAtLogin({ action: null, postponeCount: 0, updatedAt: null }, now)).toBe(true);
    for (const action of ["seen", "opened", "dismissed"] as const) {
      expect(shouldShowAtLogin({ action, postponeCount: 0, updatedAt: now.toISOString() }, now)).toBe(false);
    }
  });
  it('"Ver depois" respeita intervalo e limite de adiamentos', () => {
    const recent = new Date(now.getTime() - 3600e3).toISOString();
    const old = new Date(now.getTime() - 24 * 3600e3).toISOString();
    expect(shouldShowAtLogin({ action: "later", postponeCount: 1, updatedAt: recent }, now)).toBe(false);
    expect(shouldShowAtLogin({ action: "later", postponeCount: 1, updatedAt: old }, now)).toBe(true);
    expect(shouldShowAtLogin({ action: "later", postponeCount: NEWS_MAX_POSTPONES, updatedAt: old }, now)).toBe(false);
  });
});
