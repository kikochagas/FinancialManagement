import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "./lib/auth";

export async function middleware(request: NextRequest) {
  // Update session expiration on every request
  const response = await updateSession(request) || NextResponse.next();

  const { pathname } = request.nextUrl;

  // Paths that do not require authentication
  const publicPaths = ["/login", "/register"];
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return response;
  }

  const session = request.cookies.get("session")?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }



  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
