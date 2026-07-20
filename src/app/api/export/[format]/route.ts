import { getReadOnlyBrowserSessionResult } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { handleUserDataExportRequest } from "@/server/user-data-export";

type ExportRouteContext = {
  params: Promise<{ format: string }>;
};

export const dynamic = "force-dynamic";

const dependencies = {
  getSessionResult: getReadOnlyBrowserSessionResult,
  getDatabase: getPrismaClient,
};

export async function GET(request: Request, context: ExportRouteContext) {
  const { format } = await context.params;
  return handleUserDataExportRequest(request, format, dependencies);
}
