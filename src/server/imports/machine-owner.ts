import { Prisma } from "@/generated/prisma/client";

type MachineOwnerTransaction = Prisma.TransactionClient;

export type TrustedMachineOwnerResult =
  | {
      status: "resolved";
      ownerId: string;
      cycle: { id: string; startDate: Date; endDate: Date };
    }
  | {
      status:
        | "import_owner_not_found"
        | "active_cycle_not_found"
        | "active_cycle_ambiguous";
    };

async function activeCycles(
  transaction: MachineOwnerTransaction,
  ownerId: string,
) {
  return transaction.resetCycle.findMany({
    where: { userId: ownerId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    take: 2,
    select: { id: true, startDate: true, endDate: true },
  });
}

export async function resolveTrustedMachineOwner(
  transaction: MachineOwnerTransaction,
  ownerAuthentikSubject: string,
): Promise<TrustedMachineOwnerResult> {
  const owner = await transaction.user.findUnique({
    where: { authentikSubject: ownerAuthentikSubject },
    select: { id: true },
  });
  if (!owner) return { status: "import_owner_not_found" };

  const expected = await activeCycles(transaction, owner.id);
  if (expected.length === 0) return { status: "active_cycle_not_found" };
  if (expected.length !== 1) return { status: "active_cycle_ambiguous" };

  await transaction.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM reset_cycles WHERE id = ${expected[0].id}::uuid FOR UPDATE`,
  );

  const current = await activeCycles(transaction, owner.id);
  if (current.length === 0) return { status: "active_cycle_not_found" };
  if (current.length !== 1 || current[0].id !== expected[0].id) {
    return { status: "active_cycle_ambiguous" };
  }

  return { status: "resolved", ownerId: owner.id, cycle: current[0] };
}
