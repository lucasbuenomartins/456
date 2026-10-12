export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> = {},
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get isNetwork() {
    return this.code === "network";
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
/** Avisado quando a sessão expira (401) para redirecionar ao login. */
export function onUnauthorized(fn: Listener) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Evita duplicidade se a mesma ação for enviada duas vezes (duplo clique, reenvio). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Não dispara o redirecionamento automático em 401 (telas de login). */
  silent401?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, "network", "Sem conexão com o servidor. Verifique a internet e tente de novo.");
  }
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const body = (data as { error?: ApiErrorBody } | null)?.error;
    if (res.status === 401 && !opts.silent401) unauthorizedListeners.forEach((fn) => fn());
    throw new ApiError(
      res.status,
      body?.code ?? "http_error",
      body?.message ?? "Não foi possível concluir. Tente novamente.",
      body?.fields,
      body?.details,
    );
  }
  return data as T;
}

export const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
