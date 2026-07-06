import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  reset90Prisma?: PrismaClient;
};

export function createPrismaClient(
  connectionString = process.env.DATABASE_URL,
) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export function getPrismaClient() {
  if (!globalForPrisma.reset90Prisma) {
    globalForPrisma.reset90Prisma = createPrismaClient();
  }

  return globalForPrisma.reset90Prisma;
}
