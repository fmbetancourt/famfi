import { describe, expect, it } from 'vitest'
import { Money } from '../value-objects/Money'
import {
  BudgetAllocator,
  type BudgetItemInput,
  type HistoricalTransaction,
} from './BudgetAllocator'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const INCOME = Money.fromPesos(6_200_000) // Freddy's salary

// Category IDs matching the seed data
const CAT = {
  supermercado: 'cat-supermercado',
  restaurantes: 'cat-restaurantes',
  transporte: 'cat-transporte',
  salud: 'cat-salud',
  servicios: 'cat-servicios',
} as const

/** Builds a transaction on a given year-month (day defaults to 15). */
function tx(
  categoryId: string,
  amount: number,
  year: number,
  month: number // 1-12
): HistoricalTransaction {
  return { categoryId, amount, date: new Date(year, month - 1, 15) }
}

/** Builds a budget item with a Money planned amount. */
function item(categoryId: string, planned: number): BudgetItemInput {
  return { categoryId, planned: Money.fromPesos(planned) }
}

// ─── suggestBudget ────────────────────────────────────────────────────────────

describe('BudgetAllocator.suggestBudget', () => {
  it('suggests $600K for supermercado when history consistently shows $600K/month', () => {
    // 3 months × $600K = $1,800K total → average $600K
    const history: HistoricalTransaction[] = [
      tx(CAT.supermercado, 350_000, 2026, 1),
      tx(CAT.supermercado, 250_000, 2026, 1), // Jan: $600K
      tx(CAT.supermercado, 600_000, 2026, 2), // Feb: $600K
      tx(CAT.supermercado, 200_000, 2026, 3),
      tx(CAT.supermercado, 200_000, 2026, 3),
      tx(CAT.supermercado, 200_000, 2026, 3), // Mar: $600K
    ]

    const suggestions = BudgetAllocator.suggestBudget(history, INCOME)

    const suggestion = suggestions.find(
      (s) => s.categoryId === CAT.supermercado
    )
    expect(suggestion).toBeDefined()
    expect(suggestion!.suggestedAmount.value).toBe(600_000)
  })

  it('averages across multiple categories independently', () => {
    // 3 months of data
    const history: HistoricalTransaction[] = [
      // Supermercado: $600K, $600K, $600K → $600K avg
      tx(CAT.supermercado, 600_000, 2026, 1),
      tx(CAT.supermercado, 600_000, 2026, 2),
      tx(CAT.supermercado, 600_000, 2026, 3),
      // Restaurantes: $400K, $350K, $450K → $400K avg
      tx(CAT.restaurantes, 400_000, 2026, 1),
      tx(CAT.restaurantes, 350_000, 2026, 2),
      tx(CAT.restaurantes, 450_000, 2026, 3),
    ]

    const suggestions = BudgetAllocator.suggestBudget(history, INCOME)

    const supermercado = suggestions.find(
      (s) => s.categoryId === CAT.supermercado
    )
    const restaurantes = suggestions.find(
      (s) => s.categoryId === CAT.restaurantes
    )

    expect(supermercado!.suggestedAmount.value).toBe(600_000)
    expect(restaurantes!.suggestedAmount.value).toBe(400_000)
  })

  it('weights the average by months in history, not months with data', () => {
    // $300K only in Jan (2 months have $0) → total $300K / 3 months = $100K
    const history: HistoricalTransaction[] = [
      tx(CAT.transporte, 300_000, 2026, 1),
      tx(CAT.supermercado, 600_000, 2026, 1), // anchor to pull in 3 distinct months
      tx(CAT.supermercado, 600_000, 2026, 2),
      tx(CAT.supermercado, 600_000, 2026, 3),
    ]

    const suggestions = BudgetAllocator.suggestBudget(history, INCOME)

    const transporte = suggestions.find((s) => s.categoryId === CAT.transporte)
    // $300K across 3 months → $100K avg
    expect(transporte!.suggestedAmount.value).toBe(100_000)
  })

  it('returns empty array when there are no transactions', () => {
    const suggestions = BudgetAllocator.suggestBudget([], INCOME)
    expect(suggestions).toHaveLength(0)
  })

  it('handles a single month of history correctly', () => {
    const history: HistoricalTransaction[] = [tx(CAT.salud, 180_000, 2026, 3)]

    const suggestions = BudgetAllocator.suggestBudget(history, INCOME)

    const salud = suggestions.find((s) => s.categoryId === CAT.salud)
    expect(salud!.suggestedAmount.value).toBe(180_000)
  })

  it('rounds fractional averages to the nearest peso', () => {
    // $100K over 3 months → $33,333.33... → rounds to $33,333
    const history: HistoricalTransaction[] = [
      tx(CAT.servicios, 100_000, 2026, 1),
      tx(CAT.supermercado, 1, 2026, 2), // anchor for month 2
      tx(CAT.supermercado, 1, 2026, 3), // anchor for month 3
    ]

    const suggestions = BudgetAllocator.suggestBudget(history, INCOME)

    const servicios = suggestions.find((s) => s.categoryId === CAT.servicios)
    // 100_000 / 3 = 33333.33 → rounds to 33_333
    expect(servicios!.suggestedAmount.value).toBe(33_333)
  })
})

