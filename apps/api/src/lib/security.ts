import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const newToken = (): string => randomBytes(32).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string): Promise<string> =>
  hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

export async function verifyPassword(passwordHash: string | null | undefined, password: string): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/** Hash fixo para comparar em tempo constante quando o e-mail não existe (evita enumeração por tempo). */
let dummyHash: string | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= await hashPassword("senha-inexistente-para-tempo-constante");
  await verifyPassword(dummyHash, password);
}
