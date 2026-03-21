import { initTRPC, TRPCError } from '@trpc/server'
import type { Session } from 'next-auth'
import { getServerSession } from 'next-auth'
import type { PrismaClient } from '@/generated/prisma/client'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface TRPCContext {
  session: Session | null
  prisma: PrismaClient
}

// Context with guaranteed authenticated session
export interface AuthedTRPCContext extends TRPCContext {
  session: Session
}

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await getServerSession(authOptions)
  return { session, prisma }
}

const t = initTRPC.context<TRPCContext>().create()

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: { ...ctx, session: ctx.session } satisfies AuthedTRPCContext,
  })
})

export const router = t.router
export const publicProcedure = t.procedure
export const protectedProcedure = t.procedure.use(isAuthed)
