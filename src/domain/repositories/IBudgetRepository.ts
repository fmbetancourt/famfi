export interface BudgetItemData {
  id: string;
  categoryId: string;
  planned: number;
  actual: number;
}

export interface BudgetData {
  id: string;
  familyId: string;
  month: number;
  year: number;
  totalIncome: number;
  totalPlanned: number;
  items: BudgetItemData[];
}

export interface IBudgetRepository {
  findByMonthYear(familyId: string, month: number, year: number): Promise<BudgetData | null>;
  findLatest(familyId: string): Promise<BudgetData | null>;
  save(data: Omit<BudgetData, "id">): Promise<BudgetData>;
  updateItem(itemId: string, actual: number): Promise<void>;
}
