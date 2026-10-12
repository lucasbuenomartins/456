import * as RDialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { ArrowRight, Search, UserPlus, UserRound } from "../ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { normalizeSearch } from "@clinica/shared";
import { api } from "../lib/api";
import { formatPhoneBR } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { Kbd } from "../ui";
import { visibleNav } from "./nav";
import { useSession } from "./session";
import { settingsPages } from "../pages/settings/settingsPages";

interface Item {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Busca global (Ctrl+K): telas, ações e clientes. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useSession();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const dq = useDebounced(q.trim(), 200);
  const canSearchClients = session.can("clients.read");

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const clients = useQuery({
    queryKey: ["palette-clients", dq],
    queryFn: () => api<{ items: { id: string; fullName: string; phone: string }[] }>(`/api/clients?q=${encodeURIComponent(dq)}&pageSize=10&status=all`),
    enabled: open && canSearchClients && dq.length >= 2,
  });

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const items = useMemo<Item[]>(() => {
    const nq = normalizeSearch(q);
    const screens: Item[] = [
      ...visibleNav(session).map((n) => ({ id: `nav:${n.to}`, label: n.label, hint: "Ir para", icon: <n.icon className="h-4 w-4" />, run: () => go(n.to) })),
      ...settingsPages(session).map((p) => ({ id: `set:${p.to}`, label: p.label, hint: "Configurações", icon: <p.icon className="h-4 w-4" />, run: () => go(p.to) })),
      { id: "nav:/novidades", label: "Novidades", hint: "Ir para", icon: <ArrowRight className="h-4 w-4" />, run: () => go("/novidades") },
      { id: "nav:/meu-perfil", label: "Meu perfil", hint: "Ir para", icon: <UserRound className="h-4 w-4" />, run: () => go("/meu-perfil") },
    ];
    if (session.can("clients.create") && session.canWrite("core")) {
      screens.unshift({ id: "act:new-client", label: "Cadastrar cliente", hint: "Ação", icon: <UserPlus className="h-4 w-4" />, run: () => go("/clientes/novo") });
    }
    const filtered = nq ? screens.filter((s) => normalizeSearch(s.label).includes(nq)) : screens.slice(0, 8);
    const found = (clients.data?.items ?? []).slice(0, 6).map<Item>((c) => ({
      id: `client:${c.id}`,
      label: c.fullName,
      hint: formatPhoneBR(c.phone),
      icon: <UserRound className="h-4 w-4" />,
      run: () => go(`/clientes/${c.id}`),
    }));
    return [...found, ...filtered];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, session, clients.data]);

  useEffect(() => setCursor(0), [q, clients.data]);

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[70] bg-[rgb(var(--overlay)/0.45)] animate-fade-in" />
        <RDialog.Content
          className="fixed inset-x-0 top-0 z-[71] flex max-h-[85dvh] flex-col bg-surface shadow-pop animate-slide-up focus:outline-none sm:left-1/2 sm:top-[12vh] sm:w-[600px] sm:-translate-x-1/2 sm:rounded-3xl"
          aria-describedby={undefined}
        >
          <RDialog.Title className="sr-only">Buscar telas e clientes</RDialog.Title>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-5 w-5 text-ink-subtle" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  items[cursor]?.run();
                }
              }}
              placeholder={canSearchClients ? "Buscar cliente pelo nome ou telefone, ou uma tela…" : "Buscar uma tela…"}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-subtle"
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={items[cursor] ? `palette-${items[cursor].id}` : undefined}
            />
            <RDialog.Close className="rounded-lg px-2 py-1 text-sm text-ink-subtle hover:bg-surface-muted">Esc</RDialog.Close>
          </div>
          <ul id="palette-list" role="listbox" className="overflow-y-auto p-2">
            {items.length === 0 && (
              <li className="px-3 py-8 text-center text-sm text-ink-subtle">
                {clients.isFetching ? "Buscando…" : "Nada encontrado. Tente outra palavra."}
              </li>
            )}
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`palette-${item.id}`}
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={item.run}
                className={clsx("flex min-h-touch cursor-pointer items-center gap-3 rounded-lg px-3", i === cursor && "bg-primary-soft")}
              >
                <span className="text-ink-subtle">{item.icon}</span>
                <span className="flex-1 truncate text-[0.9375rem]">{item.label}</span>
                {item.hint && <span className="text-xs text-ink-subtle">{item.hint}</span>}
              </li>
            ))}
          </ul>
          <div className="hidden items-center gap-3 border-t border-border px-4 py-2 text-xs text-ink-subtle sm:flex">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navegar <Kbd>Enter</Kbd> abrir <Kbd>Esc</Kbd> fechar
          </div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
