import { Money } from "../value-objects/Money";
import { BillingCycle } from "../value-objects/BillingCycle";

export interface CreditCardProps {
  readonly id: string;
  readonly name: string;
  readonly bank: string;
  readonly cardType: string;
  readonly lastFourDigits: string;
  readonly ownerId: string;
  readonly creditLimit: Money;
  readonly currentBalance: Money;
  readonly billingCycle: BillingCycle;
  readonly rateRevolving: number;
  readonly rateInstallments: number;
  readonly rateCashAdvance: number;
  readonly caeRevolving: number;
  readonly isActive: boolean;
  readonly isFrozen: boolean;
}

/**
 * Domain entity representing a credit card with financial behavior.
 * All monetary values use the Money value object — never raw numbers.
 */
export class CreditCard {
  readonly id: string;
  readonly name: string;
  readonly bank: string;
  readonly cardType: string;
  readonly lastFourDigits: string;
  readonly ownerId: string;
  readonly creditLimit: Money;
  readonly currentBalance: Money;
  readonly billingCycle: BillingCycle;
  readonly rateRevolving: number;
  readonly rateInstallments: number;
  readonly rateCashAdvance: number;
  readonly caeRevolving: number;
  readonly isActive: boolean;
  readonly isFrozen: boolean;

  constructor(props: CreditCardProps) {
    this.id = props.id;
    this.name = props.name;
    this.bank = props.bank;
    this.cardType = props.cardType;
    this.lastFourDigits = props.lastFourDigits;
    this.ownerId = props.ownerId;
    this.creditLimit = props.creditLimit;
    this.currentBalance = props.currentBalance;
    this.billingCycle = props.billingCycle;
    this.rateRevolving = props.rateRevolving;
    this.rateInstallments = props.rateInstallments;
    this.rateCashAdvance = props.rateCashAdvance;
    this.caeRevolving = props.caeRevolving;
    this.isActive = props.isActive;
    this.isFrozen = props.isFrozen;
  }

  /** Available credit = limit - balance */
  availableCredit(): Money {
    return this.creditLimit.subtract(this.currentBalance);
  }

  /** Utilization as a percentage (0-100+). Over 100 means over-limit. */
  utilizationRate(): number {
    if (this.creditLimit.isZero()) return 0;
    return (this.currentBalance.value / this.creditLimit.value) * 100;
  }

  /** Monthly interest cost at the revolving rate on current balance. */
  monthlyInterestCost(): Money {
    return this.currentBalance.percentage(this.rateRevolving);
  }

  /** Days until next payment due date. */
  daysUntilDue(fromDate: Date): number {
    return this.billingCycle.daysUntilDue(fromDate);
  }

  /** Next payment due date. */
  nextDueDate(fromDate: Date): Date {
    return this.billingCycle.nextDueDate(fromDate);
  }

  hasDebt(): boolean {
    return this.currentBalance.isPositive();
  }

  isUsable(): boolean {
    return this.isActive && !this.isFrozen;
  }
}
