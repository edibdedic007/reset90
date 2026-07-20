import { redirect } from "next/navigation";

import { auth } from "../../auth";
import { getPrismaClient } from "../db/client";
import { getAuthMode } from "./config";
import {
  createDevBrowserIdentity,
  resolveExistingBrowserUser,
  storeBrowserUser,
  type BrowserUserIdentity,
  type BrowserUserSession,
} from "./users";

export type { BrowserUserSession } from "./users";

export type ReadOnlyBrowserSessionResult =
  | { status: "unauthenticated" }
  | { status: "user_not_found" }
  | { status: "authenticated"; session: BrowserUserSession };

async function getBrowserIdentity(): Promise<BrowserUserIdentity | null> {
  if (getAuthMode() === "dev") {
    return createDevBrowserIdentity();
  }

  const session = await auth();
  const authentikSubject = session?.user?.authentikSubject;

  if (!authentikSubject) {
    return null;
  }

  return {
    authentikSubject,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    isDev: false,
  };
}

export async function getBrowserSession(): Promise<BrowserUserSession | null> {
  const identity = await getBrowserIdentity();
  return identity ? storeBrowserUser(getPrismaClient(), identity) : null;
}

export async function getReadOnlyBrowserSession(): Promise<BrowserUserSession | null> {
  const result = await getReadOnlyBrowserSessionResult();
  return result.status === "authenticated" ? result.session : null;
}

export async function getReadOnlyBrowserSessionResult(): Promise<ReadOnlyBrowserSessionResult> {
  const identity = await getBrowserIdentity();
  if (!identity) return { status: "unauthenticated" };

  const session = await resolveExistingBrowserUser(getPrismaClient(), identity);
  return session
    ? { status: "authenticated", session }
    : { status: "user_not_found" };
}

export async function requireBrowserSession(): Promise<BrowserUserSession> {
  const session = await getBrowserSession();
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/");
  }
  return session;
}
