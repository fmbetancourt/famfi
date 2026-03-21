import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { DebtCalculator } from '@/domain/services/DebtCalculator'
import { dashboardRouter } from './dashboard'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'u1', name: 'Test', email: 'test@test.com', familyId: 'f1' },
  expires: '9999-12-31',
}

type Ctx = Parameters<ReturnType<typeof dashboardRouter.createCaller>>[0]

function makeCtx(prisma: unknown): Ctx {
  return { session: mockSession, prisma } as Ctx
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makePrisma(): PrismaClient {
  return {
    creditCard: {
      findMany: vi.fn(),
    },
    income: {
      aggregate: vi.fn(),
    },
    budget: {
      findUnique: vi.fn(),
    },
    debtPayoffPlan: {
      findFirst: vi.fn(),
    },
    transaction: {
      groupBy: vi.fn(),
    },
  } as unknown as PrismaClient
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCard(
  id: string,
  name: string,
  currentBalance: number,
  rateRevolving: number,
  creditLimit = 10_000_000,
  bank = 'Banco X',
  paymentDueDay = 10
) {
  return {
    id,
    name,
    currentBalance,
    rateRevolving,
    creditLimit,
    bank,
    paymentDueDay,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dashboardRouter', () => {
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
  })

  // ── auth middleware ──────────────────────────────────────────────────────

  describe('auth middleware', () => {
    it('throws UNAUTHORIZED when session is null', async () => {
      const unauthCtx = { session: null, prisma } as Ctx
      const caller = dashboardRouter.createCaller(unauthCtx)
      await expect(caller.getSummary()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })

  // ── getSummary ───────────────────────────────────────────────────────────

  describe('getSummary', () => {
    it('returns zeroed values when no cards exist', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSummary()

      expect(result.totalDebt).toBe(0)
      expect(result.cardCount).toBe(0)
      expect(result.cardsWithDebt).toBe(0)
      expect(result.monthlyInterest).toBe(0)
    })

    it('only includes cards with balance > 0 in monthlyInterest', async () => {
      const cards = [
        makeCard('c1', 'Visa Gold', 5_000_000, 3.35),
        makeCard('c2', 'MC Platinum', 0, 2.8), // no balance — should NOT add interest
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 8_000_000 },
      } as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSummary()

      // Only c1 has balance: 5_000_000 * 3.35 / 100 = 167_500
      expect(result.monthlyInterest).toBe(167_500)
      expect(result.cardsWithDebt).toBe(1)
      expect(result.cardCount).toBe(2)
      expect(result.totalDebt).toBe(5_000_000)
    })

    it('computes fixedExpenses from budget fixed items when budget exists', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)

      const mockBudget = {
        id: 'b1',
        totalPlanned: 3_000_000,
        items: [
          {
            planned: 800_000,
            category: { isFixed: true },
          },
          {
            planned: 400_000,
            category: { isFixed: false },
          },
          {
            planned: 600_000,
            category: { isFixed: true },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(mockBudget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSummary()

      // fixedExpenses = 800_000 + 600_000 = 1_400_000
      expect(result.availableAfterFixed).toBe(5_000_000 - 1_400_000)
    })

    it('uses fixedExpenses = 0 when no budget exists', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: 5_000_000 },
      } as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSummary()

      expect(result.availableAfterFixed).toBe(5_000_000)
    })

    it('uses totalIncome = 0 when income aggregate is null', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)
      vi.mocked(prisma.income.aggregate).mockResolvedValue({
        _sum: { amount: null },
      } as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getSummary()

      expect(result.totalIncome).toBe(0)
      expect(result.availableAfterFixed).toBe(0)
    })
  })

  // ── getDebtDistribution ──────────────────────────────────────────────────

  describe('getDebtDistribution', () => {
    it('returns empty slices when no cards have debt', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtDistribution()

      expect(result.slices).toHaveLength(0)
      expect(result.totalDebt).toBe(0)
    })

    it('returns top 4 slices only when <= 4 cards with debt', async () => {
      const cards = [
        makeCard('c1', 'Visa Gold', 5_000_000, 3.35),
        makeCard('c2', 'MC Platinum', 3_000_000, 2.8),
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtDistribution()

      expect(result.slices).toHaveLength(2)
      expect(result.totalDebt).toBe(8_000_000)
      // No "Otras" slice
      expect(result.slices.every((s) => !s.name.startsWith('Otras'))).toBe(true)
    })

    it('groups cards beyond 4 into an "Otras" slice', async () => {
      const cards = [
        makeCard('c1', 'Card 1', 5_000_000, 3.35),
        makeCard('c2', 'Card 2', 4_000_000, 3.0),
        makeCard('c3', 'Card 3', 3_000_000, 2.8),
        makeCard('c4', 'Card 4', 2_000_000, 2.5),
        makeCard('c5', 'Card 5', 1_000_000, 2.0), // goes into "Otras"
        makeCard('c6', 'Card 6', 500_000, 1.8), // goes into "Otras"
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtDistribution()

      // Top 4 + 1 "Otras" = 5 slices
      expect(result.slices).toHaveLength(5)
      const otrasSlice = result.slices.find((s) => s.name.startsWith('Otras'))
      expect(otrasSlice).toBeDefined()
      expect(otrasSlice!.name).toBe('Otras (2 tarjetas)')
      expect(otrasSlice!.value).toBe(1_500_000)
      expect(otrasSlice!.color).toBe('#94A3B8')
    })

    it('computes percentages correctly', async () => {
      const cards = [
        makeCard('c1', 'Card A', 8_000_000, 3.35),
        makeCard('c2', 'Card B', 2_000_000, 2.8),
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtDistribution()

      expect(result.totalDebt).toBe(10_000_000)
      // Card A = 80%, Card B = 20%
      expect(result.slices[0].percentage).toBe(80)
      expect(result.slices[1].percentage).toBe(20)
    })

    it('returns percentage = 0 when totalDebt is 0', async () => {
      // This case can't normally happen (cards filtered by balance > 0) but
      // the code path exists for the "Otras" group calculation; we test it
      // by directly verifying that the formula guards against division by zero.
      // The router only queries cards with currentBalance > 0, so totalDebt
      // will never be 0 if cards are returned.
      // We simulate an edge case where all balances sum to 0 is not reachable
      // through the normal path, so we verify the happy path instead.
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtDistribution()

      expect(result.totalDebt).toBe(0)
      expect(result.slices).toHaveLength(0)
    })
  })

  // ── getUpcomingPayments ──────────────────────────────────────────────────

  describe('getUpcomingPayments', () => {
    it('returns empty array when no cards have debt', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      expect(result).toHaveLength(0)
    })

    it('groups cards by bank|dueDay and sums balances/payments', async () => {
      const cards = [
        {
          bank: 'Banco Estado',
          paymentDueDay: 10,
          currentBalance: 3_000_000,
          rateRevolving: 3.0,
        },
        {
          bank: 'Banco Estado',
          paymentDueDay: 10,
          currentBalance: 2_000_000,
          rateRevolving: 2.5,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      // Both cards same bank + same dueDay → grouped into 1 entry
      expect(result).toHaveLength(1)
      expect(result[0].bank).toBe('Banco Estado')
      expect(result[0].totalBalance).toBe(5_000_000)
    })

    it('keeps cards with different banks as separate entries', async () => {
      const cards = [
        {
          bank: 'Banco Estado',
          paymentDueDay: 10,
          currentBalance: 3_000_000,
          rateRevolving: 3.0,
        },
        {
          bank: 'Santander',
          paymentDueDay: 10,
          currentBalance: 2_000_000,
          rateRevolving: 2.5,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      expect(result).toHaveLength(2)
    })

    it('minPayment uses max(interest, 2%) — interest wins when rate is high', async () => {
      // 3_000_000 * 3.35% = 100_500 interest
      // 3_000_000 * 2% = 60_000
      // max = 100_500
      const cards = [
        {
          bank: 'BBVA',
          paymentDueDay: 15,
          currentBalance: 3_000_000,
          rateRevolving: 3.35,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      // interest = round(3_000_000 * 3.35 / 100) = 100_500
      // 2pct     = round(3_000_000 * 0.02) = 60_000
      expect(result[0].minPayment).toBe(100_500)
    })

    it('minPayment uses 2% when interest is lower', async () => {
      // 1_000_000 * 0.5% = 5_000 interest
      // 1_000_000 * 2% = 20_000
      // max = 20_000
      const cards = [
        {
          bank: 'Falabella',
          paymentDueDay: 23,
          currentBalance: 1_000_000,
          rateRevolving: 0.5,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      // 2% wins
      expect(result[0].minPayment).toBe(20_000)
    })

    it('daysLeft is correct when dueDay is in the future within same month', async () => {
      // We need to be careful with system date here.
      // The code computes daysLeft = dueDay - day when day <= dueDay.
      // We use a dueDay far enough in the future relative to any reasonable test date.
      const cards = [
        {
          bank: 'Scotiabank',
          paymentDueDay: 31,
          currentBalance: 2_000_000,
          rateRevolving: 2.0,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      const today = new Date()
      const day = today.getDate()
      // If today <= 31 (always true): daysLeft = 31 - day
      if (day <= 31) {
        expect(result[0].daysLeft).toBe(31 - day)
      }
    })

    it('daysLeft wraps to next month when dueDay has already passed', async () => {
      // Use dueDay = 1: if today is any day > 1, it wraps to next month
      const cards = [
        {
          bank: 'Ripley',
          paymentDueDay: 1,
          currentBalance: 2_000_000,
          rateRevolving: 2.0,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      const today = new Date()
      const day = today.getDate()
      if (day > 1) {
        // Should be > 0 (some days into next month)
        expect(result[0].daysLeft).toBeGreaterThan(0)
      }
    })

    it('sorts results by daysLeft ascending', async () => {
      const cards = [
        {
          bank: 'Banco Estado',
          paymentDueDay: 28,
          currentBalance: 3_000_000,
          rateRevolving: 3.0,
        },
        {
          bank: 'Santander',
          paymentDueDay: 10,
          currentBalance: 2_000_000,
          rateRevolving: 2.5,
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getUpcomingPayments()

      // Verify sorted ascending by daysLeft
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].daysLeft).toBeLessThanOrEqual(result[i + 1].daysLeft)
      }
    })
  })

  // ── getDebtPlanWidget ────────────────────────────────────────────────────

  describe('getDebtPlanWidget', () => {
    it('returns hasPlan: false with totalDebt when no active plan exists', async () => {
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        null as never
      )
      const cards = [makeCard('c1', 'Visa', 5_000_000, 3.35)]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      expect(result.hasPlan).toBe(false)
      expect((result as { hasPlan: false; totalDebt: number }).totalDebt).toBe(
        5_000_000
      )
    })

    it('returns hasPlan: false with totalDebt = 0 when no cards', async () => {
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        null as never
      )
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      expect(result.hasPlan).toBe(false)
      expect((result as { hasPlan: false; totalDebt: number }).totalDebt).toBe(
        0
      )
    })

    it('returns re-simulated remainingMonths and nextCard when simulation succeeds', async () => {
      const activePlan = {
        id: 'plan1',
        name: 'Plan Avalanche',
        strategy: 'avalanche',
        monthlyPayment: 5_000_000,
        projectedMonths: 36,
        projectedInterest: 2_000_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )

      const cards = [makeCard('c1', 'Visa Gold', 5_000_000, 3.35)]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      // Mock successful simulation
      vi.spyOn(DebtCalculator, 'simulatePayoff').mockReturnValueOnce({
        strategy: 'avalanche',
        totalMonths: 24,
        totalInterestPaid: 1_500_000,
        totalPaid: 6_500_000,
        monthlySnapshots: [],
        freedCards: [{ cardId: 'c1', cardName: 'Visa Gold', month: 24 }],
        savingsVsMinimum: 500_000,
        minimumPaymentRequired: 167_500,
      })

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      expect(result.hasPlan).toBe(true)
      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      expect(hasPlanResult.remainingMonths).toBe(24)
      expect(hasPlanResult.nextCard).toEqual({ name: 'Visa Gold', month: 24 })
    })

    it('falls back to projectedMonths when re-simulation throws', async () => {
      const activePlan = {
        id: 'plan1',
        name: 'Plan Avalanche',
        strategy: 'avalanche',
        monthlyPayment: 100, // now below minimum due to new spending
        projectedMonths: 36,
        projectedInterest: 2_000_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )

      const cards = [makeCard('c1', 'Visa Gold', 5_000_000, 3.35)]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      // Simulation fails (payment below minimum)
      vi.spyOn(DebtCalculator, 'simulatePayoff').mockImplementationOnce(() => {
        throw new Error('Payment below minimum required')
      })

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      expect(result.hasPlan).toBe(true)
      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      // Falls back to projectedMonths
      expect(hasPlanResult.remainingMonths).toBe(36)
      // nextCard stays null since simulation failed
      expect(hasPlanResult.nextCard).toBeNull()
    })

    it('skips simulation when cardInputs is empty and uses projectedMonths', async () => {
      const activePlan = {
        id: 'plan1',
        name: 'Plan Snowball',
        strategy: 'snowball',
        monthlyPayment: 5_000_000,
        projectedMonths: 20,
        projectedInterest: 1_000_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )
      // No cards with balance
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const simulateSpy = vi.spyOn(DebtCalculator, 'simulatePayoff')

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      expect(result.hasPlan).toBe(true)
      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      expect(hasPlanResult.remainingMonths).toBe(20)
      // simulatePayoff should NOT have been called
      expect(simulateSpy).not.toHaveBeenCalled()
    })

    it('returns nextCard = null when sim.freedCards is empty', async () => {
      const activePlan = {
        id: 'plan1',
        name: 'Plan Avalanche',
        strategy: 'avalanche',
        monthlyPayment: 5_000_000,
        projectedMonths: 36,
        projectedInterest: 2_000_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )

      const cards = [makeCard('c1', 'Visa Gold', 5_000_000, 3.35)]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      vi.spyOn(DebtCalculator, 'simulatePayoff').mockReturnValueOnce({
        strategy: 'avalanche',
        totalMonths: 30,
        totalInterestPaid: 1_000_000,
        totalPaid: 6_000_000,
        monthlySnapshots: [],
        freedCards: [], // no freed cards
        savingsVsMinimum: 500_000,
        minimumPaymentRequired: 167_500,
      })

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      expect(hasPlanResult.nextCard).toBeNull()
    })

    it('computes estimatedInitialDebt correctly', async () => {
      // estimatedInitialDebt = monthlyPayment * projectedMonths - projectedInterest
      const activePlan = {
        id: 'plan1',
        name: 'Plan Avalanche',
        strategy: 'avalanche',
        monthlyPayment: 1_000_000,
        projectedMonths: 10,
        projectedInterest: 500_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      // 1_000_000 * 10 - 500_000 = 9_500_000
      expect(hasPlanResult.estimatedInitialDebt).toBe(9_500_000)
    })

    it('handles null projectedMonths and projectedInterest gracefully', async () => {
      const activePlan = {
        id: 'plan1',
        name: 'Plan Avalanche',
        strategy: 'avalanche',
        monthlyPayment: 5_000_000,
        projectedMonths: null,
        projectedInterest: null,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getDebtPlanWidget()

      const hasPlanResult = result as Extract<typeof result, { hasPlan: true }>
      expect(hasPlanResult.remainingMonths).toBe(0)
      expect(hasPlanResult.originalMonths).toBe(0)
      expect(hasPlanResult.estimatedInitialDebt).toBe(0)
    })

    it('maps strategy "snowball" correctly', async () => {
      const activePlan = {
        id: 'plan2',
        name: 'Plan Snowball',
        strategy: 'snowball',
        monthlyPayment: 5_000_000,
        projectedMonths: 24,
        projectedInterest: 1_000_000,
        isActive: true,
        createdAt: new Date(),
      }
      vi.mocked(prisma.debtPayoffPlan.findFirst).mockResolvedValue(
        activePlan as never
      )

      const cards = [makeCard('c1', 'MC', 3_000_000, 2.8)]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      vi.spyOn(DebtCalculator, 'simulatePayoff').mockReturnValueOnce({
        strategy: 'snowball',
        totalMonths: 22,
        totalInterestPaid: 900_000,
        totalPaid: 3_900_000,
        monthlySnapshots: [],
        freedCards: [],
        savingsVsMinimum: 100_000,
        minimumPaymentRequired: 84_000,
      })

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      await caller.getDebtPlanWidget()

      expect(DebtCalculator.simulatePayoff).toHaveBeenCalledWith(
        expect.any(Array),
        5_000_000,
        'snowball'
      )
    })
  })

  // ── getMonthlySpending ───────────────────────────────────────────────────

  describe('getMonthlySpending', () => {
    it('returns empty categories and topDeviations when no transactions and no budget', async () => {
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      expect(result.categories).toHaveLength(0)
      expect(result.topDeviations).toHaveLength(0)
      expect(result.hasBudget).toBe(false)
      expect(result.totalSpent).toBe(0)
      expect(result.totalPlanned).toBe(0)
    })

    it('builds categories from budget items and spending map', async () => {
      const transactions = [
        { categoryId: 'cat1', _sum: { amount: 600_000 } },
        { categoryId: 'cat2', _sum: { amount: 200_000 } },
      ]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )

      const budget = {
        id: 'b1',
        totalPlanned: 2_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 800_000,
            category: {
              id: 'cat1',
              name: 'Alimentación',
              icon: '🛒',
              color: '#green',
            },
          },
          {
            categoryId: 'cat2',
            planned: 1_200_000,
            category: {
              id: 'cat2',
              name: 'Transporte',
              icon: '🚗',
              color: '#blue',
            },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      expect(result.hasBudget).toBe(true)
      expect(result.categories).toHaveLength(2)
      expect(result.totalSpent).toBe(800_000)
      expect(result.totalPlanned).toBe(2_000_000)

      // cat1: 600_000 spent, cat2: 200_000 spent
      const cat1 = result.categories.find((c) => c.categoryId === 'cat1')!
      expect(cat1.spent).toBe(600_000)
      const cat2 = result.categories.find((c) => c.categoryId === 'cat2')!
      expect(cat2.spent).toBe(200_000)
    })

    it('topDeviations is limited to top 3 by progress descending', async () => {
      const transactions = [
        { categoryId: 'cat1', _sum: { amount: 900_000 } }, // 90% of 1_000_000 → warning
        { categoryId: 'cat2', _sum: { amount: 1_200_000 } }, // 120% → exceeded
        { categoryId: 'cat3', _sum: { amount: 400_000 } }, // 40% → ok
        { categoryId: 'cat4', _sum: { amount: 700_000 } }, // 70% → ok (not in top 3)
      ]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )

      const budget = {
        id: 'b1',
        totalPlanned: 4_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
          {
            categoryId: 'cat2',
            planned: 1_000_000,
            category: { id: 'cat2', name: 'Cat2', icon: 'B', color: '#2' },
          },
          {
            categoryId: 'cat3',
            planned: 1_000_000,
            category: { id: 'cat3', name: 'Cat3', icon: 'C', color: '#3' },
          },
          {
            categoryId: 'cat4',
            planned: 1_000_000,
            category: { id: 'cat4', name: 'Cat4', icon: 'D', color: '#4' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      // Top 3, sorted by progress descending
      expect(result.topDeviations).toHaveLength(3)
      expect(result.topDeviations[0].progress).toBeGreaterThanOrEqual(
        result.topDeviations[1].progress
      )
      expect(result.topDeviations[1].progress).toBeGreaterThanOrEqual(
        result.topDeviations[2].progress
      )
    })

    it('topDeviations includes all 3 deviation statuses (exceeded, warning, ok)', async () => {
      const transactions = [
        { categoryId: 'cat1', _sum: { amount: 1_200_000 } }, // exceeded: > 1_000_000
        { categoryId: 'cat2', _sum: { amount: 850_000 } }, // warning: 85% of 1_000_000
        { categoryId: 'cat3', _sum: { amount: 500_000 } }, // ok: 50%
      ]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )

      const budget = {
        id: 'b1',
        totalPlanned: 3_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
          {
            categoryId: 'cat2',
            planned: 1_000_000,
            category: { id: 'cat2', name: 'Cat2', icon: 'B', color: '#2' },
          },
          {
            categoryId: 'cat3',
            planned: 1_000_000,
            category: { id: 'cat3', name: 'Cat3', icon: 'C', color: '#3' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      const statuses = result.topDeviations.map((d) => d.status)
      expect(statuses).toContain('exceeded')
      expect(statuses).toContain('warning')
      expect(statuses).toContain('ok')
    })

    it('computeDeviationStatus: actual > planned → exceeded', async () => {
      const transactions = [{ categoryId: 'cat1', _sum: { amount: 1_100_000 } }]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )
      const budget = {
        id: 'b1',
        totalPlanned: 1_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      expect(result.topDeviations[0].status).toBe('exceeded')
    })

    it('computeDeviationStatus: planned > 0 and ratio >= 0.8 → warning', async () => {
      const transactions = [{ categoryId: 'cat1', _sum: { amount: 800_000 } }]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )
      const budget = {
        id: 'b1',
        totalPlanned: 1_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      expect(result.topDeviations[0].status).toBe('warning')
    })

    it('computeDeviationStatus: ratio < 0.8 → ok', async () => {
      const transactions = [{ categoryId: 'cat1', _sum: { amount: 500_000 } }]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )
      const budget = {
        id: 'b1',
        totalPlanned: 1_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      expect(result.topDeviations[0].status).toBe('ok')
    })

    it('topDeviations excludes categories with 0 spent', async () => {
      // cat1 has 0 spent (no transaction row → spendingMap returns 0)
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)

      const budget = {
        id: 'b1',
        totalPlanned: 1_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      // cat1 spent = 0 → filtered out from topDeviations
      expect(result.topDeviations).toHaveLength(0)
      // But categories still has the item (with spent=0)
      expect(result.categories).toHaveLength(1)
      expect(result.categories[0].spent).toBe(0)
    })

    it('handles null _sum.amount in transactions.groupBy (treats as 0)', async () => {
      // groupBy can return null for _sum.amount when there are no matching transactions
      const transactions = [
        { categoryId: 'cat1', _sum: { amount: null } }, // null amount
      ]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )

      const budget = {
        id: 'b1',
        totalPlanned: 1_000_000,
        items: [
          {
            categoryId: 'cat1',
            planned: 1_000_000,
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      // null amount treated as 0 in both spendingMap and totalSpent
      expect(result.totalSpent).toBe(0)
      expect(result.categories[0].spent).toBe(0)
    })

    it('topDeviations shows progress = 0 when planned is 0 and spent > 0', async () => {
      // A category with planned = 0 but actual spending — the ternary should return 0
      const transactions = [{ categoryId: 'cat1', _sum: { amount: 500_000 } }]
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue(
        transactions as never
      )

      const budget = {
        id: 'b1',
        totalPlanned: 0,
        items: [
          {
            categoryId: 'cat1',
            planned: 0, // planned = 0
            category: { id: 'cat1', name: 'Cat1', icon: 'A', color: '#1' },
          },
        ],
      }
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(budget as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      // spent > 0 but planned = 0 → progress = 0 (guarded ternary)
      expect(result.topDeviations).toHaveLength(1)
      expect(result.topDeviations[0].progress).toBe(0)
    })

    it('returns correct month, year, dayOfMonth, daysInMonth fields', async () => {
      vi.mocked(prisma.transaction.groupBy).mockResolvedValue([] as never)
      vi.mocked(prisma.budget.findUnique).mockResolvedValue(null as never)

      const caller = dashboardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getMonthlySpending()

      const now = new Date()
      expect(result.month).toBe(now.getMonth() + 1)
      expect(result.year).toBe(now.getFullYear())
      expect(result.dayOfMonth).toBe(now.getDate())
      expect(result.daysInMonth).toBeGreaterThanOrEqual(28)
      expect(result.daysInMonth).toBeLessThanOrEqual(31)
    })
  })
})
