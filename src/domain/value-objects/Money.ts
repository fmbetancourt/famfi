/**
 * Value Object representing Chilean Pesos (CLP).
 * Immutable, integer-only — CLP has no decimal subdivisions.
 */
export class Money {
  private constructor(private readonly pesos: number) {
    if (!Number.isInteger(pesos)) {
      throw new Error(`Money must be an integer, received: ${pesos}`)
    }
  }

  static fromPesos(amount: number): Money {
    return new Money(Math.round(amount))
  }

  static zero(): Money {
    return new Money(0)
  }

  get value(): number {
    return this.pesos
  }

  add(other: Money): Money {
    return new Money(this.pesos + other.pesos)
  }

  subtract(other: Money): Money {
    return new Money(this.pesos - other.pesos)
  }

  /**
   * Multiplies by a scalar factor. Result is rounded to the nearest integer.
   */
  multiply(factor: number): Money {
    return new Money(Math.round(this.pesos * factor))
  }

  /**
   * Calculates rate% of this amount.
   * e.g. money.percentage(3.35) returns 3.35% of the value.
   */
  percentage(rate: number): Money {
    return new Money(Math.round((this.pesos * rate) / 100))
  }

  isNegative(): boolean {
    return this.pesos < 0
  }

  isZero(): boolean {
    return this.pesos === 0
  }

  isPositive(): boolean {
    return this.pesos > 0
  }

  equals(other: Money): boolean {
    return this.pesos === other.pesos
  }

  greaterThan(other: Money): boolean {
    return this.pesos > other.pesos
  }

  lessThan(other: Money): boolean {
    return this.pesos < other.pesos
  }

  /**
   * Formats as Chilean pesos: "$1.234.567"
   * Negative values: "-$1.234.567"
   */
  format(): string {
    const abs = Math.abs(this.pesos)
    const formatted = abs.toLocaleString('de-DE') // dot as thousands separator
    const sign = this.pesos < 0 ? '-' : ''
    return `${sign}$${formatted}`
  }

  toString(): string {
    return this.format()
  }
}
