"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, makeSessionCookieValue, SESSION_COOKIE } from "@/lib/auth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!checkPassword(password)) {
    redirect(`/login?next=${encodeURIComponent(next)}&error=1`);
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, makeSessionCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect(next || "/");
}
