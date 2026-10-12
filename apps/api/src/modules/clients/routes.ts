import {
  CLIENT_ORIGIN_LABEL,
  COMMUNICATION_CHANNELS,
  clientBulkSchema,
  clientInputSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  maskCpf,
  normalizeSearch,
  onlyDigits,
  type ClientInputParsed,
} from "@clinica/shared";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ctxOf } from "../../app";
import { withTenant, type Tx } from "../../db/client";
import * as s from "../../db/schema";
import { can, type ClinicContext } from "../../lib/access";
import { audit, diffFields } from "../../lib/audit";
import { AppError, conflict, notFound } from "../../lib/errors";
import { idempotent } from "../../lib/idempotency";
import { parse } from "../../lib/validate";
import { assertWithinLimit } from "../settings/limits";

type ClientRow = typeof s.clients.$inferSelect;

export function buildSearchText(c: Pick<ClientInputParsed, "fullName" | "socialName" | "email">): string {
  return normalizeSearch([c.fullName, c.socialName, c.email].filter(Boolean).join(" "));
}

function present(row: ClientRow, ctx: ClinicContext) {
  const showDocs = can(ctx, "clients.documents.read");
  return {
    id: row.id,
    fullName: row.fullName,
    socialName: row.socialName,
    phone: row.phone,
    phoneIsWhatsapp: row.phoneIsWhatsapp,
    email: row.email,
    birthDate: row.birthDate,
    cpf: showDocs ? row.cpf : maskCpf(row.cpf),
    cpfMasked: !showDocs && Boolean(row.cpf),
    origin: row.origin,
    originLabel: row.origin ? (CLIENT_ORIGIN_LABEL as Record<string, string>)[row.origin] ?? row.origin : null,
    preferredUnitId: row.preferredUnitId,
    notes: row.notes,
    tags: row.tags,
    address: row.address,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function findDuplicates(tx: Tx, input: { phone?: string | null; cpf?: string | null; fullName?: string; birthDate?: string | null }, excludeId?: string) {
  const conds: SQL[] = [];
  if (input.phone) conds.push(eq(s.clients.phone, onlyDigits(input.phone)));
  if (input.cpf) conds.push(eq(s.clients.cpf, onlyDigits(input.cpf)));
  if (input.fullName && input.birthDate) {
    conds.push(
      and(sql`${s.clients.searchText} like ${normalizeSearch(input.fullName) + "%"}`, eq(s.clients.birthDate, input.birthDate))!,
    );
  }
  if (!conds.length) return [];
  const where = excludeId ? and(or(...conds), ne(s.clients.id, excludeId)) : or(...conds);
  const rows = await tx.select().from(s.clients).where(where).limit(5);
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    phone: r.phone,
    birthDate: r.birthDate,
    status: r.status,
    matchedBy: [
      input.cpf && r.cpf === onlyDigits(input.cpf) ? "cpf" : null,
      input.phone && r.phone === onlyDigits(input.phone) ? "phone" : null,
      input.birthDate && r.birthDate === input.birthDate ? "name_birth" : null,
    ].filter(Boolean) as string[],
  }));
}

async function recordConsents(tx: Tx, ctx: ClinicContext, clientId: string, consents: ClientInputParsed["consents"], onlyChanges: boolean) {
  const current = await currentConsents(tx, clientId);
  const rows = COMMUNICATION_CHANNELS.filter((ch) => !onlyChanges || current[ch]?.granted !== consents[ch]).map((channel) => ({
    tenantId: ctx.tenant.id,
    clientId,
    channel,
    granted: consents[channel],
    source: "cadastro",
    recordedBy: ctx.user.id,
  }));
  if (rows.length) await tx.insert(s.clientConsents).values(rows);
  return rows.map((r) => r.channel);
}

async function currentConsents(tx: Tx, clientId: string) {
  const rows = await tx
    .selectDistinctOn([s.clientConsents.channel], {
      channel: s.clientConsents.channel,
      granted: s.clientConsents.granted,
      recordedAt: s.clientConsents.recordedAt,
      recordedBy: s.users.name,
    })
    .from(s.clientConsents)
    .leftJoin(s.users, eq(s.users.id, s.clientConsents.recordedBy))
    .where(eq(s.clientConsents.clientId, clientId))
    .orderBy(s.clientConsents.channel, desc(s.clientConsents.recordedAt));
  return Object.fromEntries(rows.map((r) => [r.channel, r])) as Record<string, (typeof rows)[number] | undefined>;
}

