import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ApiError, api } from "../../lib/api";
import { Badge, Callout, ErrorState, Spinner } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function SelectTenantPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["auth-tenants"],
    queryFn: () => api<{ tenants: { id: string; name: string; status: string }[] }>("/api/auth/tenants", { silent401: true }),
    retry: false,
  });
  useEffect(() => {
    document.title = "Escolher clínica · Lumi";
  }, []);

  if (q.error instanceof ApiError && q.error.status === 401) return <Navigate to="/entrar" replace />;

  const choose = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await api("/api/auth/select-tenant", { body: { tenantId: id } });
      qc.clear();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar nesta clínica.");
      setBusy(null);
    }
  };

  return (
    <AuthLayout title="Escolha a clínica" subtitle="Você tem acesso a mais de uma clínica. Em qual quer entrar agora?">
      {q.isLoading && <Spinner />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {error && <Callout tone="danger" className="mb-3">{error}</Callout>}
      <ul className="flex flex-col gap-2">
        {q.data?.tenants.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => choose(t.id)}
              disabled={busy !== null}
              className="flex min-h-[60px] w-full items-center gap-3 rounded-xl border border-border px-4 text-left hover:border-primary hover:bg-primary-soft disabled:opacity-60"
            >
              <Building2 className="h-5 w-5 text-primary" aria-hidden />
              <span className="flex-1 font-medium">{t.name}</span>
              {t.status !== "active" && t.status !== "trial" && <Badge tone="warning">Somente leitura</Badge>}
              {busy === t.id ? <Spinner label="" /> : <ChevronRight className="h-5 w-5 text-ink-subtle" aria-hidden />}
            </button>
          </li>
        ))}
      </ul>
    </AuthLayout>
  );
}
