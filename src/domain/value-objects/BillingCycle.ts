/**
 * Value Object representing a credit card billing cycle.
 * Encapsulates the relationship between statement closing day and payment due day.
 */
export class BillingCycle {
  constructor(
    readonly billingDay: number,
    readonly dueDay: number
  ) {
    if (billingDay < 1 || billingDay > 31) {
      throw new Error(`Invalid billing day: ${billingDay}. Must be 1-31.`)
    }
    if (dueDay < 1 || dueDay > 31) {
      throw new Error(`Invalid due day: ${dueDay}. Must be 1-31.`)
    }
  }

  /**
   * Calculates days remaining until the next payment due date from a given date.
   * If the due day has already passed this month, returns days until next month's due.
   * Uses UTC internally to avoid DST drift.
   */
  daysUntilDue(fromDate: Date): number {
    const year = fromDate.getFullYear()
    const month = fromDate.getMonth()
    const day = fromDate.getDate()

    let dueDate: Date
    if (day > this.dueDay) {
      dueDate = new Date(Date.UTC(year, month + 1, this.dueDay))
    } else {
      dueDate = new Date(Date.UTC(year, month, this.dueDay))
    }

    const fromUTC = new Date(Date.UTC(year, month, day))
    const diffMs = dueDate.getTime() - fromUTC.getTime()
    return Math.round(diffMs / (1000 * 60 * 60 * 24))
  }

  /**
   * Returns the next payment due date from a given date.
   */
  nextDueDate(fromDate: Date): Date {
    const year = fromDate.getFullYear()
    const month = fromDate.getMonth()
    const day = fromDate.getDate()

    if (day > this.dueDay) {
      return new Date(year, month + 1, this.dueDay)
    }
    return new Date(year, month, this.dueDay)
  }

  /**
   * Returns the next statement closing date from a given date.
   */
  nextBillingDate(fromDate: Date): Date {
    const year = fromDate.getFullYear()
    const month = fromDate.getMonth()
    const day = fromDate.getDate()

    if (day > this.billingDay) {
      return new Date(year, month + 1, this.billingDay)
    }
    return new Date(year, month, this.billingDay)
  }
}
