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

export async function requireBrowserSession(): Promise<BrowserUserSession> {
  if (getAuthMode() === "dev") {
    return storeBrowserUser(getPrismaClient(), createDevBrowserIdentity());
  }

  const session = await auth();
  const authentikSubject = session?.user?.authentikSubject;

  if (!authentikSubject) {
    redirect("/api/auth/signin?callbackUrl=/");
  }

  return storeBrowserUser(getPrismaClient(), {
    authentikSubject,
    email: session.user.email ?? null,
    displayName: session.user.name ?? null,
    isDev: false,
  });
}
