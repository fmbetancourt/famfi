import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { cardRouter } from './card'

// Must be hoisted before any imports that transitively load @/lib/prisma or next-auth
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Shared mock data ─────────────────────────────────────────────────────────

const mockSession = {
  user: { id: 'u1', name: 'Test User', email: 'test@test.com', familyId: 'f1' },
  expires: '9999-12-31',
}

// ─── Mock factory helpers ─────────────────────────────────────────────────────

function makePrisma(): PrismaClient {
  return {
    creditCard: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    balanceSnapshot: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

function makeCtx(prisma: unknown) {
  return { session: mockSession, prisma } as Parameters<
    ReturnType<typeof cardRouter.createCaller>
  >[0]
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('cardRouter', () => {
  let prisma: ReturnType<typeof makePrisma>

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = makePrisma()
  })

  // ── getAll ─────────────────────────────────────────────────────────────────

  describe('getAll', () => {
    it('returns cards scoped to the family', async () => {
      const cards = [
        {
          id: 'c1',
          name: 'Visa',
          currentBalance: 500000,
          owner: { name: 'Test User' },
        },
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(cards as never)

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getAll()

      expect(result).toEqual(cards)
      expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
        where: { owner: { familyId: 'f1' } },
        include: { owner: { select: { name: true } } },
        orderBy: { currentBalance: 'desc' },
      })
    })

    it('returns empty array when no cards exist', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([] as never)

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getAll()

      expect(result).toEqual([])
    })
  })

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    const fullCard = {
      id: 'c1',
      name: 'Visa',
      owner: { name: 'Test User', familyId: 'f1' },
      balanceSnapshots: [],
    }

    it('returns the card when it belongs to the family', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(
        fullCard as never
      )

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getById({ id: 'c1' })

      expect(result).toEqual(fullCard)
    })

    it('returns null when card does not exist (findUnique returns null)', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(null as never)

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getById({ id: 'c-missing' })

      expect(result).toBeNull()
    })

    it('returns null when card belongs to a different family', async () => {
      const foreignCard = {
        id: 'c2',
        name: 'Mastercard',
        owner: { name: 'Other', familyId: 'f-other' },
        balanceSnapshots: [],
      }
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(
        foreignCard as never
      )

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.getById({ id: 'c2' })

      expect(result).toBeNull()
    })
  })

  // ── updateBalance ──────────────────────────────────────────────────────────

  describe('updateBalance', () => {
    it('throws NOT_FOUND when card does not exist', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(null as never)

      const caller = cardRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.updateBalance({ id: 'c-missing', balance: 100000 })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws NOT_FOUND when card belongs to a different family', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue({
        id: 'c2',
        owner: { familyId: 'f-other' },
      } as never)

      const caller = cardRouter.createCaller(makeCtx(prisma))
      await expect(
        caller.updateBalance({ id: 'c2', balance: 100000 })
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('atomically updates balance and creates snapshot when card is owned by family', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue({
        id: 'c1',
        owner: { familyId: 'f1' },
      } as never)

      const updatedCard = { id: 'c1', currentBalance: 300000 }
      const snapshot = { id: 'snap1', creditCardId: 'c1', balance: 300000 }
      vi.mocked(prisma.$transaction).mockResolvedValue([
        updatedCard,
        snapshot,
      ] as never)

      // Simulate nested prisma calls inside $transaction
      vi.mocked(prisma.creditCard.update).mockReturnValue(updatedCard as never)
      vi.mocked(prisma.balanceSnapshot.create).mockReturnValue(
        snapshot as never
      )

      const caller = cardRouter.createCaller(makeCtx(prisma))
      const result = await caller.updateBalance({ id: 'c1', balance: 300000 })

      expect(result).toEqual([updatedCard, snapshot])
      expect(prisma.$transaction).toHaveBeenCalledOnce()
    })
  })

  // ── auth middleware ────────────────────────────────────────────────────────

  describe('auth middleware', () => {
    it('throws UNAUTHORIZED when session is null', async () => {
      const unauthCtx = { session: null, prisma } as unknown as Parameters<
        ReturnType<typeof cardRouter.createCaller>
      >[0]

      const caller = cardRouter.createCaller(unauthCtx)
      await expect(caller.getAll()).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      })
    })
  })
})
