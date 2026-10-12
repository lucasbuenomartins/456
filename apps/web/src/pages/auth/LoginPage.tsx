import { loginSchema } from "@clinica/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ApiError, api } from "../../lib/api";
import { Button, Callout, Field, Input } from "../../ui";
import { AuthLayout } from "./AuthLayout";

export function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-12" />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2.5 text-ink-subtle hover:text-ink"
        aria-label={show ? "Esconder senha" : "Mostrar senha"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    document.title = "Entrar · Lumi";
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFields(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setFields({});
    setBusy(true);
    try {
      const res = await api<{ needsTenant: boolean }>("/api/auth/login", { body: parsed.data, silent401: true });
      qc.clear();
      const back = params.get("voltar");
      navigate(res.needsTenant ? "/escolher-clinica" : back && back.startsWith("/") && !back.startsWith("//") ? back : "/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Use o e-mail e a senha cadastrados pela sua clínica."
      footer={
        <>
          Primeira vez? Abra o link de convite que você recebeu da clínica.
          <br />
          <a className="mt-2 inline-block text-ink-subtle underline" href="/admin/entrar">
            Acesso do suporte da plataforma
          </a>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <Callout tone="danger">{error}</Callout>}
        <Field label="E-mail" error={fields.email}>
          <Input type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Senha" error={fields.password}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" loading={busy} loadingText="Entrando…">
          Entrar
        </Button>
        <button type="button" onClick={() => setForgot((f) => !f)} className="text-sm text-primary hover:underline" aria-expanded={forgot}>
          Esqueci minha senha
        </button>
        {forgot && (
          <Callout tone="info">
            Peça ao administrador da sua clínica um novo convite de acesso. A recuperação de senha por e-mail depende da integração de envio de e-mails, prevista para uma próxima etapa.
          </Callout>
        )}
      </form>
    </AuthLayout>
  );
}
