import { requireBrowserSession } from "@/server/auth/session";
import { handleSetContextPinnedRequest } from "@/server/context";
import { getPrismaClient } from "@/server/db/client";

type ContextPinRoute = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: ContextPinRoute) {
  const { id } = await context.params;
  return handleSetContextPinnedRequest(request, id, {
    requireSession: requireBrowserSession,
    getDatabase: getPrismaClient,
  });
}
