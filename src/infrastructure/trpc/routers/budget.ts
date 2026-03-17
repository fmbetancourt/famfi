import { TRPCError } from '@trpc/server'
import { z } from 'zod/v4'
import { BudgetAllocator } from '@/domain/services/BudgetAllocator'
import { Money } from '@/domain/value-objects/Money'
import { PrismaBudgetRepository } from '@/infrastructure/persistence/PrismaBudgetRepository'
import { protectedProcedure, router } from '../trpc'

// ─── Thresholds ──────────────────────────────────────────────────────────────

/** Percentage of planned at which a budget item becomes a warning. */
const WARNING_THRESHOLD = 0.8

type ItemStatus = 'ok' | 'warning' | 'exceeded'

function computeStatus(planned: number, actual: number): ItemStatus {
  if (actual > planned) return 'exceeded'
  if (planned > 0 && actual / planned >= WARNING_THRESHOLD) return 'warning'
  return 'ok'
}

function computeProgress(planned: number, actual: number): number {
  if (planned === 0) return 0
  return Math.round((actual / planned) * 100)
}

// ─── Shared input schemas ────────────────────────────────────────────────────

const monthYearInput = z.object({
  month: z.int().min(1).max(12),
  year: z.int().min(2020).max(2100),
})

// ─── Router ──────────────────────────────────────────────────────────────────

