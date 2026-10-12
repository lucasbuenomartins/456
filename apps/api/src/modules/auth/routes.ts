import { acceptInviteSchema, loginSchema } from "@clinica/shared";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { config } from "../../config";
import { adminDb } from "../../db/client";
import * as s from "../../db/schema";
import { AppError } from "../../lib/errors";
import { burnPasswordCheck, hashPassword, hashToken, newToken, verifyPassword } from "../../lib/security";
import { parse } from "../../lib/validate";

export const SESSION_COOKIE = "session";

export interface BareSession {
  sessionId: string;
  userId: string;
  userName: string;
}

const authRateLimit = { rateLimit: { max: config.authRateLimit, timeWindow: "1 minute" } };

/** Sessão válida, ainda sem empresa escolhida (usuário que trabalha em mais de uma clínica). */
export async function loadBareSession(token: string): Promise<BareSession | null> {
  const [row] = await adminDb
    .select({ sessionId: s.sessions.id, userId: s.users.id, userName: s.users.name, isActive: s.users.isActive })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.tokenHash, hashToken(token)), gt(s.sessions.expiresAt, new Date())));
  if (!row || !row.isActive) return null;
  return { sessionId: row.sessionId, userId: row.userId, userName: row.userName };
}

/** Empresas em que o usuário pode entrar (vínculo ativo e empresa não bloqueada). */
async function availableTenants(userId: string) {
  const rows = await adminDb
    .select({ id: s.tenants.id, name: s.tenants.name, status: s.tenants.status, dataAvailableUntil: s.tenants.dataAvailableUntil })
    .from(s.memberships)
    .innerJoin(s.tenants, eq(s.tenants.id, s.memberships.tenantId))
    .where(and(eq(s.memberships.userId, userId), eq(s.memberships.status, "active")));
  const now = new Date();
  return rows
    .filter((t) => t.status !== "cancelled" || (t.dataAvailableUntil && t.dataAvailableUntil > now))
    .map(({ id, name, status }) => ({ id, name, status }));
}

async function firstUnitFor(tenantId: string, userId: string): Promise<string | null> {
  const [m] = await adminDb
    .select({ unitId: s.membershipRoles.unitId })
    .from(s.memberships)
    .innerJoin(s.membershipRoles, eq(s.membershipRoles.membershipId, s.memberships.id))
    .where(and(eq(s.memberships.tenantId, tenantId), eq(s.memberships.userId, userId)))
    .limit(1);
  if (m?.unitId) return m.unitId;
  const [unit] = await adminDb
    .select({ id: s.units.id })
    .from(s.units)
    .where(and(eq(s.units.tenantId, tenantId), eq(s.units.isActive, true)))
    .orderBy(s.units.createdAt)
    .limit(1);
  return unit?.id ?? null;
}

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: config.sessionDays * 24 * 3600,
  });
}

