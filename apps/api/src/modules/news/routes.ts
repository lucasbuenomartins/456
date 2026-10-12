import { NEWS_MAX_AT_LOGIN, canReadModule, newsReceiptSchema, shouldShowAtLogin, type ModuleKey, type PermissionKey } from "@clinica/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf } from "../../app";
import { withTenant, type Tx } from "../../db/client";
import * as s from "../../db/schema";
import { can, type ClinicContext } from "../../lib/access";
import { notFound } from "../../lib/errors";
import { parse } from "../../lib/validate";

/** Novidades publicadas que fazem sentido para este usuário (módulos contratados e permissões). */
async function visibleNews(tx: Tx, ctx: ClinicContext) {
  // A política de RLS já restringe a novidades publicadas com data de publicação no passado.
  const rows = await tx
    .select({ news: s.news, receipt: s.newsReceipts })
    .from(s.news)
    .leftJoin(s.newsReceipts, and(eq(s.newsReceipts.newsId, s.news.id), eq(s.newsReceipts.userId, ctx.user.id)))
    .orderBy(desc(s.news.publishedAt));
  return rows.filter(({ news }) => {
    if (news.module && !canReadModule(ctx.modules[news.module as ModuleKey])) return false;
    if (news.requiredPermission && !can(ctx, news.requiredPermission as PermissionKey)) return false;
    return true;
  });
}

const present = ({ news, receipt }: { news: typeof s.news.$inferSelect; receipt: typeof s.newsReceipts.$inferSelect | null }) => ({
  id: news.id,
  title: news.title,
  summary: news.summary,
  benefit: news.benefit,
  version: news.version,
  publishedAt: news.publishedAt,
  module: news.module,
  targetPath: news.targetPath,
  tourId: news.tourId,
  state: receipt?.action ?? null,
});

export async function newsRoutes(app: FastifyInstance) {
  app.get("/api/news", async (req) => {
    const ctx = ctxOf(req);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      const rows = await visibleNews(tx, ctx);
      return { items: rows.map(present), unread: rows.filter((r) => !r.receipt || r.receipt.action === "later").length };
    });
  });

  /** Novidades para apresentar logo após o login. */
  app.get("/api/news/pending", async (req) => {
    const ctx = ctxOf(req);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      const now = new Date();
      const rows = (await visibleNews(tx, ctx)).filter(({ news, receipt }) => {
        if (news.showToExistingUsersOnly && news.publishedAt && ctx.user.createdAt >= news.publishedAt) return false;
        return shouldShowAtLogin(
          { action: (receipt?.action as never) ?? null, postponeCount: receipt?.postponeCount ?? 0, updatedAt: receipt?.updatedAt.toISOString() ?? null },
          now,
        );
      });
      return { items: rows.slice(0, NEWS_MAX_AT_LOGIN).map(present), more: Math.max(0, rows.length - NEWS_MAX_AT_LOGIN) };
    });
  });

  app.post<{ Params: { id: string } }>("/api/news/:id/receipt", { config: { allowReadOnly: true } }, async (req) => {
    const ctx = ctxOf(req);
    const { action } = parse(newsReceiptSchema, req.body);
    return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.id }, async (tx) => {
      const visible = await visibleNews(tx, ctx);
      const item = visible.find((r) => r.news.id === req.params.id);
      if (!item) throw notFound("Novidade");
      const current = item.receipt;
      // "Ver depois" nunca rebaixa uma novidade já vista, aberta ou dispensada.
      if (current && action === "later" && current.action !== "later") return { ok: true };
      // "Visto" não rebaixa "aberto" nem "dispensado".
      if (current && action === "seen" && (current.action === "opened" || current.action === "dismissed")) return { ok: true };
      const postponeCount = (current?.postponeCount ?? 0) + (action === "later" ? 1 : 0);
      await tx
        .insert(s.newsReceipts)
        .values({ userId: ctx.user.id, newsId: req.params.id, action, postponeCount })
        .onConflictDoUpdate({
          target: [s.newsReceipts.userId, s.newsReceipts.newsId],
          set: { action, postponeCount, updatedAt: new Date() },
        });
      return { ok: true };
    });
  });
}
