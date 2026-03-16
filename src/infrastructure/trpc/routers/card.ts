import { z } from 'zod/v4'
import { protectedProcedure, router } from '../trpc'

export const cardRouter = router({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    return ctx.prisma.creditCard.findMany({
      where: { owner: { familyId } },
      include: { owner: { select: { name: true } } },
      orderBy: { currentBalance: 'desc' },
    })
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const card = await ctx.prisma.creditCard.findUnique({
        where: { id: input.id },
        include: {
          owner: { select: { name: true, familyId: true } },
          balanceSnapshots: {
            orderBy: { snapshotDate: 'desc' },
            take: 12,
          },
        },
      })

      // Ensure the card belongs to the user's family
      if (!card || card.owner.familyId !== ctx.session.user.familyId) {
        return null
      }

      return card
    }),

  updateBalance: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        balance: z.int().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before updating
      const card = await ctx.prisma.creditCard.findUnique({
        where: { id: input.id },
        include: { owner: { select: { familyId: true } } },
      })

      if (!card || card.owner.familyId !== ctx.session.user.familyId) {
        throw new Error('Card not found')
      }

      return ctx.prisma.$transaction([
        ctx.prisma.creditCard.update({
          where: { id: input.id },
          data: { currentBalance: input.balance },
        }),
        ctx.prisma.balanceSnapshot.create({
          data: {
            creditCardId: input.id,
            balance: input.balance,
            snapshotDate: new Date(),
          },
        }),
      ])
    }),
})
