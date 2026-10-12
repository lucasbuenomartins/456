import { z } from "zod";
import { MODULE_KEYS, MODULE_STATUSES } from "./modules";
import { NEWS_ACTIONS } from "./news";
import { TOUR_STATUSES } from "./tours";
import { isValidCnpj, isValidCpf, isValidPhoneBR, onlyDigits } from "./validators";

const trimmed = (max: number) => z.string().trim().max(max, `Use no máximo ${max} caracteres.`);
const optionalText = (max: number) =>
  trimmed(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const emailSchema = z
  .string({ required_error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .email("E-mail inválido. Confira se tem @ e o domínio, como nome@exemplo.com.")
  .max(200);

export const passwordSchema = z
  .string({ required_error: "Informe a senha." })
  .min(8, "A senha precisa ter pelo menos 8 caracteres.")
  .max(200, "Senha muito longa.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Informe a senha."),
});

export const phoneSchema = z
  .string({ required_error: "Informe o telefone." })
  .trim()
  .min(1, "Informe o telefone.")
  .refine(isValidPhoneBR, "Telefone inválido. Use DDD + número, como (11) 98765-4321.")
  .transform(onlyDigits);

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || isValidPhoneBR(v), "Telefone inválido. Use DDD + número.")
  .transform((v) => (v ? onlyDigits(v) : null));

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .nullable()
  .refine((v) => !v || z.string().email().safeParse(v).success, "E-mail inválido.")
  .transform((v) => (v ? v : null));

const optionalCpf = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((v) => !v || isValidCpf(v), "CPF inválido. Confira os números.")
  .transform((v) => (v ? onlyDigits(v) : null));

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

const birthDate = isoDate
  .optional()
  .nullable()
  .refine((v) => {
    if (!v) return true;
    const d = new Date(`${v}T00:00:00Z`);
    const now = new Date();
    return !Number.isNaN(d.getTime()) && d <= now && d.getUTCFullYear() >= 1900;
  }, "Data de nascimento inválida.")
  .transform((v) => v ?? null);

export const addressSchema = z
  .object({
    zipCode: optionalText(9),
    street: optionalText(200),
    number: optionalText(20),
    complement: optionalText(100),
    district: optionalText(100),
    city: optionalText(100),
    state: optionalText(2),
  })
  .partial();

export const CLIENT_ORIGINS = [
  "indicacao",
  "instagram",
  "facebook",
  "google",
  "whatsapp",
  "passou_na_frente",
  "parceria",
  "outro",
] as const;

export const CLIENT_ORIGIN_LABEL: Record<(typeof CLIENT_ORIGINS)[number], string> = {
  indicacao: "Indicação",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  whatsapp: "WhatsApp",
  passou_na_frente: "Passou na frente",
  parceria: "Parceria",
  outro: "Outro",
};

export const COMMUNICATION_CHANNELS = ["whatsapp", "email", "sms"] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const clientInputSchema = z.object({
  fullName: trimmed(160).min(3, "Informe o nome completo (pelo menos 3 letras)."),
  socialName: optionalText(160),
  phone: phoneSchema,
  phoneIsWhatsapp: z.boolean().default(true),
  email: optionalEmail,
  birthDate,
  cpf: optionalCpf,
  origin: z.enum(CLIENT_ORIGINS).optional().nullable().transform((v) => v ?? null),
  preferredUnitId: z.string().uuid().optional().nullable().transform((v) => v ?? null),
  notes: optionalText(2000),
  tags: z.array(trimmed(40).min(1)).max(20).default([]),
  address: addressSchema.default({}),
  /** Consentimentos de comunicação comercial. Separados de atendimento e uso de imagem. */
  consents: z
    .object({
      whatsapp: z.boolean().default(false),
      email: z.boolean().default(false),
      sms: z.boolean().default(false),
    })
    .default({ whatsapp: false, email: false, sms: false }),
  /** Confirma o cadastro mesmo com possível duplicidade (telefone ou nome+nascimento iguais). */
  confirmDuplicate: z.boolean().optional(),
});
export type ClientInput = z.input<typeof clientInputSchema>;
export type ClientInputParsed = z.output<typeof clientInputSchema>;

export const clientUpdateSchema = clientInputSchema.extend({
  /** Controle de concorrência otimista. */
  version: z.number().int().nonnegative(),
});

export const clientListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  tag: z.string().trim().max(40).optional(),
  birthdayMonth: z.coerce.number().int().min(1).max(12).optional(),
  unitId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(25),
  sort: z.enum(["name", "-created", "created"]).default("name"),
});

