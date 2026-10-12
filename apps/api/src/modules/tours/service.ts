import { TOUR_MAP, type TourStatus } from "@clinica/shared";
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { tourProgress } from "../../db/schema";
import { AppError } from "../../lib/errors";

export type Realm = "clinic" | "platform";

export async function listTourState(db: DbOrTx, realm: Realm, userId: string) {
  const rows = await db
    .select({ tourId: tourProgress.tourId, version: tourProgress.version, status: tourProgress.status, timesShown: tourProgress.timesShown })
    .from(tourProgress)
    .where(and(eq(tourProgress.realm, realm), eq(tourProgress.userId, userId)));
  return rows as { tourId: string; version: number; status: TourStatus; timesShown: number }[];
}

/**
 * Registra um evento do tour. Regras:
 * - "seen": primeira exibição cria o registro; reexibições de um tour não concluído somam timesShown.
 *   Uma nova versão do tour reinicia o estado.
 * - "completed": conclusão definitiva.
 * - "dismissed": dispensa; não sobrescreve uma conclusão anterior da mesma versão.
 */
export async function recordTourEvent(db: DbOrTx, realm: Realm, userId: string, tourId: string, version: number, status: TourStatus) {
  const entry = TOUR_MAP[tourId];
  if (!entry || entry.realm !== realm) throw new AppError(404, "not_found", "Tour não encontrado.");
  if (version > entry.version) throw new AppError(422, "validation", "Versão de tour inválida.");

  const [current] = await db
    .select()
    .from(tourProgress)
    .where(and(eq(tourProgress.realm, realm), eq(tourProgress.userId, userId), eq(tourProgress.tourId, tourId)))
    .for("update");
  const now = new Date();

  if (!current) {
    await db
      .insert(tourProgress)
      .values({
        realm,
        userId,
        tourId,
        version,
        status,
        timesShown: 1,
        completedAt: status === "completed" ? now : null,
        dismissedAt: status === "dismissed" ? now : null,
      })
      .onConflictDoNothing();
    return;
  }

  const newVersion = version > current.version;
  let next: Partial<typeof tourProgress.$inferInsert>;
  if (status === "seen") {
    next = newVersion
      ? { version, status: "seen", timesShown: 1, completedAt: null, dismissedAt: null }
      : { timesShown: current.timesShown + 1 };
  } else if (status === "completed") {
    next = { version: Math.max(version, current.version), status: "completed", completedAt: now };
  } else {
    next = current.status === "completed" && !newVersion ? {} : { version: Math.max(version, current.version), status: "dismissed", dismissedAt: now };
  }
  if (Object.keys(next).length) {
    await db.update(tourProgress).set({ ...next, updatedAt: now }).where(eq(tourProgress.id, current.id));
  }
}
