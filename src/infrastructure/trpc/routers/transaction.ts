import { z } from 'zod/v4'
import { protectedProcedure, router } from '../trpc'

const listInput = z.object({
  cursor: z.string().optional(),
  limit: z.int().min(1).max(100).default(20),
  memberId: z.string().optional(),
  categoryId: z.string().optional(),
  creditCardId: z.string().optional(),
  type: z
    .enum([
      'EXPENSE',
      'INCOME',
      'CARD_PAYMENT',
      'INTER_CARD_TRANSFER',
      'INTEREST_CHARGE',
      'FEE',
    ])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})

const createInput = z.object({
  amount: z.int().positive(),
  description: z.string().min(1).max(200),
  merchant: z.string().max(100).optional(),
  categoryId: z.string(),
  creditCardId: z.string().optional(),
  type: z.enum([
    'EXPENSE',
    'INCOME',
    'CARD_PAYMENT',
    'INTER_CARD_TRANSFER',
    'INTEREST_CHARGE',
    'FEE',
  ]),
  date: z.coerce.date(),
})

export const transactionRouter = router({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const familyId = ctx.session.user.familyId
    const {
      cursor,
      limit,
      memberId,
      categoryId,
      creditCardId,
      type,
      from,
      to,
    } = input

    const transactions = await ctx.prisma.transaction.findMany({
      where: {
        member: { familyId },
        ...(memberId && { memberId }),
        ...(categoryId && { categoryId }),
        ...(creditCardId && { creditCardId }),
        ...(type && { type }),
        ...((from || to) && {
          date: {
            ...(from && { gte: from }),
            ...(to && { lte: to }),
          },
        }),
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

  create: protectedProcedure
    .input(createInput)
    .mutation(async ({ ctx, input }) => {
      const memberId = ctx.session.user.id

      return ctx.prisma.transaction.create({
        data: {
          ...input,
          memberId,
          source: 'MANUAL',
        },
      })
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tx = await ctx.prisma.transaction.findUnique({
        where: { id: input.id },
        include: { member: { select: { familyId: true } } },
      })

      if (!tx || tx.member.familyId !== ctx.session.user.familyId) {
        throw new Error('Transaction not found')
      }

      return ctx.prisma.transaction.delete({ where: { id: input.id } })
    }),
})
