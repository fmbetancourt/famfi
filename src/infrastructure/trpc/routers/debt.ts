import { TRPCError } from '@trpc/server'
import { z } from 'zod/v4'
import {
  type CardInput,
  DebtCalculator,
} from '@/domain/services/DebtCalculator'
import { protectedProcedure, router } from '../trpc'

// ─── Shared schemas ───────────────────────────────────────────────────────────

const strategySchema = z.enum(['avalanche', 'snowball'])

const simulateInput = z.object({
  monthlyPayment: z.int().positive('El pago mensual debe ser mayor a cero'),
  strategy: strategySchema,
  /** Card IDs to exclude from the simulation (e.g. frozen or already paid). */
  excludeCardIds: z.array(z.string()).default([]),
})

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Fetches all active credit cards with outstanding balances for a family
 * and maps them to the CardInput shape required by DebtCalculator.
 */
async function fetchDebtCards(
  prisma: Parameters<
    Parameters<typeof protectedProcedure.query>[0]
  >[0]['ctx']['prisma'],
  familyId: string,
  excludeCardIds: string[] = []
): Promise<CardInput[]> {
  const cards = await prisma.creditCard.findMany({
    where: {
      owner: { familyId },
      currentBalance: { gt: 0 },
      isActive: true,
      ...(excludeCardIds.length > 0 && { id: { notIn: excludeCardIds } }),
    },
    select: {
      id: true,
      name: true,
      currentBalance: true,
      rateRevolving: true,
    },
    orderBy: { currentBalance: 'desc' },
  })

  return cards.map((c) => ({
    id: c.id,
    name: c.name,
    balance: c.currentBalance,
    monthlyRate: c.rateRevolving,
  }))
}

/**
 * Generates a human-readable plan name from the strategy and current date.
 * e.g. "Plan Avalanche – Marzo 2026"
 */
function buildPlanName(strategy: string): string {
  const strategyLabel = strategy === 'avalanche' ? 'Avalanche' : 'Snowball'
  const date = new Date()
  const month = date.toLocaleDateString('es-CL', { month: 'long' })
  const year = date.getFullYear()
  return `Plan ${strategyLabel} – ${month.charAt(0).toUpperCase()}${month.slice(1)} ${year}`
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const debtRouter = router({
  /**
   * Runs a debt payoff simulation for the family's cards using the chosen
   * strategy and monthly payment amount.
   *
   * Cards can be selectively excluded (e.g. frozen cards, minor-balance cards
   * the user wants to keep out of the simulation).
   *
   * Throws BAD_REQUEST if the monthly payment is below the minimum required
   * to cover all interest charges, or if there are no cards with debt.
   */
  simulate: protectedProcedure
    .input(simulateInput)
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const cards = await fetchDebtCards(
        ctx.prisma,
        familyId,
        input.excludeCardIds
      )

      if (cards.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No se encontraron tarjetas con deuda para simular',
        })
      }

      try {
        return DebtCalculator.simulatePayoff(
          cards,
          input.monthlyPayment,
          input.strategy
        )
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            err instanceof Error ? err.message : 'Error en la simulación',
        })
      }
    }),

  /**
   * Runs both avalanche and snowball simulations side by side.
   * Useful for the strategy comparison UI.
   *
   * Throws BAD_REQUEST if the monthly payment is below the minimum required.
   */
  compare: protectedProcedure
    .input(
      z.object({
        monthlyPayment: z
          .int()
          .positive('El pago mensual debe ser mayor a cero'),
        excludeCardIds: z.array(z.string()).default([]),
      })
    )
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const cards = await fetchDebtCards(
        ctx.prisma,
        familyId,
        input.excludeCardIds
      )

      if (cards.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No se encontraron tarjetas con deuda para comparar',
        })
      }

      try {
        return DebtCalculator.compareStrategies(cards, input.monthlyPayment)
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            err instanceof Error ? err.message : 'Error en la comparación',
        })
      }
    }),

  /**
   * Returns a high-level overview of the family's current debt:
   * total balance, estimated monthly interest, card count, and the
   * priority targets for each strategy.
   */
  getDebtOverview: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId

    const cards = await ctx.prisma.creditCard.findMany({
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
        creditLimit: true,
      },
      orderBy: { currentBalance: 'desc' },
    })

    if (cards.length === 0) {
      return {
        totalDebt: 0,
        estimatedMonthlyInterest: 0,
        minimumPaymentRequired: 0,
        cardCount: 0,
        avalancheTarget: null,
        snowballTarget: null,
      }
    }

    const cardInputs: CardInput[] = cards.map((c) => ({
      id: c.id,
      name: c.name,
      balance: c.currentBalance,
      monthlyRate: c.rateRevolving,
    }))

    const totalDebt = cards.reduce((sum, c) => sum + c.currentBalance, 0)
    const estimatedMonthlyInterest =
      DebtCalculator.calculateMinimumPayment(cardInputs).value

    // Avalanche target: highest rate first, ties broken by highest balance
    const avalancheTarget = [...cards].sort((a, b) => {
      if (b.rateRevolving !== a.rateRevolving) {
        return b.rateRevolving - a.rateRevolving
      }
      return b.currentBalance - a.currentBalance
    })[0]

    // Snowball target: lowest balance first
    const snowballTarget = [...cards].sort(
      (a, b) => a.currentBalance - b.currentBalance
    )[0]

    return {
      totalDebt,
      estimatedMonthlyInterest,
      minimumPaymentRequired: estimatedMonthlyInterest,
      cardCount: cards.length,
      avalancheTarget: {
        id: avalancheTarget.id,
        name: avalancheTarget.name,
        balance: avalancheTarget.currentBalance,
        monthlyRate: avalancheTarget.rateRevolving,
      },
      snowballTarget: {
        id: snowballTarget.id,
        name: snowballTarget.name,
        balance: snowballTarget.currentBalance,
        monthlyRate: snowballTarget.rateRevolving,
      },
    }
  }),

  /**
   * Saves a new debt payoff plan as the family's active plan.
   *
   * Runs a full simulation to compute and persist projected months and
   * total interest. Any previously active plan is deactivated atomically.
   *
   * Throws NOT_FOUND if there are no cards with outstanding debt.
   * Throws BAD_REQUEST if the monthly payment is below the minimum required.
   */
  savePlan: protectedProcedure
    .input(
      z.object({
        strategy: strategySchema,
        monthlyPayment: z
          .int()
          .positive('El pago mensual debe ser mayor a cero'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const cards = await fetchDebtCards(ctx.prisma, familyId)

      if (cards.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No hay tarjetas con deuda para guardar un plan',
        })
      }

      let simulation
      try {
        simulation = DebtCalculator.simulatePayoff(
          cards,
          input.monthlyPayment,
          input.strategy
        )
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            err instanceof Error ? err.message : 'Error al calcular el plan',
        })
      }

      // Deactivate all existing plans and create the new active one atomically
      const [, newPlan] = await ctx.prisma.$transaction([
        ctx.prisma.debtPayoffPlan.updateMany({
          where: { isActive: true },
          data: { isActive: false },
        }),
        ctx.prisma.debtPayoffPlan.create({
          data: {
            name: buildPlanName(input.strategy),
            strategy: input.strategy,
            monthlyPayment: input.monthlyPayment,
            isActive: true,
            projectedMonths: simulation.totalMonths,
            projectedInterest: simulation.totalInterestPaid,
            startDate: new Date(),
          },
        }),
      ])

      return newPlan
    }),

  /**
   * Returns the currently active debt payoff plan, or null if none exists.
   */
  getActivePlan: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.debtPayoffPlan.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  }),
})
