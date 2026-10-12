// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { SCREENS, TOURS, screenTourId, type ScreenId } from "@clinica/shared";
import { describe, expect, it } from "vitest";
import { TOUR_DEFINITIONS } from "./definitions";

/** Critério de conclusão de toda tela: possui tour, e cada passo aponta para um elemento que existe no código. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx$/.test(f) ? [p] : [];
  });
}

const src = path.resolve(__dirname, "..");
const code = sourceFiles(src).map((f) => readFileSync(f, "utf8")).join("\n");
const anchorsInCode = new Set([...code.matchAll(/(?:data-tour|tourId)=(?:"|\{")([a-z0-9.\-]+)/gi)].map((m) => m[1]!));

describe("cobertura dos tours", () => {
  it("toda tela tem um tour de primeiro acesso com conteúdo", () => {
    for (const screen of Object.keys(SCREENS) as ScreenId[]) {
      const id = screenTourId(screen);
      expect(TOURS.find((t) => t.id === id), `tour ausente no catálogo: ${id}`).toBeDefined();
      expect(TOUR_DEFINITIONS[id]?.steps.length, `tour sem passos: ${id}`).toBeGreaterThan(0);
    }
  });

  it("todo tour do catálogo tem conteúdo", () => {
    for (const t of TOURS) expect(TOUR_DEFINITIONS[t.id], t.id).toBeDefined();
  });

  it("todo elemento citado pelos tours existe nas telas (identificadores estáveis)", () => {
    const missing: string[] = [];
    for (const def of Object.values(TOUR_DEFINITIONS)) {
      for (const step of def.steps) {
        for (const a of [step.anchor, step.mobileAnchor]) if (a && !anchorsInCode.has(a)) missing.push(`${def.id} → ${a}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("toda tela registra o próprio identificador com useScreen", () => {
    const registered = new Set([...code.matchAll(/useScreen\("([a-z.]+)"/g)].map((m) => m[1]));
    const missing = Object.keys(SCREENS).filter((s) => !registered.has(s));
    expect(missing).toEqual([]);
  });
});
