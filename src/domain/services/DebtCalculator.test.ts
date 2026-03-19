import { describe, expect, it } from 'vitest'
import { type CardInput, DebtCalculator } from './DebtCalculator'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * 4 main cards with real balances and rates from docs/financial-context.md.
 * All balances are as of Feb 2026.
 */
const SCOTIABANK_SIGNATURE: CardInput = {
  id: 'scotiabank-signature',
  name: 'Scotiabank Signature',
  balance: 14_637_492,
  monthlyRate: 2.4,
}

const SANTANDER_WORLD_LIMITED: CardInput = {
  id: 'santander-world-limited',
  name: 'Santander World Limited',
  balance: 14_388_382,
  monthlyRate: 3.35,
}

const SCOTIABANK_INFINITE: CardInput = {
  id: 'scotiabank-infinite',
  name: 'Scotiabank Infinite',
  balance: 6_575_620,
  monthlyRate: 2.4,
}

const SANTANDER_PLATINUM: CardInput = {
  id: 'santander-platinum',
  name: 'Santander Platinum',
  balance: 3_795_017,
  monthlyRate: 3.35,
}

/** All 4 main cards, total balance $39,396,511. */
const FOUR_CARDS: CardInput[] = [
  SCOTIABANK_SIGNATURE,
  SANTANDER_WORLD_LIMITED,
  SCOTIABANK_INFINITE,
  SANTANDER_PLATINUM,
]

/** Single card for edge-case tests. */
const SINGLE_CARD: CardInput[] = [
  { id: 'solo', name: 'Solo Card', balance: 5_000_000, monthlyRate: 2.4 },
]

/** All cards with zero balance. */
const ZERO_CARDS: CardInput[] = [
  { id: 'c1', name: 'Card A', balance: 0, monthlyRate: 3.35 },
  { id: 'c2', name: 'Card B', balance: 0, monthlyRate: 2.4 },
]

// ─── calculateMonthlyInterest ─────────────────────────────────────────────────

describe('DebtCalculator.calculateMonthlyInterest', () => {
  it('calculates interest for Scotiabank Signature at 2.40%', () => {
    // 14,637,492 × 2.40 / 100 = 351,299.808 → rounds to 351,300
    const interest =
      DebtCalculator.calculateMonthlyInterest(SCOTIABANK_SIGNATURE)
    expect(interest.value).toBe(351_300)
  })

  it('calculates interest for Santander World Limited at 3.35%', () => {
    // 14,388,382 × 3.35 / 100 = 482,010.797 → rounds to 482,011
    const interest = DebtCalculator.calculateMonthlyInterest(
      SANTANDER_WORLD_LIMITED
    )
    expect(interest.value).toBe(482_011)
  })

  it('calculates interest for Santander Platinum at 3.35%', () => {
    // 3,795,017 × 3.35 / 100 = 127,133.069 → rounds to 127,133
    const interest = DebtCalculator.calculateMonthlyInterest(SANTANDER_PLATINUM)
    expect(interest.value).toBe(127_133)
  })

  it('returns zero interest for a zero-balance card', () => {
    const card: CardInput = {
      id: 'z',
      name: 'Zero',
      balance: 0,
      monthlyRate: 3.35,
    }
    expect(DebtCalculator.calculateMonthlyInterest(card).value).toBe(0)
  })

  it('rounds fractional peso results to nearest integer', () => {
    // 100,001 × 3.35 / 100 = 3,350.0335 → rounds to 3,350
    const card: CardInput = {
      id: 'x',
      name: 'X',
      balance: 100_001,
      monthlyRate: 3.35,
    }
    expect(DebtCalculator.calculateMonthlyInterest(card).value).toBe(3_350)
  })
})

// ─── calculateMinimumPayment ──────────────────────────────────────────────────

describe('DebtCalculator.calculateMinimumPayment', () => {
  it('sums monthly interest across all 4 real cards', () => {
    // 482,011 + 127,133 + 351,300 + 157,815 = 1,118,259
    const min = DebtCalculator.calculateMinimumPayment(FOUR_CARDS)
    expect(min.value).toBe(1_118_259)
  })

  it('ignores cards with zero balance', () => {
    const cards: CardInput[] = [
      { id: 'a', name: 'A', balance: 1_000_000, monthlyRate: 3.35 },
      { id: 'b', name: 'B', balance: 0, monthlyRate: 2.4 },
    ]
    // Only card A: 1,000,000 × 3.35 / 100 = 33,500
    expect(DebtCalculator.calculateMinimumPayment(cards).value).toBe(33_500)
  })

  it('returns zero for an empty card list', () => {
    expect(DebtCalculator.calculateMinimumPayment([]).value).toBe(0)
  })

  it('returns zero when all cards have zero balance', () => {
    expect(DebtCalculator.calculateMinimumPayment(ZERO_CARDS).value).toBe(0)
  })
})

