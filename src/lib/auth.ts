// src/lib/auth.ts
// NextAuth v4 authOptions — Google OAuth with JWT session strategy.
// user_id is always session.user.email (stable, human-readable — per RESEARCH.md Pattern 4 note).
//
// Type augmentation for when accessToken is re-added (Phase 4 — Daytona proxy):
//   declare module 'next-auth' { interface Session { accessToken?: string } }
//   declare module 'next-auth/jwt' { interface JWT { accessToken?: string } }
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    async jwt({ token }) {
      // NOTE (Phase 4 — Daytona): to propagate the Google access token, add:
      //   if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
    async session({ session }) {
      // NOTE (Phase 4 — Daytona): to expose accessToken, add:
      //   session.accessToken = token.accessToken;
      return session;
    },
  },
};
