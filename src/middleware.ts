import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const staffRoles = new Set(["ADMIN", "SALESPERSON", "WAREHOUSE", "FINANCE"]);

function isPublicPath(pathname: string) {
  if (pathname === "/" || pathname === "/login" || pathname === "/register") {
    return true;
  }

  return pathname === "/shop" || pathname.startsWith("/shop/catalog") || pathname.startsWith("/shop/product");
}

function redirectToLogin(requestUrl: URL) {
  const loginUrl = new URL("/login", requestUrl);
  loginUrl.searchParams.set("callbackUrl", `${requestUrl.pathname}${requestUrl.search}`);
  return NextResponse.redirect(loginUrl);
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

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/dashboard")) {
    if (!role || !staffRoles.has(role)) {
      return redirectToLogin(nextUrl);
    }

    if ((pathname.startsWith("/dashboard/settings") || pathname.startsWith("/dashboard/logs")) && role !== "ADMIN") {
      return redirectToLogin(nextUrl);
    }

    return NextResponse.next();
  }

  if (pathname.startsWith("/dealer")) {
    if (role !== "DEALER") {
      return redirectToLogin(nextUrl);
    }

    return NextResponse.next();
  }

  if (
    pathname.startsWith("/shop/cart") ||
    pathname.startsWith("/shop/checkout") ||
    pathname.startsWith("/shop/my-orders") ||
    pathname.startsWith("/shop/account") ||
    pathname.startsWith("/shop/ai-chat") ||
    pathname.startsWith("/shop/coupons")
  ) {
    if (role !== "CONSUMER") {
      return redirectToLogin(nextUrl);
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
