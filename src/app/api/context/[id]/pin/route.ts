import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { handleSetContextPinnedRequest } from "@/server/context";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";

type ContextPinRoute = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: ContextPinRoute) {
  return handleBrowserMutation(
    request,
    "PATCH",
    "context.pin.update",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    async (boundedRequest, session) => {
      const { id } = await context.params;
      return handleSetContextPinnedRequest(boundedRequest, id, {
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      });
    },
  );
}
