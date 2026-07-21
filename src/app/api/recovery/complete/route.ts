import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";
import { handleCompleteRecoveryRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBrowserMutation(
    request,
    "POST",
    "recovery.complete",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    (boundedRequest, session) =>
      handleCompleteRecoveryRequest(boundedRequest, {
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      }),
  );
}
