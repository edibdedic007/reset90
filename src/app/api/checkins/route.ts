import { requireBrowserSession } from "@/server/auth/session";
import { handleCreateCheckinRequest } from "@/server/checkins";
import { getPrismaClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateCheckinRequest(request, {
    requireSession: requireBrowserSession,
    getDatabase: getPrismaClient,
  });
}
