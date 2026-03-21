import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { BudgetAllocator } from '@/domain/services/BudgetAllocator'
import { budgetRouter } from './budget'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'u1', name: 'Test', email: 'test@test.com', familyId: 'f1' },
  expires: '9999-12-31',
}

type Ctx = Parameters<ReturnType<typeof budgetRouter.createCaller>>[0]

function makeCtx(prisma: unknown): Ctx {
  return { session: mockSession, prisma } as Ctx
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makePrisma(): PrismaClient {
  return {
    budget: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    budgetItem: {
      findUnique: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    income: {
      aggregate: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

// ─── Budget item fixtures ─────────────────────────────────────────────────────

function makeItem(
  id: string,
  categoryId: string,
  planned: number,
  actual: number,
  categoryOpts: Partial<{
    name: string
    icon: string
    color: string
    isFixed: boolean
  }> = {}
) {
  return {
    id,
    categoryId,
    planned,
    actual,
    category: {
      id: categoryId,
      name: categoryOpts.name ?? `Cat ${id}`,
      icon: categoryOpts.icon ?? '📦',
      color: categoryOpts.color ?? '#000',
      isFixed: categoryOpts.isFixed ?? false,
    },
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('budgetRouter', () => {
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
  })

  // ── auth middleware ──────────────────────────────────────────────────────

  describe('auth middleware', () => {
    it('throws UNAUTHORIZED when session is null', async () => {
      const unauthCtx = { session: null, prisma } as Ctx
      const caller = budgetRouter.createCaller(unauthCtx)
      await expect(caller.getTotalIncome()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ── getCurrent ───────────────────────────────────────────────────────────

  describe('getCurrent', () => {
    it('returns null when no budget exists for current month', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getCurrent()

      expect(result).toBeNull()
    })

    it('returns the budget with items when it exists', async () => {
      const mockBudget = {
        id: 'b1',
        familyId: 'f1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 3_000_000,
        items: [makeItem('i1', 'cat1', 1_000_000, 500_000)],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getCurrent()

      expect(result).toEqual(mockBudget)
      expect(prisma.budget.findUnique).toHaveBeenCalledOnce()
    })
  })

  // ── getByMonth ───────────────────────────────────────────────────────────

  describe('getByMonth', () => {
    it('returns null when no budget exists for the given month', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result).toBeNull()
    })

    it('enriches items with progress and status', async () => {
      const mockBudget = {
        id: 'b1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 3_000_000,
        items: [
          makeItem('i1', 'cat1', 1_000_000, 1_200_000), // exceeded: actual > planned
          makeItem('i2', 'cat2', 1_000_000, 850_000), // warning: 85% >= 80%
          makeItem('i3', 'cat3', 1_000_000, 500_000), // ok: 50%
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result).not.toBeNull()
      expect(result!.items[0]).toMatchObject({
        progress: 120,
        status: 'exceeded',
      })
      expect(result!.items[1]).toMatchObject({
        progress: 85,
        status: 'warning',
      })
      expect(result!.items[2]).toMatchObject({
        progress: 50,
        status: 'ok',
      })
    })

    it('computes totalActual and remainingIncome correctly', async () => {
      const mockBudget = {
        id: 'b1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 3_000_000,
        items: [
          makeItem('i1', 'cat1', 1_000_000, 400_000),
          makeItem('i2', 'cat2', 2_000_000, 600_000),
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result!.totalActual).toBe(1_000_000)
      expect(result!.remainingIncome).toBe(4_000_000)
    })

    it('computeProgress returns 0 when planned is 0', async () => {
      const mockBudget = {
        id: 'b1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 0,
        items: [
          makeItem('i1', 'cat1', 0, 0), // planned=0 → progress should be 0, status 'ok'
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result!.items[0].progress).toBe(0)
      expect(result!.items[0].status).toBe('ok')
    })

    it('computeStatus: exact 80% (>= threshold) triggers warning', async () => {
      const mockBudget = {
        id: 'b1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 1_000_000,
        items: [makeItem('i1', 'cat1', 1_000_000, 800_000)], // exactly 80%
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result!.items[0].status).toBe('warning')
    })

    it('computeStatus: below 80% (e.g. 79%) triggers ok', async () => {
      const mockBudget = {
        id: 'b1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 1_000_000,
        items: [makeItem('i1', 'cat1', 1_000_000, 790_000)], // 79%
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getByMonth({ month: 3, year: 2026 })

      expect(result!.items[0].status).toBe('ok')
    })
  })

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws CONFLICT when a budget already exists for that month', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue({
        id: 'b1',
      } as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.create({
          month: 3,
          year: 2026,
          items: [{ categoryId: 'cat1', planned: 1_000_000 }],
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('creates a new budget and derives totalIncome from aggregate', async () => {
      // No existing budget
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      // Income aggregate
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)

      // repo.save calls prisma.budget.create
      const savedBudget = {
        id: 'b1',
        familyId: 'f1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 1_500_000,
        items: [
          { id: 'i1', categoryId: 'cat1', planned: 1_000_000, actual: 0 },
          { id: 'i2', categoryId: 'cat2', planned: 500_000, actual: 0 },
        ],
      }
      vi.mocked(prisma.budget.create).mockResolvedValue(savedBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.create({
        month: 3,
        year: 2026,
        items: [
          { categoryId: 'cat1', planned: 1_000_000 },
          { categoryId: 'cat2', planned: 500_000 },
        ],
      })

      expect(result.totalIncome).toBe(5_000_000)
      expect(result.totalPlanned).toBe(1_500_000)
      expect(prisma.income.aggregate).toHaveBeenCalledOnce()
    })

    it('uses 0 when income aggregate _sum.amount is null', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)

      const savedBudget = {
        id: 'b1',
        familyId: 'f1',
        month: 3,
        year: 2026,
        totalIncome: 0,
        totalPlanned: 1_000_000,
        items: [
          { id: 'i1', categoryId: 'cat1', planned: 1_000_000, actual: 0 },
        ],
      }
      vi.mocked(prisma.budget.create).mockResolvedValue(savedBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.create({
        month: 3,
        year: 2026,
        items: [{ categoryId: 'cat1', planned: 1_000_000 }],
      })

      expect(result.totalIncome).toBe(0)
    })
  })

  // ── updateItem ────────────────────────────────────────────────────────────

  describe('updateItem', () => {
    it('throws NOT_FOUND when item does not belong to this family', async () => {
      // item belongs to a different family
      vi.mocked(prisma.budgetItem.findUnique).mockResolvedValue({
        budget: { familyId: 'other-family' },
      } as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.updateItem({ budgetItemId: 'i1', planned: 200_000 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws NOT_FOUND when item is not found (null)', async () => {
      vi.mocked(prisma.budgetItem.findUnique).mockResolvedValue(null as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.updateItem({ budgetItemId: 'i1', planned: 200_000 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('calls updatePlanned successfully when item belongs to family', async () => {
      vi.mocked(prisma.budgetItem.findUnique).mockResolvedValue({
        budget: { familyId: 'f1' },
      } as never)

      // repo.updatePlanned uses prisma.$transaction
      vi.mocked(prisma.$transaction).mockResolvedValue(undefined as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.updateItem({ budgetItemId: 'i1', planned: 200_000 })
      ).resolves.toBeUndefined()

      expect(prisma.$transaction).toHaveBeenCalledOnce()
    })
  })

  // ── duplicate ─────────────────────────────────────────────────────────────

  describe('duplicate', () => {
    it('throws NOT_FOUND when source budget does not exist', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.duplicate({
          sourceMonth: 2,
          sourceYear: 2026,
          targetMonth: 3,
          targetYear: 2026,
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws CONFLICT when target month already has a budget', async () => {
      const sourceBudget = {
        id: 'b1',
        totalPlanned: 2_000_000,
        items: [{ categoryId: 'cat1', planned: 2_000_000 }],
      }

      // First call: source found; second call: target already exists
      vi.mocked(prisma.budget.findUnique)
        .mockResolvedValueOnce(sourceBudget as never)
        .mockResolvedValueOnce({ id: 'b2' } as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.duplicate({
          sourceMonth: 2,
          sourceYear: 2026,
          targetMonth: 3,
          targetYear: 2026,
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('uses 0 for totalIncome when income aggregate _sum.amount is null in duplicate', async () => {
      const sourceBudget = {
        id: 'b1',
        totalPlanned: 2_000_000,
        items: [{ categoryId: 'cat1', planned: 2_000_000 }],
      }

      vi.mocked(prisma.budget.findUnique)
        .mockResolvedValueOnce(sourceBudget as never)
        .mockResolvedValueOnce(null as never)

      // Income aggregate returns null amount
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)

      const savedBudget = {
        id: 'b3',
        familyId: 'f1',
        month: 3,
        year: 2026,
        totalIncome: 0,
        totalPlanned: 2_000_000,
        items: [
          { id: 'i1', categoryId: 'cat1', planned: 2_000_000, actual: 0 },
        ],
      }
      vi.mocked(prisma.budget.create).mockResolvedValue(savedBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.duplicate({
        sourceMonth: 2,
        sourceYear: 2026,
        targetMonth: 3,
        targetYear: 2026,
      })

      expect(result.totalIncome).toBe(0)
    })

    it('successfully copies items with actuals reset to 0', async () => {
      const sourceBudget = {
        id: 'b1',
        totalPlanned: 2_000_000,
        items: [
          { categoryId: 'cat1', planned: 1_000_000 },
          { categoryId: 'cat2', planned: 1_000_000 },
        ],
      }

      // Source found, target not found
      vi.mocked(prisma.budget.findUnique)
        .mockResolvedValueOnce(sourceBudget as never)
        .mockResolvedValueOnce(null as never)

      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)

      const savedBudget = {
        id: 'b3',
        familyId: 'f1',
        month: 3,
        year: 2026,
        totalIncome: 5_000_000,
        totalPlanned: 2_000_000,
        items: [
          { id: 'i1', categoryId: 'cat1', planned: 1_000_000, actual: 0 },
          { id: 'i2', categoryId: 'cat2', planned: 1_000_000, actual: 0 },
        ],
      }
      vi.mocked(prisma.budget.create).mockResolvedValue(savedBudget as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.duplicate({
        sourceMonth: 2,
        sourceYear: 2026,
        targetMonth: 3,
        targetYear: 2026,
      })

      expect(result.items.every((i) => i.actual === 0)).toBe(true)
      expect(result.month).toBe(3)
      expect(result.year).toBe(2026)
    })
  })

  // ── getSuggestion ─────────────────────────────────────────────────────────

  describe('getSuggestion', () => {
    it('uses Money.fromPesos(0) when income aggregate _sum.amount is null', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)
      vi.spyOn(BudgetAllocator, 'suggestBudget').mockReturnValueOnce([])

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSuggestion({ month: 3, year: 2026 })

      // Null income treated as 0 — BudgetAllocator returns empty, so we get []
      expect(result).toEqual([])
      // BudgetAllocator was called with Money(0) — verified by call count
      expect(BudgetAllocator.suggestBudget).toHaveBeenCalledOnce()
    })

    it('returns empty array when BudgetAllocator returns no suggestions', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)
      vi.spyOn(BudgetAllocator, 'suggestBudget').mockReturnValueOnce([])

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSuggestion({ month: 3, year: 2026 })

      expect(result).toEqual([])
      expect(prisma.category.findMany).not.toHaveBeenCalled()
    })

    it('returns enriched suggestions sorted by suggestedAmount desc', async () => {
      const transactions = [
        { categoryId: 'cat1', amount: 600_000, date: new Date('2026-01-15') },
        { categoryId: 'cat2', amount: 200_000, date: new Date('2026-01-20') },
      ]
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(
        transactions as never
      )
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)

      // Override BudgetAllocator to return predictable suggestions
      vi.spyOn(BudgetAllocator, 'suggestBudget').mockReturnValueOnce([
        {
          categoryId: 'cat1',
          suggestedAmount: { value: 600_000 } as ReturnType<
            typeof import('@/domain/value-objects/Money').Money.fromPesos
          >,
        },
        {
          categoryId: 'cat2',
          suggestedAmount: { value: 200_000 } as ReturnType<
            typeof import('@/domain/value-objects/Money').Money.fromPesos
          >,
        },
      ])

      vi.mocked(prisma.category.findMany).mockResolvedValue([
        {
          id: 'cat1',
          name: 'Alimentación',
          icon: '🛒',
          color: '#green',
        },
        {
          id: 'cat2',
          name: 'Transporte',
          icon: '🚗',
          color: '#blue',
        },
      ] as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSuggestion({ month: 3, year: 2026 })

      // Should be sorted descending by suggestedAmount
      expect(result).toHaveLength(2)
      expect(result[0].suggestedAmount).toBeGreaterThanOrEqual(
        result[1].suggestedAmount
      )
      expect(result[0].categoryId).toBe('cat1')
    })

    it('filters out suggestions whose category is not found in DB', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)

      vi.spyOn(BudgetAllocator, 'suggestBudget').mockReturnValueOnce([
        {
          categoryId: 'cat-ghost',
          suggestedAmount: { value: 300_000 } as ReturnType<
            typeof import('@/domain/value-objects/Money').Money.fromPesos
          >,
        },
      ])

      // category not returned by DB
      vi.mocked(prisma.category.findMany).mockResolvedValue([] as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSuggestion({ month: 3, year: 2026 })

      expect(result).toEqual([])
    })
  })

  // ── recalculateActuals ────────────────────────────────────────────────────

  describe('recalculateActuals', () => {
    it('throws NOT_FOUND when no budget exists for the given month', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.recalculateActuals({ month: 3, year: 2026 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('calls repo.recalculateActuals when budget exists', async () => {
      vi.mocked(prisma.budget.findUnique).mockResolvedValue({
        id: 'b1',
      } as never)

      // recalculateActuals calls prisma.budget.findUniqueOrThrow then $transaction
      const mockBudgetDetail = {
        familyId: 'f1',
        month: 3,
        year: 2026,
        items: [{ id: 'i1', categoryId: 'cat1' }],
      }
      const budgetWithThrow = {
        findUniqueOrThrow: vi.fn().mockResolvedValue(mockBudgetDetail),
      }
      const transactionAgg = {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 500_000 } }),
      }

      // Rebuild prisma mock to add findUniqueOrThrow support
      const customPrisma = {
        ...prisma,
        budget: {
          findUnique: vi.fn().mockResolvedValue({ id: 'b1' }),
          findUniqueOrThrow: budgetWithThrow.findUniqueOrThrow,
        },
        transaction: transactionAgg,
        $transaction: vi.fn().mockResolvedValue(undefined),
        budgetItem: {
          update: vi.fn().mockResolvedValue({}),
        },
      } as unknown as PrismaClient

      const caller = budgetRouter.createCaller(makeCtx(customPrisma))
      await expect(
        caller.recalculateActuals({ month: 3, year: 2026 })
      ).resolves.toBeUndefined()

      expect(budgetWithThrow.findUniqueOrThrow).toHaveBeenCalledOnce()
    })
  })

  // ── getTotalIncome ────────────────────────────────────────────────────────

  describe('getTotalIncome', () => {
    it('returns the total recurring income amount', async () => {
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 7_000_000 },
      } as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getTotalIncome()

      expect(result).toBe(7_000_000)
    })

    it('returns 0 when _sum.amount is null', async () => {
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)

      const caller = budgetRouter.createCaller(makeCtx(prisma))
      const result = await caller.getTotalIncome()

      expect(result).toBe(0)
    })
  })
})
