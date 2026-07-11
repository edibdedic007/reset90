import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleUpdateRecoveryActionsRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  return handleUpdateRecoveryActionsRequest(request, {
    requireSession: requireBrowserSession,
    getDatabase: getPrismaClient,
  });
}