export const clientBulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "Selecione pelo menos um cliente.").max(500),
  action: z.enum(["deactivate", "activate", "add_tag", "remove_tag"]),
  tag: trimmed(40).optional(),
});

export const companySchema = z.object({
  name: trimmed(120).min(2, "Informe o nome da empresa."),
  legalName: optionalText(200),
  document: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || isValidCnpj(v) || isValidCpf(v), "CNPJ ou CPF inválido.")
    .transform((v) => (v ? onlyDigits(v) : null)),
  phone: optionalPhone,
  email: optionalEmail,
});

export const unitSchema = z.object({
  name: trimmed(120).min(2, "Informe o nome da unidade."),
  phone: optionalPhone,
  address: addressSchema.default({}),
  timezone: z.string().default("America/Sao_Paulo"),
  isActive: z.boolean().default(true),
});

export const roleAssignmentSchema = z.object({
  roleId: z.string().uuid(),
  /** null = todas as unidades */
  unitId: z.string().uuid().nullable(),
});

export const inviteSchema = z.object({
  name: trimmed(120).min(2, "Informe o nome."),
  email: emailSchema,
  jobTitle: optionalText(80),
  assignments: z.array(roleAssignmentSchema).min(1, "Escolha pelo menos uma função."),
});

export const memberUpdateSchema = z.object({
  jobTitle: optionalText(80),
  assignments: z.array(roleAssignmentSchema).min(1, "Escolha pelo menos uma função."),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: trimmed(120).min(2, "Informe seu nome."),
  password: passwordSchema,
});

export const roleSchema = z.object({
  name: trimmed(60).min(2, "Informe o nome da função."),
  description: optionalText(300),
  permissions: z.array(z.string()).default([]),
});

export const tourEventSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(TOUR_STATUSES),
});

export const newsReceiptSchema = z.object({
  action: z.enum(NEWS_ACTIONS),
});

export const profileSchema = z.object({
  name: trimmed(120).min(2, "Informe seu nome."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: passwordSchema,
});

// ---------- Painel do SaaS ----------

export const planLimitsSchema = z.object({
  units: z.number().int().positive().nullable(),
  users: z.number().int().positive().nullable(),
  clients: z.number().int().positive().nullable(),
  storageMb: z.number().int().positive().nullable(),
});
export type PlanLimits = z.infer<typeof planLimitsSchema>;

export const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Use letras minúsculas, números e hífen."),
  name: trimmed(80).min(2),
  description: optionalText(300),
  monthlyPriceCents: z.number().int().nonnegative(),
  modules: z.array(z.enum(MODULE_KEYS)).default(["core"]),
  limits: planLimitsSchema,
  isActive: z.boolean().default(true),
});

export const createTenantSchema = z.object({
  name: trimmed(120).min(2, "Informe o nome da empresa."),
  document: companySchema.shape.document,
  planId: z.string().uuid({ message: "Escolha um plano." }),
  trialDays: z.number().int().min(0).max(90).default(14),
  firstUnitName: trimmed(120).min(2).default("Unidade principal"),
  owner: z.object({
    name: trimmed(120).min(2, "Informe o nome do responsável."),
    email: emailSchema,
  }),
});

export const tenantStatusChangeSchema = z.object({
  status: z.enum(["active", "suspended", "cancelled"]),
  reason: trimmed(300).min(3, "Explique o motivo (aparece no histórico)."),
});

export const tenantModuleChangeSchema = z.object({
  status: z.enum(MODULE_STATUSES),
  reason: trimmed(300).min(3, "Explique o motivo (aparece no histórico)."),
});

export const tenantPlanChangeSchema = z.object({
  planId: z.string().uuid(),
  reason: trimmed(300).min(3, "Explique o motivo (aparece no histórico)."),
});

export const newsSchema = z.object({
  title: trimmed(120).min(3, "Informe o título."),
  summary: trimmed(400).min(3, "Explique o que mudou."),
  benefit: trimmed(300).min(3, "Explique o benefício prático."),
  version: trimmed(20).min(1),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["draft", "published", "archived"]),
  module: z.enum(MODULE_KEYS).nullable(),
  requiredPermission: z.string().nullable(),
  targetPath: z
    .string()
    .trim()
    .regex(/^\/[a-z0-9\-/]*$/i, "Informe um caminho interno, como /clientes.")
    .nullable(),
  tourId: z.string().nullable(),
  showToExistingUsersOnly: z.boolean().default(true),
});
