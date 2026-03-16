import type {
  CreditCard as PrismaCreditCard,
  PrismaClient,
} from '@/generated/prisma/client'
import type { ICreditCardRepository } from '@/domain/repositories/ICreditCardRepository'
import { CreditCard } from '@/domain/entities/CreditCard'
import { Money } from '@/domain/value-objects/Money'
import { BillingCycle } from '@/domain/value-objects/BillingCycle'

/** Maps a Prisma CreditCard row to the domain entity. */
function toDomain(row: PrismaCreditCard): CreditCard {
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

export class PrismaCreditCardRepository implements ICreditCardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<CreditCard | null> {
    const row = await this.prisma.creditCard.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findByOwnerId(ownerId: string): Promise<CreditCard[]> {
    const rows = await this.prisma.creditCard.findMany({
      where: { ownerId },
      orderBy: { currentBalance: 'desc' },
    })
    return rows.map(toDomain)
  }

  async findAllWithDebt(): Promise<CreditCard[]> {
    const rows = await this.prisma.creditCard.findMany({
      where: { currentBalance: { gt: 0 }, isActive: true },
      orderBy: { currentBalance: 'desc' },
    })
    return rows.map(toDomain)
  }

  async findAll(): Promise<CreditCard[]> {
    const rows = await this.prisma.creditCard.findMany({
      orderBy: { currentBalance: 'desc' },
    })
    return rows.map(toDomain)
  }

  async save(card: CreditCard): Promise<void> {
    await this.prisma.creditCard.upsert({
      where: { id: card.id },
      update: {
        name: card.name,
        bank: card.bank,
        cardType: card.cardType,
        lastFourDigits: card.lastFourDigits,
        ownerId: card.ownerId,
        creditLimit: card.creditLimit.value,
        currentBalance: card.currentBalance.value,
        billingCycleDay: card.billingCycle.billingDay,
        paymentDueDay: card.billingCycle.dueDay,
        rateRevolving: card.rateRevolving,
        rateInstallments: card.rateInstallments,
        rateCashAdvance: card.rateCashAdvance,
        caeRevolving: card.caeRevolving,
        isActive: card.isActive,
        isFrozen: card.isFrozen,
      },
      create: {
        id: card.id,
        name: card.name,
        bank: card.bank,
        cardType: card.cardType,
        lastFourDigits: card.lastFourDigits,
        ownerId: card.ownerId,
        creditLimit: card.creditLimit.value,
        currentBalance: card.currentBalance.value,
        billingCycleDay: card.billingCycle.billingDay,
        paymentDueDay: card.billingCycle.dueDay,
        rateRevolving: card.rateRevolving,
        rateInstallments: card.rateInstallments,
        rateCashAdvance: card.rateCashAdvance,
        caeRevolving: card.caeRevolving,
        isActive: card.isActive,
        isFrozen: card.isFrozen,
      },
    })
  }

  async updateBalance(id: string, newBalance: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.creditCard.update({
        where: { id },
        data: { currentBalance: newBalance },
      }),
      this.prisma.balanceSnapshot.create({
        data: {
          creditCardId: id,
          balance: newBalance,
          snapshotDate: new Date(),
        },
      }),
    ])
  }
}