// ─── validateBudget ───────────────────────────────────────────────────────────

describe('BudgetAllocator.validateBudget', () => {
  it('is valid when total planned equals income exactly', () => {
    const items = [
      item(CAT.supermercado, 2_000_000),
      item(CAT.restaurantes, 1_200_000),
      item(CAT.transporte, 800_000),
      item(CAT.salud, 700_000),
      item(CAT.servicios, 1_500_000),
    ]
    // Total: 6,200,000 === INCOME

    const result = BudgetAllocator.validateBudget(items, INCOME)

    expect(result.isValid).toBe(true)
    expect(result.totalPlanned.value).toBe(6_200_000)
    expect(result.excess.isZero()).toBe(true)
  })

  it('is valid when total planned is less than income', () => {
    const items = [
      item(CAT.supermercado, 600_000),
      item(CAT.restaurantes, 400_000),
    ]
    // Total: $1M < $6.2M

    const result = BudgetAllocator.validateBudget(items, INCOME)

    expect(result.isValid).toBe(true)
    expect(result.excess.isZero()).toBe(true)
  })

  it('is invalid and reports correct excess when planned exceeds income', () => {
    const items = [
      item(CAT.supermercado, 3_000_000),
      item(CAT.restaurantes, 2_000_000),
      item(CAT.transporte, 1_000_000),
      item(CAT.salud, 500_000),
      item(CAT.servicios, 700_000),
    ]
    // Total: $7,200,000 — exceeds $6,200,000 by $1,000,000

    const result = BudgetAllocator.validateBudget(items, INCOME)

    expect(result.isValid).toBe(false)
    expect(result.totalPlanned.value).toBe(7_200_000)
    expect(result.excess.value).toBe(1_000_000)
  })

  it('is valid with empty item list (zero planned)', () => {
    const result = BudgetAllocator.validateBudget([], INCOME)

    expect(result.isValid).toBe(true)
    expect(result.totalPlanned.isZero()).toBe(true)
    expect(result.excess.isZero()).toBe(true)
  })

  it('reports correct excess for single over-budget category', () => {
    // Budget only one item that exceeds income
    const items = [item(CAT.supermercado, 7_000_000)]
    // $7M > $6.2M → excess = $800K

    const result = BudgetAllocator.validateBudget(items, INCOME)

    expect(result.isValid).toBe(false)
    expect(result.excess.value).toBe(800_000)
  })
})

// ─── calculateRemaining ───────────────────────────────────────────────────────

describe('BudgetAllocator.calculateRemaining', () => {
  it('returns positive remaining when budget is under income', () => {
    const items = [
      item(CAT.supermercado, 600_000),
      item(CAT.restaurantes, 400_000),
      item(CAT.transporte, 200_000),
    ]
    // Planned: $1,200,000 — Remaining: $6,200,000 - $1,200,000 = $5,000,000

    const remaining = BudgetAllocator.calculateRemaining(INCOME, items)

    expect(remaining.value).toBe(5_000_000)
    expect(remaining.isPositive()).toBe(true)
  })

  it('returns zero when budget exactly matches income', () => {
    const items = [
      item(CAT.supermercado, 3_000_000),
      item(CAT.restaurantes, 3_200_000),
    ]
    // Planned: $6,200,000 = income

    const remaining = BudgetAllocator.calculateRemaining(INCOME, items)

    expect(remaining.isZero()).toBe(true)
  })

  it('returns negative when budget exceeds income', () => {
    const items = [
      item(CAT.supermercado, 4_000_000),
      item(CAT.restaurantes, 3_000_000),
    ]
    // Planned: $7,000,000 > $6,200,000 → remaining = -$800,000

    const remaining = BudgetAllocator.calculateRemaining(INCOME, items)

    expect(remaining.value).toBe(-800_000)
    expect(remaining.isNegative()).toBe(true)
  })

  it('returns full income when no items are planned', () => {
    const remaining = BudgetAllocator.calculateRemaining(INCOME, [])

    expect(remaining.value).toBe(6_200_000)
    expect(remaining.equals(INCOME)).toBe(true)
  })

  it('real-world monthly budget — correctly calculates remaining', () => {
    // Approximate monthly budget for Freddy's family
    const items = [
      item(CAT.supermercado, 600_000),
      item(CAT.restaurantes, 400_000),
      item(CAT.transporte, 200_000),
      item(CAT.salud, 150_000),
      item(CAT.servicios, 1_750_000), // fixed expenses (credit card minimums, utilities)
    ]
    // Total planned: $3,100,000 — Remaining: $6,200,000 - $3,100,000 = $3,100,000

    const remaining = BudgetAllocator.calculateRemaining(INCOME, items)

    expect(remaining.value).toBe(3_100_000)
  })
})
