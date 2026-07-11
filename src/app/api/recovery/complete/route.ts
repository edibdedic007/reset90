import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleCompleteRecoveryRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCompleteRecoveryRequest(request, {
    requireSession: requireBrowserSession,
    getDatabase: getPrismaClient,
  });
}
