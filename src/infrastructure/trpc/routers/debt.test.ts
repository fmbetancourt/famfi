import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { DebtCalculator } from '@/domain/services/DebtCalculator'
import { debtRouter } from './debt'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'u1', name: 'Test User', email: 'test@test.com', familyId: 'f1' },
  expires: '9999-12-31',
}

/** Cards that have a balance large enough that minimums aren't a problem at 5_000_000. */
const mockDbCards = [
  {
    id: 'c1',
    name: 'Visa Gold',
    currentBalance: 5_000_000,
    rateRevolving: 3.35,
    creditLimit: 10_000_000,
  },
  {
    id: 'c2',
    name: 'Mastercard',
    currentBalance: 3_000_000,
    rateRevolving: 2.8,
    creditLimit: 8_000_000,
  },
]

// ─── Mock factory helpers ─────────────────────────────────────────────────────

function makePrisma(): PrismaClient {
  return {
    creditCard: {
      findMany: vi.fn(),
    },
    debtPayoffPlan: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

type Ctx = Parameters<ReturnType<typeof debtRouter.createCaller>>[0]

function makeCtx(prisma: unknown): Ctx {
  return { session: mockSession, prisma } as Ctx
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('debtRouter', () => {
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
  })

  // ── simulate ───────────────────────────────────────────────────────────────

  describe('simulate', () => {
    it('throws NOT_FOUND when no cards with debt exist', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.simulate({
          monthlyPayment: 1_000_000,
          strategy: 'avalanche',
          excludeCardIds: [],
        })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws BAD_REQUEST when payment is below minimum required', async () => {
      // 5_000_000 * 3.35% = 167_500 and 3_000_000 * 2.80% = 84_000 → min ≈ 251_500
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      // Payment of 1 is far below the minimum required to cover interest
      await expect(
        caller.simulate({
          monthlyPayment: 1,
          strategy: 'avalanche',
          excludeCardIds: [],
        })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('returns simulation result on success with avalanche strategy', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.simulate({
        monthlyPayment: 5_000_000,
        strategy: 'avalanche',
        excludeCardIds: [],
      })

      expect(result.strategy).toBe('avalanche')
      expect(result.totalMonths).toBeGreaterThan(0)
      expect(result.totalInterestPaid).toBeGreaterThan(0)
    })

    it('returns simulation result on success with snowball strategy', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.simulate({
        monthlyPayment: 5_000_000,
        strategy: 'snowball',
        excludeCardIds: [],
      })

      expect(result.strategy).toBe('snowball')
      expect(result.totalMonths).toBeGreaterThan(0)
    })

    it('uses fallback message when simulatePayoff throws a non-Error', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )
      vi.spyOn(DebtCalculator, 'simulatePayoff').mockImplementationOnce(() => {
        throw 'raw string — not an Error instance'
      })

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.simulate({
          monthlyPayment: 1_000_000,
          strategy: 'avalanche',
          excludeCardIds: [],
        })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Error en la simulación',
      })
    })

    it('excludes specified card IDs from the simulation', async () => {
      // Only c2 is returned (c1 was excluded)
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([
        mockDbCards[1],
      ] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.simulate({
        monthlyPayment: 500_000,
        strategy: 'avalanche',
        excludeCardIds: ['c1'],
      })

      // Should only include c2
      expect(result.strategy).toBe('avalanche')
    })
  })

  // ── compare ────────────────────────────────────────────────────────────────

  describe('compare', () => {
    it('throws NOT_FOUND when no cards with debt exist', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.compare({ monthlyPayment: 1_000_000, excludeCardIds: [] })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws BAD_REQUEST when payment is below minimum required', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.compare({ monthlyPayment: 1, excludeCardIds: [] })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('returns both strategies on success', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.compare({
        monthlyPayment: 5_000_000,
        excludeCardIds: [],
      })

      expect(result).toHaveProperty('avalanche')
      expect(result).toHaveProperty('snowball')
      expect(result).toHaveProperty('recommendation')
    })

    it('uses fallback message when compareStrategies throws a non-Error', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )
      vi.spyOn(DebtCalculator, 'compareStrategies').mockImplementationOnce(
        () => {
          throw 'raw string — not an Error instance'
        }
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.compare({ monthlyPayment: 1_000_000, excludeCardIds: [] })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Error en la comparación',
      })
    })

    it('excludes specified card IDs from the comparison', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([
        mockDbCards[0],
      ] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.compare({
        monthlyPayment: 5_000_000,
        excludeCardIds: ['c2'],
      })

      expect(result.avalanche.strategy).toBe('avalanche')
      expect(result.snowball.strategy).toBe('snowball')
    })
  })

  // ── getDebtOverview ────────────────────────────────────────────────────────

  describe('getDebtOverview', () => {
    it('returns zeroed-out overview when no active cards with debt', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtOverview()

      expect(result).toEqual({
        totalDebt: 0,
        estimatedMonthlyInterest: 0,
        minimumPaymentRequired: 0,
        cardCount: 0,
        avalancheTarget: null,
        snowballTarget: null,
      })
    })

    it('returns full overview with targets when cards have debt', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtOverview()

      expect(result.totalDebt).toBe(8_000_000)
      expect(result.cardCount).toBe(2)
      expect(result.estimatedMonthlyInterest).toBeGreaterThan(0)
      expect(result.minimumPaymentRequired).toBeGreaterThan(0)

      // Avalanche target: highest rate = c1 (3.35%)
      expect(result.avalancheTarget).not.toBeNull()
      expect(result.avalancheTarget!.id).toBe('c1')

      // Snowball target: lowest balance = c2 (3_000_000)
      expect(result.snowballTarget).not.toBeNull()
      expect(result.snowballTarget!.id).toBe('c2')
    })

    it('breaks avalanche ties by highest balance', async () => {
      // Both cards have the same rate, different balances
      const tieBreakerCards = [
        {
          id: 'cx',
          name: 'Card X',
          currentBalance: 2_000_000,
          rateRevolving: 3.0,
          creditLimit: 5_000_000,
        },
        {
          id: 'cy',
          name: 'Card Y',
          currentBalance: 4_000_000,
          rateRevolving: 3.0,
          creditLimit: 8_000_000,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        tieBreakerCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtOverview()

      // cy has higher balance — should be avalanche target when rates are tied
      expect(result.avalancheTarget!.id).toBe('cy')
    })
  })

  // ── savePlan ───────────────────────────────────────────────────────────────

  describe('savePlan', () => {
    it('throws NOT_FOUND when no cards with debt exist', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.savePlan({ strategy: 'avalanche', monthlyPayment: 1_000_000 })
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    })

    it('throws BAD_REQUEST when payment is below minimum required', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.savePlan({ strategy: 'avalanche', monthlyPayment: 1 })
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it('deactivates old plans and creates new plan on success', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const newPlan = {
        id: 'plan1',
        name: 'Plan Avalanche – Marzo 2026',
        strategy: 'avalanche',
        monthlyPayment: 5_000_000,
        isActive: true,
        projectedMonths: 3,
        projectedInterest: 500_000,
        startDate: new Date(),
        createdAt: new Date(),
      }

      vi.mocked(prisma.$transaction).mockResolvedValue([
        { count: 1 },
        newPlan,
      ] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.savePlan({
        strategy: 'avalanche',
        monthlyPayment: 5_000_000,
      })

      expect(result).toEqual(newPlan)
      expect(prisma.$transaction).toHaveBeenCalledOnce()
    })

    it('uses fallback message when simulatePayoff throws a non-Error in savePlan', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )
      vi.spyOn(DebtCalculator, 'simulatePayoff').mockImplementationOnce(() => {
        throw 'raw string — not an Error instance'
      })

      const caller = debtRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.savePlan({ strategy: 'avalanche', monthlyPayment: 5_000_000 })
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Error al calcular el plan',
      })
    })

    it('saves a snowball plan with the correct name label', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(
        mockDbCards as never
      )

      const newPlan = { id: 'plan2', strategy: 'snowball', isActive: true }
      vi.mocked(prisma.$transaction).mockResolvedValue([
        { count: 0 },
        newPlan,
      ] as never)

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.savePlan({
        strategy: 'snowball',
        monthlyPayment: 5_000_000,
      })

      expect(result).toEqual(newPlan)
    })
  })

  // ── getActivePlan ──────────────────────────────────────────────────────────

  describe('getActivePlan', () => {
    it('returns the active plan when one exists', async () => {
      const plan = {
        id: 'plan1',
        isActive: true,
        strategy: 'avalanche',
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        plan as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.getActivePlan()

      expect(result).toEqual(plan)
    })

    it('returns null when no active plan exists', async () => {
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        null as never
      )

      const caller = debtRouter.createCaller(makeCtx(prisma))
      const result = await caller.getActivePlan()

      expect(result).toBeNull()
    })
  })

  // ── auth middleware ────────────────────────────────────────────────────────

  describe('auth middleware', () => {
    it('throws UNAUTHORIZED when session is null', async () => {
      const unauthCtx = { session: null, prisma } as Ctx

      const caller = debtRouter.createCaller(unauthCtx)
      await expect(
        caller.simulate({
          monthlyPayment: 1_000_000,
          strategy: 'avalanche',
          excludeCardIds: [],
        })
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    })
  })
})
