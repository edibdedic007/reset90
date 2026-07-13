import { redirect } from "next/navigation";

import { auth } from "../../auth";
import { getPrismaClient } from "../db/client";
import { getAuthMode } from "./config";
import {
  createDevBrowserIdentity,
  storeBrowserUser,
  type BrowserUserSession,
} from "./users";

export type { BrowserUserSession } from "./users";

export async function getBrowserSession(): Promise<BrowserUserSession | null> {
  if (getAuthMode() === "dev") {
    return storeBrowserUser(getPrismaClient(), createDevBrowserIdentity());
  }

  const session = await auth();
  const authentikSubject = session?.user?.authentikSubject;

  if (!authentikSubject) {
    return null;
  }

  return storeBrowserUser(getPrismaClient(), {
    authentikSubject,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    isDev: false,
  });
}

export async function requireBrowserSession(): Promise<BrowserUserSession> {
  const session = await getBrowserSession();
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/");
  }
  return session;
}
