import { and, eq, gt } from "drizzle-orm";
import { adminDb } from "../../db/client";
import * as s from "../../db/schema";
import { hashToken } from "../../lib/security";

export interface PlatformContext {
  sessionId: string;
  user: { id: string; name: string; email: string };
}

export async function loadPlatformContext(token: string): Promise<PlatformContext | null> {
  const [row] = await adminDb
    .select({ sessionId: s.platformSessions.id, user: s.platformUsers })
    .from(s.platformSessions)
    .innerJoin(s.platformUsers, eq(s.platformUsers.id, s.platformSessions.platformUserId))
    .where(and(eq(s.platformSessions.tokenHash, hashToken(token)), gt(s.platformSessions.expiresAt, new Date())));
  if (!row) return null;
  return { sessionId: row.sessionId, user: { id: row.user.id, name: row.user.name, email: row.user.email } };
}
