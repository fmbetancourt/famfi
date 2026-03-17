import { TRPCError } from '@trpc/server'
import { z } from 'zod/v4'
import { protectedProcedure, router } from '../trpc'

/** Percentage at which a budget item transitions to "warning" status. */
const BUDGET_WARNING_THRESHOLD = 0.8

/**
 * Emits budget threshold events after a transaction updates a BudgetItem.
 * Phase 1 (Week 2-4): structured console.warn.
 * Phase 2 (Week 5): replace with push/email notification service.
 */
function emitBudgetThresholdEvent(
  budgetId: string,
  categoryId: string,
  planned: number,
  actual: number
): void {
  if (planned === 0) return

  const progress = actual / planned

  if (progress > 1) {
    console.warn('[BudgetEvent] EXCEEDED', {
      budgetId,
      categoryId,
      planned,
      actual,
      progressPct: Math.round(progress * 100),
    })
  } else if (progress >= BUDGET_WARNING_THRESHOLD) {
    console.warn('[BudgetEvent] WARNING', {
      budgetId,
      categoryId,
      planned,
      actual,
      progressPct: Math.round(progress * 100),
    })
  }
}

const createInput = z.object({
  amount: z.int().positive(),
  description: z.string().min(1).max(200),
  merchant: z.string().max(100).optional(),
  categoryId: z.string(),
  creditCardId: z.string().nullable().optional(),
  memberId: z.string(),
  date: z.coerce.date(),
})

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.int().min(1).max(100).default(20),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  memberId: z.string().optional(),
  categoryId: z.string().optional(),
})

export const transactionRouter = router({
  /**
   * Create a transaction.
   * - If creditCardId is provided, atomically increments that card's currentBalance.
   * - If a budget exists for the transaction's month, updates the matching BudgetItem.actual.
   */
  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      // Verify member belongs to the family
      const member = await ctx.prisma.familyMember.findUnique({
        where: { id: input.memberId },
        select: { familyId: true },
      })
      if (member?.familyId !== familyId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'El miembro no pertenece a tu familia',
        })
      }

      // Verify card belongs to the family (if provided)
      if (input.creditCardId) {
        const card = await ctx.prisma.creditCard.findUnique({
          where: { id: input.creditCardId },
          select: { owner: { select: { familyId: true } } },
        })
        if (card?.owner.familyId !== familyId) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'La tarjeta no pertenece a tu familia',
          })
        }
      }

      const txMonth = input.date.getMonth() + 1
      const txYear = input.date.getFullYear()

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Create the transaction
        const transaction = await tx.transaction.create({
          data: {
            amount: input.amount,
            description: input.description,
            merchant: input.merchant ?? null,
            categoryId: input.categoryId,
            creditCardId: input.creditCardId ?? null,
            memberId: input.memberId,
            type: 'EXPENSE',
            source: 'MANUAL',
            date: input.date,
          },
          include: {
            category: { select: { name: true, icon: true, color: true } },
            member: { select: { name: true } },
            creditCard: { select: { name: true, bank: true } },
          },
        })

        // 2. Update card balance if paid with credit card
        if (input.creditCardId) {
          await tx.creditCard.update({
            where: { id: input.creditCardId },
            data: { currentBalance: { increment: input.amount } },
          })
        }

        // 3. Update budget item actual and emit threshold events if a budget exists
        const budget = await tx.budget.findUnique({
          where: {
            familyId_month_year: {
              familyId,
              month: txMonth,
              year: txYear,
            },
          },
          select: { id: true },
        })

        if (budget) {
          // Atomically increment actual and read the resulting values for threshold checks.
          // .catch(() => null) handles the case where no budget item exists for this category.
          const updatedItem = await tx.budgetItem
            .update({
              where: {
                budgetId_categoryId: {
                  budgetId: budget.id,
                  categoryId: input.categoryId,
                },
              },
              data: { actual: { increment: input.amount } },
              select: { actual: true, planned: true },
            })
            .catch(() => null)

          if (updatedItem) {
            emitBudgetThresholdEvent(
              budget.id,
              input.categoryId,
              updatedItem.planned,
              updatedItem.actual
            )
          }
        }

        return transaction
      })
    }),

  /**
   * List transactions with cursor-based pagination.
   * Scoped to the user's family. Includes category, member, and card relations.
   */
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const familyId = ctx.session.user.familyId
    const { cursor, limit, startDate, endDate, memberId, categoryId } = input

    const transactions = await ctx.prisma.transaction.findMany({
      where: {
        member: { familyId },
        date: { gte: startDate, lte: endDate },
        ...(memberId && { memberId }),
        ...(categoryId && { categoryId }),
      },
      include: {
        category: { select: { name: true, icon: true, color: true } },
        member: { select: { name: true } },
        creditCard: { select: { name: true, bank: true } },
      },
      orderBy: { date: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    })

    let nextCursor: string | undefined
    if (transactions.length > limit) {
      const next = transactions.pop()
      nextCursor = next?.id
    }

    return { items: transactions, nextCursor }
  }),

  /**
   * All categories, ordered by sortOrder, grouped by isFixed.
   */
  getCategories: protectedProcedure.query(async ({ ctx }) => {
    const categories = await ctx.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        nameEn: true,
        icon: true,
        color: true,
        isFixed: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    })

    const fixed = categories.filter((c) => c.isFixed)
    const variable = categories.filter((c) => !c.isFixed)

    return { fixed, variable, all: categories }
  }),

  /**
   * Active, non-frozen cards for a specific family member.
   * Used for the "¿Con qué pagaste?" selector.
   */
  getMemberCards: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      // Verify member belongs to the family
      const member = await ctx.prisma.familyMember.findUnique({
        where: { id: input.memberId },
        select: { familyId: true },
      })
      if (member?.familyId !== familyId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'El miembro no pertenece a tu familia',
        })
      }

      return ctx.prisma.creditCard.findMany({
        where: {
          ownerId: input.memberId,
          isActive: true,
          isFrozen: false,
        },
        select: {
          id: true,
          name: true,
          bank: true,
          lastFourDigits: true,
          creditLimit: true,
          currentBalance: true,
        },
        orderBy: { bank: 'asc' },
      })
    }),

  /**
   * Delete a transaction. Reverses the card balance and budget item if applicable.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const familyId = ctx.session.user.familyId

      const existing = await ctx.prisma.transaction.findUnique({
        where: { id: input.id },
        include: { member: { select: { familyId: true } } },
      })

      if (!existing || existing.member.familyId !== familyId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Transacción no encontrada',
        })
      }

      const txMonth = existing.date.getMonth() + 1
      const txYear = existing.date.getFullYear()

      return ctx.prisma.$transaction(async (tx) => {
        // 1. Delete the transaction
        await tx.transaction.delete({ where: { id: input.id } })

        // 2. Reverse card balance if it was a card expense
        if (existing.creditCardId) {
          await tx.creditCard.update({
            where: { id: existing.creditCardId },
            data: { currentBalance: { decrement: existing.amount } },
          })
        }

        // 3. Reverse budget item actual
        const budget = await tx.budget.findUnique({
          where: {
            familyId_month_year: {
              familyId,
              month: txMonth,
              year: txYear,
            },
          },
          select: { id: true },
        })

        if (budget) {
          await tx.budgetItem
            .update({
              where: {
                budgetId_categoryId: {
                  budgetId: budget.id,
                  categoryId: existing.categoryId,
                },
              },
              data: { actual: { decrement: existing.amount } },
            })
            .catch(() => {
              // No matching budget item — skip
            })
        }
      })
    }),
})
