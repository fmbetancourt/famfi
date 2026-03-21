import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import type { TransactionFilter } from '@/domain/repositories/ITransactionRepository'
import { PrismaTransactionRepository } from './PrismaTransactionRepository'

// Prevent PrismaPg and NextAuth from loading during tests
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PrismaClient mock — only the tables used by PrismaTransactionRepository. */
function makePrisma() {
  return {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  } as unknown as PrismaClient
}

/** Builds a complete Prisma Transaction row with optional overrides. */
function makePrismaRow(
  overrides?: Partial<{
    id: string
    amount: number
    description: string
    merchant: string | null
    categoryId: string
    memberId: string
    creditCardId: string | null
    type: string
    isInterCard: boolean
    source: string
    date: Date
  }>
) {
  return {
    id: overrides?.id ?? 'tx-1',
    amount: overrides?.amount ?? 150_000,
    description: overrides?.description ?? 'Supermercado Jumbo',
    merchant: overrides?.merchant !== undefined ? overrides.merchant : 'Jumbo',
    categoryId: overrides?.categoryId ?? 'cat-food',
    memberId: overrides?.memberId ?? 'member-1',
    creditCardId:
      overrides?.creditCardId !== undefined ? overrides.creditCardId : 'card-1',
    type: overrides?.type ?? 'EXPENSE',
    isInterCard: overrides?.isInterCard ?? false,
    source: overrides?.source ?? 'MANUAL',
    date: overrides?.date ?? new Date('2026-03-15'),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PrismaTransactionRepository', () => {
  let prisma: ReturnType<typeof makePrisma>
  let repo: PrismaTransactionRepository

  beforeEach(() => {
    prisma = makePrisma()
    repo = new PrismaTransactionRepository(prisma as unknown as PrismaClient)
  })

  // ── findById ───────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns null when no record is found', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null)

      const result = await repo.findById('tx-missing')

      expect(result).toBeNull()
      expect(prisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: 'tx-missing' },
      })
    })

    it('returns mapped TransactionData when a record is found', async () => {
      const row = makePrismaRow()
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(row as never)

      const result = await repo.findById('tx-1')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('tx-1')
      expect(result?.amount).toBe(150_000)
      expect(result?.description).toBe('Supermercado Jumbo')
      expect(result?.merchant).toBe('Jumbo')
      expect(result?.categoryId).toBe('cat-food')
      expect(result?.memberId).toBe('member-1')
      expect(result?.creditCardId).toBe('card-1')
      expect(result?.type).toBe('EXPENSE')
      expect(result?.isInterCard).toBe(false)
      expect(result?.source).toBe('MANUAL')
      expect(result?.date).toEqual(new Date('2026-03-15'))
    })

    it('maps null merchant and creditCardId correctly', async () => {
      const row = makePrismaRow({ merchant: null, creditCardId: null })
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(row as never)

      const result = await repo.findById('tx-1')

      expect(result?.merchant).toBeNull()
      expect(result?.creditCardId).toBeNull()
    })
  })

  // ── findByFilter ───────────────────────────────────────────────────────

  describe('findByFilter', () => {
    it('calls findMany with empty where clause for empty filter', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])

      await repo.findByFilter({})

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with memberId', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])

      await repo.findByFilter({ memberId: 'member-1' })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { memberId: 'member-1' },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with creditCardId', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])

      await repo.findByFilter({ creditCardId: 'card-1' })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { creditCardId: 'card-1' },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with categoryId', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])

      await repo.findByFilter({ categoryId: 'cat-food' })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-food' },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with type', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])

      await repo.findByFilter({ type: 'INCOME' })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { type: 'INCOME' },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with both dateFrom and dateTo', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
      const from = new Date('2026-03-01')
      const to = new Date('2026-03-31')

      await repo.findByFilter({ dateFrom: from, dateTo: to })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { date: { gte: from, lte: to } },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with only dateFrom (no lte)', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
      const from = new Date('2026-03-01')

      await repo.findByFilter({ dateFrom: from })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { date: { gte: from } },
        orderBy: { date: 'desc' },
      })
    })

    it('builds where clause with only dateTo (no gte)', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
      const to = new Date('2026-03-31')

      await repo.findByFilter({ dateTo: to })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: { date: { lte: to } },
        orderBy: { date: 'desc' },
      })
    })

    it('builds combined where clause with all filters at once', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([])
      const filter: TransactionFilter = {
        memberId: 'member-1',
        creditCardId: 'card-1',
        categoryId: 'cat-food',
        type: 'EXPENSE',
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-12-31'),
      }

      await repo.findByFilter(filter)

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: {
          memberId: 'member-1',
          creditCardId: 'card-1',
          categoryId: 'cat-food',
          type: 'EXPENSE',
          date: { gte: filter.dateFrom, lte: filter.dateTo },
        },
        orderBy: { date: 'desc' },
      })
    })

    it('returns mapped TransactionData array', async () => {
      const rows = [
        makePrismaRow({ id: 'tx-1', amount: 200_000 }),
        makePrismaRow({ id: 'tx-2', amount: 50_000 }),
      ]
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(rows as never)

      const result = await repo.findByFilter({})

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('tx-1')
      expect(result[0].amount).toBe(200_000)
      expect(result[1].id).toBe('tx-2')
      expect(result[1].amount).toBe(50_000)
    })
  })

  // ── sumByFilter ────────────────────────────────────────────────────────

  describe('sumByFilter', () => {
    it('returns 0 when _sum.amount is null', async () => {
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)

      const result = await repo.sumByFilter({})

      expect(result).toBe(0)
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {},
        _sum: { amount: true },
      })
    })

    it('returns the aggregated amount when present', async () => {
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { amount: 1_500_000 },
      } as never)

      const result = await repo.sumByFilter({ type: 'EXPENSE' })

      expect(result).toBe(1_500_000)
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: { type: 'EXPENSE' },
        _sum: { amount: true },
      })
    })

    it('passes the full where clause derived from filter to aggregate', async () => {
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { amount: 500_000 },
      } as never)
      const from = new Date('2026-03-01')
      const to = new Date('2026-03-31')

      await repo.sumByFilter({
        memberId: 'member-1',
        dateFrom: from,
        dateTo: to,
      })

      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          memberId: 'member-1',
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      })
    })
  })

  // ── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('calls prisma.transaction.create with data and returns mapped TransactionData', async () => {
      const input = {
        amount: 300_000,
        description: 'Farmacia Cruz Verde',
        merchant: 'Cruz Verde',
        categoryId: 'cat-health',
        memberId: 'member-1',
        creditCardId: 'card-1',
        type: 'EXPENSE' as const,
        isInterCard: false,
        source: 'MANUAL' as const,
        date: new Date('2026-03-20'),
      }
      const row = makePrismaRow({
        id: 'tx-new',
        ...input,
      })
      vi.mocked(prisma.transaction.create).mockResolvedValue(row as never)

      const result = await repo.create(input)

      expect(prisma.transaction.create).toHaveBeenCalledWith({ data: input })
      expect(result.id).toBe('tx-new')
      expect(result.amount).toBe(300_000)
      expect(result.description).toBe('Farmacia Cruz Verde')
      expect(result.categoryId).toBe('cat-health')
      expect(result.type).toBe('EXPENSE')
      expect(result.source).toBe('MANUAL')
    })

    it('maps null merchant and creditCardId in create result', async () => {
      const input = {
        amount: 100_000,
        description: 'Transferencia',
        merchant: null,
        categoryId: 'cat-transfer',
        memberId: 'member-2',
        creditCardId: null,
        type: 'INCOME' as const,
        isInterCard: false,
        source: 'MANUAL' as const,
        date: new Date('2026-03-21'),
      }
      const row = makePrismaRow({ id: 'tx-income', ...input })
      vi.mocked(prisma.transaction.create).mockResolvedValue(row as never)

      const result = await repo.create(input)

      expect(result.merchant).toBeNull()
      expect(result.creditCardId).toBeNull()
      expect(result.type).toBe('INCOME')
    })
  })

  // ── delete ─────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('calls prisma.transaction.delete with the correct id', async () => {
      vi.mocked(prisma.transaction.delete).mockResolvedValue({} as never)

      await repo.delete('tx-to-delete')

      expect(prisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'tx-to-delete' },
      })
    })

    it('resolves to undefined (void)', async () => {
      vi.mocked(prisma.transaction.delete).mockResolvedValue({} as never)

      await expect(repo.delete('tx-1')).resolves.toBeUndefined()
    })
  })
})
