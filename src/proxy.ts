import { type NextRequest, NextResponse } from "next/server";

import { enforceApplicationMethod } from "@/server/http/security";

export function proxy(request: NextRequest) {
  return enforceApplicationMethod(request) ?? NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
