import { ZodError } from "zod";

/** Erro de negócio com mensagem pronta para o usuário (pt-BR). */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what = "Registro") => new AppError(404, "not_found", `${what} não encontrado.`);
export const forbidden = (message = "Você não tem permissão para esta ação. Fale com o administrador da sua clínica.") =>
  new AppError(403, "forbidden", message);
export const unauthorized = () => new AppError(401, "unauthorized", "Sua sessão expirou. Entre novamente.");
export const conflict = (code: string, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, undefined, details);

export function zodToFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function validationError(error: ZodError): AppError {
  return new AppError(422, "validation", "Confira os campos destacados.", zodToFields(error));
}
