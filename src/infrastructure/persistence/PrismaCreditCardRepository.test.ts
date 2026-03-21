import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@/generated/prisma/client'
import { CreditCard } from '@/domain/entities/CreditCard'
import { Money } from '@/domain/value-objects/Money'
import { BillingCycle } from '@/domain/value-objects/BillingCycle'
import { PrismaCreditCardRepository } from './PrismaCreditCardRepository'

// Prevent PrismaPg and NextAuth from loading during tests
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal PrismaClient mock — only the tables used by PrismaCreditCardRepository. */
function makePrisma() {
  return {
    creditCard: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    balanceSnapshot: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaClient
}

/** Builds a Prisma CreditCard row (all required fields present). */
function makePrismaRow(
  overrides?: Partial<{
    id: string
    name: string
    bank: string
    cardType: string
    lastFourDigits: string
    ownerId: string
    creditLimit: number
    currentBalance: number
    billingCycleDay: number
    paymentDueDay: number
    rateRevolving: number
    rateInstallments: number
    rateCashAdvance: number
    caeRevolving: number
    isActive: boolean
    isFrozen: boolean
  }>
) {
  return {
    id: overrides?.id ?? 'card-1',
    name: overrides?.name ?? 'Scotiabank Signature',
    bank: overrides?.bank ?? 'Scotiabank',
    cardType: overrides?.cardType ?? 'VISA',
    lastFourDigits: overrides?.lastFourDigits ?? '1234',
    ownerId: overrides?.ownerId ?? 'member-1',
    creditLimit: overrides?.creditLimit ?? 10_000_000,
    currentBalance: overrides?.currentBalance ?? 5_000_000,
    billingCycleDay: overrides?.billingCycleDay ?? 23,
    paymentDueDay: overrides?.paymentDueDay ?? 10,
    rateRevolving: overrides?.rateRevolving ?? 2.4,
    rateInstallments: overrides?.rateInstallments ?? 1.2,
    rateCashAdvance: overrides?.rateCashAdvance ?? 3.0,
    caeRevolving: overrides?.caeRevolving ?? 32.5,
    isActive: overrides?.isActive ?? true,
    isFrozen: overrides?.isFrozen ?? false,
  }
}

/** Builds a domain CreditCard from a Prisma row for comparison. */
function domainCardFromRow(row: ReturnType<typeof makePrismaRow>): CreditCard {
  return new CreditCard({
    id: row.id,
    name: row.name,
    bank: row.bank,
    cardType: row.cardType,
    lastFourDigits: row.lastFourDigits,
    ownerId: row.ownerId,
    creditLimit: Money.fromPesos(row.creditLimit),
    currentBalance: Money.fromPesos(row.currentBalance),
    billingCycle: new BillingCycle(row.billingCycleDay, row.paymentDueDay),
    rateRevolving: row.rateRevolving,
    rateInstallments: row.rateInstallments,
    rateCashAdvance: row.rateCashAdvance,
    caeRevolving: row.caeRevolving,
    isActive: row.isActive,
    isFrozen: row.isFrozen,
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PrismaCreditCardRepository', () => {
  let prisma: ReturnType<typeof makePrisma>
  let repo: PrismaCreditCardRepository

  beforeEach(() => {
    prisma = makePrisma()
    repo = new PrismaCreditCardRepository(prisma as unknown as PrismaClient)
  })

  // ── findById ───────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns null when no record is found', async () => {
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(null)

      const result = await repo.findById('card-missing')

      expect(result).toBeNull()
      expect(prisma.creditCard.findUnique).toHaveBeenCalledWith({
        where: { id: 'card-missing' },
      })
    })

    it('returns a CreditCard domain entity with all fields mapped correctly', async () => {
      const row = makePrismaRow()
      vi.mocked(prisma.creditCard.findUnique).mockResolvedValue(row as never)

      const result = await repo.findById('card-1')

      expect(result).toBeInstanceOf(CreditCard)
      expect(result?.id).toBe('card-1')
      expect(result?.name).toBe('Scotiabank Signature')
      expect(result?.bank).toBe('Scotiabank')
      expect(result?.cardType).toBe('VISA')
      expect(result?.lastFourDigits).toBe('1234')
      expect(result?.ownerId).toBe('member-1')
      expect(result?.creditLimit).toBeInstanceOf(Money)
      expect(result?.creditLimit.value).toBe(10_000_000)
      expect(result?.currentBalance).toBeInstanceOf(Money)
      expect(result?.currentBalance.value).toBe(5_000_000)
      expect(result?.billingCycle).toBeInstanceOf(BillingCycle)
      expect(result?.billingCycle.billingDay).toBe(23)
      expect(result?.billingCycle.dueDay).toBe(10)
      expect(result?.rateRevolving).toBe(2.4)
      expect(result?.rateInstallments).toBe(1.2)
      expect(result?.rateCashAdvance).toBe(3.0)
      expect(result?.caeRevolving).toBe(32.5)
      expect(result?.isActive).toBe(true)
      expect(result?.isFrozen).toBe(false)
    })
  })

  // ── findByOwnerId ──────────────────────────────────────────────────────

  describe('findByOwnerId', () => {
    it('returns an empty array when owner has no cards', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([])

      const result = await repo.findByOwnerId('member-unknown')

      expect(result).toEqual([])
      expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'member-unknown' },
        orderBy: { currentBalance: 'desc' },
      })
    })

    it('returns mapped CreditCard entities ordered by balance desc', async () => {
      const rows = [
        makePrismaRow({ id: 'card-2', currentBalance: 8_000_000 }),
        makePrismaRow({ id: 'card-1', currentBalance: 3_000_000 }),
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(rows as never)

      const result = await repo.findByOwnerId('member-1')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeInstanceOf(CreditCard)
      expect(result[0].id).toBe('card-2')
      expect(result[1].id).toBe('card-1')
    })
  })

  // ── findAllWithDebt ────────────────────────────────────────────────────

  describe('findAllWithDebt', () => {
    it('returns only active cards with balance > 0', async () => {
      const rows = [
        makePrismaRow({
          id: 'card-debt',
          currentBalance: 1_000_000,
          isActive: true,
        }),
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(rows as never)

      const result = await repo.findAllWithDebt()

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(CreditCard)
      expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
        where: { currentBalance: { gt: 0 }, isActive: true },
        orderBy: { currentBalance: 'desc' },
      })
    })

    it('returns an empty array when no cards have debt', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([])

      const result = await repo.findAllWithDebt()

      expect(result).toEqual([])
    })
  })

  // ── findAll ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all cards ordered by balance desc', async () => {
      const rows = [
        makePrismaRow({ id: 'card-A', currentBalance: 5_000_000 }),
        makePrismaRow({ id: 'card-B', currentBalance: 0 }),
      ]
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue(rows as never)

      const result = await repo.findAll()

      expect(result).toHaveLength(2)
      expect(result.every((c) => c instanceof CreditCard)).toBe(true)
      expect(prisma.creditCard.findMany).toHaveBeenCalledWith({
        orderBy: { currentBalance: 'desc' },
      })
    })

    it('returns an empty array when there are no cards', async () => {
      vi.mocked(prisma.creditCard.findMany).mockResolvedValue([])

      const result = await repo.findAll()

      expect(result).toEqual([])
    })
  })

  // ── save ───────────────────────────────────────────────────────────────

  describe('save', () => {
    it('calls prisma.creditCard.upsert with full card data in both update and create', async () => {
      const row = makePrismaRow()
      const card = domainCardFromRow(row)
      vi.mocked(prisma.creditCard.upsert).mockResolvedValue(row as never)

      await repo.save(card)

      const expectedPayload = {
        name: row.name,
        bank: row.bank,
        cardType: row.cardType,
        lastFourDigits: row.lastFourDigits,
        ownerId: row.ownerId,
        creditLimit: row.creditLimit,
        currentBalance: row.currentBalance,
        billingCycleDay: row.billingCycleDay,
        paymentDueDay: row.paymentDueDay,
        rateRevolving: row.rateRevolving,
        rateInstallments: row.rateInstallments,
        rateCashAdvance: row.rateCashAdvance,
        caeRevolving: row.caeRevolving,
        isActive: row.isActive,
        isFrozen: row.isFrozen,
      }

      expect(prisma.creditCard.upsert).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        update: expectedPayload,
        create: { id: 'card-1', ...expectedPayload },
      })
    })
  })

  // ── updateBalance ──────────────────────────────────────────────────────

  describe('updateBalance', () => {
    it('calls $transaction with [creditCard.update, balanceSnapshot.create]', async () => {
      // updateBalance uses array-form $transaction; Prisma queues updates before passing to driver.
      // We resolve with a sentinel to verify the call structure.
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never)

      // The method calls this.prisma.creditCard.update() and this.prisma.balanceSnapshot.create()
      // before passing them as an array to $transaction. The mock return values of those calls
      // are the unresolved promises that get forwarded to the driver — we just need to stub them.
      vi.mocked(prisma.creditCard.update).mockReturnValue({} as never)
      vi.mocked(prisma.balanceSnapshot.create).mockReturnValue({} as never)

      await repo.updateBalance('card-1', 3_500_000)

      // Verify that the two inner calls were constructed with the right arguments
      expect(prisma.creditCard.update).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        data: { currentBalance: 3_500_000 },
      })

      expect(prisma.balanceSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            creditCardId: 'card-1',
            balance: 3_500_000,
          }),
        })
      )

      // Verify $transaction received an array
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
      const txArg = vi.mocked(prisma.$transaction).mock.calls[0][0]
      expect(Array.isArray(txArg)).toBe(true)
      expect((txArg as unknown as unknown[]).length).toBe(2)
    })

    it('creates a snapshot with a Date as snapshotDate', async () => {
      vi.mocked(prisma.$transaction).mockResolvedValue([{}, {}] as never)
      vi.mocked(prisma.creditCard.update).mockReturnValue({} as never)
      vi.mocked(prisma.balanceSnapshot.create).mockReturnValue({} as never)

      await repo.updateBalance('card-2', 0)

      const createArg = vi.mocked(prisma.balanceSnapshot.create).mock
        .calls[0][0]
      expect(createArg.data.snapshotDate).toBeInstanceOf(Date)
    })
  })
})
