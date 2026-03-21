import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { PrismaBudgetRepository } from './PrismaBudgetRepository'

// Prevent PrismaPg and NextAuth from loading during tests
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PrismaClient mock — only the tables used by PrismaBudgetRepository. */
function makePrisma() {
  return {
    budget: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    budgetItem: {
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    transaction: {
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

/** Builds a complete Prisma budget row with optional item overrides. */
function makePrismaRow(
  overrides?: Partial<{
    id: string
    familyId: string
    month: number
    year: number
    totalIncome: number
    totalPlanned: number
    items: Array<{
      id: string
      categoryId: string
      planned: number
      actual: number
    }>
  }>
) {
  const items = overrides?.items ?? [
    {
      id: 'item-1',
      categoryId: 'cat-A',
      planned: 100_000,
      actual: 80_000,
      budgetId: 'budget-1',
    },
    {
      id: 'item-2',
      categoryId: 'cat-B',
      planned: 200_000,
      actual: 150_000,
      budgetId: 'budget-1',
    },
  ]
  return {
    id: overrides?.id ?? 'budget-1',
    familyId: overrides?.familyId ?? 'family-1',
    month: overrides?.month ?? 3,
    year: overrides?.year ?? 2026,
    totalIncome: overrides?.totalIncome ?? 5_000_000,
    totalPlanned: overrides?.totalPlanned ?? 300_000,
    items,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PrismaBudgetRepository', () => {
  let prisma: ReturnType<typeof makePrisma>
  let repo: PrismaBudgetRepository

  beforeEach(() => {
    prisma = makePrisma()
    repo = new PrismaBudgetRepository(prisma as unknown as PrismaClient)
  })

  // ── findByMonthYear ──────────────────────────────────────────────────────

  describe('findByMonthYear', () => {
    it('returns null when no record is found', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null)

      const result = await repo.findByMonthYear('family-1', 3, 2026)

      expect(result).toBeNull()
      expect(prisma.budget.findUnique).toHaveBeenCalledWith({
        where: {
          familyId_month_year: { familyId: 'family-1', month: 3, year: 2026 },
        },
        include: { items: true },
      })
    })

    it('returns mapped BudgetData when a record is found', async () => {
      const row = makePrismaRow()
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(row as never)

      const result = await repo.findByMonthYear('family-1', 3, 2026)

      expect(result).not.toBeNull()
      expect(result?.id).toBe('budget-1')
      expect(result?.familyId).toBe('family-1')
      expect(result?.month).toBe(3)
      expect(result?.year).toBe(2026)
      expect(result?.totalIncome).toBe(5_000_000)
      expect(result?.totalPlanned).toBe(300_000)
      expect(result?.items).toHaveLength(2)
      expect(result?.items[0]).toEqual({
        id: 'item-1',
        categoryId: 'cat-A',
        planned: 100_000,
        actual: 80_000,
      })
      expect(result?.items[1]).toEqual({
        id: 'item-2',
        categoryId: 'cat-B',
        planned: 200_000,
        actual: 150_000,
      })
    })
  })

  // ── findLatest ───────────────────────────────────────────────────────────

  describe('findLatest', () => {
    it('returns null when no record is found', async () => {
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(null)

      const result = await repo.findLatest('family-1')

      expect(result).toBeNull()
      expect(prisma.budget.findFirst).toHaveBeenCalledWith({
        where: { familyId: 'family-1' },
        include: { items: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })
    })

    it('returns mapped BudgetData ordered by year desc, month desc', async () => {
      const row = makePrismaRow({ month: 12, year: 2025 })
      vi.mocked(prisma.budget.findFirst).mockResolvedValue(row as never)

      const result = await repo.findLatest('family-1')

      expect(result?.month).toBe(12)
      expect(result?.year).toBe(2025)
      expect(result?.items).toHaveLength(2)
    })
  })

  // ── save ──────────────────────────────────────────────────────────────────

  describe('save', () => {
    it('calls prisma.budget.create with derived totalPlanned and returns BudgetData', async () => {
      const input = {
        familyId: 'family-1',
        month: 4,
        year: 2026,
        totalIncome: 4_000_000,
        items: [
          { id: 'item-1', categoryId: 'cat-A', planned: 150_000, actual: 0 },
          { id: 'item-2', categoryId: 'cat-B', planned: 250_000, actual: 0 },
        ],
      }
      // totalPlanned should be derived: 150_000 + 250_000 = 400_000
      const row = makePrismaRow({
        month: 4,
        year: 2026,
        totalIncome: 4_000_000,
        totalPlanned: 400_000,
      })
      vi.mocked(prisma.budget.create).mockResolvedValue(row as never)

      const result = await repo.save(input)

      expect(prisma.budget.create).toHaveBeenCalledWith({
        data: {
          familyId: 'family-1',
          month: 4,
          year: 2026,
          totalIncome: 4_000_000,
          totalPlanned: 400_000, // derived from items.reduce
          items: {
            create: [
              { categoryId: 'cat-A', planned: 150_000, actual: 0 },
              { categoryId: 'cat-B', planned: 250_000, actual: 0 },
            ],
          },
        },
        include: { items: true },
      })
      expect(result.totalPlanned).toBe(400_000)
    })

    it('derives totalPlanned via items.reduce (ignores input totalPlanned if present)', async () => {
      const input = {
        familyId: 'family-1',
        month: 5,
        year: 2026,
        totalIncome: 3_000_000,
        items: [{ id: 'x', categoryId: 'cat-X', planned: 50_000, actual: 0 }],
      }
      const row = makePrismaRow({
        totalPlanned: 50_000,
        items: [{ id: 'x', categoryId: 'cat-X', planned: 50_000, actual: 0 }],
      })
      vi.mocked(prisma.budget.create).mockResolvedValue(row as never)

      await repo.save(input)

      // totalPlanned passed to prisma must be 50_000 (from the single item)
      const createArg = vi.mocked(prisma.budget.create).mock.calls[0][0]
      expect(createArg.data.totalPlanned).toBe(50_000)
    })
  })

  // ── updateItem ────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    it('calls prisma.budgetItem.update with correct args and returns void', async () => {
      vi.mocked(prisma.budgetItem.update).mockResolvedValue({} as never)

      await repo.updateItem('item-1', 95_000)

      expect(prisma.budgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { actual: 95_000 },
      })
    })
  })

  // ── updatePlanned ─────────────────────────────────────────────────────────

  describe('updatePlanned', () => {
    it('runs $transaction that updates item, aggregates sum, then updates budget', async () => {
      // Capture the callback and execute it against a tx mock
      const txMock = {
        budgetItem: {
          update: vi.fn(),
          aggregate: vi.fn(),
        },
        budget: {
          update: vi.fn(),
        },
      }

      txMock.budgetItem.update.mockResolvedValue({ budgetId: 'budget-1' })
      txMock.budgetItem.aggregate.mockResolvedValue({
        _sum: { planned: 500_000 },
      })
      txMock.budget.update.mockResolvedValue({} as never)

      vi.mocked(prisma.$transaction).mockImplementation(
        async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)
      )

      await repo.updatePlanned('item-1', 500_000)

      // 1) item update
      expect(txMock.budgetItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { planned: 500_000 },
        select: { budgetId: true },
      })
      // 2) aggregate sum
      expect(txMock.budgetItem.aggregate).toHaveBeenCalledWith({
        where: { budgetId: 'budget-1' },
        _sum: { planned: true },
      })
      // 3) update budget totalPlanned with aggregated sum
      expect(txMock.budget.update).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
        data: { totalPlanned: 500_000 },
      })
    })

    it('uses 0 when _sum.planned is null', async () => {
      const txMock = {
        budgetItem: {
          update: vi.fn(),
          aggregate: vi.fn(),
        },
        budget: {
          update: vi.fn(),
        },
      }

      txMock.budgetItem.update.mockResolvedValue({ budgetId: 'budget-empty' })
      txMock.budgetItem.aggregate.mockResolvedValue({ _sum: { planned: null } })
      txMock.budget.update.mockResolvedValue({} as never)

      vi.mocked(prisma.$transaction).mockImplementation(
        async (fn: (tx: typeof txMock) => Promise<void>) => fn(txMock)
      )

      await repo.updatePlanned('item-x', 0)

      expect(txMock.budget.update).toHaveBeenCalledWith({
        where: { id: 'budget-empty' },
        data: { totalPlanned: 0 },
      })
    })
  })

  // ── recalculateActuals ────────────────────────────────────────────────────

  describe('recalculateActuals', () => {
    it('fetches budget, aggregates per item in parallel, then updates all atomically', async () => {
      const budgetRow = {
        familyId: 'family-1',
        month: 3,
        year: 2026,
        items: [
          { id: 'item-1', categoryId: 'cat-A' },
          { id: 'item-2', categoryId: 'cat-B' },
        ],
      }
      vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue(
        budgetRow as never
      )

      // item-1 has 80_000 in transactions; item-2 has null → 0
      vi.mocked(prisma.transaction.aggregate)
        .mockResolvedValueOnce({ _sum: { amount: 80_000 } } as never)
        .mockResolvedValueOnce({ _sum: { amount: null } } as never)

      // Capture the array-form $transaction call
      vi.mocked(prisma.$transaction).mockResolvedValue([] as never)
      vi.mocked(prisma.budgetItem.update).mockResolvedValue({} as never)

      await repo.recalculateActuals('budget-1')

      // Verify findUniqueOrThrow was called correctly
      expect(prisma.budget.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'budget-1' },
        select: {
          familyId: true,
          month: true,
          year: true,
          items: { select: { id: true, categoryId: true } },
        },
      })

      // Verify aggregate was called for each item with correct date range
      const startDate = new Date(2026, 2, 1) // March 1
      const endDate = new Date(2026, 3, 0, 23, 59, 59, 999) // March 31

      expect(prisma.transaction.aggregate).toHaveBeenCalledTimes(2)
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          member: { familyId: 'family-1' },
          categoryId: 'cat-A',
          type: 'EXPENSE',
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      })
      expect(prisma.transaction.aggregate).toHaveBeenCalledWith({
        where: {
          member: { familyId: 'family-1' },
          categoryId: 'cat-B',
          type: 'EXPENSE',
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      })

      // Verify $transaction was called with an array of update operations
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      const txArg = vi.mocked(prisma.$transaction).mock.calls[0][0]
      expect(Array.isArray(txArg)).toBe(true)
    })

    it('uses 0 as actual when transaction aggregate returns null', async () => {
      const budgetRow = {
        familyId: 'family-1',
        month: 1,
        year: 2026,
        items: [{ id: 'item-only', categoryId: 'cat-only' }],
      }
      vi.mocked(prisma.budget.findUniqueOrThrow).mockResolvedValue(
        budgetRow as never
      )
      vi.mocked(prisma.transaction.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)
      vi.mocked(prisma.$transaction).mockResolvedValue([] as never)
      vi.mocked(prisma.budgetItem.update).mockResolvedValue({} as never)

      // Should not throw — null amount maps to 0
      await expect(repo.recalculateActuals('budget-1')).resolves.toBeUndefined()
    })
  })
})
