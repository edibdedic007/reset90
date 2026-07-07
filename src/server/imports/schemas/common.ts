import { z } from "zod";

export const IMPORT_SCHEMA_VERSION = "1.0" as const;

export const nonEmptyText = (maximumLength: number) =>
  z.string().min(1).max(maximumLength).regex(/\S/, "Must contain visible text");

export const dateSchema = z.iso.date();

export const dayNumberSchema = z.number().int().min(1).max(90);

export const sourceSchema = z.enum(["custom_gpt", "manual", "system"]);

export const importKindSchema = z.enum([
  "daily_plan",
  "daily_reflection",
  "weekly_review",
  "context_item",
]);

export const domainSchema = z.enum([
  "body",
  "mood",
  "digital",
  "learning",
  "work",
  "system",
  "environment",
  "social",
  "other",
]);

export const dayStatusSchema = z.enum([
  "green",
  "yellow",
  "blue",
  "red",
  "gold",
  "unset",
]);

export const stringList = (maximumItems: number, maximumLength = 500) =>
  z.array(nonEmptyText(maximumLength)).max(maximumItems);
