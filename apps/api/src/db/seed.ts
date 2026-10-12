/**
 * Dados de demonstração para desenvolvimento e testes manuais.
 * NÃO use em produção. Senhas fixas apenas para ambiente local.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSearch } from "@clinica/shared";
import { and, eq, sql } from "drizzle-orm";
import { provisionTenant } from "../modules/admin/provisioning";
import { hashPassword } from "../lib/security";
import { adminDb, closePools, type DbOrTx } from "./client";
import * as s from "./schema";

export const DEMO_PASSWORD = "Senha@123";

const PLANS = [
  {
    code: "essencial",
    name: "Essencial",
    description: "Agenda e cadastro de clientes para começar.",
    monthlyPriceCents: 14900,
    modules: ["core", "agenda"],
    limits: { units: 1, users: 5, clients: 2000, storageMb: 2048 },
  },
  {
    code: "profissional",
    name: "Profissional",
    description: "Agenda, prontuário e financeiro para a clínica em crescimento.",
    monthlyPriceCents: 29900,
    modules: ["core", "agenda", "prontuario", "financeiro"],
    limits: { units: 3, users: 15, clients: null, storageMb: 10240 },
  },
  {
    code: "completo",
    name: "Completo",
    description: "Todos os módulos disponíveis, várias unidades.",
    monthlyPriceCents: 49900,
    modules: ["core", "agenda", "prontuario", "financeiro", "estoque", "crm", "relatorios"],
    limits: { units: null, users: null, clients: null, storageMb: 51200 },
  },
];

async function upsertUser(db: DbOrTx, name: string, email: string) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const [u] = await db
    .insert(s.users)
    .values({ name, email, passwordHash })
    .onConflictDoUpdate({ target: s.users.email, set: { name, passwordHash } })
    .returning();
  return u!;
}

async function addMember(db: DbOrTx, tenantId: string, userId: string, roleTemplate: string, unitId: string | null, opts: { owner?: boolean; jobTitle?: string } = {}) {
  const [m] = await db
    .insert(s.memberships)
    .values({ tenantId, userId, isOwner: opts.owner ?? false, jobTitle: opts.jobTitle ?? null })
    .returning();
  const [role] = await db.select().from(s.roles).where(and(eq(s.roles.tenantId, tenantId), eq(s.roles.templateKey, roleTemplate)));
  await db.insert(s.membershipRoles).values({ tenantId, membershipId: m!.id, roleId: role!.id, unitId });
  return m!;
}

const FIRST = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Mariana", "Natália", "Patrícia", "Renata", "Sofia", "Tatiane", "Vanessa", "Bruno", "Carlos", "Diego", "Rafael"];
const LAST = ["Silva", "Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Araújo", "Ribeiro", "Carvalho", "Gomes", "Martins"];
const TAGS = ["VIP", "Pacote", "Retorno", "Indicação"];
const ORIGINS = ["indicacao", "instagram", "google", "whatsapp", "passou_na_frente"];

async function seedClients(db: DbOrTx, tenantId: string, unitIds: string[], createdBy: string, n: number, offset = 0) {
  const values = Array.from({ length: n }, (_, i) => {
    const k = i + offset;
    const fullName = `${FIRST[k % FIRST.length]} ${LAST[(k * 7) % LAST.length]} ${LAST[(k * 3 + 1) % LAST.length]}`;
    const month = ((k * 5) % 12) + 1;
    const day = ((k * 11) % 27) + 1;
    return {
      tenantId,
      fullName,
      phone: `119${String(80000000 + k * 7919).slice(0, 8)}`,
      phoneIsWhatsapp: k % 5 !== 0,
      email: k % 3 === 0 ? null : `${normalizeSearch(fullName).replace(/\s+/g, ".")}${k}@exemplo.com`,
      birthDate: k % 4 === 0 ? null : `${1960 + (k % 40)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      origin: ORIGINS[k % ORIGINS.length]!,
      preferredUnitId: unitIds[k % unitIds.length]!,
      tags: k % 4 === 0 ? [TAGS[k % TAGS.length]!] : [],
      status: k % 13 === 0 ? "inactive" : "active",
      searchText: normalizeSearch(fullName),
      createdBy,
      updatedBy: createdBy,
    };
  });
  await db.insert(s.clients).values(values);
}

export async function seed() {
  await adminDb.transaction(async (tx) => {
    const [{ n }] = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from plans`)).rows as [{ n: number }];
    if (n > 0) {
      console.log("Banco já possui dados. Seed ignorado (use um banco vazio).");
      return;
    }

    const plans = await tx.insert(s.plans).values(PLANS).returning();
    const plan = (code: string) => plans.find((p) => p.code === code)!;

    await tx.insert(s.platformUsers).values({
      name: "Suporte da Plataforma",
      email: "admin@plataforma.local",
      passwordHash: await hashPassword(DEMO_PASSWORD),
    });

    // Empresa 1: plano Completo, duas unidades
    const a = await provisionTenant(tx, {
      name: "Clínica Bella Pele",
      document: "11222333000181",
      planId: plan("completo").id,
      trialDays: 0,
      firstUnitName: "Unidade Centro",
      owner: { name: "Ana Paula Ribeiro", email: "ana@bellapele.com.br" },
    });
    await tx.update(s.invites).set({ revokedAt: new Date() }).where(eq(s.invites.tenantId, a.tenant.id));
    const [unit2] = await tx.insert(s.units).values({ tenantId: a.tenant.id, name: "Unidade Jardins" }).returning();

    const owner = await upsertUser(tx, "Ana Paula Ribeiro", "ana@bellapele.com.br");
    await addMember(tx, a.tenant.id, owner.id, "admin", null, { owner: true, jobTitle: "Proprietária" });
    const sec = await upsertUser(tx, "Carla Mendes", "carla@bellapele.com.br");
    await addMember(tx, a.tenant.id, sec.id, "recepcao", a.unit.id, { jobTitle: "Secretária" });
    const prof = await upsertUser(tx, "Dra. Júlia Castro", "julia@bellapele.com.br");
    await addMember(tx, a.tenant.id, prof.id, "profissional", null, { jobTitle: "Biomédica esteta" });
    const fin = await upsertUser(tx, "Marcos Lima", "marcos@bellapele.com.br");
    await addMember(tx, a.tenant.id, fin.id, "financeiro", null, { jobTitle: "Financeiro" });
    const com = await upsertUser(tx, "Paula Nogueira", "paula@bellapele.com.br");
    await addMember(tx, a.tenant.id, com.id, "comercial", unit2!.id, { jobTitle: "Consultora" });
    const ges = await upsertUser(tx, "Roberto Dias", "roberto@bellapele.com.br");
    await addMember(tx, a.tenant.id, ges.id, "gestor", null, { jobTitle: "Gerente" });

    await seedClients(tx, a.tenant.id, [a.unit.id, unit2!.id], sec.id, 60);

    // Empresa 2: plano Essencial — usada para comprovar isolamento e módulos não contratados
    const b = await provisionTenant(tx, {
      name: "Estética Aurora",
      document: null,
      planId: plan("essencial").id,
      trialDays: 14,
      firstUnitName: "Unidade principal",
      owner: { name: "Bianca Torres", email: "bianca@aurora.com.br" },
    });
    await tx.update(s.invites).set({ revokedAt: new Date() }).where(eq(s.invites.tenantId, b.tenant.id));
    const ownerB = await upsertUser(tx, "Bianca Torres", "bianca@aurora.com.br");
    await addMember(tx, b.tenant.id, ownerB.id, "admin", null, { owner: true, jobTitle: "Proprietária" });
    await seedClients(tx, b.tenant.id, [b.unit.id], ownerB.id, 8, 100);

    // Quem trabalha nas duas clínicas escolhe a empresa após o login.
    await addMember(tx, b.tenant.id, prof.id, "profissional", null, { jobTitle: "Biomédica esteta" });

    const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000);
    await tx.insert(s.news).values([
      {
        title: "Busca rápida de clientes",
        summary: "Agora você encontra clientes digitando parte do nome ou do telefone, sem acentos.",
        benefit: "Atenda o telefone e encontre a ficha em segundos.",
        version: "1.1",
        status: "published",
        publishedAt: daysAgo(1),
        module: "core",
        requiredPermission: "clients.read",
        targetPath: "/clientes",
        tourId: "update.clients.quick-search",
        showToExistingUsersOnly: false,
      },
      {
        title: "Atalho Ctrl+K",
        summary: "Pressione Ctrl+K (ou toque na lupa) para ir a qualquer tela ou cliente.",
        benefit: "Menos cliques para as tarefas do dia a dia.",
        version: "1.1",
        status: "published",
        publishedAt: daysAgo(1),
        module: null,
        requiredPermission: null,
        targetPath: "/",
        tourId: "update.home.command-palette",
        showToExistingUsersOnly: false,
      },
    ]);

    console.log("Seed concluído.");
    console.log(`Senha de todos os usuários de demonstração: ${DEMO_PASSWORD}`);
    console.log("Painel do SaaS: admin@plataforma.local");
    console.log("Clínica Bella Pele: ana@ (responsável), carla@ (secretária), julia@ (profissional, também na Aurora), marcos@ (financeiro), paula@ (comercial), roberto@ (gestor) — @bellapele.com.br");
    console.log("Estética Aurora: bianca@aurora.com.br");
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed()
    .then(closePools)
    .catch(async (err) => {
      console.error(err);
      await closePools();
      process.exit(1);
    });
}
