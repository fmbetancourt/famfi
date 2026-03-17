import type {
  Budget as PrismaBudget,
  BudgetItem as PrismaBudgetItem,
  PrismaClient,
} from '@/generated/prisma/client'
import type {
  BudgetData,
  BudgetItemData,
  IBudgetRepository,
} from '@/domain/repositories/IBudgetRepository'

type BudgetWithItems = PrismaBudget & { items: PrismaBudgetItem[] }

function toDomainItem(row: PrismaBudgetItem): BudgetItemData {
  return {
    id: row.id,
    categoryId: row.categoryId,
    planned: row.planned,
    actual: row.actual,
  }
}

function toDomain(row: BudgetWithItems): BudgetData {
  return {
    id: row.id,
    familyId: row.familyId,
    month: row.month,
    year: row.year,
    totalIncome: row.totalIncome,
    totalPlanned: row.totalPlanned,
    items: row.items.map(toDomainItem),
  }
}

export class PrismaBudgetRepository implements IBudgetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByMonthYear(
    familyId: string,
    month: number,
    year: number
  ): Promise<BudgetData | null> {
    const row = await this.prisma.budget.findUnique({
      where: { familyId_month_year: { familyId, month, year } },
      include: { items: true },
    })
    return row ? toDomain(row) : null
  }

  async findLatest(familyId: string): Promise<BudgetData | null> {
    const row = await this.prisma.budget.findFirst({
      where: { familyId },
      include: { items: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })
    return row ? toDomain(row) : null
  }

  async save(data: Omit<BudgetData, 'id'>): Promise<BudgetData> {
    // Derive totalPlanned from items to ensure consistency
    const totalPlanned = data.items.reduce((sum, item) => sum + item.planned, 0)

    const row = await this.prisma.budget.create({
      data: {
        familyId: data.familyId,
        month: data.month,
        year: data.year,
        totalIncome: data.totalIncome,
        totalPlanned,
        items: {
          create: data.items.map((item) => ({
            categoryId: item.categoryId,
            planned: item.planned,
            actual: item.actual,
          })),
        },
      },
      include: { items: true },
    })
    return toDomain(row)
  }

  /** Updates the actual (spent) amount for a single budget item. */
  async updateItem(itemId: string, actual: number): Promise<void> {
    await this.prisma.budgetItem.update({
      where: { id: itemId },
      data: { actual },
    })
  }

  /**
   * Updates the planned (budgeted) amount for a budget item
   * and atomically recalculates the parent budget's totalPlanned.
   */
  async updatePlanned(itemId: string, planned: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.budgetItem.update({
        where: { id: itemId },
        data: { planned },
        select: { budgetId: true },
      })

      const agg = await tx.budgetItem.aggregate({
        where: { budgetId: item.budgetId },
        _sum: { planned: true },
      })

      await tx.budget.update({
        where: { id: item.budgetId },
        data: { totalPlanned: agg._sum.planned ?? 0 },
      })
    })
  }

  /**
   * Recomputes every BudgetItem.actual for a budget by aggregating
   * EXPENSE transactions for the budget's family and month/year.
   * Useful after bulk imports or corrections.
   */
  async recalculateActuals(budgetId: string): Promise<void> {
    const budget = await this.prisma.budget.findUniqueOrThrow({
      where: { id: budgetId },
      select: {
        familyId: true,
        month: true,
        year: true,
        items: { select: { id: true, categoryId: true } },
      },
    })

    const startDate = new Date(budget.year, budget.month - 1, 1)
    const endDate = new Date(budget.year, budget.month, 0, 23, 59, 59, 999)

    // Aggregate transactions for every item in parallel, then write atomically
    const updates = await Promise.all(
      budget.items.map(async (item) => {
        const agg = await this.prisma.transaction.aggregate({
          where: {
            member: { familyId: budget.familyId },
            categoryId: item.categoryId,
            type: 'EXPENSE',
            date: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        })
        return { id: item.id, actual: agg._sum.amount ?? 0 }
      })
    )

    await this.prisma.$transaction(
      updates.map(({ id, actual }) =>
        this.prisma.budgetItem.update({
          where: { id },
          data: { actual },
        })
      )
    )
  }
}
