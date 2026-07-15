import { auth, isEmailAllowed } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const email = req.auth?.user?.email;

  // Login page: send signed-in users home; others proceed
  if (pathname === "/login") {
    if (isLoggedIn && isEmailAllowed(email)) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  // Public API / auth paths
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/track") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  if (!isLoggedIn || !isEmailAllowed(email)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    if (isLoggedIn && !isEmailAllowed(email)) {
      loginUrl.searchParams.set("error", "AccessDenied");
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
