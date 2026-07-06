import { getPrismaClient } from "@/server/db/client";

export async function checkDatabaseReadiness() {
  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
