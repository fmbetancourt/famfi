import { describe, expect, it } from 'vitest'
import { Money } from './Money'

describe('Money', () => {
  // ─── Construction ───────────────────────────────────────────────

  describe('construction', () => {
    it('creates from integer pesos', () => {
      const money = Money.fromPesos(1_000_000)
      expect(money.value).toBe(1_000_000)
    })

    it('rounds float input to nearest integer', () => {
      const money = Money.fromPesos(1_000.7)
      expect(money.value).toBe(1_001)
    })

    it('creates zero', () => {
      const money = Money.zero()
      expect(money.value).toBe(0)
      expect(money.isZero()).toBe(true)
    })
  })

  // ─── Arithmetic ─────────────────────────────────────────────────

  describe('arithmetic', () => {
    it('adds two amounts', () => {
      const a = Money.fromPesos(3_500_000)
      const b = Money.fromPesos(2_700_000)
      expect(a.add(b).value).toBe(6_200_000)
    })

    it('subtracts two amounts', () => {
      const income = Money.fromPesos(6_200_000)
      const expenses = Money.fromPesos(4_274_000)
      expect(income.subtract(expenses).value).toBe(1_926_000)
    })

    it('multiplies by scalar', () => {
      const monthly = Money.fromPesos(700_000)
      expect(monthly.multiply(12).value).toBe(8_400_000)
    })

    it('multiplies by fractional scalar and rounds', () => {
      const amount = Money.fromPesos(1_000_001)
      expect(amount.multiply(0.5).value).toBe(500_001) // rounds 500000.5
    })
  })

  // ─── Percentage / Interest ──────────────────────────────────────

  describe('percentage', () => {
    it('calculates monthly revolving interest — Santander World Limited', () => {
      // $14,388,382 at 3.35% monthly revolving rate
      const balance = Money.fromPesos(14_388_382)
      const interest = balance.percentage(3.35)
      // 14_388_382 * 0.0335 = 482_010.797 → rounds to 482_011
      expect(interest.value).toBe(482_011)
    })

    it('calculates monthly revolving interest — Scotiabank Signature', () => {
      // $14,637,492 at 2.40% monthly revolving rate
      const balance = Money.fromPesos(14_637_492)
      const interest = balance.percentage(2.4)
      // 14_637_492 * 0.024 = 351_299.808 → rounds to 351_300
      expect(interest.value).toBe(351_300)
    })

    it('calculates interest on small balance', () => {
      const balance = Money.fromPesos(19_424)
      const interest = balance.percentage(3.35)
      // 19_424 * 0.0335 = 650.704 → rounds to 651
      expect(interest.value).toBe(651)
    })

    it('percentage of zero is zero', () => {
      expect(Money.zero().percentage(3.35).value).toBe(0)
    })

    it('zero percent of any amount is zero', () => {
      expect(Money.fromPesos(14_388_382).percentage(0).value).toBe(0)
    })
  })

  // ─── Immutability ───────────────────────────────────────────────

  describe('immutability', () => {
    it('add returns new instance, original unchanged', () => {
      const original = Money.fromPesos(1_000_000)
      const result = original.add(Money.fromPesos(500_000))
      expect(original.value).toBe(1_000_000)
      expect(result.value).toBe(1_500_000)
    })

    it('subtract returns new instance, original unchanged', () => {
      const original = Money.fromPesos(1_000_000)
      const result = original.subtract(Money.fromPesos(300_000))
      expect(original.value).toBe(1_000_000)
      expect(result.value).toBe(700_000)
    })

    it('percentage returns new instance, original unchanged', () => {
      const original = Money.fromPesos(14_388_382)
      const interest = original.percentage(3.35)
      expect(original.value).toBe(14_388_382)
      expect(interest.value).toBe(482_011)
    })
  })

  // ─── Comparisons ────────────────────────────────────────────────

  describe('comparisons', () => {
    it('detects negative', () => {
      expect(Money.fromPesos(-100_000).isNegative()).toBe(true)
      expect(Money.fromPesos(100_000).isNegative()).toBe(false)
      expect(Money.zero().isNegative()).toBe(false)
    })

    it('detects zero', () => {
      expect(Money.zero().isZero()).toBe(true)
      expect(Money.fromPesos(1).isZero()).toBe(false)
    })

    it('detects positive', () => {
      expect(Money.fromPesos(1).isPositive()).toBe(true)
      expect(Money.zero().isPositive()).toBe(false)
      expect(Money.fromPesos(-1).isPositive()).toBe(false)
    })

    it('equality', () => {
      const a = Money.fromPesos(14_388_382)
      const b = Money.fromPesos(14_388_382)
      expect(a.equals(b)).toBe(true)
      expect(a.equals(Money.fromPesos(14_388_383))).toBe(false)
    })

    it('greaterThan / lessThan', () => {
      const high = Money.fromPesos(14_637_492)
      const low = Money.fromPesos(3_795_017)
      expect(high.greaterThan(low)).toBe(true)
      expect(low.lessThan(high)).toBe(true)
      expect(high.lessThan(low)).toBe(false)
    })
  })

  // ─── Formatting ─────────────────────────────────────────────────

  describe('format', () => {
    it('formats total family debt', () => {
      expect(Money.fromPesos(40_476_064).format()).toBe('$40.476.064')
    })

    it('formats credit card balance', () => {
      expect(Money.fromPesos(14_388_382).format()).toBe('$14.388.382')
    })

    it('formats monthly salary', () => {
      expect(Money.fromPesos(3_500_000).format()).toBe('$3.500.000')
    })

    it('formats small amount', () => {
      expect(Money.fromPesos(651).format()).toBe('$651')
    })

    it('formats zero', () => {
      expect(Money.zero().format()).toBe('$0')
    })

    it('formats negative amount', () => {
      expect(Money.fromPesos(-800_000).format()).toBe('-$800.000')
    })

    it('toString delegates to format', () => {
      const money = Money.fromPesos(6_200_000)
      expect(`${money}`).toBe('$6.200.000')
    })
  })

  // ─── Edge Cases ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles subtraction resulting in negative', () => {
      const balance = Money.fromPesos(100_000)
      const payment = Money.fromPesos(150_000)
      const result = balance.subtract(payment)
      expect(result.value).toBe(-50_000)
      expect(result.isNegative()).toBe(true)
    })

    it('chain of operations — monthly cash flow', () => {
      const income = Money.fromPesos(6_200_000)
      const propertyNet = Money.fromPesos(800_000)
      const fixed = Money.fromPesos(1_750_000)
      const allowances = Money.fromPesos(124_000)
      const groceries = Money.fromPesos(600_000)
      const dining = Money.fromPesos(700_000)
      const interest = Money.fromPesos(300_000)

      const available = income
        .subtract(propertyNet)
        .subtract(fixed)
        .subtract(allowances)
        .subtract(groceries)
        .subtract(dining)
        .subtract(interest)

      expect(available.value).toBe(1_926_000)
    })

    it('sum across all card balances', () => {
      const balances = [
        14_637_492, 14_388_382, 6_575_620, 3_795_017, 944_511, 101_218, 19_424,
        14_400,
      ].map(Money.fromPesos)

      const total = balances.reduce((sum, b) => sum.add(b), Money.zero())
      expect(total.value).toBe(40_476_064)
    })
  })
})
