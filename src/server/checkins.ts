import { z } from "zod";

import type { PrismaClient } from "../generated/prisma/client";
import {
  CheckinKind,
  EnergyLevel,
  type CheckinKind as CheckinKindType,
  type EnergyLevel as EnergyLevelType,
} from "../generated/prisma/enums";
import { normalizeUtcDate } from "./db/cycle";

export const CHECKIN_NOTE_MAX_LENGTH = 500;

const scoreSchema = z.number().int().min(1).max(10);

export const createCheckinSchema = z
  .object({
    kind: z.enum(CheckinKind),
    energyLevel: z.enum(EnergyLevel),
    mood: scoreSchema,
    fog: scoreSchema,
    loneliness: scoreSchema,
    selfCriticism: scoreSchema,
    digitalControl: scoreSchema,
    learningResistance: scoreSchema,
    bodyRelationship: scoreSchema,
    workConfidence: scoreSchema,
    note: z.string().trim().max(CHECKIN_NOTE_MAX_LENGTH).nullable().optional(),
  })
  .strict();

export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;

export type CheckinScores = {
  mood: number;
  fog: number;
  loneliness: number;
  selfCriticism: number;
  digitalControl: number;
  learningResistance: number;
  bodyRelationship: number;
  workConfidence: number;
};

export type DayCheckin = {
  id: string;
  kind: CheckinKindType;
  timestamp: string;
  energyLevel: EnergyLevelType;
  scores: CheckinScores;
  note: string | null;
};

export type CheckinDatabase = Pick<PrismaClient, "dayLog" | "$transaction">;

export type CreateCheckinResult =
  { status: "not_found" } | { status: "created"; checkin: DayCheckin };

export type CheckinHttpDependencies = {
  requireSession: () => Promise<{ userId: string }>;
  getDatabase: () => CheckinDatabase;
  createCheckin?: typeof createTodayCheckin;
};

type StoredCheckin = {
  id: string;
  kind: CheckinKindType;
  timestamp: Date;
  energyLevel: EnergyLevelType;
  moodScore: number;
  fogScore: number;
  lonelinessScore: number;
  selfCriticismScore: number;
  digitalControlScore: number;
  learningResistanceScore: number;
  bodyRelationshipScore: number;
  workConfidenceScore: number;
  note: string | null;
};

export const checkinSelect = {
  id: true,
  kind: true,
  timestamp: true,
  energyLevel: true,
  moodScore: true,
  fogScore: true,
  lonelinessScore: true,
  selfCriticismScore: true,
  digitalControlScore: true,
  learningResistanceScore: true,
  bodyRelationshipScore: true,
  workConfidenceScore: true,
  note: true,
} as const;

export function toDayCheckin(checkin: StoredCheckin): DayCheckin {
  return {
    id: checkin.id,
    kind: checkin.kind,
    timestamp: checkin.timestamp.toISOString(),
    energyLevel: checkin.energyLevel,
    scores: {
      mood: checkin.moodScore,
      fog: checkin.fogScore,
      loneliness: checkin.lonelinessScore,
      selfCriticism: checkin.selfCriticismScore,
      digitalControl: checkin.digitalControlScore,
      learningResistance: checkin.learningResistanceScore,
      bodyRelationship: checkin.bodyRelationshipScore,
      workConfidence: checkin.workConfidenceScore,
    },
    note: checkin.note,
  };
}

export async function createTodayCheckin(
  database: CheckinDatabase,
  userId: string,
  input: CreateCheckinInput,
  now = new Date(),
): Promise<CreateCheckinResult> {
  const today = normalizeUtcDate(now);
  const dayLog = await database.dayLog.findFirst({
    where: {
      date: today,
      cycle: { userId, status: "ACTIVE" },
    },
    select: { id: true },
  });

  if (!dayLog) {
    return { status: "not_found" };
  }

  const checkin = await database.$transaction(async (transaction) => {
    const created = await transaction.checkin.create({
      data: {
        dayLogId: dayLog.id,
        kind: input.kind,
        timestamp: now,
        energyLevel: input.energyLevel,
        moodScore: input.mood,
        fogScore: input.fog,
        lonelinessScore: input.loneliness,
        selfCriticismScore: input.selfCriticism,
        digitalControlScore: input.digitalControl,
        learningResistanceScore: input.learningResistance,
        bodyRelationshipScore: input.bodyRelationship,
        workConfidenceScore: input.workConfidence,
        note: input.note?.trim() || null,
      },
      select: checkinSelect,
    });

    await transaction.dayLog.update({
      where: { id: dayLog.id },
      data: { energyLevel: input.energyLevel },
      select: { id: true },
    });

    return created;
  });

  return { status: "created", checkin: toDayCheckin(checkin) };
}

export async function handleCreateCheckinRequest(
  request: Request,
  dependencies: CheckinHttpDependencies,
) {
  const session = await dependencies.requireSession();
  const body = await request.json().catch(() => null);
  const parsed = createCheckinSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_checkin_payload" },
      { status: 400 },
    );
  }

  const result = await (dependencies.createCheckin ?? createTodayCheckin)(
    dependencies.getDatabase(),
    session.userId,
    parsed.data,
  );

  if (result.status === "not_found") {
    return Response.json(
      { ok: false, error: "today_not_found" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, checkin: result.checkin }, { status: 201 });
}
