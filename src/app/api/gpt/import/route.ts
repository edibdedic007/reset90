import { getPrismaClient } from "@/server/db/client";
import {
  createGptImportRateLimiter,
  handleGptImport,
} from "@/server/imports/http";

export const runtime = "nodejs";

const rateLimiter = createGptImportRateLimiter();

export function POST(request: Request) {
  return handleGptImport(request, {
    env: {
      GPT_INGEST_TOKEN: process.env.GPT_INGEST_TOKEN,
      GPT_INGEST_OWNER_SUBJECT: process.env.GPT_INGEST_OWNER_SUBJECT,
    },
    getDatabase: getPrismaClient,
    rateLimiter,
  });
}
