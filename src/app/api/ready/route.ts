import { NextResponse } from "next/server";

import { getReadinessStatus } from "@/lib/status";
import { checkDatabaseReadiness } from "@/server/db/readiness";

export async function GET() {
  const databaseReady = await checkDatabaseReadiness();
  return NextResponse.json(getReadinessStatus(databaseReady), {
    status: databaseReady ? 200 : 503,
  });
}
