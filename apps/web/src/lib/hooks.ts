import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage";

/** Estado salvo neste aparelho (ex.: filtros de uma tabela). A chave deve incluir usuário e empresa. */
export function usePersistentState<T>(key: string | null, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => (key ? storage.get(key, initial) : initial));
  const keyRef = useRef(key);
  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValue(key ? storage.get(key, initial) : initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        if (keyRef.current) storage.set(keyRef.current, next);
        return next;
      });
    },
    [],
  );
  return [value, set];
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const fn = () => setMatches(mql.matches);
    fn();
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

export const useIsMobile = () => useMediaQuery("(max-width: 639px)");

/** Atalho de teclado global. Ignorado enquanto a pessoa digita em um campo (exceto com Ctrl/⌘). */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const needMod = parts.includes("mod");
    const fn = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const mod = e.ctrlKey || e.metaKey;
      if (needMod !== mod) return;
      if (typing && !needMod) return;
      if (e.key.toLowerCase() !== key) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [combo, enabled]);
}

/** Avisa antes de fechar a aba com alterações não salvas. */
export function useBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [active]);
}
