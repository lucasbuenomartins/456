import { formatCpf, formatPhoneBR } from "@clinica/shared";

export { formatCpf, formatPhoneBR };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Datas sem hora (AAAA-MM-DD) são exibidas sem conversão de fuso. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value));
}

export function formatMoney(cents: number): string {
  return moneyFmt.format(cents / 100);
}

export function relativeTime(value: string | Date | null | undefined): string {
  if (!value) return "nunca";
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${d} dia${d > 1 ? "s" : ""}`;
  return formatDate(value instanceof Date ? value.toISOString() : value);
}

export function age(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T00:00:00Z`);
  const now = new Date();
  let a = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => !/^(da|de|do|das|dos|e|dra?\.?)$/i.test(p));
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

export function whatsappLink(phone: string): string {
  return `https://wa.me/55${phone.replace(/\D/g, "")}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;
}
