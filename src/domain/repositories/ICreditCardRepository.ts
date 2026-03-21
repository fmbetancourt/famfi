import { CreditCard } from '../entities/CreditCard'

export interface ICreditCardRepository {
  findById(id: string): Promise<CreditCard | null>
  findByOwnerId(ownerId: string): Promise<CreditCard[]>
  findAllWithDebt(): Promise<CreditCard[]>
  findAll(): Promise<CreditCard[]>
  save(card: CreditCard): Promise<void>
  updateBalance(id: string, newBalance: number): Promise<void>
}
