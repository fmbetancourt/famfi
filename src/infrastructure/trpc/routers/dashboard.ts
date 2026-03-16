import { protectedProcedure, router } from '../trpc'

// Colors for the debt distribution chart
const CHART_COLORS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#84CC16',
  '#06B6D4',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#F59E0B',
  '#6366F1',
]

export const dashboardRouter = router({
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
      where: { owner: { familyId }, isActive: true },
      select: { currentBalance: true, creditLimit: true },
    })

    const totalDebt = cards.reduce((sum, c) => sum + c.currentBalance, 0)
    const totalLimit = cards.reduce((sum, c) => sum + c.creditLimit, 0)

    return {
      totalDebt,
      totalLimit,
      cardCount: cards.length,
    }
  }),

  getDebtDistribution: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
      where: {
        owner: { familyId },
        isActive: true,
        currentBalance: { gt: 0 },
      },
      select: { name: true, currentBalance: true },
      orderBy: { currentBalance: 'desc' },
    })

    // Top 4 cards individually, rest grouped as "Otras"
    const top = cards.slice(0, 4)
    const rest = cards.slice(4)

    const slices = top.map((c, i) => ({
      name: c.name,
      value: c.currentBalance,
      color: CHART_COLORS[i],
    }))

    if (rest.length > 0) {
      const otherTotal = rest.reduce((sum, c) => sum + c.currentBalance, 0)
      slices.push({
        name: `Otras (${rest.length} tarjetas)`,
        value: otherTotal,
        color: '#94A3B8',
      })
    }

    return slices
  }),

  getUpcomingPayments: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
      where: { owner: { familyId }, isActive: true, currentBalance: { gt: 0 } },
      select: { bank: true, paymentDueDay: true },
    })

    // Group by bank + due day (multiple cards from same bank share a due date)
    const grouped = new Map<string, number>()
    for (const card of cards) {
      const key = `${card.bank}|${card.paymentDueDay}`
      if (!grouped.has(key)) {
        grouped.set(key, card.paymentDueDay)
      }
    }

    const today = new Date()
    const day = today.getDate()

    function daysUntil(dueDay: number): number {
      if (day <= dueDay) return dueDay - day
      const nextMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        dueDay
      )
      return Math.ceil(
        (nextMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )
    }

    const payments = Array.from(grouped.entries()).map(([key, dueDay]) => ({
      bank: key.split('|')[0],
      dueDay,
      daysLeft: daysUntil(dueDay),
    }))

    return payments.sort((a, b) => a.daysLeft - b.daysLeft)
  }),

  getMonthlyBudget: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const budget = await ctx.prisma.budget.findUnique({
      where: { familyId_month_year: { familyId, month, year } },
      include: { items: true },
    })

    if (!budget) {
      return { planned: 0, spent: 0, month, year }
    }

    const planned = budget.totalPlanned
    const spent = budget.items.reduce((sum, item) => sum + item.actual, 0)

    return { planned, spent, month, year }
  }),
})
