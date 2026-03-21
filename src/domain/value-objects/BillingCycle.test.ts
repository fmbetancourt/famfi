import { describe, expect, it } from 'vitest'
import { BillingCycle } from './BillingCycle'

describe('BillingCycle', () => {
  // All Santander/Scotiabank cards: billing 23rd, due 10th/11th
  const santander = new BillingCycle(23, 10)
  const scotiabank = new BillingCycle(23, 11)

  describe('construction', () => {
    it('creates with valid days', () => {
      expect(santander.billingDay).toBe(23)
      expect(santander.dueDay).toBe(10)
    })

    it('rejects invalid billing day', () => {
      expect(() => new BillingCycle(0, 10)).toThrow('Invalid billing day')
      expect(() => new BillingCycle(32, 10)).toThrow('Invalid billing day')
    })

    it('rejects invalid due day', () => {
      expect(() => new BillingCycle(23, 0)).toThrow('Invalid due day')
      expect(() => new BillingCycle(23, 32)).toThrow('Invalid due day')
    })
  })

  describe('daysUntilDue', () => {
    it('returns days when due date is in the future this month', () => {
      // March 1st → due March 10th = 9 days
      const march1 = new Date(2026, 2, 1)
      expect(santander.daysUntilDue(march1)).toBe(9)
    })

    it('returns 0 on the due date itself', () => {
      const march10 = new Date(2026, 2, 10)
      expect(santander.daysUntilDue(march10)).toBe(0)
    })

    it('rolls to next month when due date already passed', () => {
      // March 15 midnight → due April 10 midnight = 26 full days remaining
      // Math.ceil of exact midnight-to-midnight = 26
      const march15 = new Date(2026, 2, 15)
      expect(santander.daysUntilDue(march15)).toBe(26)
    })

    it('handles Scotiabank due on 11th', () => {
      // March 1st → due March 11th = 10 days
      const march1 = new Date(2026, 2, 1)
      expect(scotiabank.daysUntilDue(march1)).toBe(10)
    })

    it('handles month boundary — January to February', () => {
      // Jan 15 → due Feb 10 = 26 days
      const jan15 = new Date(2026, 0, 15)
      expect(santander.daysUntilDue(jan15)).toBe(26)
    })

    it('handles year boundary — December to January', () => {
      // Dec 15 → due Jan 10 = 26 days
      const dec15 = new Date(2025, 11, 15)
      expect(santander.daysUntilDue(dec15)).toBe(26)
    })
  })

  describe('nextDueDate', () => {
    it("returns this month if due date hasn't passed", () => {
      const march1 = new Date(2026, 2, 1)
      const due = santander.nextDueDate(march1)
      expect(due.getFullYear()).toBe(2026)
      expect(due.getMonth()).toBe(2) // March
      expect(due.getDate()).toBe(10)
    })

    it('returns next month if due date already passed', () => {
      const march15 = new Date(2026, 2, 15)
      const due = santander.nextDueDate(march15)
      expect(due.getFullYear()).toBe(2026)
      expect(due.getMonth()).toBe(3) // April
      expect(due.getDate()).toBe(10)
    })
  })

  describe('nextBillingDate', () => {
    it("returns this month if billing date hasn't passed", () => {
      const march1 = new Date(2026, 2, 1)
      const billing = santander.nextBillingDate(march1)
      expect(billing.getDate()).toBe(23)
      expect(billing.getMonth()).toBe(2)
    })

    it('returns next month if billing date already passed', () => {
      const march25 = new Date(2026, 2, 25)
      const billing = santander.nextBillingDate(march25)
      expect(billing.getDate()).toBe(23)
      expect(billing.getMonth()).toBe(3) // April
    })
  })
})
