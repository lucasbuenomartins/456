import { acceptInviteSchema } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { ApiError, api } from "../../lib/api";
import { Button, ButtonLink, Callout, ErrorState, Field, Input, Spinner } from "../../ui";
import { AuthLayout } from "./AuthLayout";
import { PasswordInput } from "./LoginPage";

export function AcceptInvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api<{ tenantName: string; name: string; email: string; existingAccount: boolean }>(`/api/invites/${token}`, { silent401: true }),
    retry: false,
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = "Aceitar convite · Lumi";
  }, []);
  useEffect(() => {
    if (info.data) setName(info.data.name);
  }, [info.data]);

  if (info.isLoading) {
    return (
      <AuthLayout title="Convite">
        <Spinner />
      </AuthLayout>
    );
  }
  if (info.error) {
    return (
      <AuthLayout title="Convite indisponível">
        <ErrorState error={info.error} />
        <ButtonLink to="/entrar" variant="secondary" className="w-full">
          Ir para o login
        </ButtonLink>
      </AuthLayout>
    );
  }
  const existing = info.data!.existingAccount;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = acceptInviteSchema.safeParse({ token, name, password });
    const f: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
    if (!existing && password !== confirm) f.confirm = "As senhas não são iguais.";
    setFields(f);
    if (!parsed.success || Object.keys(f).length) return;
    setBusy(true);
    try {
      await api("/api/invites/accept", { body: parsed.data, silent401: true });
      qc.clear();
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields);
        setError(err.message);
      } else setError("Não foi possível aceitar o convite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={`Bem-vindo(a) à ${info.data!.tenantName}`}
      subtitle={existing ? "Você já tem uma conta. Confirme sua senha para entrar nesta clínica." : "Crie sua senha para começar a usar o sistema."}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="E-mail">
          <Input value={info.data!.email} disabled readOnly />
        </Field>
        {!existing && (
          <Field label="Seu nome" error={fields.name} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
        )}
        <Field label={existing ? "Sua senha atual" : "Crie uma senha"} error={fields.password} hint={existing ? undefined : "Pelo menos 8 caracteres."} required>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={existing ? "current-password" : "new-password"} />
        </Field>
        {!existing && (
          <Field label="Repita a senha" error={fields.confirm} required>
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <Button type="submit" size="lg" loading={busy} loadingText="Entrando…">
          {existing ? "Entrar na clínica" : "Criar acesso e entrar"}
        </Button>
      </form>
    </AuthLayout>
  );
}
