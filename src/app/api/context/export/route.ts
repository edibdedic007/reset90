import { getBrowserSession } from "@/server/auth/session";
import { handleGptContextPacketRequest } from "@/server/context-export/gpt-context-packet";
import { getPrismaClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

const dependencies = {
  getSession: getBrowserSession,
  getDatabase: getPrismaClient,
};

export function GET(request: Request) {
  return handleGptContextPacketRequest(request, dependencies);
}
