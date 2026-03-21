import { describe, expect, it } from 'vitest'
import { CreditCard } from './CreditCard'
import { Money } from '../value-objects/Money'
import { BillingCycle } from '../value-objects/BillingCycle'

// Helper to build a CreditCard with sensible defaults
function buildCard(
  overrides: Partial<ConstructorParameters<typeof CreditCard>[0]> = {}
): CreditCard {
  return new CreditCard({
    id: 'card-1',
    name: 'Santander World Limited',
    bank: 'SANTANDER',
    cardType: 'WORLD_LIMITED',
    lastFourDigits: '3315',
    ownerId: 'freddy-1',
    creditLimit: Money.fromPesos(15_000_000),
    currentBalance: Money.fromPesos(14_388_382),
    billingCycle: new BillingCycle(23, 10),
    rateRevolving: 3.35,
    rateInstallments: 2.72,
    rateCashAdvance: 3.35,
    caeRevolving: 51.1,
    isActive: true,
    isFrozen: false,
    ...overrides,
  })
}

describe('CreditCard', () => {
  describe('availableCredit', () => {
    it('calculates available credit — Santander World Limited', () => {
      const card = buildCard()
      // 15,000,000 - 14,388,382 = 611,618
      expect(card.availableCredit().value).toBe(611_618)
    })

    it('returns full limit when balance is zero', () => {
      const card = buildCard({
        name: 'BCI Black',
        creditLimit: Money.fromPesos(11_000_000),
        currentBalance: Money.zero(),
      })
      expect(card.availableCredit().value).toBe(11_000_000)
    })

    it('returns zero when fully utilized', () => {
      const card = buildCard({
        creditLimit: Money.fromPesos(4_840_000),
        currentBalance: Money.fromPesos(4_840_000),
      })
      expect(card.availableCredit().isZero()).toBe(true)
    })

    it('returns negative when over-limit', () => {
      const card = buildCard({
        creditLimit: Money.fromPesos(1_470_000),
        currentBalance: Money.fromPesos(1_500_000),
      })
      expect(card.availableCredit().isNegative()).toBe(true)
    })
  })

  describe('utilizationRate', () => {
    it('calculates utilization — Santander World Limited at ~96%', () => {
      const card = buildCard()
      // 14,388,382 / 15,000,000 * 100 = 95.922...
      const rate = card.utilizationRate()
      expect(rate).toBeCloseTo(95.92, 1)
    })

    it('returns 0 for zero balance', () => {
      const card = buildCard({ currentBalance: Money.zero() })
      expect(card.utilizationRate()).toBe(0)
    })

    it('returns 0 when limit is zero (avoid division by zero)', () => {
      const card = buildCard({
        creditLimit: Money.zero(),
        currentBalance: Money.zero(),
      })
      expect(card.utilizationRate()).toBe(0)
    })

    it('exceeds 100 when over-limit', () => {
      const card = buildCard({
        creditLimit: Money.fromPesos(1_000_000),
        currentBalance: Money.fromPesos(1_100_000),
      })
      expect(card.utilizationRate()).toBeCloseTo(110, 1)
    })

    it('Scotiabank Signature — near 100%', () => {
      const card = buildCard({
        creditLimit: Money.fromPesos(14_694_000),
        currentBalance: Money.fromPesos(14_637_492),
      })
      // 14,637,492 / 14,694,000 * 100 = 99.616...
      expect(card.utilizationRate()).toBeCloseTo(99.62, 1)
    })
  })

  describe('monthlyInterestCost', () => {
    it('Santander World Limited — 3.35% of $14,388,382 = $482,011', () => {
      const card = buildCard()
      expect(card.monthlyInterestCost().value).toBe(482_011)
    })

    it('Scotiabank Signature — 2.40% of $14,637,492 = $351,300', () => {
      const card = buildCard({
        currentBalance: Money.fromPesos(14_637_492),
        rateRevolving: 2.4,
      })
      expect(card.monthlyInterestCost().value).toBe(351_300)
    })

    it('Scotiabank Infinite — 2.40% of $6,575,620 = $157,815', () => {
      const card = buildCard({
        currentBalance: Money.fromPesos(6_575_620),
        rateRevolving: 2.4,
      })
      expect(card.monthlyInterestCost().value).toBe(157_815)
    })

    it('Santander Platinum — 3.35% of $3,795,017 = $127,133', () => {
      const card = buildCard({
        currentBalance: Money.fromPesos(3_795_017),
        rateRevolving: 3.35,
      })
      expect(card.monthlyInterestCost().value).toBe(127_133)
    })

    it('zero balance produces zero interest', () => {
      const card = buildCard({ currentBalance: Money.zero() })
      expect(card.monthlyInterestCost().isZero()).toBe(true)
    })
  })

  describe('daysUntilDue / nextDueDate', () => {
    it('Santander due on 10th — from March 1st = 9 days', () => {
      const card = buildCard()
      const march1 = new Date(2026, 2, 1)
      expect(card.daysUntilDue(march1)).toBe(9)
    })

    it('Scotiabank due on 11th — from March 1st = 10 days', () => {
      const card = buildCard({ billingCycle: new BillingCycle(23, 11) })
      const march1 = new Date(2026, 2, 1)
      expect(card.daysUntilDue(march1)).toBe(10)
    })

    it('nextDueDate returns correct date', () => {
      const card = buildCard()
      const march1 = new Date(2026, 2, 1)
      const due = card.nextDueDate(march1)
      expect(due.getDate()).toBe(10)
      expect(due.getMonth()).toBe(2) // March
    })

    it('nextDueDate rolls to next month after due', () => {
      const card = buildCard()
      const march15 = new Date(2026, 2, 15)
      const due = card.nextDueDate(march15)
      expect(due.getDate()).toBe(10)
      expect(due.getMonth()).toBe(3) // April
    })
  })

  describe('hasDebt / isUsable', () => {
    it('hasDebt with positive balance', () => {
      const card = buildCard()
      expect(card.hasDebt()).toBe(true)
    })

    it('no debt with zero balance', () => {
      const card = buildCard({ currentBalance: Money.zero() })
      expect(card.hasDebt()).toBe(false)
    })

    it('active and not frozen = usable', () => {
      const card = buildCard({ isActive: true, isFrozen: false })
      expect(card.isUsable()).toBe(true)
    })

    it('frozen card is not usable', () => {
      const card = buildCard({ isFrozen: true })
      expect(card.isUsable()).toBe(false)
    })

    it('inactive card is not usable', () => {
      const card = buildCard({ isActive: false })
      expect(card.isUsable()).toBe(false)
    })
  })
})
