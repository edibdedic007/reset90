import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";
import { handleStartRecoveryRequest } from "@/server/recovery/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBrowserMutation(
    request,
    "POST",
    "recovery.start",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    (_boundedRequest, session) =>
      handleStartRecoveryRequest({
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      }),
  );
}
