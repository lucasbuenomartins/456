import type { ReactNode } from "react";

/** Telas públicas (sem usuário identificado): usam ajuda inline em vez de tour. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10">
      <div className="mb-6 flex items-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-ink">
          <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
            <path d="M16 5c3.5 4.6 7 7.6 7 12.2a7 7 0 0 1-14 0C9 12.6 12.5 9.6 16 5z" fill="currentColor" />
          </svg>
        </span>
        <span className="text-xl font-semibold">Lumi</span>
      </div>
      <main className="card w-full max-w-md p-6 sm:p-8">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-[0.9375rem] text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </main>
      {footer && <div className="mt-6 max-w-md text-center text-sm text-ink-muted">{footer}</div>}
    </div>
  );
}
