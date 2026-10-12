import { useCallback, useEffect, useState } from "react";
import { storage } from "./storage";

/** Tema escolhido neste aparelho. "system" segue o modo claro/escuro do aparelho. */
export type ThemePreference = "light" | "dark" | "system";
export const THEME_KEY = "lumi:theme";

const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return media()?.matches ? "dark" : "light";
  return pref;
}

export function applyTheme(pref: ThemePreference) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#170f14" : "#be185d");
}

const listeners = new Set<(p: ThemePreference) => void>();

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => storage.get<ThemePreference>(THEME_KEY, "system"));

  useEffect(() => {
    const fn = (p: ThemePreference) => setPreference(p);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  // Acompanha a troca de modo do aparelho quando a preferência é automática.
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const mql = media();
    const onChange = () => applyTheme("system");
    mql?.addEventListener("change", onChange);
    return () => mql?.removeEventListener("change", onChange);
  }, [preference]);

  const set = useCallback((p: ThemePreference) => {
    storage.set(THEME_KEY, p);
    listeners.forEach((fn) => fn(p));
  }, []);

  return { preference, resolved: resolveTheme(preference), setPreference: set };
}
