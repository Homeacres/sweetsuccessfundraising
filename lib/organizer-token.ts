import { createHmac, timingSafeEqual } from "node:crypto";

export type OrganizerAction = "start" | "unsubscribe" | "roster" | "reply";

export function signOrganizerAction(organizerId: string, action: OrganizerAction, secret: string): string {
  const body = `${action}.${organizerId}`;
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyOrganizerAction(
  token: string,
  action: OrganizerAction,
  secret: string,
): { organizerId: string } | null {
  const split = token.lastIndexOf(".");
  if (split <= 0) return null;
  const body = token.slice(0, split);
  const mac = token.slice(split + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const prefix = `${action}.`;
  if (!body.startsWith(prefix)) return null;
  const organizerId = body.slice(prefix.length);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizerId)) return null;
  return { organizerId };
}

/** Local-part token. UUID without dashes plus a short mac stays under 64 characters. */
export function replyLocalPart(organizerId: string, secret: string): string {
  const id = organizerId.replace(/-/g, "").toLowerCase();
  const mac = createHmac("sha256", secret).update(`reply.${organizerId}`).digest("hex").slice(0, 20);
  return `${id}.${mac}`;
}

export function organizerIdFromReplyLocalPart(localPart: string, secret: string): string | null {
  const [id, mac] = localPart.toLowerCase().split(".");
  if (!id || !mac || !/^[0-9a-f]{32}$/.test(id)) return null;
  const organizerId = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  const expected = createHmac("sha256", secret).update(`reply.${organizerId}`).digest("hex").slice(0, 20);
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return organizerId;
}

export function organizerActionSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.ORGANIZER_ACTION_SECRET?.trim();
  return secret || null;
}
