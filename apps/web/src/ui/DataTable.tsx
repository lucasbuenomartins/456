import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useIsMobile } from "../lib/hooks";
import { Button } from "./Button";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Alinha números à direita. */
  numeric?: boolean;
}

/**
 * Tabela legível para desktop que vira lista de cartões no celular
 * (sem rolagem horizontal). Suporta seleção para ações em lote e abertura por teclado.
 */
export function DataTable<T>({
  columns,
  rows,
  rowId,
  onOpen,
  mobileRow,
  selectable,
  selected,
  onSelectedChange,
  caption,
  tourId,
}: {
  columns: Column<T>[];
  rows: T[];
  rowId: (row: T) => string;
  onOpen?: (row: T) => void;
  mobileRow: (row: T) => ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  caption: string;
  tourId?: string;
}) {
  const isMobile = useIsMobile();
  const sel = selected ?? new Set<string>();
  const allSelected = rows.length > 0 && rows.every((r) => sel.has(rowId(r)));
  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange?.(next);
  };
  const toggleAll = () => {
    const next = new Set(sel);
    if (allSelected) rows.forEach((r) => next.delete(rowId(r)));
    else rows.forEach((r) => next.add(rowId(r)));
    onSelectedChange?.(next);
  };
  const onKey = (e: KeyboardEvent, row: T) => {
    if (e.key === "Enter" && onOpen) {
      e.preventDefault();
      onOpen(row);
    }
  };

  if (isMobile) {
    return (
      <ul className="divide-y divide-border" aria-label={caption} data-tour={tourId}>
        {rows.map((row) => {
          const id = rowId(row);
          return (
            <li key={id} className="flex items-stretch">
              {selectable && (
                <label className="flex w-12 shrink-0 items-center justify-center">
                  <span className="sr-only">Selecionar</span>
                  <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={sel.has(id)} onChange={() => toggle(id)} />
                </label>
              )}
              <button
                type="button"
                className={clsx("flex min-h-[64px] flex-1 items-center gap-3 py-3 text-left active:bg-surface-muted", !selectable && "px-4", selectable && "pr-4")}
                onClick={() => onOpen?.(row)}
              >
                {mobileRow(row)}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto" data-tour={tourId}>
      <table className="w-full border-collapse text-[0.9375rem]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border">
            {selectable && (
              <th scope="col" className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={allSelected ? "Desmarcar todos desta página" : "Selecionar todos desta página"}
                  className="h-4 w-4 accent-[rgb(var(--primary))]"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} scope="col" className={clsx("px-4 py-3 text-left text-sm font-medium text-ink-subtle", c.numeric && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = rowId(row);
            const checked = sel.has(id);
            return (
              <tr
                key={id}
                tabIndex={onOpen ? 0 : undefined}
                onKeyDown={(e) => onKey(e, row)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,button,a")) return;
                  onOpen?.(row);
                }}
                aria-selected={selectable ? checked : undefined}
                className={clsx(
                  "border-b border-border last:border-0 focus:outline-none focus-visible:bg-primary-soft",
                  onOpen && "cursor-pointer hover:bg-surface-muted",
                  checked && "bg-primary-soft/60",
                )}
              >
                {selectable && (
                  <td className="px-4 py-3">
                    <input type="checkbox" aria-label="Selecionar" className="h-4 w-4 accent-[rgb(var(--primary))]" checked={checked} onChange={() => toggle(id)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} className={clsx("px-4 py-3 align-middle", c.numeric && "text-right tabular", c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-ink-muted">
      <span className="tabular">
        {from}–{to} de {total.toLocaleString("pt-BR")}
      </span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon={<ChevronLeft className="h-4 w-4" />} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <span className="hidden sm:inline">Anterior</span>
        </Button>
        <span className="tabular hidden sm:inline">
          Página {page} de {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <span className="hidden sm:inline">Próxima</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}

/** Barra de ações em lote, visível quando há itens selecionados. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div role="region" aria-label="Ações em lote" className="sticky bottom-20 z-20 mx-auto mt-3 flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-ink px-4 py-3 text-ink-inverse shadow-pop sm:bottom-4">
      <span className="mr-auto text-sm font-medium">
        {count} selecionado{count > 1 ? "s" : ""}
      </span>
      {children}
      <button onClick={onClear} className="rounded-lg px-3 py-2 text-sm text-ink-inverse/80 hover:bg-white/10 hover:text-ink-inverse">
        Limpar seleção
      </button>
    </div>
  );
}