export const budgetRouter = router({
  /**
   * Returns the current month's budget (used by the dashboard).
   * Raw Prisma data — no derived fields added to preserve backward compatibility.
   */
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const familyId = ctx.session.user.familyId
    const now = new Date()

    return ctx.prisma.budget.findUnique({
      where: {
        familyId_month_year: {
          familyId,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
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

  /**
   * Returns the budget for a specific month with computed progress and status
   * per item. Returns null if no budget exists for that month.
   */
  getByMonth: protectedProcedure
    .input(monthYearInput)
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const budget = await ctx.prisma.budget.findUnique({
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
              category: {
                select: { id: true, name: true, icon: true, color: true },
              },
            },
            orderBy: { category: { sortOrder: 'asc' } },
          },
        },
      })

      if (!budget) return null

      const items = budget.items.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        category: item.category,
        planned: item.planned,
        actual: item.actual,
        progress: computeProgress(item.planned, item.actual),
        status: computeStatus(item.planned, item.actual),
      }))

      const totalActual = items.reduce((sum, i) => sum + i.actual, 0)

      return {
        id: budget.id,
        month: budget.month,
        year: budget.year,
        totalIncome: budget.totalIncome,
        totalPlanned: budget.totalPlanned,
        totalActual,
        remainingIncome: budget.totalIncome - totalActual,
        items,
      }
    }),

  /**
   * Creates a new budget for the given month/year.
   * Throws CONFLICT if a budget already exists for that month.
   * totalIncome is derived from the family's recurring income records.
   */
  create: protectedProcedure
    .input(
      monthYearInput.extend({
        items: z
          .array(
            z.object({
              categoryId: z.string().min(1),
              planned: z.int().positive(),
            })
          )
          .min(1, 'El presupuesto debe tener al menos una categoría'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      // Guard: prevent duplicate budgets for the same month
      const existing = await ctx.prisma.budget.findUnique({
        where: {
          familyId_month_year: {
            familyId,
            month: input.month,
            year: input.year,
          },
        },
        select: { id: true },
      })
      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ya existe un presupuesto para ${input.month}/${input.year}`,
        })
      }

      // Derive totalIncome from the family's recurring incomes
      const totalIncome = await ctx.prisma.income
        .aggregate({
          where: { member: { familyId }, isRecurring: true },
          _sum: { amount: true },
        })
        .then((r) => r._sum.amount ?? 0)

      const totalPlanned = input.items.reduce((sum, i) => sum + i.planned, 0)

      const repo = new PrismaBudgetRepository(ctx.prisma)
      return repo.save({
        familyId,
        month: input.month,
        year: input.year,
        totalIncome,
        totalPlanned,
        items: input.items.map((i) => ({
          id: '', // generated by Prisma
          categoryId: i.categoryId,
          planned: i.planned,
          actual: 0,
        })),
      })
    }),

  /**
   * Updates the planned (budgeted) amount for a single budget item.
   * Recalculates the parent budget's totalPlanned atomically.
   */
  updateItem: protectedProcedure
    .input(
      z.object({
        budgetItemId: z.string().min(1),
        planned: z.int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      // Verify the item belongs to this family
      const item = await ctx.prisma.budgetItem.findUnique({
        where: { id: input.budgetItemId },
        select: { budget: { select: { familyId: true } } },
      })
      if (item?.budget.familyId !== familyId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Item de presupuesto no encontrado',
        })
      }

      const repo = new PrismaBudgetRepository(ctx.prisma)
      await repo.updatePlanned(input.budgetItemId, input.planned)
    }),

  /**
   * Copies a budget from one month to another, resetting all actuals to zero.
   * Throws NOT_FOUND if the source budget does not exist.
   * Throws CONFLICT if the target month already has a budget.
   */
  duplicate: protectedProcedure
    .input(
      z.object({
        sourceMonth: z.int().min(1).max(12),
        sourceYear: z.int(),
        targetMonth: z.int().min(1).max(12),
        targetYear: z.int(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const source = await ctx.prisma.budget.findUnique({
        where: {
          familyId_month_year: {
            familyId,
            month: input.sourceMonth,
            year: input.sourceYear,
          },
        },
        include: { items: { select: { categoryId: true, planned: true } } },
      })
      if (!source) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No existe presupuesto para ${input.sourceMonth}/${input.sourceYear}`,
        })
      }

      const targetExists = await ctx.prisma.budget.findUnique({
        where: {
          familyId_month_year: {
            familyId,
            month: input.targetMonth,
            year: input.targetYear,
          },
        },
        select: { id: true },
      })
      if (targetExists) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Ya existe un presupuesto para ${input.targetMonth}/${input.targetYear}`,
        })
      }

      // Derive fresh totalIncome for the new month
      const totalIncome = await ctx.prisma.income
        .aggregate({
          where: { member: { familyId }, isRecurring: true },
          _sum: { amount: true },
        })
        .then((r) => r._sum.amount ?? 0)

      const repo = new PrismaBudgetRepository(ctx.prisma)
      return repo.save({
        familyId,
        month: input.targetMonth,
        year: input.targetYear,
        totalIncome,
        totalPlanned: source.totalPlanned,
        items: source.items.map((i) => ({
          id: '',
          categoryId: i.categoryId,
          planned: i.planned,
          actual: 0,
        })),
      })
    }),

  /**
   * Returns suggested monthly budget amounts per category based on the
   * 3 months of EXPENSE transactions preceding the requested month.
   * Returns empty array if no transaction history exists.
   */
  getSuggestion: protectedProcedure
    .input(monthYearInput)
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      // Compute the 3-month window before the target month
      const targetDate = new Date(input.year, input.month - 1, 1)
      const endDate = new Date(targetDate.getTime() - 1) // last ms of previous month
      const startDate = new Date(
        endDate.getFullYear(),
        endDate.getMonth() - 2, // go back 3 full months
        1
      )

      const transactions = await ctx.prisma.transaction.findMany({
        where: {
          member: { familyId },
          type: 'EXPENSE',
          date: { gte: startDate, lte: endDate },
        },
        select: { categoryId: true, amount: true, date: true },
      })

      // Collect all categories referenced in suggestions for enrichment
      const income = await ctx.prisma.income
        .aggregate({
          where: { member: { familyId }, isRecurring: true },
          _sum: { amount: true },
        })
        .then((r) => Money.fromPesos(r._sum.amount ?? 0))

      const suggestions = BudgetAllocator.suggestBudget(
        transactions.map((tx) => ({
          categoryId: tx.categoryId,
          amount: tx.amount,
          date: tx.date,
        })),
        income
      )

      if (suggestions.length === 0) return []

      // Enrich suggestions with category metadata
      const categoryIds = suggestions.map((s) => s.categoryId)
      const categories = await ctx.prisma.category.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, icon: true, color: true },
      })
      const categoryMap = new Map(categories.map((c) => [c.id, c]))

      return suggestions
        .map((s) => ({
          categoryId: s.categoryId,
          category: categoryMap.get(s.categoryId) ?? null,
          suggestedAmount: s.suggestedAmount.value,
        }))
        .filter((s) => s.category !== null)
        .sort((a, b) => b.suggestedAmount - a.suggestedAmount)
    }),

  /**
   * Recalculates all BudgetItem.actual values for a given month by summing
   * real EXPENSE transactions. Use this to repair actuals after data corrections
   * or bulk imports.
   */
  recalculateActuals: protectedProcedure
    .input(monthYearInput)
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const budget = await ctx.prisma.budget.findUnique({
        where: {
          familyId_month_year: {
            familyId,
            month: input.month,
            year: input.year,
          },
        },
        select: { id: true },
      })
      if (!budget) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No existe presupuesto para ${input.month}/${input.year}`,
        })
      }

      const repo = new PrismaBudgetRepository(ctx.prisma)
      await repo.recalculateActuals(budget.id)
    }),
})
