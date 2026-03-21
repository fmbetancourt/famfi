import { Money } from '../value-objects/Money'

// ─── Input / Output types ────────────────────────────────────────────────────

/** A single historical transaction used for budget suggestion calculations. */
export interface HistoricalTransaction {
  categoryId: string
  /** Positive integer (CLP). Always the expense amount, never negative. */
  amount: number
  date: Date
}

/** A budget line item used for validation and remaining calculations. */
export interface BudgetItemInput {
  categoryId: string
  planned: Money
}

/** Suggested monthly budget amount for a category. */
export interface BudgetSuggestion {
  categoryId: string
  /** Monthly average spend derived from historical data. */
  suggestedAmount: Money
}

/** Result of budget validation against total income. */
export interface ValidationResult {
  isValid: boolean
  totalPlanned: Money
  /** How much the planned budget exceeds income. Zero when isValid is true. */
  excess: Money
}

// ─── Domain Service ──────────────────────────────────────────────────────────

/**
 * Pure domain service for budget allocation logic.
 * No external dependencies — all operations are in-memory.
 */
export class BudgetAllocator {
  /**
   * Suggests monthly budget amounts per category based on historical spending.
   *
   * Algorithm:
   *   1. Count distinct calendar months represented in the transaction set.
   *   2. For each category, sum all transaction amounts.
   *   3. Divide by the total number of distinct months to get the monthly average.
   *
   * Example: 3 months of $600K/month in groceries → suggests $600K.
   *
   * @param transactions - Historical expenses (any time range, typically 3 months)
   * @param income - Total monthly income (used by caller to contextualise suggestions)
   */
  static suggestBudget(
    transactions: ReadonlyArray<HistoricalTransaction>,
    income: Money
  ): BudgetSuggestion[] {
    // income is provided for caller context / future ratio display; not used in averaging
    void income

    if (transactions.length === 0) return []

    // Count distinct year-month combinations in the history
    const distinctMonths = new Set(
      transactions.map((tx) => `${tx.date.getFullYear()}-${tx.date.getMonth()}`)
    )
    const numMonths = distinctMonths.size

    // Accumulate totals per category
    const totals = new Map<string, number>()
    for (const tx of transactions) {
      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amount)
    }

    // Build suggestions as monthly average per category
    return [...totals.entries()].map(([categoryId, total]) => ({
      categoryId,
      suggestedAmount: Money.fromPesos(Math.round(total / numMonths)),
    }))
  }

  /**
   * Validates that the sum of all planned items does not exceed total monthly income.
   *
   * @returns isValid=true when totalPlanned ≤ totalIncome.
   *          excess is the over-budget amount (zero when valid).
   */
  static validateBudget(
    items: ReadonlyArray<BudgetItemInput>,
    totalIncome: Money
  ): ValidationResult {
    const totalPlanned = items.reduce(
      (sum, item) => sum.add(item.planned),
      Money.zero()
    )

    const isValid = !totalPlanned.greaterThan(totalIncome)
    const excess = isValid ? Money.zero() : totalPlanned.subtract(totalIncome)

    return { isValid, totalPlanned, excess }
  }

  /**
   * Returns the unallocated amount: income minus the sum of all planned items.
   *
   * Positive → money still available to assign or save.
   * Negative → budget is over-allocated.
   */
  static calculateRemaining(
    totalIncome: Money,
    items: ReadonlyArray<BudgetItemInput>
  ): Money {
    const totalPlanned = items.reduce(
      (sum, item) => sum.add(item.planned),
      Money.zero()
    )
    return totalIncome.subtract(totalPlanned)
  }
}
