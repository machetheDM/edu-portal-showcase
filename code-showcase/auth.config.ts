/**
 * EduPortal Auth Configuration
 * ============================
 * Route-level RBAC via the `authorized` callback.
 * No middleware.ts needed — protection happens inside NextAuth.
 */
import type { NextAuthConfig } from "next-auth";

const protectedPrefixes: Record<string, string[]> = {
  "/parent": ["PARENT", "ADMIN"],
  "/student": ["STUDENT", "ADMIN"],
  "/teacher": ["TEACHER", "ADMIN"],
  "/admin": ["ADMIN"],
};

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id   = user.id as string;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      const u = session.user as unknown as Record<string, unknown>;
      u.id   = token.id;
      u.role = token.role;
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Redirect logged-in users away from login page
      if (pathname.startsWith("/login")) {
        if (isLoggedIn) {
          const role = (auth?.user as { role?: string })?.role;
          return Response.redirect(new URL(getDashboardPath(role), nextUrl));
        }
        return true;
      }

      // Check role-based access for protected prefixes
      for (const [prefix, allowedRoles] of Object.entries(protectedPrefixes)) {
        if (pathname.startsWith(prefix)) {
          if (!isLoggedIn) {
            return Response.redirect(new URL("/login", nextUrl));
          }
          const role = (auth?.user as { role?: string })?.role;
          if (!role || !allowedRoles.includes(role)) {
            return Response.redirect(new URL(getDashboardPath(role), nextUrl));
          }
          return true;
        }
      }

      return true; // public routes
    },
  },
  providers: [], // populated in auth.ts
};

function getDashboardPath(role?: string): string {
  switch (role) {
    case "PARENT":  return "/parent";
    case "STUDENT": return "/student";
    case "TEACHER": return "/teacher";
    case "ADMIN":   return "/admin";
    default:        return "/login";
  }
}