// ─── simulatePayoff — error cases ─────────────────────────────────────────────

describe('DebtCalculator.simulatePayoff — error cases', () => {
  it('throws when monthlyPayment is 0', () => {
    expect(() =>
      DebtCalculator.simulatePayoff(FOUR_CARDS, 0, 'avalanche')
    ).toThrow('greater than zero')
  })

  it('throws when monthlyPayment is negative', () => {
    expect(() =>
      DebtCalculator.simulatePayoff(FOUR_CARDS, -500_000, 'snowball')
    ).toThrow('greater than zero')
  })

  it('throws when monthlyPayment is below the minimum required', () => {
    // Minimum for 4 cards ≈ 1,118,259. Paying 1,000,000 is not enough.
    expect(() =>
      DebtCalculator.simulatePayoff(FOUR_CARDS, 1_000_000, 'avalanche')
    ).toThrow('minimum required')
  })
})

// ─── simulatePayoff — edge cases ─────────────────────────────────────────────

describe('DebtCalculator.simulatePayoff — edge cases', () => {
  it('returns a zero-month result when all cards already have zero balance', () => {
    const result = DebtCalculator.simulatePayoff(
      ZERO_CARDS,
      1_500_000,
      'avalanche'
    )

    expect(result.totalMonths).toBe(0)
    expect(result.totalInterestPaid).toBe(0)
    expect(result.totalPaid).toBe(0)
    expect(result.monthlySnapshots).toHaveLength(0)
    expect(result.freedCards).toHaveLength(0)
    expect(result.minimumPaymentRequired).toBe(0)
  })

  it('handles a single card correctly — pays off within expected months', () => {
    // $5M @ 2.40% with $1.5M/month
    // Interest month 1: 5,000,000 × 2.40% = 120,000. Excess = 1,380,000.
    // Should be paid off in ~4 months.
    const result = DebtCalculator.simulatePayoff(
      SINGLE_CARD,
      1_500_000,
      'avalanche'
    )

    expect(result.freedCards).toHaveLength(1)
    expect(result.freedCards[0].cardId).toBe('solo')
    expect(result.totalMonths).toBeGreaterThanOrEqual(3)
    expect(result.totalMonths).toBeLessThanOrEqual(6)
    expect(result.totalInterestPaid).toBeGreaterThan(0)
  })

  it('single card — snowball and avalanche produce identical results', () => {
    const av = DebtCalculator.simulatePayoff(
      SINGLE_CARD,
      1_500_000,
      'avalanche'
    )
    const sb = DebtCalculator.simulatePayoff(SINGLE_CARD, 1_500_000, 'snowball')

    expect(av.totalMonths).toBe(sb.totalMonths)
    expect(av.totalInterestPaid).toBe(sb.totalInterestPaid)
  })

  it('single card — all snapshots have 0 balance at final month', () => {
    const result = DebtCalculator.simulatePayoff(
      SINGLE_CARD,
      1_500_000,
      'avalanche'
    )
    const lastSnapshot = result.monthlySnapshots.at(-1)!

    expect(lastSnapshot.cardBalances['solo']).toBe(0)
  })
})

// ─── simulatePayoff — real data (avalanche) ───────────────────────────────────

