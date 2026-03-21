import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { Prisma } from '@/generated/prisma/client'
import { transactionRouter } from './transaction'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a real P2025 error the same way the router catches it. */
function makeP2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: '7.x',
  })
}

const mockSession = {
  user: { id: 'u1', name: 'Test User', email: 'test@test.com', familyId: 'f1' },
  expires: '9999-12-31',
}

// ─── Prisma mock factories ─────────────────────────────────────────────────────

/** Creates a mock "inner transaction client" (tx) used inside $transaction callbacks. */
function makeTx() {
  return {
    transaction: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    creditCard: {
      update: vi.fn(),
    },
    budget: {
      findUnique: vi.fn(),
    },
    budgetItem: {
      update: vi.fn(),
    },
  }
}

function makePrisma(
  tx = makeTx()
): PrismaClient & { _tx: ReturnType<typeof makeTx> } {
  const mock = {
    _tx: tx,
    familyMember: {
      findUnique: vi.fn(),
    },
    creditCard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
    },
    // $transaction receives an async callback and invokes it with the inner tx client
    $transaction: vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaClient & { _tx: ReturnType<typeof makeTx> }

  return mock
}

type Ctx = Parameters<ReturnType<typeof transactionRouter.createCaller>>[0]

function makeCtx(prisma: unknown): Ctx {
  return { session: mockSession, prisma } as Ctx
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const baseDate = new Date('2026-03-15T00:00:00.000Z')

const createInput = {
  amount: 50_000,
  description: 'Almuerzo',
  categoryId: 'cat-food',
  memberId: 'mem1',
  date: baseDate,
} as const

const mockTransaction = {
  id: 'txn1',
  amount: 50_000,
  description: 'Almuerzo',
  merchant: null,
  categoryId: 'cat-food',
  creditCardId: null,
  memberId: 'mem1',
  type: 'EXPENSE',
  source: 'MANUAL',
  date: baseDate,
  category: { name: 'Alimentación', icon: '🍔', color: '#f00' },
  member: { name: 'Test User' },
  creditCard: null,
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('transactionRouter', () => {
  let prisma: ReturnType<typeof makePrisma>
  let tx: ReturnType<typeof makeTx>
  let consoleWarnSpy: MockInstance

  beforeEach(() => {
    vi.clearAllMocks()
    tx = makeTx()
    prisma = makePrisma(tx)
    consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
  })

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('throws FORBIDDEN when member does not belong to the family', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f-other',
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.create(createInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('throws FORBIDDEN when member is not found (familyId undefined)', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.create(createInput)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('throws FORBIDDEN when card belongs to a different family', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue({
        owner: { familyId: 'f-other' },
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.create({ ...createInput, creditCardId: 'card-x' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('throws FORBIDDEN when card lookup returns null', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.create({ ...createInput, creditCardId: 'card-missing' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })

    it('creates transaction without credit card and without budget', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.create(createInput)

      expect(result).toEqual(mockTransaction)
      expect(tx.creditCard.update).not.toHaveBeenCalled()
      expect(tx.budgetItem.update).not.toHaveBeenCalled()
    })

    it('creates transaction with credit card (increments balance)', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue({
        owner: { familyId: 'f1' },
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue({
        ...mockTransaction,
        creditCardId: 'c1',
        creditCard: { name: 'Visa', bank: 'BCI' },
      } as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue(null as never)
      vi.mocked(tx.creditCard.update).mockResolvedValue({} as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.create({ ...createInput, creditCardId: 'c1' })

      expect(tx.creditCard.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { currentBalance: { increment: 50_000 } },
      })
    })

    it('updates budget item when a budget exists for the month', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockResolvedValue({
        actual: 50_000,
        planned: 100_000,
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.create(createInput)

      expect(tx.budgetItem.update).toHaveBeenCalledOnce()
      // No threshold triggered (50% < 80% warning)
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('emits WARNING event when budget usage reaches 80%+', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      // actual / planned = 80_000 / 100_000 = 0.80 → WARNING
      vi.mocked(tx.budgetItem.update).mockResolvedValue({
        actual: 80_000,
        planned: 100_000,
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.create(createInput)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[BudgetEvent] WARNING',
        expect.any(Object)
      )
    })

    it('emits EXCEEDED event when budget usage is over 100%', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      // actual / planned = 110_000 / 100_000 = 1.10 → EXCEEDED
      vi.mocked(tx.budgetItem.update).mockResolvedValue({
        actual: 110_000,
        planned: 100_000,
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.create(createInput)

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[BudgetEvent] EXCEEDED',
        expect.any(Object)
      )
    })

    it('skips budget threshold event when planned is 0', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockResolvedValue({
        actual: 50_000,
        planned: 0,
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.create(createInput)

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })

    it('handles P2025 on budgetItem.update gracefully (no budget item for category)', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockRejectedValue(makeP2025())

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      // Should NOT throw — P2025 is caught and treated as "no budget item"
      const result = await caller.create(createInput)
      expect(result).toEqual(mockTransaction)
    })

    it('rethrows non-P2025 errors from budgetItem.update', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      vi.mocked(tx.transaction.create).mockResolvedValue(
        mockTransaction as never
      )
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockRejectedValue(
        new Error('Unexpected DB error')
      )

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.create(createInput)).rejects.toThrow(
        'Unexpected DB error'
      )
    })
  })

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    const listInput = {
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-03-31'),
      limit: 20,
    }

    it('returns items and nextCursor when there are more results than the limit', async () => {
      // Return limit + 1 items to trigger nextCursor
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `txn${i}`,
        date: baseDate,
        amount: 10_000 * (i + 1),
      }))
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(items as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.list(listInput)

      expect(result.items).toHaveLength(20)
      expect(result.nextCursor).toBe('txn20')
    })

    it('returns items with no nextCursor when results fit within the limit', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        id: `txn${i}`,
        date: baseDate,
      }))
      vi.mocked(prisma.transaction.findMany).mockResolvedValue(items as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.list(listInput)

      expect(result.items).toHaveLength(5)
      expect(result.nextCursor).toBeUndefined()
    })

    it('applies cursor-based pagination when cursor is provided', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.list({ ...listInput, cursor: 'txn5' })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'txn5' }, skip: 1 })
      )
    })

    it('filters by memberId and categoryId when provided', async () => {
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.list({
        ...listInput,
        memberId: 'mem1',
        categoryId: 'cat-food',
      })

      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            memberId: 'mem1',
            categoryId: 'cat-food',
          }),
        })
      )
    })
  })

  // ── getCategories ──────────────────────────────────────────────────────────

  describe('getCategories', () => {
    it('groups categories into fixed, variable, and all', async () => {
      const categories = [
        {
          id: 'c1',
          name: 'Arriendo',
          nameEn: 'Rent',
          icon: '🏠',
          color: '#111',
          isFixed: true,
          sortOrder: 1,
        },
        {
          id: 'c2',
          name: 'Alimentación',
          nameEn: 'Food',
          icon: '🍔',
          color: '#222',
          isFixed: false,
          sortOrder: 2,
        },
        {
          id: 'c3',
          name: 'Salud',
          nameEn: 'Health',
          icon: '💊',
          color: '#333',
          isFixed: true,
          sortOrder: 3,
        },
      ]
      vi.mocked(prisma.category.findMany).mockResolvedValue(categories as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.getCategories()

      expect(result.fixed).toHaveLength(2)
      expect(result.variable).toHaveLength(1)
      expect(result.all).toHaveLength(3)
    })

    it('returns empty arrays when no categories exist', async () => {
      vi.mocked(prisma.category.findMany).mockResolvedValue([] as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.getCategories()

      expect(result.fixed).toEqual([])
      expect(result.variable).toEqual([])
      expect(result.all).toEqual([])
    })
  })

  // ── getMemberCards ─────────────────────────────────────────────────────────

  describe('getMemberCards', () => {
    it('throws FORBIDDEN when member does not belong to the family', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f-other',
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.getMemberCards({ memberId: 'mem-x' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('throws FORBIDDEN when member is not found', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.getMemberCards({ memberId: 'mem-missing' })
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
    })

    it('returns active non-frozen cards for the member', async () => {
      vi.mocked(prisma.familyMember.findUnique).mockResolvedValue({
        familyId: 'f1',
      } as never)
      const cards = [
        {
          id: 'c1',
          name: 'Visa',
          bank: 'BCI',
          lastFourDigits: '1234',
          creditLimit: 5_000_000,
          currentBalance: 1_000_000,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMemberCards({ memberId: 'mem1' })

      expect(result).toEqual(cards)
      expect(prisma.creditCard.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'mem1', isActive: true, isFrozen: false },
        })
      )
    })
  })

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    const baseExistingTx = {
      id: 'txn1',
      amount: 50_000,
      date: baseDate,
      creditCardId: null,
      categoryId: 'cat-food',
      member: { familyId: 'f1' },
    }

    it('throws NOT_FOUND when transaction does not exist', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.delete({ id: 'txn-missing' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws NOT_FOUND when transaction belongs to a different family', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue({
        ...baseExistingTx,
        member: { familyId: 'f-other' },
      } as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.delete({ id: 'txn1' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('deletes transaction without card and without budget', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(
        baseExistingTx as never
      )
      vi.mocked(tx.transaction.delete).mockResolvedValue({} as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.delete({ id: 'txn1' })

      expect(tx.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'txn1' },
      })
      expect(tx.creditCard.update).not.toHaveBeenCalled()
      expect(tx.budgetItem.update).not.toHaveBeenCalled()
    })

    it('decrements card balance when transaction was charged to a card', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue({
        ...baseExistingTx,
        creditCardId: 'c1',
      } as never)
      vi.mocked(tx.transaction.delete).mockResolvedValue({} as never)
      vi.mocked(tx.creditCard.update).mockResolvedValue({} as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue(null as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.delete({ id: 'txn1' })

      expect(tx.creditCard.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { currentBalance: { decrement: 50_000 } },
      })
    })

    it('reverses budget item when a budget exists for the month', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(
        baseExistingTx as never
      )
      vi.mocked(tx.transaction.delete).mockResolvedValue({} as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockResolvedValue({} as never)

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await caller.delete({ id: 'txn1' })

      expect(tx.budgetItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { actual: { decrement: 50_000 } },
        })
      )
    })

    it('handles P2025 on budgetItem.update gracefully during delete', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(
        baseExistingTx as never
      )
      vi.mocked(tx.transaction.delete).mockResolvedValue({} as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockRejectedValue(makeP2025())

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      // P2025 should be swallowed — delete succeeds
      await expect(caller.delete({ id: 'txn1' })).resolves.not.toThrow()
    })

    it('rethrows non-P2025 errors from budgetItem.update during delete', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(
        baseExistingTx as never
      )
      vi.mocked(tx.transaction.delete).mockResolvedValue({} as never)
      vi.mocked(tx.budget.findUnique).mockResolvedValue({
        id: 'budget1',
      } as never)
      vi.mocked(tx.budgetItem.update).mockRejectedValue(
        new Error('Unexpected DB error')
      )

      const caller = transactionRouter.createCaller(makeCtx(prisma))
      await expect(caller.delete({ id: 'txn1' })).rejects.toThrow(
        'Unexpected DB error'
      )
    })
  })

  // ── auth middleware ────────────────────────────────────────────────────────

  describe('auth middleware', () => {
    it('throws UNAUTHORIZED when session is null', async () => {
      const unauthCtx = { session: null, prisma } as Ctx

      const caller = transactionRouter.createCaller(unauthCtx)
      await expect(
        caller.list({
          startDate: new Date('2026-03-01'),
          endDate: new Date('2026-03-31'),
          limit: 20,
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })
})
