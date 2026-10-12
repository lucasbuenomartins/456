/**
 * Regras de exibição de novidades após o login.
 */
export const NEWS_ACTIONS = ["seen", "opened", "later", "dismissed"] as const;
export type NewsAction = (typeof NEWS_ACTIONS)[number];

/** Máximo de novidades apresentadas de uma vez após o login. As demais ficam na central. */
export const NEWS_MAX_AT_LOGIN = 3;
/** "Ver depois" volta a aparecer no próximo login, no máximo esta quantidade de vezes. */
export const NEWS_MAX_POSTPONES = 2;
/** Intervalo mínimo antes de reapresentar uma novidade adiada. */
export const NEWS_POSTPONE_HOURS = 12;

export interface NewsReceiptState {
  action: NewsAction | null;
  postponeCount: number;
  updatedAt: string | null;
}

/**
 * Uma novidade aparece no login quando:
 * - nunca foi vista, ou
 * - foi adiada ("Ver depois") menos de NEWS_MAX_POSTPONES vezes e já passou o intervalo mínimo.
 * Uma vez vista, aberta ou dispensada, só aparece na central.
 */
export function shouldShowAtLogin(receipt: NewsReceiptState, now: Date = new Date()): boolean {
  if (receipt.action === null) return true;
  if (receipt.action !== "later") return false;
  if (receipt.postponeCount >= NEWS_MAX_POSTPONES) return false;
  if (!receipt.updatedAt) return true;
  const elapsedHours = (now.getTime() - new Date(receipt.updatedAt).getTime()) / 36e5;
  return elapsedHours >= NEWS_POSTPONE_HOURS;
}
