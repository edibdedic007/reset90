import NextAuth, { type NextAuthConfig } from "next-auth";
import Authentik from "next-auth/providers/authentik";

import {
  getAuthentikProviderConfig,
  getAuthMode,
  getAuthSecret,
  getSessionCookieConfig,
  isPublicAuthPath,
  SESSION_MAX_AGE_SECONDS,
  shouldTrustAuthHost,
  shouldUseSecureCookies,
} from "./server/auth/config";
import { storeBrowserUser } from "./server/auth/users";
import { getPrismaClient } from "./server/db/client";

const authentikConfig = getAuthentikProviderConfig();

export const authConfig = {
  providers: authentikConfig ? [Authentik(authentikConfig)] : [],
  secret: getAuthSecret(),
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  trustHost: shouldTrustAuthHost(),
  useSecureCookies: shouldUseSecureCookies(),
  cookies: {
    sessionToken: getSessionCookieConfig(),
  },
  callbacks: {
    async signIn({ user, account }) {
      if (getAuthMode() !== "oidc") {
        return true;
      }

      const authentikSubject =
        account?.provider === "authentik"
          ? account.providerAccountId.trim()
          : "";
      if (!authentikSubject) {
        return false;
      }

      await storeBrowserUser(getPrismaClient(), {
        authentikSubject,
        email: user.email ?? null,
        displayName: user.name ?? null,
        isDev: false,
      });
      return true;
    },
    authorized({ auth, request }) {
      if (isPublicAuthPath(request.nextUrl.pathname)) {
        return true;
      }

      if (getAuthMode() === "dev") {
        return true;
      }

      return Boolean(auth?.user);
    },
    jwt({ token, account }) {
      if (account?.provider === "authentik") {
        const authentikSubject = account.providerAccountId.trim();
        if (!authentikSubject) {
          throw new Error("Authentik account subject is required");
        }

        token.authentikSubject = authentikSubject;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.authentikSubject === "string") {
        session.user.authentikSubject = token.authentikSubject;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
