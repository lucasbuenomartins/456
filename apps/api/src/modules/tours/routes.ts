import { tourEventSchema } from "@clinica/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf, platformOf } from "../../app";
import { adminDb, withTenant } from "../../db/client";
import { tourProgress } from "../../db/schema";
import { parse } from "../../lib/validate";
import { listTourState, recordTourEvent } from "./service";

export async function tourRoutes(app: FastifyInstance) {
  app.get("/api/tours/state", async (req) => {
    const ctx = ctxOf(req);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => ({
      items: await listTourState(tx, "clinic", ctx.user.id),
    }));
  });

  app.post<{ Params: { tourId: string } }>("/api/tours/:tourId/events", { config: { allowReadOnly: true } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(tourEventSchema, req.body);
    await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
      recordTourEvent(tx, "clinic", ctx.user.id, req.params.tourId, body.version, body.status),
    );
    return { ok: true };
  });

  /** Reativa todos os tours da pessoa (Meu perfil → Rever explicações das telas). */
  app.post("/api/tours/reset", { config: { allowReadOnly: true } }, async (req) => {
    const ctx = ctxOf(req);
    await withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, (tx) =>
      tx.delete(tourProgress).where(and(eq(tourProgress.realm, "clinic"), eq(tourProgress.userId, ctx.user.id))),
    );
    return { ok: true };
  });

  app.post("/api/admin/tours/reset", { config: { realm: "platform" } }, async (req) => {
    const p = platformOf(req);
    await adminDb.delete(tourProgress).where(and(eq(tourProgress.realm, "platform"), eq(tourProgress.userId, p.user.id)));
    return { ok: true };
  });

  app.get("/api/admin/tours/state", { config: { realm: "platform" } }, async (req) => {
    const p = platformOf(req);
    return { items: await listTourState(adminDb, "platform", p.user.id) };
  });

  app.post<{ Params: { tourId: string } }>("/api/admin/tours/:tourId/events", { config: { realm: "platform" } }, async (req) => {
    const p = platformOf(req);
    const body = parse(tourEventSchema, req.body);
    await adminDb.transaction((tx) => recordTourEvent(tx, "platform", p.user.id, req.params.tourId, body.version, body.status));
    return { ok: true };
  });
}
