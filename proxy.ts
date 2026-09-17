import { NextRequest, NextResponse } from "next/server";

// The site's own pages call these routes same-origin (no key needed).
// Anything else (an MCP wrapper, curl, another site) must send x-api-key.
export function proxy(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const sameOrigin = !!(origin && host && new URL(origin).host === host);
  if (sameOrigin) return NextResponse.next();

  const key = request.headers.get("x-api-key");
  if (!process.env.API_KEY || key !== process.env.API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
