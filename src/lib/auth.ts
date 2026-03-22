import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// NextAuth v4 uses NEXTAUTH_URL to construct callback and CSRF URLs.
//
// Vercel exposes two URL variables:
//   VERCEL_URL         — deployment-specific (e.g. famfi-abc123.vercel.app).
//                        Changes on every push; users never access this directly.
//   VERCEL_BRANCH_URL  — stable branch alias (e.g. famfi-git-develop-team.vercel.app).
//                        The URL users actually hit on preview deployments.
//
// Using VERCEL_URL causes a cookie domain mismatch → redirect loop after login.
// On preview envs, always use VERCEL_BRANCH_URL so the cookie domain matches.
// On production, respect the explicit NEXTAUTH_URL env var (custom domain).
if (process.env.VERCEL_ENV === 'preview') {
  process.env.NEXTAUTH_URL = process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : `https://${process.env.VERCEL_URL}`
} else {
  process.env.NEXTAUTH_URL ??= 'http://localhost:3000'
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const member = await prisma.familyMember.findUnique({
          where: { email: credentials.email },
        })

        if (!member?.passwordHash) {
          return null
        }

        const isValid = await compare(credentials.password, member.passwordHash)

        if (!isValid) {
          return null
        }

        return {
          id: member.id,
          name: member.name,
          email: member.email,
          familyId: member.familyId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id
        token.familyId = user.familyId
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId
        session.user.familyId = token.familyId
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
