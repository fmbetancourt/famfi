import { Money } from '../value-objects/Money'

// ─── Input / Output types ─────────────────────────────────────────────────────

/** A credit card input for debt payoff simulation. */
export interface CardInput {
  id: string
  name: string
  /** Current balance in CLP (integer, positive). */
  balance: number
  /** Monthly interest rate in percent (e.g., 3.35 for 3.35%). */
  monthlyRate: number
}

export type PayoffStrategy = 'avalanche' | 'snowball'

/** Snapshot of all card balances at the end of a given month. */
export interface MonthlySnapshot {
  /** 1-indexed month number in the simulation. */
  month: number
  /** cardId → remaining balance after this month's payments. */
  cardBalances: Record<string, number>
  /** Total interest paid across all cards this month. */
  interestPaid: number
  /** Total principal paid across all cards this month. */
  principalPaid: number
}

/** Records when a card's balance reached zero. */
export interface FreedCard {
  cardId: string
  cardName: string
  /** Month number (1-indexed) when the balance reached zero. */
  month: number
}

/** Full result of a debt payoff simulation. */
export interface DebtPayoffSimulation {
  strategy: PayoffStrategy
  /** Months until all debt reaches zero. Capped at 120 if never fully paid. */
  totalMonths: number
  /** Total interest paid across all cards over the payoff period. */
  totalInterestPaid: number
  /** Total cash outflow: principal + interest. */
  totalPaid: number
  /** Month-by-month card balances. */
  monthlySnapshots: MonthlySnapshot[]
  /** When each card's balance reached zero. */
  freedCards: FreedCard[]
  /**
   * How much is saved in interest compared to paying only minimums (= monthly
   * interest only, keeping balances constant) for the same number of months.
   */
  savingsVsMinimum: number
  /** Minimum monthly payment required to at least cover all interest charges. */
  minimumPaymentRequired: number
}

/** Side-by-side comparison of avalanche vs snowball. */
export interface StrategyComparison {
  avalanche: DebtPayoffSimulation
  snowball: DebtPayoffSimulation
  /**
   * avalanche.totalInterestPaid − snowball.totalInterestPaid.
   * Negative means avalanche pays less interest (typical).
   */
  interestDifference: number
  /** snowball.totalMonths − avalanche.totalMonths. Positive = avalanche is faster. */
  monthsDifference: number
  recommendation: 'avalanche' | 'snowball' | 'equal'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIMULATION_MONTHS = 120

// ─── Domain Service ───────────────────────────────────────────────────────────

/**
 * Pure domain service for debt payoff calculations.
 * No external dependencies — all operations are deterministic and in-memory.
 *
 * All monetary amounts are integers (CLP has no decimal subdivisions).
 */
export class DebtCalculator {
  /**
   * Calculates the monthly interest for a single card.
   * Formula: balance × monthlyRate / 100, rounded to the nearest peso.
   */
  static calculateMonthlyInterest(card: CardInput): Money {
    return Money.fromPesos(Math.round((card.balance * card.monthlyRate) / 100))
  }

  /**
   * Calculates the total minimum monthly payment required to cover all interest
   * charges across every card with an outstanding balance.
   *
   * This is the floor for `monthlyPayment` in `simulatePayoff` — paying less
   * means the debt grows and can never be eliminated.
   */
  static calculateMinimumPayment(cards: ReadonlyArray<CardInput>): Money {
    const total = cards
      .filter((c) => c.balance > 0)
      .reduce(
        (sum, c) => sum + Math.round((c.balance * c.monthlyRate) / 100),
        0
      )
    return Money.fromPesos(total)
  }

  /**
   * Simulates full debt payoff for the given cards.
   *
   * Algorithm — each month:
   *   1. Compute interest per card (balance × monthlyRate / 100).
   *   2. Pay minimums (= interest) on all cards — net balance change: zero.
   *   3. Distribute the entire excess (monthlyPayment − totalInterest) to the
   *      target card (first in strategy order). If the target reaches 0, the
   *      remaining excess cascades to the next card in the same month.
   *   4. Repeat until all balances are 0 or 120 months have elapsed.
   *
   * @throws {Error} when monthlyPayment ≤ 0 or < minimumPaymentRequired.
   */
  static simulatePayoff(
    cards: ReadonlyArray<CardInput>,
    monthlyPayment: number,
    strategy: PayoffStrategy
  ): DebtPayoffSimulation {
    if (monthlyPayment <= 0) {
      throw new Error('Monthly payment must be greater than zero')
    }

    const cardsWithDebt = cards.filter((c) => c.balance > 0)

    // Edge case: all cards already at zero
    if (cardsWithDebt.length === 0) {
      return {
        strategy,
        totalMonths: 0,
        totalInterestPaid: 0,
        totalPaid: 0,
        monthlySnapshots: [],
        freedCards: [],
        savingsVsMinimum: 0,
        minimumPaymentRequired: 0,
      }
    }

    const minimumPaymentRequired =
      DebtCalculator.calculateMinimumPayment(cardsWithDebt).value

    if (monthlyPayment < minimumPaymentRequired) {
      throw new Error(
        `Monthly payment of ${monthlyPayment} is less than the minimum required payment of ${minimumPaymentRequired}`
      )
    }

    const balances = new Map<string, number>(
      cardsWithDebt.map((c) => [c.id, c.balance])
    )
    const cardMap = new Map<string, CardInput>(
      cardsWithDebt.map((c) => [c.id, c])
    )
    const allCardIds = cardsWithDebt.map((c) => c.id)

    // Initial monthly interest — used for savingsVsMinimum
    const initialMonthlyInterest = cardsWithDebt.reduce(
      (sum, c) => sum + Math.round((c.balance * c.monthlyRate) / 100),
      0
    )

    const monthlySnapshots: MonthlySnapshot[] = []
    const freedCards: FreedCard[] = []
    let totalInterestPaid = 0
    let totalPrincipalPaid = 0
    let month = 0

    while (month < MAX_SIMULATION_MONTHS) {
      const activeIds = allCardIds.filter((id) => (balances.get(id) ?? 0) > 0)
      if (activeIds.length === 0) break

      month++

      const interestTotal = DebtCalculator.computeInterestTotal(
        activeIds,
        balances,
        cardMap
      )
      totalInterestPaid += interestTotal

      const sortedIds = DebtCalculator.sortByStrategy(
        activeIds,
        cardMap,
        balances,
        strategy
      )

      const principalThisMonth = DebtCalculator.distributeExcess(
        sortedIds,
        balances,
        cardMap,
        monthlyPayment - interestTotal,
        month,
        freedCards
      )
      totalPrincipalPaid += principalThisMonth

      monthlySnapshots.push(
        DebtCalculator.buildSnapshot(
          month,
          allCardIds,
          balances,
          interestTotal,
          principalThisMonth
        )
      )
    }

    const totalPaid = totalInterestPaid + totalPrincipalPaid

    // Savings vs. minimum-only scenario: if only interest were paid each month,
    // balances would never decrease and interest would stay at the initial level.
    const savingsVsMinimum = Math.max(
      0,
      initialMonthlyInterest * month - totalInterestPaid
    )

    return {
      strategy,
      totalMonths: month,
      totalInterestPaid,
      totalPaid,
      monthlySnapshots,
      freedCards,
      savingsVsMinimum,
      minimumPaymentRequired,
    }
  }

