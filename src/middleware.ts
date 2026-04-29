import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { canAccessPath, isPublicPath } from "@/features/auth/permissions";

function redirectToLogin(requestUrl: URL) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", `${requestUrl.pathname}${requestUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

function redirectToForbidden(requestUrl: URL) {
  const forbiddenUrl = new URL("/forbidden", requestUrl);
  forbiddenUrl.searchParams.set("from", `${requestUrl.pathname}${requestUrl.search}`);
  return NextResponse.redirect(forbiddenUrl);
}

export async function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const pathname = nextUrl.pathname;
  const isProduction = process.env.NODE_ENV === "production";
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    secureCookie: isProduction,
    salt: isProduction ? "__Secure-authjs.session-token" : "authjs.session-token",
  });
  const role = token?.role;

  if (isPublicPath(pathname) || canAccessPath(typeof role === "string" ? role : null, pathname)) {
    return NextResponse.next();
  }

  if (!role) {
    return redirectToLogin(nextUrl);
  }

  return redirectToForbidden(nextUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
