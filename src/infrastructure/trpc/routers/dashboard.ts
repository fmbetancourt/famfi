import {
  type CardInput,
  DebtCalculator,
  type PayoffStrategy,
} from '@/domain/services/DebtCalculator'
import { protectedProcedure, router } from '../trpc'

// ─── Budget deviation helpers ─────────────────────────────────────────────────

/** Mirrors the same threshold used in the budget router. */
const WARNING_THRESHOLD = 0.8

type DeviationStatus = 'ok' | 'warning' | 'exceeded'

function computeDeviationStatus(
  planned: number,
  actual: number
): DeviationStatus {
  if (actual > planned) return 'exceeded'
  if (planned > 0 && actual / planned >= WARNING_THRESHOLD) return 'warning'
  return 'ok'
}

// ─── Chart colors ─────────────────────────────────────────────────────────────

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
  /**
   * Summary card: total debt, card count with debt, estimated monthly interest,
   * total credit limit, and available monthly budget (income - fixed expenses).
   */
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
      where: { owner: { familyId }, isActive: true },
      select: {
        currentBalance: true,
        creditLimit: true,
        rateRevolving: true,
      },
    })

    const cardsWithDebt = cards.filter((c) => c.currentBalance > 0)
    const totalDebt = cards.reduce((sum, c) => sum + c.currentBalance, 0)
    const totalLimit = cards.reduce((sum, c) => sum + c.creditLimit, 0)
    const monthlyInterest = cardsWithDebt.reduce(
      (sum, c) => sum + Math.round((c.currentBalance * c.rateRevolving) / 100),
      0
    )

    // Monthly available = total income - fixed expenses (from current budget)
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const [incomes, budget] = await Promise.all([
      ctx.prisma.income.aggregate({
        where: { member: { familyId }, isRecurring: true },
        _sum: { amount: true },
      }),
      ctx.prisma.budget.findUnique({
        where: { familyId_month_year: { familyId, month, year } },
        include: {
          items: {
            include: { category: { select: { isFixed: true } } },
          },
        },
      }),
    ])

    const totalIncome = incomes._sum.amount ?? 0
    const fixedExpenses = budget
      ? budget.items
          .filter((i) => i.category.isFixed)
          .reduce((sum, i) => sum + i.planned, 0)
      : 0

    return {
      totalDebt,
      totalLimit,
      cardCount: cards.length,
      cardsWithDebt: cardsWithDebt.length,
      monthlyInterest,
      totalIncome,
      availableAfterFixed: totalIncome - fixedExpenses,
    }
  }),

  /**
   * Debt distribution for pie chart: each card with balance, percentage, color.
   * Top 4 individual + rest grouped.
   */
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

    const totalDebt = cards.reduce((sum, c) => sum + c.currentBalance, 0)
    const top = cards.slice(0, 4)
    const rest = cards.slice(4)

    const slices = top.map((c, i) => ({
      name: c.name,
      value: c.currentBalance,
      // v8 ignore: totalDebt > 0 always (cards are filtered by currentBalance > 0 above)
      /* v8 ignore next */
      percentage:
        totalDebt > 0 ? Math.round((c.currentBalance / totalDebt) * 100) : 0,
      color: CHART_COLORS[i],
    }))

    if (rest.length > 0) {
      const otherTotal = rest.reduce((sum, c) => sum + c.currentBalance, 0)
      slices.push({
        name: `Otras (${rest.length} tarjetas)`,
        value: otherTotal,
        // v8 ignore: totalDebt > 0 always (rest only exists when cards have positive balance)
        /* v8 ignore next */
        percentage:
          totalDebt > 0 ? Math.round((otherTotal / totalDebt) * 100) : 0,
        color: '#94A3B8',
      })
    }

    return { slices, totalDebt }
  }),

  /**
   * Upcoming payments: cards with active debt grouped by bank,
   * with due day, days remaining, and total minimum payment per bank.
   */
  getUpcomingPayments: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
      where: {
        owner: { familyId },
        isActive: true,
        currentBalance: { gt: 0 },
      },
      select: {
        bank: true,
        paymentDueDay: true,
        currentBalance: true,
        rateRevolving: true,
      },
    })

    // Group by bank|dueDay, summing balances and interest for minimum payment
    const grouped = new Map<
      string,
      {
        bank: string
        dueDay: number
        totalBalance: number
        totalMinPayment: number
      }
    >()

    for (const card of cards) {
      const key = `${card.bank}|${card.paymentDueDay}`
      const existing = grouped.get(key)
      // Minimum payment estimate: ~2% of balance or the interest, whichever is higher
      const interest = Math.round(
        (card.currentBalance * card.rateRevolving) / 100
      )
      const twoPct = Math.round(card.currentBalance * 0.02)
      const minPayment = Math.max(interest, twoPct)

      if (existing) {
        existing.totalBalance += card.currentBalance
        existing.totalMinPayment += minPayment
      } else {
        grouped.set(key, {
          bank: card.bank,
          dueDay: card.paymentDueDay,
          totalBalance: card.currentBalance,
          totalMinPayment: minPayment,
        })
      }
    }

    const today = new Date()
    const day = today.getDate()

    function daysUntil(dueDay: number): number {
      if (day <= dueDay) return dueDay - day
      const nextMonth = new Date(
        Date.UTC(today.getFullYear(), today.getMonth() + 1, dueDay)
      )
      const fromUTC = new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), day)
      )
      return Math.round(
        (nextMonth.getTime() - fromUTC.getTime()) / (1000 * 60 * 60 * 24)
      )
    }

    const payments = Array.from(grouped.values()).map((g) => ({
      bank: g.bank,
      dueDay: g.dueDay,
      daysLeft: daysUntil(g.dueDay),
      totalBalance: g.totalBalance,
      minPayment: g.totalMinPayment,
    }))

    return payments.sort((a, b) => a.daysLeft - b.daysLeft)
  }),

  /**
   * Debt plan widget: returns either a "no plan" summary (total debt + CTA)
   * or the active plan status (remaining months, progress, next freed card).
   *
   * Re-runs DebtCalculator with current balances so remaining months stay
   * accurate even as the family pays down debt month over month.
   * Falls back to projectedMonths if re-simulation fails (e.g. payment
   * is now below minimum due to new spending on a card).
   */
  getDebtPlanWidget: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const [activePlan, dbCards] = await Promise.all([
      ctx.prisma.debtPayoffPlan.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      ctx.prisma.creditCard.findMany({
        where: {
          owner: { familyId },
          currentBalance: { gt: 0 },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          currentBalance: true,
          rateRevolving: true,
        },
      }),
    ])

    const currentTotalDebt = dbCards.reduce(
      (sum, c) => sum + c.currentBalance,
      0
    )

    if (!activePlan) {
      return { hasPlan: false as const, totalDebt: currentTotalDebt }
    }

    // Re-simulate with current balances for live remaining months and next card
    const cardInputs: CardInput[] = dbCards.map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.currentBalance,
      monthlyRate: c.rateRevolving,
    }))

    const strategy: PayoffStrategy =
      activePlan.strategy === 'snowball' ? 'snowball' : 'avalanche'

    let remainingMonths = activePlan.projectedMonths ?? 0
    let nextCard: { name: string; month: number } | null = null

    if (cardInputs.length > 0) {
      try {
        const sim = DebtCalculator.simulatePayoff(
          cardInputs,
          activePlan.monthlyPayment,
          strategy
        )
        remainingMonths = sim.totalMonths
        if (sim.freedCards[0]) {
          nextCard = {
            name: sim.freedCards[0].cardName,
            month: sim.freedCards[0].month,
          }
        }
      } catch {
        // Monthly payment now below minimum — keep projectedMonths as fallback
      }
    }

    // Algebraic derivation: initial debt = total payments − total interest
    // (principal = monthlyPayment × months − projectedInterest)
    const estimatedInitialDebt =
      activePlan.monthlyPayment * (activePlan.projectedMonths ?? 0) -
      (activePlan.projectedInterest ?? 0)

    return {
      hasPlan: true as const,
      planName: activePlan.name,
      monthlyPayment: activePlan.monthlyPayment,
      remainingMonths,
      originalMonths: activePlan.projectedMonths ?? 0,
      estimatedInitialDebt,
      currentTotalDebt,
      nextCard,
    }
  }),

  /**
   * Monthly spending by category vs budget.
   * Sums actual transactions for the current month, grouped by category,
   * and compares against budgeted amounts.
   */
  getMonthlySpending: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

    const [transactions, budget] = await Promise.all([
      ctx.prisma.transaction.groupBy({
        by: ['categoryId'],
        where: {
          member: { familyId },
          type: 'EXPENSE',
          date: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
      }),
      ctx.prisma.budget.findUnique({
        where: { familyId_month_year: { familyId, month, year } },
        include: {
          items: {
            include: {
              category: {
                select: { id: true, name: true, icon: true, color: true },
              },
            },
          },
        },
      }),
    ])

    // Build a map of categoryId -> actual spending
    const spendingMap = new Map<string, number>()
    for (const t of transactions) {
      spendingMap.set(t.categoryId, t._sum.amount ?? 0)
    }

    const totalSpent = transactions.reduce(
      (sum, t) => sum + (t._sum.amount ?? 0),
      0
    )
    const totalPlanned = budget?.totalPlanned ?? 0

    // Build per-category breakdown if budget exists
    const categories = budget
      ? budget.items.map((item) => ({
          categoryId: item.categoryId,
          name: item.category.name,
          icon: item.category.icon,
          color: item.category.color,
          planned: item.planned,
          spent: spendingMap.get(item.categoryId) ?? 0,
        }))
      : []

    const hasBudget = budget !== null
    const dayOfMonth = now.getDate()
    const daysInMonth = new Date(year, month, 0).getDate()

    // Top 3 categories by spending progress — only those with actual spending.
    const topDeviations = categories
      .filter((c) => c.spent > 0)
      .map((c) => ({
        name: c.name,
        icon: c.icon,
        color: c.color,
        planned: c.planned,
        actual: c.spent,
        progress: c.planned > 0 ? Math.round((c.spent / c.planned) * 100) : 0,
        status: computeDeviationStatus(c.planned, c.spent),
      }))
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 3)

    return {
      month,
      year,
      totalPlanned,
      totalSpent,
      hasBudget,
      categories,
      topDeviations,
      dayOfMonth,
      daysInMonth,
    }
  }),
})
