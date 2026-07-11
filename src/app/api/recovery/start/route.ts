import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleStartRecoveryRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleStartRecoveryRequest({
    requireSession: requireBrowserSession,
    getDatabase: getPrismaClient,
  });
}
