import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../src/app";
import { DEMO_PASSWORD } from "../src/db/seed";

let appPromise: Promise<FastifyInstance> | null = null;
export const getApp = () => (appPromise ??= buildApp());

export interface Session {
  cookie: string;
  get: (url: string) => Promise<LightMyRequestResponse>;
  post: (url: string, body?: unknown, headers?: Record<string, string>) => Promise<LightMyRequestResponse>;
  put: (url: string, body?: unknown) => Promise<LightMyRequestResponse>;
  del: (url: string) => Promise<LightMyRequestResponse>;
}

function cookieFrom(res: LightMyRequestResponse, name: string): string {
  const c = res.cookies.find((x) => x.name === name);
  if (!c) throw new Error(`login falhou: ${res.statusCode} ${res.body}`);
  return `${name}=${c.value}`;
}

function sessionFor(app: FastifyInstance, cookie: string): Session {
  const req = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, body?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload: body as never, headers: { cookie, ...headers } });
  return {
    cookie,
    get: (url) => req("GET", url),
    post: (url, body, headers) => req("POST", url, body ?? {}, headers),
    put: (url, body) => req("PUT", url, body),
    del: (url) => req("DELETE", url),
  };
}

export async function login(email: string, tenantName?: string): Promise<Session> {
  const app = await getApp();
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: DEMO_PASSWORD } });
  const session = sessionFor(app, cookieFrom(res, "session"));
  const body = res.json();
  if (body.needsTenant) {
    const t = body.tenants.find((x: { name: string }) => x.name === tenantName) ?? body.tenants[0];
    await session.post("/api/auth/select-tenant", { tenantId: t.id });
  }
  return session;
}

export async function loginAdmin(): Promise<Session> {
  const app = await getApp();
  const res = await app.inject({ method: "POST", url: "/api/admin/auth/login", payload: { email: "admin@plataforma.local", password: DEMO_PASSWORD } });
  return sessionFor(app, cookieFrom(res, "admin_session"));
}

let seq = 0;
/** Telefone celular válido e único por chamada. */
export function uniquePhone(): string {
  seq += 1;
  return `2198${String(Date.now() % 1e4).padStart(4, "0")}${String(seq).padStart(3, "0")}`.slice(0, 11);
}

export const ana = () => login("ana@bellapele.com.br");
export const carla = () => login("carla@bellapele.com.br");
export const bianca = () => login("bianca@aurora.com.br");
