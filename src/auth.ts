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
    authorized({ auth, request }) {
      if (isPublicAuthPath(request.nextUrl.pathname)) {
        return true;
      }

      if (getAuthMode() === "dev") {
        return true;
      }

      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.authentikSubject = user.id;
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
