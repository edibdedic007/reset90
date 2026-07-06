import { config as loadEnv } from "dotenv";

import {
  addUtcDays,
  buildDayLogSeeds,
  DEFAULT_PHASES,
  normalizeUtcDate,
} from "../src/server/db/cycle";
import { createPrismaClient } from "../src/server/db/client";

loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local", quiet: true });

const prisma = createPrismaClient();

async function seed() {
  const user = await prisma.user.upsert({
    where: { authentikSubject: "local-development" },
    update: {},
    create: {
      authentikSubject: "local-development",
      email: "reset90@localhost.invalid",
      displayName: "Reset90 Local User",
    },
  });

  const cycleName = "Reset90 Local Cycle";
  const existingCycle = await prisma.resetCycle.findUnique({
    where: { userId_name: { userId: user.id, name: cycleName } },
  });
  const startDate = existingCycle?.startDate ?? normalizeUtcDate(new Date());
  const cycle =
    existingCycle === null
      ? await prisma.resetCycle.create({
          data: {
            userId: user.id,
            name: cycleName,
            startDate,
            endDate: addUtcDays(startDate, 89),
            status: "ACTIVE",
          },
        })
      : await prisma.resetCycle.update({
          where: { id: existingCycle.id },
          data: { status: "ACTIVE" },
        });

  const phases = [];
  for (const phase of DEFAULT_PHASES) {
    phases.push(
      await prisma.resetPhase.upsert({
        where: {
          cycleId_dayStart: { cycleId: cycle.id, dayStart: phase.dayStart },
        },
        update: {
          name: phase.name,
          dayEnd: phase.dayEnd,
          description: phase.description,
        },
        create: { cycleId: cycle.id, ...phase },
      }),
    );
  }

  const dayLogs = buildDayLogSeeds(startDate, phases);
  await prisma.$transaction(
    dayLogs.map((dayLog) =>
      prisma.dayLog.upsert({
        where: {
          cycleId_dayNumber: { cycleId: cycle.id, dayNumber: dayLog.dayNumber },
        },
        update: { date: dayLog.date, phaseId: dayLog.phaseId },
        create: { cycleId: cycle.id, ...dayLog },
      }),
    ),
  );

  console.log(
    `Seeded active cycle with ${phases.length} phases and ${dayLogs.length} day logs.`,
  );
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
