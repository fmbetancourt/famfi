export type TransactionType =
  | "EXPENSE"
  | "INCOME"
  | "CARD_PAYMENT"
  | "INTER_CARD_TRANSFER"
  | "INTEREST_CHARGE"
  | "FEE";

export type TransactionSource =
  | "MANUAL"
  | "EMAIL_TRACKER"
  | "PDF_IMPORT"
  | "BANK_API";

export interface TransactionFilter {
  memberId?: string;
  creditCardId?: string;
  categoryId?: string;
  type?: TransactionType;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface TransactionData {
  id: string;
  amount: number;
  description: string;
  merchant: string | null;
  categoryId: string;
  memberId: string;
  creditCardId: string | null;
  type: TransactionType;
  isInterCard: boolean;
  source: TransactionSource;
  date: Date;
}

export interface ITransactionRepository {
  findById(id: string): Promise<TransactionData | null>;
  findByFilter(filter: TransactionFilter): Promise<TransactionData[]>;
  sumByFilter(filter: TransactionFilter): Promise<number>;
  create(data: Omit<TransactionData, "id">): Promise<TransactionData>;
  delete(id: string): Promise<void>;
}
