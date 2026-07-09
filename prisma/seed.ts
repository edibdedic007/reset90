import { config as loadEnv } from "dotenv";

import {
  addUtcDays,
  buildDayLogSeeds,
  DEFAULT_PHASES,
  normalizeUtcDate,
} from "../src/server/db/cycle";
import {
  DEV_AUTHENTIK_SUBJECT,
  DEV_DISPLAY_NAME,
} from "../src/server/auth/config";
import { createPrismaClient } from "../src/server/db/client";

loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local", quiet: true });

const prisma = createPrismaClient();
const LOCAL_DEV_EMAIL = "reset90@localhost.invalid";

async function seed() {
  const userBySubject = await prisma.user.findUnique({
    where: { authentikSubject: DEV_AUTHENTIK_SUBJECT },
  });
  const userByEmail = await prisma.user.findUnique({
    where: { email: LOCAL_DEV_EMAIL },
  });

  if (userBySubject && userByEmail && userBySubject.id !== userByEmail.id) {
    await prisma.user.update({
      where: { id: userByEmail.id },
      data: { email: null },
    });
  }

  const existingUser = userBySubject ?? userByEmail;
  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          authentikSubject: DEV_AUTHENTIK_SUBJECT,
          email: LOCAL_DEV_EMAIL,
          displayName: DEV_DISPLAY_NAME,
        },
      })
    : await prisma.user.create({
        data: {
          authentikSubject: DEV_AUTHENTIK_SUBJECT,
          email: LOCAL_DEV_EMAIL,
          displayName: DEV_DISPLAY_NAME,
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
