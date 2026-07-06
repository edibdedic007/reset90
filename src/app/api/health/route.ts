import { NextResponse } from "next/server";

import { getHealthStatus } from "@/lib/status";

export function GET() {
  return NextResponse.json(getHealthStatus());
}