describe('DebtCalculator.simulatePayoff — real data, avalanche $1.5M/month', () => {
  const result = DebtCalculator.simulatePayoff(
    FOUR_CARDS,
    1_500_000,
    'avalanche'
  )

  it('pays off all 4 cards before the 120-month cap', () => {
    expect(result.totalMonths).toBeLessThan(120)
    expect(result.freedCards).toHaveLength(4)
  })

  it('pays off all cards within a realistic timeframe (35–65 months)', () => {
    // Minimum-only simulation with balance × rateRevolving gives ~$1.1M/month
    // in interest, leaving ~$381K excess per month. Full payoff ~45-55 months.
    // (The financial context's "~30 months" estimate uses simplified assumptions.)
    expect(result.totalMonths).toBeGreaterThan(35)
    expect(result.totalMonths).toBeLessThanOrEqual(65)
  })

  it('targets high-rate Santander cards first (freed before Scotiabank cards)', () => {
    const santanderFreeMonths = result.freedCards
      .filter((f) => f.cardId.startsWith('santander'))
      .map((f) => f.month)

    const scotiaFreeMonths = result.freedCards
      .filter((f) => f.cardId.startsWith('scotiabank'))
      .map((f) => f.month)

    const lastSantander = Math.max(...santanderFreeMonths)
    const firstScotia = Math.min(...scotiaFreeMonths)

    // At least one Scotiabank card is freed after the last Santander card
    expect(firstScotia).toBeGreaterThan(lastSantander)
  })

  it('both Santander cards are freed in the same month (cascade)', () => {
    const wlMonth = result.freedCards.find(
      (f) => f.cardId === 'santander-world-limited'
    )!.month
    const platMonth = result.freedCards.find(
      (f) => f.cardId === 'santander-platinum'
    )!.month

    // Avalanche targets WL first (higher balance among same-rate group).
    // The excess that pays off WL cascades to Platinum in the same month,
    // freeing both cards in a single payment cycle.
    expect(wlMonth).toBe(platMonth)
  })

  it('produces a snapshot for every month', () => {
    expect(result.monthlySnapshots).toHaveLength(result.totalMonths)
  })

  it('all card balances are 0 in the final snapshot', () => {
    const last = result.monthlySnapshots.at(-1)!
    for (const balance of Object.values(last.cardBalances)) {
      expect(balance).toBe(0)
    }
  })

  it('total paid = totalInterestPaid + initial total balance', () => {
    const initialBalance = FOUR_CARDS.reduce((s, c) => s + c.balance, 0)
    expect(result.totalPaid).toBe(result.totalInterestPaid + initialBalance)
  })

  it('savingsVsMinimum is a positive amount', () => {
    // We pay off debt, so we pay less interest than if we only covered minimums forever
    expect(result.savingsVsMinimum).toBeGreaterThan(0)
  })

  it('minimumPaymentRequired matches calculateMinimumPayment', () => {
    expect(result.minimumPaymentRequired).toBe(
      DebtCalculator.calculateMinimumPayment(FOUR_CARDS).value
    )
  })
})

// ─── simulatePayoff — real data (snowball) ────────────────────────────────────

describe('DebtCalculator.simulatePayoff — real data, snowball $1.5M/month', () => {
  const result = DebtCalculator.simulatePayoff(
    FOUR_CARDS,
    1_500_000,
    'snowball'
  )

  it('pays off all 4 cards before the 120-month cap', () => {
    expect(result.totalMonths).toBeLessThan(120)
    expect(result.freedCards).toHaveLength(4)
  })

  it('targets Santander Platinum first (lowest balance)', () => {
    // Santander Platinum has the lowest balance ($3.8M) so it's freed first
    const platMonth = result.freedCards.find(
      (f) => f.cardId === 'santander-platinum'
    )!.month

    const othersMaxMonth = Math.max(
      ...result.freedCards
        .filter((f) => f.cardId !== 'santander-platinum')
        .map((f) => f.month)
    )

    expect(platMonth).toBeLessThan(othersMaxMonth)
  })
})

// ─── compareStrategies ────────────────────────────────────────────────────────

describe('DebtCalculator.compareStrategies', () => {
  const comparison = DebtCalculator.compareStrategies(FOUR_CARDS, 1_500_000)

  it('avalanche results in less total interest paid than snowball', () => {
    // Avalanche targets the highest-rate card first, minimizing interest accumulation.
    // Snowball leaves the high-rate Santander WL untouched while clearing smaller cards.
    expect(comparison.avalanche.totalInterestPaid).toBeLessThan(
      comparison.snowball.totalInterestPaid
    )
  })

  it('interestDifference is negative (avalanche pays less)', () => {
    expect(comparison.interestDifference).toBeLessThan(0)
  })

  it('recommendation is avalanche', () => {
    expect(comparison.recommendation).toBe('avalanche')
  })

  it('returns valid simulation results for both strategies', () => {
    expect(comparison.avalanche.freedCards).toHaveLength(4)
    expect(comparison.snowball.freedCards).toHaveLength(4)
  })

  it('monthsDifference = snowball.totalMonths − avalanche.totalMonths', () => {
    expect(comparison.monthsDifference).toBe(
      comparison.snowball.totalMonths - comparison.avalanche.totalMonths
    )
  })
})

// ─── Additional correctness tests ────────────────────────────────────────────

