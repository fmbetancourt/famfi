import type {
  PrismaClient,
  Transaction as PrismaTransaction,
} from '@/generated/prisma/client'
import type {
  ITransactionRepository,
  TransactionData,
  TransactionFilter,
  TransactionSource,
  TransactionType,
} from '@/domain/repositories/ITransactionRepository'

/** Maps a Prisma Transaction row to the domain TransactionData. */
function toDomain(row: PrismaTransaction): TransactionData {
  return {
    id: row.id,
    amount: row.amount,
    description: row.description,
    merchant: row.merchant,
    categoryId: row.categoryId,
    memberId: row.memberId,
    creditCardId: row.creditCardId,
    type: row.type as TransactionType,
    isInterCard: row.isInterCard,
    source: row.source as TransactionSource,
    date: row.date,
  }
}

/** Builds a Prisma where clause from a domain filter. */
function toWhereClause(filter: TransactionFilter) {
  return {
    ...(filter.memberId && { memberId: filter.memberId }),
    ...(filter.creditCardId && { creditCardId: filter.creditCardId }),
    ...(filter.categoryId && { categoryId: filter.categoryId }),
    ...(filter.type && { type: filter.type }),
    ...((filter.dateFrom || filter.dateTo) && {
      date: {
        ...(filter.dateFrom && { gte: filter.dateFrom }),
        ...(filter.dateTo && { lte: filter.dateTo }),
      },
    }),
  }
}

export class PrismaTransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<TransactionData | null> {
    const row = await this.prisma.transaction.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async findByFilter(filter: TransactionFilter): Promise<TransactionData[]> {
    const rows = await this.prisma.transaction.findMany({
      where: toWhereClause(filter),
      orderBy: { date: 'desc' },
    })
    return rows.map(toDomain)
  }

  async sumByFilter(filter: TransactionFilter): Promise<number> {
    const result = await this.prisma.transaction.aggregate({
      where: toWhereClause(filter),
      _sum: { amount: true },
    })
    return result._sum.amount ?? 0
  }

  async create(data: Omit<TransactionData, 'id'>): Promise<TransactionData> {
    const row = await this.prisma.transaction.create({ data })
    return toDomain(row)
  }

  async delete(id: string): Promise<void> {
    await this.prisma.transaction.delete({ where: { id } })
  }
}
