import type { ZodTypeAny, z } from "zod";
import { validationError } from "./errors";

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw validationError(result.error);
  return result.data;
}