export async function createSession(userId: string, tenantId: string | null, userAgent?: string) {
  const token = newToken();
  const unitId = tenantId ? await firstUnitFor(tenantId, userId) : null;
  await adminDb.insert(s.sessions).values({
    tokenHash: hashToken(token),
    userId,
    tenantId,
    unitId,
    userAgent: userAgent?.slice(0, 300),
    expiresAt: new Date(Date.now() + config.sessionDays * 24 * 3600 * 1000),
  });
  return token;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/login", { config: { public: true, ...authRateLimit } }, async (req, reply) => {
    const body = parse(loginSchema, req.body);
    const [user] = await adminDb.select().from(s.users).where(eq(s.users.email, body.email));
    if (!user) {
      await burnPasswordCheck(body.password);
      throw new AppError(401, "invalid_credentials", "E-mail ou senha incorretos.");
    }
    if (!(await verifyPassword(user.passwordHash, body.password)) || !user.isActive) {
      throw new AppError(401, "invalid_credentials", "E-mail ou senha incorretos.");
    }
    const tenants = await availableTenants(user.id);
    if (tenants.length === 0) {
      throw new AppError(
        403,
        "no_active_tenant",
        "Seu acesso não está ativo em nenhuma clínica. Fale com o responsável pela clínica.",
      );
    }
    const tenantId = tenants.length === 1 ? tenants[0]!.id : null;
    const token = await createSession(user.id, tenantId, req.headers["user-agent"]);
    await adminDb.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
    setSessionCookie(reply, token);
    return { needsTenant: tenantId === null, tenants };
  });

  app.get("/api/auth/tenants", { config: { realm: "session" } }, async (req) => {
    return { tenants: await availableTenants(req.bareSession!.userId) };
  });

  app.post("/api/auth/select-tenant", { config: { realm: "session" } }, async (req) => {
    const { tenantId } = (req.body ?? {}) as { tenantId?: string };
    const tenants = await availableTenants(req.bareSession!.userId);
    if (!tenantId || !tenants.some((t) => t.id === tenantId)) {
      throw new AppError(403, "forbidden", "Você não tem acesso a esta clínica.");
    }
    const unitId = await firstUnitFor(tenantId, req.bareSession!.userId);
    await adminDb.update(s.sessions).set({ tenantId, unitId }).where(eq(s.sessions.id, req.bareSession!.sessionId));
    return { ok: true };
  });

  app.post("/api/auth/logout", { config: { public: true } }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await adminDb.delete(s.sessions).where(eq(s.sessions.tokenHash, hashToken(token)));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // ----- Convites -----

  async function findInvite(token: string) {
    const [row] = await adminDb
      .select({ invite: s.invites, tenantName: s.tenants.name })
      .from(s.invites)
      .innerJoin(s.tenants, eq(s.tenants.id, s.invites.tenantId))
      .where(and(eq(s.invites.tokenHash, hashToken(token)), isNull(s.invites.acceptedAt), isNull(s.invites.revokedAt)));
    if (!row || row.invite.expiresAt < new Date()) {
      throw new AppError(
        404,
        "invite_invalid",
        "Este convite não é mais válido. Peça um novo convite ao responsável pela clínica.",
      );
    }
    return row;
  }

  app.get<{ Params: { token: string } }>(
    "/api/invites/:token",
    { config: { public: true, ...authRateLimit } },
    async (req) => {
      const { invite, tenantName } = await findInvite(req.params.token);
      const [existing] = await adminDb.select({ id: s.users.id, hasPassword: s.users.passwordHash }).from(s.users).where(eq(s.users.email, invite.email));
      return {
        tenantName,
        name: invite.name,
        email: invite.email,
        existingAccount: Boolean(existing?.hasPassword),
      };
    },
  );

  app.post("/api/invites/accept", { config: { public: true, ...authRateLimit } }, async (req, reply) => {
    const body = parse(acceptInviteSchema, req.body);
    const { invite } = await findInvite(body.token);

    const userId = await adminDb.transaction(async (tx) => {
      // Reserva o convite primeiro: aceitar duas vezes não cria vínculos duplicados.
      const claimed = await tx
        .update(s.invites)
        .set({ acceptedAt: new Date() })
        .where(and(eq(s.invites.id, invite.id), isNull(s.invites.acceptedAt)))
        .returning({ id: s.invites.id });
      if (claimed.length === 0) throw new AppError(409, "invite_used", "Este convite já foi aceito. Entre com seu e-mail e senha.");

      let [user] = await tx.select().from(s.users).where(eq(s.users.email, invite.email));
      if (user?.passwordHash) {
        // Quem já tem conta confirma a própria senha para vincular a nova clínica.
        if (!(await verifyPassword(user.passwordHash, body.password))) {
          throw new AppError(401, "invalid_credentials", "Você já tem uma conta com este e-mail. Use a mesma senha.", {
            password: "Senha incorreta para a conta existente.",
          });
        }
      } else if (user) {
        await tx.update(s.users).set({ name: body.name, passwordHash: await hashPassword(body.password) }).where(eq(s.users.id, user.id));
      } else {
        [user] = await tx
          .insert(s.users)
          .values({ name: body.name, email: invite.email, passwordHash: await hashPassword(body.password) })
          .returning();
      }
      const u = user!;

      const [membership] = await tx
        .insert(s.memberships)
        .values({ tenantId: invite.tenantId, userId: u.id, jobTitle: invite.jobTitle, status: "active", isOwner: invite.isOwner })
        .onConflictDoUpdate({
          target: [s.memberships.tenantId, s.memberships.userId],
          set: { status: "active", jobTitle: invite.jobTitle, updatedAt: new Date(), ...(invite.isOwner ? { isOwner: true } : {}) },
        })
        .returning();
      await tx.delete(s.membershipRoles).where(eq(s.membershipRoles.membershipId, membership!.id));
      if (invite.assignments.length) {
        await tx.insert(s.membershipRoles).values(
          invite.assignments.map((a) => ({ tenantId: invite.tenantId, membershipId: membership!.id, roleId: a.roleId, unitId: a.unitId })),
        );
      }
      await tx.insert(s.auditEvents).values({
        tenantId: invite.tenantId,
        actorKind: "user",
        actorId: u.id,
        actorName: u.name,
        action: "team.invite_accepted",
        entityType: "membership",
        entityId: membership!.id,
        summary: `${u.name} aceitou o convite e entrou na equipe.`,
      });
      return u.id;
    });

    const token = await createSession(userId, invite.tenantId, req.headers["user-agent"]);
    setSessionCookie(reply, token);
    return { ok: true };
  });
}
