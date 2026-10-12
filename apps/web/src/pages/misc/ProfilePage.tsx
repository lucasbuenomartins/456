import { changePasswordSchema } from "@clinica/shared";
import { useState, type FormEvent } from "react";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { useScreen, useTours } from "../../tours/TourProvider";
import { Button, Card, Field, Input, PageHeader, useToast } from "../../ui";
import { PasswordInput } from "../auth/LoginPage";

export function ProfilePage() {
  const session = useSession();
  const tours = useTours();
  const toast = useToast();
  useScreen("profile");
  const [name, setName] = useState(session.me.user.name);
  const [nameError, setNameError] = useState<string>();
  const [savingName, setSavingName] = useState(false);
  const [pwd, setPwd] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [savingPwd, setSavingPwd] = useState(false);
  const [resetting, setResetting] = useState(false);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setNameError("Informe seu nome.");
    setSavingName(true);
    try {
      await api("/api/me/profile", { method: "PATCH", body: { name } });
      await session.refresh();
      toast.success("Nome atualizado.");
      setNameError(undefined);
    } catch (err) {
      setNameError(err instanceof ApiError ? err.fields.name ?? err.message : "Erro ao salvar.");
    } finally {
      setSavingName(false);
    }
  };

  const savePwd = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse(pwd);
    const errs: Record<string, string> = parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]));
    if (pwd.newPassword !== pwd.confirm) errs.confirm = "As senhas não são iguais.";
    setPwdErrors(errs);
    if (Object.keys(errs).length) return;
    setSavingPwd(true);
    try {
      await api("/api/me/password", { body: { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword } });
      setPwd({ currentPassword: "", newPassword: "", confirm: "" });
      toast.success("Senha alterada. Outras sessões foram encerradas.");
    } catch (err) {
      if (err instanceof ApiError) setPwdErrors(err.fields);
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <>
      <PageHeader title="Meu perfil" description={`${session.me.user.email} · ${session.me.membership.roles.join(", ")}`} />
      <div className="grid max-w-3xl gap-5">
        <Card title="Seus dados" tourId="profile.form">
          <form onSubmit={saveName} noValidate className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label="Nome" error={nameError} className="flex-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="secondary" loading={savingName}>Salvar nome</Button>
          </form>
        </Card>
        <Card title="Trocar senha" tourId="profile.password">
          <form onSubmit={savePwd} noValidate className="grid gap-4 sm:grid-cols-3">
            <Field label="Senha atual" error={pwdErrors.currentPassword}>
              <PasswordInput value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} autoComplete="current-password" />
            </Field>
            <Field label="Nova senha" error={pwdErrors.newPassword} hint="Pelo menos 8 caracteres.">
              <PasswordInput value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} autoComplete="new-password" />
            </Field>
            <Field label="Repita a nova senha" error={pwdErrors.confirm}>
              <PasswordInput value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} autoComplete="new-password" />
            </Field>
            <div className="sm:col-span-3">
              <Button type="submit" loading={savingPwd}>Trocar senha</Button>
            </div>
          </form>
        </Card>
        <Card title="Tours guiados" tourId="profile.tours">
          <p className="mb-3 text-sm text-ink-muted">
            Cada tela mostra uma explicação rápida no primeiro acesso. Reative para ver todas de novo. Você também pode abrir o tour de qualquer tela em Ajuda → Ver tour desta tela.
          </p>
          <Button
            variant="secondary"
            loading={resetting}
            onClick={async () => {
              setResetting(true);
              try {
                await tours.resetAll();
                toast.success("Tours reativados. Eles aparecerão ao abrir cada tela.");
              } finally {
                setResetting(false);
              }
            }}
          >
            Rever explicações das telas
          </Button>
        </Card>
      </div>
    </>
  );
}
