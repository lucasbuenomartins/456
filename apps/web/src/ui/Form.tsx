import { clsx } from "clsx";
import { AlertCircle, Check } from "./icons";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const control =
  "block w-full rounded-xl border bg-surface px-3 text-base sm:text-[0.9375rem] text-ink placeholder:text-ink-subtle " +
  "transition-colors focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary " +
  "disabled:bg-surface-muted disabled:text-ink-subtle";

const controlBorder = (invalid?: boolean) => (invalid ? "border-danger focus:border-danger focus:ring-danger/20" : "border-border-strong");

export interface FieldProps {
  label: ReactNode;
  /** Mensagem de erro mostrada logo abaixo do campo. */
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string; required?: boolean }>;
}

/** Rótulo + controle + dica + erro, ligados por id e aria-describedby. */
export function Field({ label, error, hint, required, optional, className, children }: FieldProps) {
  const autoId = useId();
  const id = (isValidElement(children) && children.props.id) || autoId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
        {optional && <span className="font-normal text-ink-subtle"> (opcional)</span>}
      </label>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
        required,
      })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1 text-sm text-danger" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  const isInvalid = invalid ?? rest["aria-invalid"] === true;
  return <input ref={ref} className={clsx(control, "h-11 sm:h-10", controlBorder(isInvalid), className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx(control, "py-2.5 resize-y", controlBorder(rest["aria-invalid"] === true), className)}
      {...rest}
    />
  );
});

/** Select nativo: melhor acessibilidade e seletor do próprio sistema no celular. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={clsx(control, "h-11 sm:h-10 pr-8 appearance-none bg-no-repeat", controlBorder(rest["aria-invalid"] === true), className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%239b7d8c' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 0.6rem center",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={rest.id ?? id} className={clsx("flex cursor-pointer items-start gap-3 py-1.5 min-h-touch sm:min-h-0", className)}>
      <span className="relative mt-0.5 inline-flex">
        <input
          id={rest.id ?? id}
          type="checkbox"
          className="peer h-5 w-5 appearance-none rounded-[7px] border border-border-strong bg-surface checked:border-primary checked:bg-primary focus-visible:ring-4 focus-visible:ring-primary/30 focus:outline-none disabled:opacity-50"
          {...rest}
        />
        <Check className="pointer-events-none absolute inset-0 m-auto hidden h-3.5 w-3.5 text-primary-ink peer-checked:block" weight="bold" aria-hidden />
      </span>
      <span className="flex flex-col">
        <span className="text-[0.9375rem] text-ink">{label}</span>
        {description && <span className="text-sm text-ink-subtle">{description}</span>}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="flex flex-col">
        <span className="text-[0.9375rem] text-ink">{label}</span>
        {description && <span className="text-sm text-ink-subtle">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:ring-4 focus-visible:ring-primary/30 focus:outline-none disabled:opacity-50",
          checked ? "bg-primary" : "bg-border-strong",
        )}
      >
        <span className={clsx("inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform", checked ? "translate-x-6" : "translate-x-1")} />
      </button>
    </div>
  );
}

/** Grupo de opções em botões grandes (melhor que select para poucas opções, sobretudo no toque). */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  options: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <fieldset className={clsx("flex flex-col gap-1.5", className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.value)}
              className={clsx(
                "min-h-touch sm:min-h-[38px] rounded-full border px-4 text-sm transition-colors focus-visible:ring-4 focus-visible:ring-primary/30 focus:outline-none",
                active ? "border-primary bg-primary-soft font-medium text-primary" : "border-border-strong bg-surface text-ink-muted hover:bg-surface-muted",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormSection({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card p-4 sm:p-6", className)}>
      <header className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-subtle">{description}</p>}
      </header>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
