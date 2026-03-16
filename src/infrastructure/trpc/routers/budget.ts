import { z } from 'zod/v4'
import { protectedProcedure, router } from '../trpc'

export const budgetRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    return ctx.prisma.budget.findUnique({
      where: { familyId_month_year: { familyId, month, year } },
      include: {
        items: {
          include: {
            category: { select: { name: true, icon: true, color: true } },
          },
          orderBy: { category: { sortOrder: 'asc' } },
        },
      },
    })
  }),

  getByMonth: protectedProcedure
    .input(z.object({ month: z.int().min(1).max(12), year: z.int() }))
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      return ctx.prisma.budget.findUnique({
        where: {
          familyId_month_year: {
            familyId,
            month: input.month,
            year: input.year,
          },
        },
        include: {
          items: {
            include: {
              category: { select: { name: true, icon: true, color: true } },
            },
            orderBy: { category: { sortOrder: 'asc' } },
          },
        },
      })
    }),
})
