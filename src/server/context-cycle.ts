import { Prisma, type PrismaClient } from "@/generated/prisma/client";

type ActiveCycleDatabase = Pick<PrismaClient, "$queryRaw" | "resetCycle">;

export type SingularActiveCycle = {
  id: string;
  name: string;
};

export async function findSingularActiveCycle(
  database: Pick<ActiveCycleDatabase, "resetCycle">,
  userId: string,
): Promise<SingularActiveCycle | null> {
  const cycles = await database.resetCycle.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    take: 2,
    select: { id: true, name: true },
  });
  return cycles.length === 1 ? cycles[0] : null;
}

export async function lockAndRevalidateSingularActiveCycle(
  database: ActiveCycleDatabase,
  userId: string,
  expectedCycleId: string,
): Promise<SingularActiveCycle | null> {
  const locked = await database.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM reset_cycles WHERE id = ${expectedCycleId}::uuid FOR UPDATE`,
  );
  if (locked.length !== 1) {
    return null;
  }

  const current = await findSingularActiveCycle(database, userId);
  return current?.id === expectedCycleId ? current : null;
}
