import CredentialsProvider from 'next-auth/providers/credentials';
import type { NextAuthOptions } from 'next-auth';

/**
 * Login requires AUTH_USERNAME and AUTH_PASSWORD.
 * There is no in-code username or password. Unset env rejects every login.
 */
export function readAuthCredentials(): { username: string; password: string } | null {
  const username = process.env.AUTH_USERNAME?.trim() ?? '';
  const password = process.env.AUTH_PASSWORD ?? '';
  if (!username || password.length === 0) return null;
  return { username, password };
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const configured = readAuthCredentials();
        if (!configured) {
          console.error('Login rejected: set AUTH_USERNAME and AUTH_PASSWORD. There is no default login.');
          return null;
        }

        const username = credentials?.username ?? '';
        const password = credentials?.password ?? '';
        if (username === configured.username && password === configured.password) {
          return {
            id: '1',
            name: username,
            email: `${username}@referralgenie.com`,
          };
        }

        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // Only a token minted with the secret carries this; lib/tenant honors it outside production.
        if (typeof token.tenantOrganizationId === 'string') {
          (session.user as { tenantOrganizationId?: string }).tenantOrganizationId = token.tenantOrganizationId;
        }
      }
      return session;
    },
  },
};
