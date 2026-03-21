export interface BudgetItemData {
  id: string
  categoryId: string
  planned: number
  actual: number
}

export interface BudgetData {
  id: string
  familyId: string
  month: number
  year: number
  totalIncome: number
  totalPlanned: number
  items: BudgetItemData[]
}

export interface IBudgetRepository {
  findByMonthYear(
    familyId: string,
    month: number,
    year: number
  ): Promise<BudgetData | null>
  findLatest(familyId: string): Promise<BudgetData | null>
  save(data: Omit<BudgetData, 'id'>): Promise<BudgetData>
  /** Updates the actual (spent) amount for a budget item. Called by transaction side-effects. */
  updateItem(itemId: string, actual: number): Promise<void>
  /** Updates the planned (budgeted) amount for a budget item and recalculates totalPlanned. */
  updatePlanned(itemId: string, planned: number): Promise<void>
  /** Recomputes all BudgetItem.actual values by summing EXPENSE transactions for the month. */
  recalculateActuals(budgetId: string): Promise<void>
}
