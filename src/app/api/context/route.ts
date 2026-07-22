import { getReadOnlyBrowserSession } from "@/server/auth/session";
import {
  handleCreateContextRequest,
  handleGetContextRequest,
} from "@/server/context";
import { getPrismaClient } from "@/server/db/client";
import {
  handleBrowserMutation,
  handleSafeApplicationRequest,
} from "@/server/http/security";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleSafeApplicationRequest("context.read", async () => {
    const session = await getReadOnlyBrowserSession();
    if (!session) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
    return handleGetContextRequest(request, {
      requireSession: async () => session,
      getDatabase: getPrismaClient,
    });
  });
}

export function POST(request: Request) {
  return handleBrowserMutation(
    request,
    "POST",
    "context.create",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    (boundedRequest, session) =>
      handleCreateContextRequest(boundedRequest, {
        requireSession: async () => session,
        getDatabase: getPrismaClient,
      }),
  );
}
