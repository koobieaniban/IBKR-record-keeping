import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authEnabled, isValidSessionCookie, SESSION_COOKIE } from "@/lib/auth";

export function proxy(request: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/login")) return NextResponse.next();

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (isValidSessionCookie(cookie)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
