import { companySchema, formatCnpj, formatPhoneBR } from "@clinica/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "../../app/session";
import { ApiError, api } from "../../lib/api";
import { useScreen } from "../../tours/TourProvider";
import { Button, Callout, ErrorState, Field, FormSection, Input, LoadingRows, useToast } from "../../ui";
import { SettingsLayout } from "./SettingsRoutes";

interface Company {
  name: string;
  legalName: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
}

export function CompanyPage() {
  const session = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["company"], queryFn: () => api<Company>("/api/settings/company") });
  const [form, setForm] = useState<Record<keyof Company, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useScreen("settings.company", { ready: !q.isLoading });

  useEffect(() => {
    if (q.data && !form) {
      setForm({
        name: q.data.name,
        legalName: q.data.legalName ?? "",
        document: q.data.document ? formatCnpj(q.data.document) : "",
        phone: q.data.phone ? formatPhoneBR(q.data.phone) : "",
        email: q.data.email ?? "",
      });
    }
  }, [q.data, form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const payload = { ...form, legalName: form.legalName || null, document: form.document || null, phone: form.phone || null, email: form.email || null };
    const parsed = companySchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api("/api/settings/company", { method: "PUT", body: payload });
      await qc.invalidateQueries({ queryKey: ["company"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      session.refresh();
      toast.success("Dados da empresa salvos.");
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        if (!Object.keys(err.fields).length) toast.error(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const readOnly = !session.canWrite("core");
  const set = (k: keyof Company, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <SettingsLayout title="Dados da empresa" description="Informações cadastrais da clínica.">
      {q.isLoading || !form ? (
        q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <LoadingRows rows={3} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-tour="settings.company.form">
          {readOnly && <Callout tone="warning">Conta em modo somente leitura.</Callout>}
          <FormSection title="Identificação">
            <Field label="Nome da clínica" error={errors.name} required hint="Aparece no topo do sistema para toda a equipe.">
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} disabled={readOnly} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Razão social" error={errors.legalName} optional>
                <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} disabled={readOnly} />
              </Field>
              <Field label="CNPJ ou CPF" error={errors.document} optional>
                <Input inputMode="numeric" value={form.document} onChange={(e) => set("document", e.target.value.replace(/\D/g, "").length > 11 ? formatCnpj(e.target.value) : e.target.value.replace(/[^\d.\-/]/g, ""))} disabled={readOnly} />
              </Field>
            </div>
          </FormSection>
          <FormSection title="Contato">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefone" error={errors.phone} optional>
                <Input inputMode="tel" value={form.phone} onChange={(e) => set("phone", formatPhoneBR(e.target.value))} disabled={readOnly} />
              </Field>
              <Field label="E-mail" error={errors.email} optional>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={readOnly} />
              </Field>
            </div>
          </FormSection>
          {!readOnly && (
            <div className="flex justify-end">
              <Button type="submit" loading={busy} loadingText="Salvando…">
                Salvar alterações
              </Button>
            </div>
          )}
        </form>
      )}
    </SettingsLayout>
  );
}
