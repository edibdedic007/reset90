import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { handleCreateCheckinRequest } from "@/server/checkins";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBrowserMutation(
    request,
    "POST",
    "checkin.create",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    (boundedRequest, session) =>
      handleCreateCheckinRequest(boundedRequest, {
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      }),
  );
}
