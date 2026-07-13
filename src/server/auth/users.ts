import { DEV_AUTHENTIK_SUBJECT, DEV_DISPLAY_NAME } from "./config";

export type BrowserUserIdentity = {
  authentikSubject: string;
  email: string | null;
  displayName: string | null;
  isDev: boolean;
};

export type BrowserUserSession = BrowserUserIdentity & {
  userId: string;
};

export type BrowserUserRecord = {
  id: string;
  authentikSubject: string;
  email: string | null;
  displayName: string | null;
};

export type BrowserUserDatabase = {
  user: {
    upsert(args: {
      where: { authentikSubject: string };
      create: {
        authentikSubject: string;
        email: string | null;
        displayName: string | null;
      };
      update: {
        email: string | null;
        displayName: string | null;
      };
    }): Promise<BrowserUserRecord>;
  };
};

export type BrowserUserLookupDatabase = {
  user: {
    findUnique(args: {
      where: { authentikSubject: string };
      select: {
        id: true;
        authentikSubject: true;
        email: true;
        displayName: true;
      };
    }): Promise<BrowserUserRecord | null>;
  };
};

export function createDevBrowserIdentity(): BrowserUserIdentity {
  return {
    authentikSubject: DEV_AUTHENTIK_SUBJECT,
    email: null,
    displayName: DEV_DISPLAY_NAME,
    isDev: true,
  };
}

export async function storeBrowserUser(
  database: BrowserUserDatabase,
  identity: BrowserUserIdentity,
): Promise<BrowserUserSession> {
  const user = await database.user.upsert({
    where: { authentikSubject: identity.authentikSubject },
    create: {
      authentikSubject: identity.authentikSubject,
      email: identity.email,
      displayName: identity.displayName,
    },
    update: {
      email: identity.email,
      displayName: identity.displayName,
    },
  });

  return {
    userId: user.id,
    authentikSubject: user.authentikSubject,
    email: user.email,
    displayName: user.displayName,
    isDev: identity.isDev,
  };
}

export async function resolveExistingBrowserUser(
  database: BrowserUserLookupDatabase,
  identity: BrowserUserIdentity,
): Promise<BrowserUserSession | null> {
  const user = await database.user.findUnique({
    where: { authentikSubject: identity.authentikSubject },
    select: {
      id: true,
      authentikSubject: true,
      email: true,
      displayName: true,
    },
  });

  if (!user) return null;

  return {
    userId: user.id,
    authentikSubject: user.authentikSubject,
    email: user.email,
    displayName: user.displayName,
    isDev: identity.isDev,
  };
}
