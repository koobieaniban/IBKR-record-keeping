import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "trade_journal_session";

/** Auth is only enforced when APP_PASSWORD is set, so local dev without it configured isn't
 * blocked. Deployments should always set it — see README. */
export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function sessionToken(): string {
  return createHmac("sha256", process.env.APP_PASSWORD ?? "").update("authenticated").digest("hex");
}

export function checkPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD ?? "";
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isValidSessionCookie(value: string | undefined): boolean {
  if (!value) return false;
  const expected = sessionToken();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function makeSessionCookieValue(): string {
  return sessionToken();
}
