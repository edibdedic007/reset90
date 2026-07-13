import { requireBrowserSession } from "@/server/auth/session";
import {
  handleCreateContextRequest,
  handleGetContextRequest,
} from "@/server/context";
import { getPrismaClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

const dependencies = {
  requireSession: requireBrowserSession,
  getDatabase: getPrismaClient,
};

export function GET(request: Request) {
  return handleGetContextRequest(request, dependencies);
}

export function POST(request: Request) {
  return handleCreateContextRequest(request, dependencies);
}
