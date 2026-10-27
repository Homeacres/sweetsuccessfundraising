import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requiredEnv } from "@/lib/env";

export const ADMIN_COOKIE = "ssf_admin";

export function adminSessionToken(password: string): string {
  return createHmac("sha256", password).update("ssf-admin-v1").digest("hex");
}

export function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function isAdminRequest(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const jar = await cookies();
  const presented = jar.get(ADMIN_COOKIE)?.value;
  if (!presented) return false;
  return tokensMatch(presented, adminSessionToken(password));
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminRequest())) {
    throw new AdminAuthError();
  }
}

export class AdminAuthError extends Error {
  constructor() {
    super("Admin sign-in required");
    this.name = "AdminAuthError";
  }
}

export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const alt = request.headers.get("x-cron-secret")?.trim() || "";
  if (bearer && tokensMatch(bearer, secret)) return true;
  if (alt && tokensMatch(alt, secret)) return true;
  return false;
}

export function readAdminPassword(): string {
  return requiredEnv("ADMIN_PASSWORD");
}
