// src/lib/auth.ts
// NextAuth v4 authOptions — Google OAuth with JWT session strategy.
// user_id is always session.user.email (stable, human-readable — per RESEARCH.md Pattern 4 note).
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
    async jwt({ token, account }) {
      // Persist access_token on first sign-in only (account only present at that time)
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose accessToken server-side for Daytona proxy requests
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
};
