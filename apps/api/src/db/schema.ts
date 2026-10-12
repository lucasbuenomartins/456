import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export type Address = {
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
};

export type PlanLimitsJson = {
  units: number | null;
  users: number | null;
  clients: number | null;
  storageMb: number | null;
};

// ---------------------------------------------------------------------------
// Painel do SaaS (sem tenant). Acessado apenas pela conexão administrativa.
// ---------------------------------------------------------------------------

export const platformUsers = pgTable("platform_users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const platformSessions = pgTable("platform_sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  platformUserId: uuid("platform_user_id")
    .notNull()
    .references(() => platformUsers.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const plans = pgTable("plans", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  monthlyPriceCents: integer("monthly_price_cents").notNull().default(0),
  modules: text("modules").array().notNull().default(sql`'{core}'::text[]`),
  limits: jsonb("limits").$type<PlanLimitsJson>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  document: text("document"),
  phone: text("phone"),
  email: text("email"),
  /** trial | active | suspended | cancelled */
  status: text("status").notNull().default("trial"),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  /** Até quando os dados ficam disponíveis para exportação após cancelamento. */
  dataAvailableUntil: timestamp("data_available_until", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenantModules = pgTable(
  "tenant_modules",
  {
    tenantId: tenantId(),
    module: text("module").notNull(),
    /** active | trial | read_only | disabled */
    status: text("status").notNull(),
    /** plan | addon */
    source: text("source").notNull().default("plan"),
    readOnlyUntil: timestamp("read_only_until", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.module] })],
);

export const tenantHistory = pgTable(
  "tenant_history",
  {
    id: id(),
    tenantId: tenantId(),
    /** created | status | plan | module */
    kind: text("kind").notNull(),
    subject: text("subject"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    reason: text("reason"),
    actorPlatformUserId: uuid("actor_platform_user_id").references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [index("tenant_history_tenant_idx").on(t.tenantId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Identidade e acesso
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    unitId: uuid("unit_id"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const units = pgTable(
  "units",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    phone: text("phone"),
    address: jsonb("address").$type<Address>().notNull().default({}),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("units_tenant_idx").on(t.tenantId), unique("units_tenant_id_uq").on(t.tenantId, t.id)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** active | disabled */
    status: text("status").notNull().default("active"),
    jobTitle: text("job_title"),
    isOwner: boolean("is_owner").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("memberships_tenant_user_uq").on(t.tenantId, t.userId)],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    description: text("description"),
    permissions: text("permissions").array().notNull().default(sql`'{}'::text[]`),
    templateKey: text("template_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("roles_tenant_name_uq").on(t.tenantId, t.name)],
);

export const membershipRoles = pgTable(
  "membership_roles",
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    /** null = todas as unidades */
    unitId: uuid("unit_id").references(() => units.id, { onDelete: "cascade" }),
  },
  (t) => [unique("membership_roles_uq").on(t.membershipId, t.roleId, t.unitId).nullsNotDistinct()],
);

export type InviteAssignment = { roleId: string; unitId: string | null };

export const invites = pgTable(
  "invites",
  {
    id: id(),
    tenantId: tenantId(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    jobTitle: text("job_title"),
    assignments: jsonb("assignments").$type<InviteAssignment[]>().notNull(),
    /** Convite do responsável pela conta, criado pelo painel do SaaS. */
    isOwner: boolean("is_owner").notNull().default(false),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("invites_tenant_idx").on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Clientes — identidade única em toda a plataforma
// ---------------------------------------------------------------------------

export const clients = pgTable(
  "clients",
  {
    id: id(),
    tenantId: tenantId(),
    fullName: text("full_name").notNull(),
    socialName: text("social_name"),
    phone: text("phone").notNull(),
    phoneIsWhatsapp: boolean("phone_is_whatsapp").notNull().default(true),
    email: text("email"),
    birthDate: date("birth_date"),
    cpf: text("cpf"),
    origin: text("origin"),
    preferredUnitId: uuid("preferred_unit_id").references(() => units.id, { onDelete: "set null" }),
    notes: text("notes"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    address: jsonb("address").$type<Address>().notNull().default({}),
    /** active | inactive */
    status: text("status").notNull().default("active"),
    /** Texto normalizado (sem acento, minúsculo) para busca rápida. */
    searchText: text("search_text").notNull().default(""),
    version: integer("version").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clients_tenant_cpf_uq").on(t.tenantId, t.cpf).where(sql`${t.cpf} is not null`),
    index("clients_tenant_phone_idx").on(t.tenantId, t.phone),
    index("clients_tenant_status_name_idx").on(t.tenantId, t.status, t.fullName),
    index("clients_search_trgm_idx").using("gin", sql`${t.searchText} gin_trgm_ops`),
  ],
);

/**
 * Histórico de consentimentos de comunicação comercial (append-only).
 * O estado atual é o registro mais recente por canal.
 * Consentimento de atendimento e de uso de imagem ficam no módulo de prontuário.
 */
export const clientConsents = pgTable(
  "client_consents",
  {
    id: id(),
    tenantId: tenantId(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    purpose: text("purpose").notNull().default("marketing"),
    granted: boolean("granted").notNull(),
    source: text("source").notNull().default("cadastro"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("client_consents_client_idx").on(t.clientId, t.channel, t.recordedAt)],
);

// ---------------------------------------------------------------------------
// Infraestrutura transversal
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    /** null para eventos do painel do SaaS sem empresa associada */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    /** user | platform | system */
    actorKind: text("actor_kind").notNull(),
    actorId: uuid("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    unitId: uuid("unit_id"),
    /** Frase legível, sem dados sensíveis. */
    summary: text("summary").notNull(),
    /** Campos alterados. Valores de campos sensíveis nunca são gravados. */
    changes: jsonb("changes").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_tenant_idx").on(t.tenantId, t.createdAt), index("audit_events_entity_idx").on(t.tenantId, t.entityType, t.entityId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    userId: uuid("user_id").notNull(),
    route: text("route").notNull(),
    statusCode: integer("status_code").notNull(),
    response: jsonb("response"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const tourProgress = pgTable(
  "tour_progress",
  {
    id: id(),
    /** clinic | platform */
    realm: text("realm").notNull(),
    userId: uuid("user_id").notNull(),
    tourId: text("tour_id").notNull(),
    version: integer("version").notNull(),
    /** seen | completed | dismissed */
    status: text("status").notNull(),
    timesShown: integer("times_shown").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [unique("tour_progress_uq").on(t.realm, t.userId, t.tourId)],
);

export const news = pgTable("news", {
  id: id(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  benefit: text("benefit").notNull(),
  version: text("version").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  /** draft | published | archived */
  status: text("status").notNull().default("draft"),
  module: text("module"),
  requiredPermission: text("required_permission"),
  targetPath: text("target_path"),
  tourId: text("tour_id"),
  /** Quando true, só aparece no login para quem já usava o sistema antes da publicação. */
  showToExistingUsersOnly: boolean("show_to_existing_users_only").notNull().default(true),
  createdBy: uuid("created_by").references(() => platformUsers.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const newsReceipts = pgTable(
  "news_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    newsId: uuid("news_id")
      .notNull()
      .references(() => news.id, { onDelete: "cascade" }),
    /** seen | opened | later | dismissed */
    action: text("action").notNull(),
    postponeCount: integer("postpone_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.newsId] })],
);
