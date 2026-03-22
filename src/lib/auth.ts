import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// NextAuth v4 uses NEXTAUTH_URL to construct callback and CSRF URLs.
// On Vercel, VERCEL_URL is injected automatically and always matches the
// current deployment (preview or production). We always prefer it over a
// static NEXTAUTH_URL env var, which may point to a different deployment
// (e.g. the production URL being reused on a preview branch → cookie
// domain mismatch → redirect loop after login).
// Priority: https://${VERCEL_URL} → NEXTAUTH_URL → http://localhost:3000
if (process.env.VERCEL_URL) {
  process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`
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
