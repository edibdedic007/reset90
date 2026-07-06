import { NextResponse } from "next/server";

import { getReadinessStatus } from "@/lib/status";

export function GET() {
  return NextResponse.json(getReadinessStatus(), { status: 503 });
}