  /**
   * Runs both avalanche and snowball simulations and returns them side by side.
   */
  static compareStrategies(
    cards: ReadonlyArray<CardInput>,
    monthlyPayment: number
  ): StrategyComparison {
    const avalanche = DebtCalculator.simulatePayoff(
      cards,
      monthlyPayment,
      'avalanche'
    )
    const snowball = DebtCalculator.simulatePayoff(
      cards,
      monthlyPayment,
      'snowball'
    )

    const interestDifference =
      avalanche.totalInterestPaid - snowball.totalInterestPaid
    const monthsDifference = snowball.totalMonths - avalanche.totalMonths
    const recommendation =
      DebtCalculator.resolveRecommendation(interestDifference)

    return {
      avalanche,
      snowball,
      interestDifference,
      monthsDifference,
      recommendation,
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Sums the monthly interest for every active card.
   * Minimum payments equal this amount, so applying them has zero net effect on balances.
   */
  private static computeInterestTotal(
    activeIds: string[],
    balances: Map<string, number>,
    cardMap: Map<string, CardInput>
  ): number {
    return activeIds.reduce((total, id) => {
      const balance = balances.get(id) ?? 0
      const rate = cardMap.get(id)?.monthlyRate ?? 0
      return total + Math.round((balance * rate) / 100)
    }, 0)
  }

  /**
   * Applies excess payment to target cards in priority order.
   * Modifies `balances` in place and appends to `freedCards` when a card reaches 0.
   * Returns the total principal paid this month.
   */
  private static distributeExcess(
    sortedIds: string[],
    balances: Map<string, number>,
    cardMap: Map<string, CardInput>,
    excess: number,
    month: number,
    freedCards: FreedCard[]
  ): number {
    let remaining = excess
    let principalPaid = 0

    for (const id of sortedIds) {
      if (remaining <= 0) break

      const currentBal = balances.get(id) ?? 0
      if (currentBal <= 0) continue

      if (remaining >= currentBal) {
        // Fully pay off this card; carry forward the remainder
        principalPaid += currentBal
        remaining -= currentBal
        balances.set(id, 0)
        freedCards.push({
          cardId: id,
          cardName: cardMap.get(id)?.name ?? id,
          month,
        })
      } else {
        balances.set(id, currentBal - remaining)
        principalPaid += remaining
        remaining = 0
      }
    }

    return principalPaid
  }

  /** Builds a monthly snapshot from the current state of all card balances. */
  private static buildSnapshot(
    month: number,
    allCardIds: string[],
    balances: Map<string, number>,
    interestPaid: number,
    principalPaid: number
  ): MonthlySnapshot {
    const cardBalances: Record<string, number> = {}
    for (const id of allCardIds) {
      cardBalances[id] = balances.get(id) ?? 0
    }
    return { month, cardBalances, interestPaid, principalPaid }
  }

  /** Derives the strategy recommendation from the interest difference. */
  private static resolveRecommendation(
    interestDifference: number
  ): 'avalanche' | 'snowball' | 'equal' {
    if (interestDifference < 0) return 'avalanche'
    if (interestDifference > 0) return 'snowball'
    return 'equal'
  }

  /**
   * Returns a sorted copy of cardIds according to the chosen strategy.
   *
   * Avalanche: highest monthly rate first; ties broken by highest balance.
   * Snowball:  lowest balance first; ties broken by lowest rate.
   */
  private static sortByStrategy(
    cardIds: string[],
    cardMap: Map<string, CardInput>,
    balances: Map<string, number>,
    strategy: PayoffStrategy
  ): string[] {
    return [...cardIds].sort((a, b) => {
      const rateA = cardMap.get(a)?.monthlyRate ?? 0
      const rateB = cardMap.get(b)?.monthlyRate ?? 0

      if (strategy === 'avalanche') {
        if (rateB !== rateA) return rateB - rateA
        return (balances.get(b) ?? 0) - (balances.get(a) ?? 0)
      }

      // snowball
      const balA = balances.get(a) ?? 0
      const balB = balances.get(b) ?? 0
      if (balA !== balB) return balA - balB
      return rateA - rateB
    })
  }
}