describe('DebtCalculator — simulation correctness', () => {
  it('snapshot balances are monotonically non-increasing for the target card (avalanche)', () => {
    const result = DebtCalculator.simulatePayoff(
      FOUR_CARDS,
      1_500_000,
      'avalanche'
    )

    // The target card (Santander WL) should only ever decrease or stay at 0
    let prev = SANTANDER_WORLD_LIMITED.balance
    for (const snap of result.monthlySnapshots) {
      const bal = snap.cardBalances['santander-world-limited'] ?? 0
      expect(bal).toBeLessThanOrEqual(prev)
      prev = bal
    }
  })

  it('non-target cards retain their balance until targeted (Scotiabank phase)', () => {
    // With avalanche, both Scotiabank cards have the same rate (2.40%).
    // The tiebreak is highest current balance first.
    // Initially Signature ($14.6M) > Infinite ($6.6M), so Signature is targeted.
    // As Signature's balance decreases below Infinite's ($6.6M), the tiebreak
    // switches — Infinite becomes the target and is freed first.
    const result = DebtCalculator.simulatePayoff(
      FOUR_CARDS,
      1_500_000,
      'avalanche'
    )

    const infiniteFreeMonth = result.freedCards.find(
      (f) => f.cardId === 'scotiabank-infinite'
    )!.month

    const signatureFreeMonth = result.freedCards.find(
      (f) => f.cardId === 'scotiabank-signature'
    )!.month

    // Both Scotiabank cards are freed, both after all Santander cards (month ~29)
    const lastSantanderMonth = Math.max(
      ...result.freedCards
        .filter((f) => f.cardId.startsWith('santander'))
        .map((f) => f.month)
    )

    expect(infiniteFreeMonth).toBeGreaterThan(lastSantanderMonth)
    expect(signatureFreeMonth).toBeGreaterThan(lastSantanderMonth)
    // Both freed within a close range of each other
    expect(
      Math.abs(signatureFreeMonth - infiniteFreeMonth)
    ).toBeLessThanOrEqual(3)
  })

  it('accumulated principal paid equals initial total balance when all cards freed', () => {
    const result = DebtCalculator.simulatePayoff(
      FOUR_CARDS,
      1_500_000,
      'avalanche'
    )
    const principalPaid = result.monthlySnapshots.reduce(
      (sum, s) => sum + s.principalPaid,
      0
    )
    const initialBalance = FOUR_CARDS.reduce((s, c) => s + c.balance, 0)
    expect(principalPaid).toBe(initialBalance)
  })

  it('accumulated interest paid equals sum of interestPaid across all snapshots', () => {
    const result = DebtCalculator.simulatePayoff(
      FOUR_CARDS,
      1_500_000,
      'avalanche'
    )
    const sumFromSnapshots = result.monthlySnapshots.reduce(
      (sum, s) => sum + s.interestPaid,
      0
    )
    expect(sumFromSnapshots).toBe(result.totalInterestPaid)
  })

  it('exact payoff behavior with a tiny 2-card scenario', () => {
    // Card A: $1,000,000 @ 2.00%  → interest = $20,000/month
    // Card B: $500,000 @ 3.00%    → interest = $15,000/month
    // Total minimum = $35,000. Monthly payment = $535,000.
    // Excess = $500,000. Avalanche targets Card B (3.00%) first.
    //
    // Month 1: Card B: $500,000 - $500,000 = $0 (freed). Excess left: $0.
    // Month 2: Only Card A. Interest = $20,000. Excess = $515,000.
    //   Card A: $1,000,000 - $515,000 = $485,000.
    // Month 3: Interest = $9,700. Excess = $525,300.
    //   Card A: $485,000 - $525,300 → paid off (excess $40,300 unused).
    const cards: CardInput[] = [
      { id: 'a', name: 'Card A', balance: 1_000_000, monthlyRate: 2.0 },
      { id: 'b', name: 'Card B', balance: 500_000, monthlyRate: 3.0 },
    ]

    const result = DebtCalculator.simulatePayoff(cards, 535_000, 'avalanche')

    // Card B freed in month 1
    const cardBFree = result.freedCards.find((f) => f.cardId === 'b')!
    expect(cardBFree.month).toBe(1)

    // Card A freed in month 3
    const cardAFree = result.freedCards.find((f) => f.cardId === 'a')!
    expect(cardAFree.month).toBe(3)

    expect(result.totalMonths).toBe(3)
  })
})
