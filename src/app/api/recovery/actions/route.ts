import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";
import { handleUpdateRecoveryActionsRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  return handleBrowserMutation(
    request,
    "PATCH",
    "recovery.actions.update",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    (boundedRequest, session) =>
      handleUpdateRecoveryActionsRequest(boundedRequest, {
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      }),
  );
}
