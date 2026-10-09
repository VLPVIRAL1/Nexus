import { NextResponse, type NextRequest } from "next/server";

const publicPrefixes = ["/login", "/auth/recovery"];

export function proxy(request: NextRequest) {
  if (process.env.APP_ENV !== "production") return NextResponse.next();
  const isPublic = publicPrefixes.some((prefix) => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`));
  const hasSession = Boolean(request.cookies.get("nexus_session")?.value);
  if (!hasSession && !isPublic) {
    const target = new URL("/login", request.url);
    return NextResponse.redirect(target);
  }
  if (hasSession && request.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/dashboard", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"] };
