import { useCallback, useEffect, useRef, useState } from "react";
import { storage } from "./storage";

export interface DraftEnvelope<T> {
  value: T;
  savedAt: string;
  /** Versão do registro no servidor quando o rascunho começou (edições). */
  baseVersion?: number;
}

export type DraftStatus = "idle" | "saving_local" | "saved_local" | "local_unavailable";

/**
 * Rascunho automático guardado neste aparelho.
 * - Salva a cada alteração (com pequeno atraso) para não perder dados ao trocar de tela,
 *   fechar a aba ou perder a conexão.
 * - Ao reabrir, oferece recuperar o rascunho.
 * - É apagado quando o registro é salvo no servidor.
 *
 * Os rascunhos ficam apenas neste aparelho e navegador. Dados clínicos (Etapa 3)
 * usarão também rascunho no servidor, com sincronização indicada na tela.
 */
export function useDraft<T>(key: string | null, current: T, opts: { enabled: boolean; baseVersion?: number }) {
  const [pending, setPending] = useState<DraftEnvelope<T> | null>(null);
  /** Chave cujo rascunho já foi lido; até lá não gravamos nada (para não sobrescrever). */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!key) return;
    setPending(storage.get<DraftEnvelope<T> | null>(key, null));
    setLoadedKey(key);
  }, [key]);

  useEffect(() => {
    if (!key || loadedKey !== key || !opts.enabled || pending) return;
    setStatus("saving_local");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = new Date().toISOString();
      const ok = storage.set(key, { value: current, savedAt: now, baseVersion: opts.baseVersion } satisfies DraftEnvelope<T>);
      setStatus(ok ? "saved_local" : "local_unavailable");
      if (ok) setSavedAt(now);
    }, 400);
    return () => clearTimeout(timer.current);
  }, [key, loadedKey, current, opts.enabled, opts.baseVersion, pending]);

  const discard = useCallback(() => {
    if (key) storage.remove(key);
    setPending(null);
    setStatus("idle");
    setSavedAt(null);
  }, [key]);

  const accept = useCallback(() => {
    const value = pending?.value;
    setPending(null);
    return value;
  }, [pending]);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    if (key) storage.remove(key);
    setStatus("idle");
    setSavedAt(null);
  }, [key]);

  return { pending, accept, discard, clear, status, savedAt };
}