async function assertUnit(tx: Tx, unitId: string | null) {
  if (!unitId) return;
  const [u] = await tx.select({ id: s.units.id }).from(s.units).where(eq(s.units.id, unitId));
  if (!u) throw new AppError(422, "validation", "Confira os campos destacados.", { preferredUnitId: "Unidade inválida." });
}

export async function clientRoutes(app: FastifyInstance) {
  const scope = (ctx: ClinicContext) => ({ tenantId: ctx.tenant.id, userId: ctx.user.id });

  app.get("/api/clients", { config: { permission: "clients.read" } }, async (req) => {
    const ctx = ctxOf(req);
    const q = parse(clientListQuerySchema, req.query);
    return withTenant(scope(ctx), async (tx) => {
      const conds: SQL[] = [];
      if (q.status !== "all") conds.push(eq(s.clients.status, q.status));
      if (q.tag) conds.push(sql`${q.tag} = any(${s.clients.tags})`);
      if (q.unitId) conds.push(eq(s.clients.preferredUnitId, q.unitId));
      if (q.birthdayMonth) conds.push(sql`extract(month from ${s.clients.birthDate}) = ${q.birthdayMonth}`);
      if (q.q) {
        const digits = onlyDigits(q.q);
        const text = normalizeSearch(q.q);
        const textMatch = ilike(s.clients.searchText, `%${text}%`);
        if (digits.length >= 3 && digits.length === q.q.replace(/[\s().\-/]/g, "").length) {
          const byDigits: SQL[] = [ilike(s.clients.phone, `%${digits}%`)];
          if (digits.length === 11 && can(ctx, "clients.documents.read")) byDigits.push(eq(s.clients.cpf, digits));
          conds.push(or(...byDigits)!);
        } else {
          conds.push(textMatch);
        }
      }
      const where = conds.length ? and(...conds) : undefined;
      const order =
        q.sort === "-created" ? [desc(s.clients.createdAt)] : q.sort === "created" ? [asc(s.clients.createdAt)] : [asc(s.clients.searchText)];
      const [rows, [total], tags] = await Promise.all([
        tx.select().from(s.clients).where(where).orderBy(...order).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
        tx.select({ n: count() }).from(s.clients).where(where),
        tx.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from clients order by 1 limit 200`),
      ]);
      return {
        items: rows.map((r) => present(r, ctx)),
        total: total?.n ?? 0,
        page: q.page,
        pageSize: q.pageSize,
        availableTags: tags.rows.map((t) => t.tag),
      };
    });
  });

  app.get("/api/clients/duplicates", { config: { permission: "clients.read" } }, async (req) => {
    const ctx = ctxOf(req);
    const q = req.query as { phone?: string; cpf?: string; fullName?: string; birthDate?: string; excludeId?: string };
    return withTenant(scope(ctx), async (tx) => ({
      candidates: await findDuplicates(
        tx,
        {
          phone: q.phone && onlyDigits(q.phone).length >= 10 ? q.phone : null,
          cpf: q.cpf && onlyDigits(q.cpf).length === 11 ? q.cpf : null,
          fullName: q.fullName,
          birthDate: q.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(q.birthDate) ? q.birthDate : null,
        },
        q.excludeId && /^[0-9a-f-]{36}$/.test(q.excludeId) ? q.excludeId : undefined,
      ),
    }));
  });

  app.post("/api/clients", { config: { permission: "clients.create" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const input = parse(clientInputSchema, req.body);
    const result = await withTenant(scope(ctx), (tx) =>
      idempotent(tx, req, ctx, "clients.create", async () => {
        await assertUnit(tx, input.preferredUnitId);
        await assertWithinLimit(tx, ctx, "clients");
        const dups = await findDuplicates(tx, input);
        const cpfDup = dups.find((d) => d.matchedBy.includes("cpf"));
        if (cpfDup) {
          throw conflict("duplicate_cpf", "Já existe um cliente com este CPF.", { candidates: [cpfDup] });
        }
        if (dups.length && !input.confirmDuplicate) {
          throw conflict("possible_duplicate", "Encontramos um cadastro parecido. Confira antes de criar outro.", { candidates: dups });
        }
        const [row] = await tx
          .insert(s.clients)
          .values({
            tenantId: ctx.tenant.id,
            fullName: input.fullName,
            socialName: input.socialName,
            phone: input.phone,
            phoneIsWhatsapp: input.phoneIsWhatsapp,
            email: input.email,
            birthDate: input.birthDate,
            cpf: input.cpf,
            origin: input.origin,
            preferredUnitId: input.preferredUnitId,
            notes: input.notes,
            tags: [...new Set(input.tags)],
            address: input.address,
            searchText: buildSearchText(input),
            createdBy: ctx.user.id,
            updatedBy: ctx.user.id,
          })
          .returning();
        await recordConsents(tx, ctx, row!.id, input.consents, false);
        await audit(tx, ctx, {
          action: "client.created",
          entityType: "client",
          entityId: row!.id,
          summary: `Cliente ${row!.fullName} cadastrado.`,
          changes: input.confirmDuplicate && dups.length ? { duplicidadeConfirmada: dups.map((d) => d.id) } : undefined,
        });
        return { statusCode: 201, body: present(row!, ctx) };
      }),
    );
    if (result.replayed) reply.header("Idempotent-Replayed", "true");
    return reply.status(result.statusCode).send(result.body);
  });

  app.get<{ Params: { id: string } }>("/api/clients/:id", { config: { permission: "clients.read" } }, async (req) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      const [row] = await tx.select().from(s.clients).where(eq(s.clients.id, req.params.id));
      if (!row) throw notFound("Cliente");
      const consents = await currentConsents(tx, row.id);
      const activity = await tx
        .select({ id: s.auditEvents.id, summary: s.auditEvents.summary, actorName: s.auditEvents.actorName, createdAt: s.auditEvents.createdAt, action: s.auditEvents.action })
        .from(s.auditEvents)
        .where(and(eq(s.auditEvents.entityType, "client"), eq(s.auditEvents.entityId, row.id)))
        .orderBy(desc(s.auditEvents.createdAt))
        .limit(20);
      const [createdBy] = row.createdBy
        ? await tx.select({ name: s.users.name }).from(s.users).where(eq(s.users.id, row.createdBy))
        : [];
      return {
        client: present(row, ctx),
        createdByName: createdBy?.name ?? null,
        consents: COMMUNICATION_CHANNELS.map((ch) => ({
          channel: ch,
          granted: consents[ch]?.granted ?? false,
          recordedAt: consents[ch]?.recordedAt ?? null,
          recordedBy: consents[ch]?.recordedBy ?? null,
        })),
        activity,
      };
    });
  });

  app.put<{ Params: { id: string } }>("/api/clients/:id", { config: { permission: "clients.update" } }, async (req) => {
    const ctx = ctxOf(req);
    const input = parse(clientUpdateSchema, req.body);
    return withTenant(scope(ctx), async (tx) => {
      const [before] = await tx.select().from(s.clients).where(eq(s.clients.id, req.params.id)).for("update");
      if (!before) throw notFound("Cliente");
      if (before.version !== input.version) {
        throw conflict("stale", "Outra pessoa alterou este cadastro enquanto você editava. Recarregue para ver a versão atual.");
      }
      await assertUnit(tx, input.preferredUnitId);
      // Sem permissão para ver o CPF completo, o valor mascarado volta do formulário: mantém o atual.
      const canDocs = can(ctx, "clients.documents.read");
      const cpf = canDocs ? input.cpf : before.cpf;
      if (cpf && cpf !== before.cpf) {
        const dup = (await findDuplicates(tx, { cpf }, before.id)).find((d) => d.matchedBy.includes("cpf"));
        if (dup) throw conflict("duplicate_cpf", "Já existe um cliente com este CPF.", { candidates: [dup] });
      }
      const next = {
        fullName: input.fullName,
        socialName: input.socialName,
        phone: input.phone,
        phoneIsWhatsapp: input.phoneIsWhatsapp,
        email: input.email,
        birthDate: input.birthDate,
        cpf,
        origin: input.origin,
        preferredUnitId: input.preferredUnitId,
        notes: input.notes,
        tags: [...new Set(input.tags)],
        address: input.address,
      };
      const [row] = await tx
        .update(s.clients)
        .set({ ...next, searchText: buildSearchText(input), version: before.version + 1, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(eq(s.clients.id, before.id))
        .returning();
      const changedConsents = await recordConsents(tx, ctx, before.id, input.consents, true);
      const changes = diffFields(before as unknown as Record<string, unknown>, next, ["cpf", "notes", "address", "birthDate"]);
      if (changedConsents.length) changes.consentimentos = changedConsents;
      if (Object.keys(changes).length) {
        await audit(tx, ctx, {
          action: "client.updated",
          entityType: "client",
          entityId: before.id,
          summary: `Cadastro de ${row!.fullName} atualizado.`,
          changes,
        });
      }
      return present(row!, ctx);
    });
  });

  const setStatus = (status: "active" | "inactive") => async (req: { params: { id: string } } & Parameters<typeof ctxOf>[0]) => {
    const ctx = ctxOf(req);
    return withTenant(scope(ctx), async (tx) => {
      if (status === "active") await assertWithinLimit(tx, ctx, "clients");
      const [row] = await tx
        .update(s.clients)
        .set({ status, version: sql`${s.clients.version} + 1`, updatedBy: ctx.user.id, updatedAt: new Date() })
        .where(and(eq(s.clients.id, req.params.id), ne(s.clients.status, status)))
        .returning();
      if (!row) {
        const [exists] = await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.id, req.params.id));
        if (!exists) throw notFound("Cliente");
        return { ok: true, changed: false };
      }
      await audit(tx, ctx, {
        action: status === "active" ? "client.activated" : "client.deactivated",
        entityType: "client",
        entityId: row.id,
        summary: `Cliente ${row.fullName} ${status === "active" ? "reativado" : "inativado"}.`,
      });
      return { ok: true, changed: true };
    });
  };
  app.post<{ Params: { id: string } }>("/api/clients/:id/deactivate", { config: { permission: "clients.deactivate" } }, setStatus("inactive"));
  app.post<{ Params: { id: string } }>("/api/clients/:id/activate", { config: { permission: "clients.deactivate" } }, setStatus("active"));

  app.post("/api/clients/bulk", { config: { permission: "clients.update" } }, async (req) => {
    const ctx = ctxOf(req);
    const body = parse(clientBulkSchema, req.body);
    if ((body.action === "activate" || body.action === "deactivate") && !can(ctx, "clients.deactivate")) {
      throw new AppError(403, "forbidden", "Você não tem permissão para inativar ou reativar clientes.");
    }
    if ((body.action === "add_tag" || body.action === "remove_tag") && !body.tag) {
      throw new AppError(422, "validation", "Informe a etiqueta.", { tag: "Informe a etiqueta." });
    }
    return withTenant(scope(ctx), async (tx) => {
      const ids = [...new Set(body.ids)];
      const tag = body.tag ?? "";
      const setByAction = {
        activate: { status: "active" },
        deactivate: { status: "inactive" },
        add_tag: { tags: sql`array(select distinct unnest(array_append(${s.clients.tags}, ${tag}::text)))` },
        remove_tag: { tags: sql`array_remove(${s.clients.tags}, ${tag}::text)` },
      }[body.action];
      if (body.action === "activate") await assertWithinLimit(tx, ctx, "clients", ids.length);
      const updated = await tx
        .update(s.clients)
        .set({ ...setByAction, version: sql`${s.clients.version} + 1`, updatedBy: ctx.user.id, updatedAt: new Date() } as never)
        .where(inArray(s.clients.id, ids))
        .returning({ id: s.clients.id });
      const label = {
        activate: "reativados",
        deactivate: "inativados",
        add_tag: `marcados com a etiqueta "${tag}"`,
        remove_tag: `sem a etiqueta "${tag}"`,
      }[body.action];
      await audit(tx, ctx, {
        action: `client.bulk_${body.action}`,
        entityType: "client",
        summary: `${updated.length} cliente(s) ${label} em lote.`,
        changes: { ids: updated.map((u) => u.id) },
      });
      return { updated: updated.length };
    });
  });

  app.get("/api/clients/export.csv", { config: { permission: "clients.export" } }, async (req, reply) => {
    const ctx = ctxOf(req);
    const showDocs = can(ctx, "clients.documents.read");
    const csv = await withTenant(scope(ctx), async (tx) => {
      const rows = await tx.select().from(s.clients).orderBy(asc(s.clients.searchText));
      await audit(tx, ctx, {
        action: "client.exported",
        entityType: "client",
        summary: `Lista de clientes exportada (${rows.length} registros).`,
      });
      const header = ["Nome", "Nome social", "Telefone", "WhatsApp", "E-mail", "Nascimento", "CPF", "Origem", "Etiquetas", "Situação", "Cadastrado em"];
      const esc = (v: unknown) => {
        const str = v === null || v === undefined ? "" : String(v);
        // Evita injeção de fórmulas em planilhas.
        const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
        return `"${safe.replace(/"/g, '""')}"`;
      };
      const lines = rows.map((r) =>
        [
          r.fullName,
          r.socialName,
          r.phone,
          r.phoneIsWhatsapp ? "Sim" : "Não",
          r.email,
          r.birthDate,
          showDocs ? r.cpf : maskCpf(r.cpf),
          r.origin ? (CLIENT_ORIGIN_LABEL as Record<string, string>)[r.origin] : "",
          r.tags.join(", "),
          r.status === "active" ? "Ativo" : "Inativo",
          r.createdAt.toISOString().slice(0, 10),
        ]
          .map(esc)
          .join(";"),
      );
      return "﻿" + [header.map(esc).join(";"), ...lines].join("\r\n");
    });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="clientes.csv"`);
    return csv;
  });
}
